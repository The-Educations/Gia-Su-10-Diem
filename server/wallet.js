import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { isParentOf } from "./family.js";
import banks from "../shared/banks.json" with { type: "json" };

// "Số dư học phí": money a student pays in ahead of lessons. SePay never holds
// it; transfers land in the platform's bank account and SePay's webhook tells
// us to credit the balance. Every change is a ledger row plus an atomic update
// of the cached balance, so the two always agree.
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const DEFAULT_SETTINGS = {
  fee_percent: 5,
  monthly_credits: 10,
  offer_credits: 2,
  offer_hours: 48,
  confirm_hours: 48,
  cancel_hours: 12,
  min_deposit: 50000,
  credit_packs: [{ credits: 10, price: 50000 }, { credits: 30, price: 120000 }],
};
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function migrateWallet(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id), available INTEGER NOT NULL DEFAULT 0 CHECK(available >= 0),
    held INTEGER NOT NULL DEFAULT 0 CHECK(held >= 0), credits_free INTEGER NOT NULL DEFAULT 0 CHECK(credits_free >= 0),
    credits_paid INTEGER NOT NULL DEFAULT 0 CHECK(credits_paid >= 0), credits_month TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS wallet_entries (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0, held INTEGER NOT NULL DEFAULT 0, credits INTEGER NOT NULL DEFAULT 0,
    ref TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', actor_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS wallet_entries_user ON wallet_entries(user_id, id);
  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), payer_id INTEGER NOT NULL REFERENCES users(id),
    code TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TEXT);
  CREATE TABLE IF NOT EXISTS sepay_events (
    id INTEGER PRIMARY KEY, code TEXT, amount INTEGER NOT NULL, reference TEXT NOT NULL DEFAULT '',
    verdict INTEGER NOT NULL, status TEXT NOT NULL, deposit_id INTEGER, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS gateway_events (
    id TEXT PRIMARY KEY, invoice TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, verdict INTEGER NOT NULL,
    status TEXT NOT NULL, deposit_id INTEGER, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), amount INTEGER NOT NULL,
    bank_name TEXT NOT NULL, account_number TEXT NOT NULL, account_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested', note TEXT NOT NULL DEFAULT '', handled_by INTEGER, handled_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY, sender TEXT NOT NULL CHECK(sender IN ('student','tutor')),
    student_id INTEGER NOT NULL REFERENCES users(id), tutor_id INTEGER NOT NULL REFERENCES users(id),
    subject_id TEXT NOT NULL, level TEXT NOT NULL DEFAULT '', mode TEXT NOT NULL CHECK(mode IN ('online','offline')),
    area TEXT NOT NULL DEFAULT '', sessions INTEGER NOT NULL, minutes INTEGER NOT NULL, rate INTEGER NOT NULL,
    total INTEGER NOT NULL, schedule TEXT NOT NULL DEFAULT '[]', start_date TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', held INTEGER NOT NULL DEFAULT 0, credits INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL, decided_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS proposals_people ON proposals(student_id, tutor_id, status);`);
  if (!db.prepare("PRAGMA table_info(proposals)").all().some((c) => c.name === "trial"))
    db.exec("ALTER TABLE proposals ADD COLUMN trial INTEGER NOT NULL DEFAULT 0");
  // A payout carries a code for the transfer memo, the bank's reference once SePay sees
  // the money leave, and the receipt the administrator attached.
  const cols = db.prepare("PRAGMA table_info(withdrawals)").all().map((c) => c.name);
  for (const [name, type] of [["code", "TEXT"], ["bank_ref", "TEXT NOT NULL DEFAULT ''"], ["paid_via", "TEXT NOT NULL DEFAULT ''"], ["receipt_id", "TEXT"]])
    if (!cols.includes(name)) db.exec(`ALTER TABLE withdrawals ADD COLUMN ${name} ${type}`);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_code ON withdrawals(code)");
}

const bankCode = (name) => banks.find((b) => b.name.toLowerCase() === String(name).toLowerCase())?.code || "";
// VietQR for the administrator's banking app: the user's account, the amount and the memo filled in.
export const payoutQr = (w) => bankCode(w.bank_name) && w.code
  ? `https://vietqr.app/img?${new URLSearchParams({ acc: w.account_number, bank: bankCode(w.bank_name), amount: String(w.amount), des: w.code, template: "compact" })}`
  : null;

export function settings(db) {
  const stored = Object.fromEntries(all(db, "SELECT key,value FROM platform_settings").map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

const month = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const verifiedTutor = (db, id) => !!one(db, "SELECT 1 FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND u.role='tutor' AND (t.status='approved' OR t.published IS NOT NULL)", id);

// Free credits reset to the monthly allowance on the first read of a new month;
// unused ones never carry over. Bought credits stay.
export function wallet(db, userId) {
  run(db, "INSERT OR IGNORE INTO wallets(user_id) VALUES (?)", userId);
  const now = month(), w = one(db, "SELECT * FROM wallets WHERE user_id=?", userId);
  if (w.credits_month !== now) {
    const free = verifiedTutor(db, userId) ? settings(db).monthly_credits : 0;
    if (run(db, "UPDATE wallets SET credits_free=?,credits_month=? WHERE user_id=? AND credits_month=?", free, now, userId, w.credits_month).changes && free)
      run(db, "INSERT INTO wallet_entries(user_id,kind,credits,ref,note) VALUES (?,?,?,?,?)", userId, "credits_monthly", free, now, "");
    return one(db, "SELECT * FROM wallets WHERE user_id=?", userId);
  }
  return w;
}

// One ledger row and one conditional balance update; a change that would make a
// balance negative fails instead of overdrawing.
export function move(db, userId, kind, { amount = 0, held = 0, ref = "", note = "", actor = null } = {}) {
  wallet(db, userId);
  const ok = run(db, "UPDATE wallets SET available=available+?,held=held+? WHERE user_id=? AND available+?>=0 AND held+?>=0", amount, held, userId, amount, held).changes;
  if (!ok) fail(402, "Số dư không đủ.");
  run(db, "INSERT INTO wallet_entries(user_id,kind,amount,held,ref,note,actor_id) VALUES (?,?,?,?,?,?,?)", userId, kind, amount, held, ref, note, actor);
}

export function spendCredits(db, userId, count, ref) {
  const w = wallet(db, userId), free = Math.min(w.credits_free, count), paid = count - free;
  if (paid > w.credits_paid) fail(402, `Cần ${count} Xu. Mua thêm Xu để gửi đề nghị.`);
  run(db, "UPDATE wallets SET credits_free=credits_free-?,credits_paid=credits_paid-? WHERE user_id=? AND credits_free>=? AND credits_paid>=?", free, paid, userId, free, paid);
  run(db, "INSERT INTO wallet_entries(user_id,kind,credits,ref) VALUES (?,?,?,?)", userId, "credits_spent", -count, ref);
}

export function sepayConfig(env = process.env) {
  const c = {
    // Bank-transfer webhook (SePay Webhooks).
    secret: env.SEPAY_WEBHOOK_SECRET || "",
    account: env.SEPAY_BANK_ACCOUNT || "",
    bank: env.SEPAY_BANK_CODE || "",
    holder: env.SEPAY_ACCOUNT_NAME || "",
    prefix: (env.SEPAY_CODE_PREFIX || "GSD").toUpperCase(),
    // Payment gateway (Cổng thanh toán): hosted checkout and IPN.
    merchant: env.SEPAY_MERCHANT_ID || "",
    merchantSecret: env.SEPAY_SECRET_KEY || "",
    ipnSecret: env.SEPAY_IPN_SECRET || "",
    sandbox: env.SEPAY_ENV === "sandbox",
  };
  const webhook = !!(c.secret && c.account && c.bank), gateway = !!(c.merchant && c.merchantSecret && c.ipnSecret);
  return { ...c, webhook, gateway, ready: webhook || gateway };
}

// The checkout form's signature: allowed fields in SePay's order, empty ones left out.
const SIGNED = ["order_amount", "merchant", "currency", "operation", "order_description", "order_invoice_number", "customer_id", "payment_method", "success_url", "error_url", "cancel_url"];
export function signCheckout(fields, secret) {
  const text = SIGNED.filter((k) => fields[k] && fields[k] !== "0").map((k) => `${k}=${fields[k]}`).join(",");
  return createHmac("sha256", secret).update(text).digest("base64");
}

export function registerWallet(app, db, auth, audit, { production, sepay, origin = "" }) {
  const simulate = !production && !sepay.ready;
  // One code space for top-ups and payouts, so a memo always points at one record.
  const newCode = () => {
    for (;;) {
      const code = sepay.prefix + Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
      if (!one(db, "SELECT 1 FROM deposits WHERE code=? UNION ALL SELECT 1 FROM withdrawals WHERE code=?", code, code)) return code;
    }
  };
  // Requests made before payouts had codes get one, so they can be paid by QR too.
  for (const w of all(db, "SELECT id FROM withdrawals WHERE code IS NULL AND status='requested'")) run(db, "UPDATE withdrawals SET code=? WHERE id=?", newCode(), w.id);
  const expireProposals = () => {
    for (const p of all(db, "SELECT * FROM proposals WHERE status='pending' AND expires_at<?", new Date().toISOString()))
      transaction(db, () => {
        if (!run(db, "UPDATE proposals SET status='expired',decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", p.id).changes) return;
        if (p.held) move(db, p.student_id, "offer_released", { amount: p.held, held: -p.held, ref: `proposal:${p.id}` });
      });
  };
  const view = (userId) => {
    const w = wallet(db, userId);
    return {
      available: w.available, held: w.held, credits_free: w.credits_free, credits_paid: w.credits_paid,
      entries: all(db, "SELECT id,kind,amount,held,credits,ref,note,created_at FROM wallet_entries WHERE user_id=? ORDER BY id DESC LIMIT 50", userId),
      withdrawals: all(db, "SELECT id,amount,bank_name,account_number,account_name,substr(account_number,-4) AS account_last4,status,note,created_at,handled_at,code,bank_ref!='' AS bank_confirmed,CASE WHEN receipt_id IS NULL THEN NULL ELSE '/api/chat/attachments/' || receipt_id END AS receipt_url FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 20", userId),
      settings: (({ offer_credits, credit_packs, min_deposit, fee_percent }) => ({ offer_credits, credit_packs, min_deposit, fee_percent }))(settings(db)),
      payments: sepay.ready ? "live" : simulate ? "simulated" : "off",
    };
  };
  const qr = (d) => sepay.webhook
    ? `https://vietqr.app/img?${new URLSearchParams({ acc: sepay.account, bank: sepay.bank, amount: String(d.amount), des: d.code, template: "compact" })}`
    : null;
  const deposit = (d) => ({ id: d.id, code: d.code, amount: d.amount, received: d.received, status: d.status, created_at: d.created_at, qr_url: qr(d), pay_url: sepay.gateway || simulate ? `${origin}/api/wallet/pay/${d.code}` : null, account: sepay.webhook ? sepay.account : "", bank: sepay.bank, holder: sepay.holder, checkout: checkout(d) });
  // A signed form the browser posts to SePay's hosted checkout page.
  const checkout = (d) => {
    if (!sepay.gateway || d.status !== "pending") return null;
    const back = `${origin}/app/wallet?deposit=${d.id}`;
    const fields = {
      order_amount: String(d.amount), merchant: sepay.merchant, currency: "VND", operation: "PURCHASE",
      order_description: `Nap so du hoc phi ${d.code}`, order_invoice_number: d.code, customer_id: String(d.user_id),
      success_url: `${back}&result=success`, error_url: `${back}&result=error`, cancel_url: `${back}&result=cancel`,
    };
    return { action: `https://${sepay.sandbox ? "pay-sandbox" : "pay"}.sepay.vn/v1/checkout/init`, fields: { ...fields, lang: "vi", signature: signCheckout(fields, sepay.merchantSecret) } };
  };

  // Credits whatever amount arrives with a known code to that deposit's wallet.
  function credit(code, amount, eventRef) {
    return transaction(db, () => {
      const d = one(db, "SELECT * FROM deposits WHERE code=? COLLATE NOCASE", code || "");
      if (!d || amount <= 0) return null;
      run(db, "UPDATE deposits SET received=received+?,status='paid',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP) WHERE id=?", amount, d.id);
      move(db, d.user_id, "deposit", { amount, ref: `deposit:${d.id}`, note: eventRef });
      notify(db, d.user_id, "deposit_received", { subject: String(amount), link: "/wallet" });
      if (d.payer_id !== d.user_id) notify(db, d.payer_id, "deposit_received", { subject: String(amount), link: "/wallet" });
      return d;
    });
  }

  // Pending top-ups from the last 7 days are checked with SePay, so a missed IPN still lands.
  const recheck = async (rows) => { for (const d of rows) await checkWithSepay(d); };
  const recent = () => new Date(Date.now() - 7 * 86400000).toISOString().replace("T", " ").slice(0, 19);
  app.get("/api/wallet", auth(), async (req, res) => {
    expireProposals();
    await recheck(all(db, "SELECT * FROM deposits WHERE (user_id=? OR payer_id=?) AND status='pending' AND created_at>? ORDER BY id DESC LIMIT 5", req.user.id, req.user.id, recent()));
    res.json(view(req.user.id));
  });
  app.post("/api/admin/deposits/recheck", auth("admin"), async (req, res) => {
    const rows = all(db, "SELECT * FROM deposits WHERE status='pending' AND created_at>? ORDER BY id DESC LIMIT 100", recent());
    await recheck(rows);
    const paid = rows.filter((d) => one(db, "SELECT status FROM deposits WHERE id=?", d.id).status === "paid").length;
    audit(req.user.id, "deposits.recheck", paid);
    res.json({ checked: rows.length, paid });
  });
  app.post("/api/wallet/deposits", auth("student", "tutor"), (req, res) => {
    const s = settings(db);
    const { amount, student_id } = z.object({ amount: z.number().int().min(s.min_deposit).max(50000000), student_id: z.number().int().positive().optional() }).parse(req.body);
    // A parent tops up a linked child's balance.
    if (student_id && !isParentOf(db, req.user.id, student_id)) fail(403, "Chỉ nạp được cho tài khoản con đã liên kết.");
    const owner = student_id || req.user.id;
    if (!sepay.ready && !simulate) fail(503, "Nạp tiền đang tạm đóng. Vui lòng quay lại sau.");
    const d = one(db, "SELECT * FROM deposits WHERE id=?", run(db, "INSERT INTO deposits(user_id,payer_id,code,amount) VALUES (?,?,?,?)", owner, req.user.id, newCode(), amount).lastInsertRowid);
    res.status(201).json({ ...deposit(d), simulated: simulate });
  });
  app.get("/api/wallet/deposits/:id", auth(), async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const d = one(db, "SELECT * FROM deposits WHERE id=? AND payer_id=?", id, req.user.id);
    if (!d) fail(404, "Không tìm thấy lệnh nạp.");
    await checkWithSepay(d);
    res.json(deposit(one(db, "SELECT * FROM deposits WHERE id=?", id)));
  });
  // The QR on the top-up screen opens this on a phone: it forwards to SePay's page for that one order.
  app.get("/api/wallet/pay/:code", (req, res) => {
    const d = one(db, "SELECT * FROM deposits WHERE code=? COLLATE NOCASE", String(req.params.code).slice(0, 20));
    const form = d && checkout(d);
    if (!form) return res.redirect(303, d ? `${origin}/app/wallet?deposit=${d.id}` : `${origin}/app/wallet`);
    const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    res.type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SePay</title>
<form id="f" method="post" action="${esc(form.action)}">${Object.entries(form.fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("")}
<button style="font:600 17px system-ui;margin:40vh auto 0;display:block;padding:14px 24px;border:0;border-radius:999px;background:#852f36;color:#fff">Thanh toán ${d.amount.toLocaleString("vi-VN")}đ trên SePay</button></form>
<script>document.getElementById("f").submit()</script>`);
  });
  // Local development only: stands in for the bank transfer and SePay's webhook.
  app.post("/api/wallet/deposits/:id/simulate", auth(), (req, res) => {
    if (!simulate) fail(404, "Không có chức năng này.");
    const d = one(db, "SELECT * FROM deposits WHERE id=? AND payer_id=?", z.coerce.number().int().parse(req.params.id), req.user.id);
    if (!d) fail(404, "Không tìm thấy lệnh nạp.");
    credit(d.code, d.amount, "simulated");
    res.json(deposit(one(db, "SELECT * FROM deposits WHERE id=?", d.id)));
  });

  // One payment per top-up, for exactly the amount asked; shared by the IPN and the order check.
  function creditGateway(code, amount, method = "") {
    return transaction(db, () => {
      const d = one(db, "SELECT * FROM deposits WHERE code=? COLLATE NOCASE", code);
      if (!d || d.amount !== amount || !run(db, "UPDATE deposits SET received=?,status='paid',paid_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", amount, d.id).changes) return null;
      move(db, d.user_id, "deposit", { amount, ref: `deposit:${d.id}`, note: `sepay-pg:${method}` });
      notify(db, d.user_id, "deposit_received", { subject: String(amount), link: "/wallet" });
      if (d.payer_id !== d.user_id) notify(db, d.payer_id, "deposit_received", { subject: String(amount), link: "/wallet" });
      return d;
    });
  }
  // Marks a payout as sent, once: by an administrator, or by SePay seeing the money leave the bank.
  function payout(w, { actor = null, via, ref = "", receipt = null }) {
    if (!run(db, "UPDATE withdrawals SET status='paid',handled_by=?,handled_at=CURRENT_TIMESTAMP,paid_via=?,bank_ref=?,receipt_id=? WHERE id=? AND status='requested'", actor, via, ref, receipt, w.id).changes) return false;
    move(db, w.user_id, "withdrawal_paid", { held: -w.amount, ref: `withdrawal:${w.id}`, actor });
    supportNote(w.user_id, `Đã chuyển ${w.amount.toLocaleString("vi-VN")}đ cho yêu cầu rút tiền #${w.id} về ${w.bank_name} ****${w.account_number.slice(-4)}.${receipt ? " Biên lai đính kèm." : ""}`, receipt);
    notify(db, w.user_id, "withdrawal_paid", { subject: String(w.amount), link: "/wallet" });
    return true;
  }
  // A line in the user's conversation with the administrators, with the receipt when there is one.
  function supportNote(userId, body, attachment = null) {
    run(db, "INSERT OR IGNORE INTO support_threads(user_id) VALUES (?)", userId);
    const thread = one(db, "SELECT id FROM support_threads WHERE user_id=?", userId);
    const admin = one(db, "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    const id = Number(run(db, "INSERT INTO support_messages(thread_id,sender_id,body) VALUES (?,?,?)", thread.id, admin?.id || userId, body).lastInsertRowid);
    if (attachment) run(db, "UPDATE chat_attachments SET message_id=? WHERE id=? AND message_id IS NULL", id, attachment);
  }
  // A receipt is an image the administrator uploaded into that user's support conversation.
  function receiptFor(w, id, adminId) {
    if (!id) return null;
    const thread = one(db, "SELECT id FROM support_threads WHERE user_id=?", w.user_id);
    if (!thread || !one(db, "SELECT 1 FROM chat_attachments WHERE id=? AND owner_id=? AND thread_kind='support' AND thread_id=? AND message_id IS NULL AND kind='image'", id, adminId, thread.id))
      fail(400, "Biên lai không hợp lệ. Tải lại ảnh rồi thử lại.");
    return id;
  }

  // Asks SePay directly when the buyer is back but the IPN has not arrived (or never will).
  async function checkWithSepay(d) {
    if (!sepay.gateway || d.status !== "pending") return;
    try {
      const host = sepay.sandbox ? "https://pgapi-sandbox.sepay.vn" : "https://pgapi.sepay.vn";
      const r = await fetch(`${host}/v1/order/detail/${encodeURIComponent(d.code)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${sepay.merchant}:${sepay.merchantSecret}`).toString("base64")}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return;
      const o = (await r.json()).data || {};
      const paid = (o.transactions || []).find((t) => t.transaction_status === "APPROVED" && t.transaction_type !== "REFUND");
      if (o.order_status === "CAPTURED" && paid) creditGateway(d.code, Math.round(Number(o.order_amount) || 0), paid.payment_method);
    } catch { /* the IPN or the next check will settle it */ }
  }

  // Payment gateway IPN: SePay calls this once the buyer has paid on the hosted page.
  app.post("/api/sepay/ipn", (req, res) => {
    const key = req.get("X-Secret-Key") || "";
    if (!sepay.ipnSecret) return res.status(503).json({ success: false });
    if (key.length !== sepay.ipnSecret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(sepay.ipnSecret))) {
      // Kept for Admin → Finance so a wrong IPN key in SePay is easy to spot.
      run(db, "INSERT OR IGNORE INTO gateway_events(id,invoice,amount,verdict,status,payload) VALUES (?,?,?,0,'rejected_key','{}')", `rejected:${Date.now()}:${randomInt(1e9)}`, String(req.body?.order?.order_invoice_number || ""), Math.round(Number(req.body?.order?.order_amount) || 0));
      return res.status(401).json({ success: false });
    }
    const e = req.body || {}, order = e.order || {}, tx = e.transaction || {};
    const eventId = String(tx.id || order.id || "");
    if (!eventId) return res.status(400).json({ success: false });
    const seen = one(db, "SELECT verdict FROM gateway_events WHERE id=?", eventId);
    if (seen) return res.json({ success: !!seen.verdict });
    const amount = Math.round(Number(order.order_amount) || 0);
    let verdict = false, depositId = null;
    if (e.notification_type === "ORDER_PAID" && order.order_status === "CAPTURED" && tx.transaction_status === "APPROVED" && tx.transaction_type !== "REFUND") {
      const d = creditGateway(String(order.order_invoice_number || ""), amount, tx.payment_method);
      if (d) { verdict = true; depositId = d.id; }
    }
    run(db, "INSERT OR IGNORE INTO gateway_events(id,invoice,amount,verdict,status,deposit_id,payload) VALUES (?,?,?,?,?,?,?)",
      eventId, String(order.order_invoice_number || ""), amount, Number(verdict), verdict ? "processed" : "unmatched", depositId, JSON.stringify(e));
    // 200 tells SePay the notice arrived; unmatched ones wait in Admin → Finance.
    res.json({ success: verdict });
  });

  // SePay webhook with "Dùng để xác thực thanh toán": the reply is the verdict.
  app.post("/api/sepay/webhook", (req, res) => {
    if (!sepay.secret) return res.status(503).json({ success: false });
    const stamp = req.get("X-SePay-Timestamp") || "", signature = (req.get("X-SePay-Signature") || "").replace(/^sha256=/, "");
    const expected = createHmac("sha256", sepay.secret).update(`${stamp}.${req.rawBody || ""}`).digest("hex");
    const fresh = Math.abs(Date.now() / 1000 - Number(stamp)) < 300;
    if (!fresh || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      return res.status(401).json({ success: false });
    const e = req.body || {};
    const id = Number(e.id), amount = Number(e.transferAmount) || 0, code = e.code || null;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false });
    const seen = one(db, "SELECT verdict FROM sepay_events WHERE id=?", id);
    if (seen) return res.json({ success: !!seen.verdict });
    let verdict = false, depositId = null, status = "unmatched";
    if (e.transferType === "in" && (!sepay.account || String(e.accountNumber) === sepay.account || e.subAccount)) {
      const d = credit(code, amount, `sepay:${id}`);
      if (d) { verdict = true; depositId = d.id; }
    }
    // Money leaving the bank with a payout code in its memo confirms that payout.
    if (e.transferType === "out") {
      status = "ignored";
      const content = String(e.content || "").toUpperCase();
      const w = (code && one(db, "SELECT * FROM withdrawals WHERE code=? COLLATE NOCASE", code))
        || all(db, "SELECT * FROM withdrawals WHERE code IS NOT NULL AND status IN ('requested','paid') AND bank_ref='' ORDER BY id DESC LIMIT 200").find((x) => content.includes(x.code));
      if (w && w.amount === amount) {
        transaction(db, () => {
          if (w.status === "requested") payout(w, { via: "sepay", ref: String(e.referenceCode || id) });
          else run(db, "UPDATE withdrawals SET bank_ref=? WHERE id=? AND bank_ref=''", String(e.referenceCode || id), w.id);
        });
        verdict = true; status = "payout";
      }
    }
    run(db, "INSERT OR IGNORE INTO sepay_events(id,code,amount,reference,verdict,status,deposit_id,payload) VALUES (?,?,?,?,?,?,?,?)",
      id, code, amount, String(e.referenceCode || ""), Number(verdict), verdict ? (status === "payout" ? "payout" : "processed") : status, depositId, JSON.stringify(e));
    res.json({ success: verdict });
  });

  app.post("/api/wallet/withdrawals", auth("student", "tutor"), (req, res) => {
    const d = z.object({
      amount: z.number().int().min(50000),
      bank_name: z.string().trim().min(2).max(80),
      account_number: z.string().trim().regex(/^\d{6,20}$/, "Số tài khoản chỉ gồm 6–20 chữ số."),
      account_name: z.string().trim().min(2).max(80),
    }).parse(req.body);
    const id = transaction(db, () => {
      const wid = Number(run(db, "INSERT INTO withdrawals(user_id,amount,bank_name,account_number,account_name,code) VALUES (?,?,?,?,?,?)", req.user.id, d.amount, d.bank_name, d.account_number, d.account_name.toUpperCase(), newCode()).lastInsertRowid);
      move(db, req.user.id, "withdrawal_requested", { amount: -d.amount, held: d.amount, ref: `withdrawal:${wid}` });
      // The request appears in the user's conversation with the administrators.
      run(db, "INSERT OR IGNORE INTO support_threads(user_id) VALUES (?)", req.user.id);
      const thread = one(db, "SELECT id FROM support_threads WHERE user_id=?", req.user.id);
      run(db, "INSERT INTO support_messages(thread_id,sender_id,body) VALUES (?,?,?)", thread.id, req.user.id,
        `Yêu cầu rút tiền #${wid}: ${d.amount.toLocaleString("vi-VN")}đ về ${d.bank_name} ****${d.account_number.slice(-4)} (${d.account_name.toUpperCase()}).`);
      for (const admin of all(db, "SELECT id FROM users WHERE role='admin' AND status='active'"))
        notify(db, admin.id, "withdrawal_requested", { actor: req.user.name, subject: String(d.amount), link: "/admin?tab=finance" });
      return wid;
    });
    res.status(201).json({ id, ...view(req.user.id) });
  });

  app.post("/api/credits/purchase", auth("tutor"), (req, res) => {
    const { credits } = z.object({ credits: z.number().int().positive() }).parse(req.body);
    const pack = settings(db).credit_packs.find((p) => p.credits === credits);
    if (!pack) fail(400, "Gói Xu không tồn tại.");
    transaction(db, () => {
      move(db, req.user.id, "credits_purchased", { amount: -pack.price, ref: `credits:${credits}` });
      run(db, "UPDATE wallets SET credits_paid=credits_paid+? WHERE user_id=?", credits, req.user.id);
      run(db, "INSERT INTO wallet_entries(user_id,kind,credits,ref) VALUES (?,?,?,?)", req.user.id, "credits_added", credits, `credits:${credits}`);
    });
    res.json(view(req.user.id));
  });

  // Administrators
  app.get("/api/admin/finance", auth("admin"), (req, res) => {
    res.json({
      withdrawals: all(db, `SELECT w.id,w.user_id,w.amount,w.bank_name,w.account_number,w.account_name,w.status,w.note,w.created_at,w.handled_at,w.code,w.bank_ref,w.paid_via,
        u.name,u.email,u.role,(SELECT id FROM support_threads WHERE user_id=w.user_id) AS thread_id,
        CASE WHEN w.receipt_id IS NULL THEN NULL ELSE '/api/chat/attachments/' || w.receipt_id END AS receipt_url
        FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY CASE w.status WHEN 'requested' THEN 0 ELSE 1 END, w.id DESC LIMIT 200`).map((w) => ({ ...w, qr_url: w.status === "requested" ? payoutQr(w) : null })),
      // Month by month in Vietnam time: money in, money out, and what the platform earned.
      months: all(db, `WITH m(month) AS (SELECT strftime('%Y-%m', datetime('now','+7 hours','start of month','-' || n || ' months')) FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5))
        SELECT month,
          COALESCE((SELECT SUM(received) FROM deposits WHERE status='paid' AND strftime('%Y-%m', paid_at, '+7 hours')=month),0) AS deposits,
          COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status='paid' AND strftime('%Y-%m', handled_at, '+7 hours')=month),0) AS payouts,
          COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status='paid' AND bank_ref!='' AND strftime('%Y-%m', handled_at, '+7 hours')=month),0) AS payouts_confirmed,
          COALESCE((SELECT SUM(amount) FROM platform_revenue WHERE kind='lesson_fee' AND strftime('%Y-%m', created_at, '+7 hours')=month),0) AS fees,
          COALESCE((SELECT -SUM(amount) FROM wallet_entries WHERE kind='credits_purchased' AND strftime('%Y-%m', created_at, '+7 hours')=month),0) AS credits
        FROM m ORDER BY month`),
      payout_check: !!sepay.secret,
      // Paid top-ups with who paid, for whom and how, to trace a transfer quickly.
      deposits: all(db, `SELECT d.id,d.code,d.amount,d.received,d.status,d.created_at,d.paid_at,d.user_id,d.payer_id,
        u.name, u.email, p.name AS payer_name, p.email AS payer_email,
        (SELECT note FROM wallet_entries WHERE ref='deposit:' || d.id AND kind='deposit' LIMIT 1) AS method
        FROM deposits d JOIN users u ON u.id=d.user_id JOIN users p ON p.id=d.payer_id WHERE d.status='paid' ORDER BY d.paid_at DESC LIMIT 200`),
      unmatched: all(db, `SELECT id,code,amount,reference,created_at FROM (
        SELECT CAST(id AS TEXT) id,code,amount,reference,created_at FROM sepay_events WHERE status='unmatched'
        UNION ALL SELECT id,invoice AS code,amount,CASE status WHEN 'rejected_key' THEN 'Sai khóa IPN' ELSE '' END AS reference,created_at FROM gateway_events WHERE status IN ('unmatched','rejected_key')) ORDER BY created_at DESC LIMIT 100`),
      totals: one(db, `SELECT
        COALESCE((SELECT SUM(received) FROM deposits),0) AS deposited,
        COALESCE((SELECT SUM(available+held) FROM wallets),0) AS balances,
        COALESCE((SELECT -SUM(amount) FROM wallet_entries WHERE kind='credits_purchased'),0) AS credit_revenue,
        COALESCE((SELECT SUM(amount) FROM platform_revenue WHERE kind='lesson_fee'),0) AS fee_revenue`),
      settings: settings(db),
      payments: sepay.ready ? "live" : simulate ? "simulated" : "off",
    });
  });
  app.patch("/api/admin/withdrawals/:id", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ status: z.enum(["paid", "rejected"]), note: z.string().trim().max(300).default(""), receipt_id: z.string().uuid().optional() }).parse(req.body);
    transaction(db, () => {
      const w = one(db, "SELECT * FROM withdrawals WHERE id=?", id);
      if (!w) fail(404, "Không tìm thấy yêu cầu.");
      if (d.status === "paid") {
        if (!payout(w, { actor: req.user.id, via: "manual", receipt: receiptFor(w, d.receipt_id, req.user.id) })) fail(409, "Yêu cầu đã được xử lý.");
      } else {
        if (!run(db, "UPDATE withdrawals SET status='rejected',note=?,handled_by=?,handled_at=CURRENT_TIMESTAMP WHERE id=? AND status='requested'", d.note, req.user.id, id).changes) fail(409, "Yêu cầu đã được xử lý.");
        move(db, w.user_id, "withdrawal_rejected", { amount: w.amount, held: -w.amount, ref: `withdrawal:${id}`, note: d.note, actor: req.user.id });
        supportNote(w.user_id, `Yêu cầu rút tiền #${id} chưa được chuyển: ${d.note}. Số tiền đã trả lại số dư.`);
        notify(db, w.user_id, "withdrawal_rejected", { subject: String(w.amount), link: "/wallet" });
      }
      audit(req.user.id, `withdrawal.${d.status}`, id);
    });
    res.json({ ok: true });
  });
  // A receipt can be added after the payout, for example once SePay confirmed it on its own.
  app.post("/api/admin/withdrawals/:id/receipt", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { receipt_id } = z.object({ receipt_id: z.string().uuid() }).parse(req.body);
    transaction(db, () => {
      const w = one(db, "SELECT * FROM withdrawals WHERE id=?", id);
      if (!w || w.status !== "paid") fail(409, "Chỉ thêm biên lai cho yêu cầu đã chuyển.");
      const receipt = receiptFor(w, receipt_id, req.user.id);
      run(db, "UPDATE withdrawals SET receipt_id=? WHERE id=?", receipt, id);
      supportNote(w.user_id, `Biên lai chuyển khoản cho yêu cầu rút tiền #${id}.`, receipt);
      notify(db, w.user_id, "withdrawal_paid", { subject: String(w.amount), link: "/wallet" });
      audit(req.user.id, "withdrawal.receipt", id);
    });
    res.json({ ok: true });
  });
  app.post("/api/admin/wallets/:id/adjust", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ amount: z.number().int().refine((n) => n !== 0), note: z.string().trim().min(3).max(300) }).parse(req.body);
    transaction(db, () => { move(db, id, "admin_adjustment", { amount: d.amount, note: d.note, actor: req.user.id }); audit(req.user.id, "wallet.adjust", id); });
    res.json({ ok: true });
  });
  app.put("/api/admin/settings", auth("admin"), (req, res) => {
    const d = z.object({
      fee_percent: z.number().min(0).max(50),
      monthly_credits: z.number().int().min(0).max(100),
      offer_credits: z.number().int().min(0).max(20),
      offer_hours: z.number().int().min(1).max(336),
      confirm_hours: z.number().int().min(1).max(336),
      cancel_hours: z.number().int().min(0).max(168),
      min_deposit: z.number().int().min(10000).max(10000000),
      credit_packs: z.array(z.object({ credits: z.number().int().positive(), price: z.number().int().positive() })).min(1).max(6),
    }).partial().parse(req.body);
    transaction(db, () => {
      for (const [key, value] of Object.entries(d)) run(db, "INSERT INTO platform_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, JSON.stringify(value));
      audit(req.user.id, "settings.update", 0);
    });
    res.json(settings(db));
  });

  return { expireProposals, view };
}

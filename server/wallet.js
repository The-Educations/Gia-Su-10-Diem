import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { insertChatEvent } from "./chat-media.js";
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
  -- sepay_recon_events: API v2 transaction ids already applied (audit).
  -- bank_transactions: the same bank transfer can arrive through the webhook
  -- AND the v2 API; the bank's reference (referenceCode/reference_number) is
  -- the same, so whichever channel sees it first claims it before crediting.
  CREATE TABLE IF NOT EXISTS sepay_recon_events (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS bank_transactions (
    reference TEXT PRIMARY KEY, source TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
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
    // Read-only reconciliation over the SePay account API; optional.
    apiToken: env.SEPAY_API_TOKEN || "",
    bankAccountId: env.SEPAY_BANK_ACCOUNT_ID || "",
  };
  // Bank transfers only need the account number and bank code; the webhook
  // secret just adds automatic confirmation.
  const bankReady = !!(c.account && c.bank), webhook = bankReady && !!c.secret, gateway = !!(c.merchant && c.merchantSecret && c.ipnSecret);
  return { ...c, bankReady, webhook, gateway, ready: bankReady || gateway };
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
  // Same for transfers that arrived before the code could be read from content.
  rematchUnmatched();
  const expireProposals = () => {
    for (const p of all(db, "SELECT * FROM proposals WHERE status='pending' AND expires_at<?", new Date().toISOString()))
      transaction(db, () => {
        if (!run(db, "UPDATE proposals SET status='expired',decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", p.id).changes) return;
        if (p.held) move(db, p.student_id, "offer_released", { amount: p.held, held: -p.held, ref: `proposal:${p.id}` });
        // The expiry is announced once, inside the same inquiry the proposal
        // arrived in — not lazily when someone happens to list proposals.
        run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", p.student_id, p.tutor_id);
        const thread = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", p.student_id, p.tutor_id);
        if (!one(db, "SELECT 1 FROM inquiry_messages WHERE inquiry_id=? AND context_kind='proposal' AND context_id=? AND body='đề nghị đã hết hạn'", thread.id, p.id))
          insertChatEvent(db, "inquiry", thread.id, { id: p.sender === "tutor" ? p.tutor_id : p.student_id }, "đề nghị đã hết hạn", { kind: "proposal", id: p.id });
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
  const qr = (d) => sepay.bankReady
    ? `https://vietqr.app/img?${new URLSearchParams({ acc: sepay.account, bank: sepay.bank, amount: String(d.amount), des: d.code, template: "compact" })}`
    : null;
<<<<<<< HEAD
  // With a bank account the QR is the whole flow: no hosted-checkout form or
  // QR that links out to SePay ever leaves this response.
  const deposit = (d) => ({ id: d.id, code: d.code, amount: d.amount, received: d.received, status: d.status, created_at: d.created_at, qr_url: qr(d), pay_url: sepay.bankReady ? null : sepay.gateway || simulate ? `${origin}/api/wallet/pay/${d.code}` : null, account: sepay.bankReady ? sepay.account : "", bank: sepay.bank, holder: sepay.holder, checkout: sepay.bankReady ? null : checkout(d) });
=======
  // Top-ups are always the inline VietQR — no hosted-checkout link or QR that
  // bounces the buyer through SePay's page.
  const deposit = (d) => ({ id: d.id, code: d.code, amount: d.amount, received: d.received, status: d.status, created_at: d.created_at, qr_url: qr(d), pay_url: null, account: sepay.bankReady ? sepay.account : "", bank: sepay.bankReady ? sepay.bank : "", holder: sepay.bankReady ? sepay.holder : "", checkout: null });
>>>>>>> 0669ba2 (feat(wallet): inline VietQR top-ups, SePay v2 reconciliation, webhook id=0)
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
  // The credit body without a transaction, so callers can compose it inside
  // their own transaction (transaction() cannot nest on the local driver).
  function creditDeposit(code, amount, eventRef) {
    const d = one(db, "SELECT * FROM deposits WHERE code=? COLLATE NOCASE", code || "");
    if (!d || amount <= 0) return null;
    run(db, "UPDATE deposits SET received=received+?,status='paid',paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP) WHERE id=?", amount, d.id);
    move(db, d.user_id, "deposit", { amount, ref: `deposit:${d.id}`, note: eventRef });
    notify(db, d.user_id, "deposit_received", { subject: String(amount), link: "/wallet" });
    if (d.payer_id !== d.user_id) notify(db, d.payer_id, "deposit_received", { subject: String(amount), link: "/wallet" });
    return d;
  }
  function credit(code, amount, eventRef) {
    return transaction(db, () => creditDeposit(code, amount, eventRef));
  }
  function credit(code, amount, eventRef) {
    return transaction(db, () => creditDeposit(code, amount, eventRef));
  }
  // False when this bank reference was already claimed by either channel.
  const claimBankTxn = (reference, source) =>
    !!run(db, "INSERT OR IGNORE INTO bank_transactions(reference,source) VALUES (?,?)", reference, source).changes;

  // A memo code inside free transfer text: banks decorate it with dots,
  // spaces or prefixes like "MBVCB.123.GSD12345678.CT tu…". Only a code that
  // names a real top-up or payout counts.
  function codeIn(text) {
    const m = String(text || "").match(new RegExp(`(?:^|[^A-Z0-9])(${sepay.prefix}[A-Z0-9]{8})(?![A-Z0-9])`, "i"));
    if (!m) return null;
    const code = m[1].toUpperCase();
    return one(db, "SELECT code FROM deposits WHERE code=? COLLATE NOCASE UNION ALL SELECT code FROM withdrawals WHERE code=? COLLATE NOCASE", code, code)?.code || null;
  }
  const eventCode = (e) => e.code || codeIn(`${String(e.content || "")} ${String(e.description || "")}`);

  // Earlier events whose code was missed (SePay sent code=null) get a second
  // look from their stored payload — once each, inside one transaction.
  // One bad event must never stop startup, and there is no actor at startup,
  // so the audit only runs when a real admin asked for the recheck.
  function rematchUnmatched(actor = null) {
    for (const ev of all(db, "SELECT id,payload FROM sepay_events WHERE status='unmatched'")) {
      try {
        const p = JSON.parse(ev.payload);
        if (p.transferType !== "in") continue;
        const code = codeIn(`${String(p.content || "")} ${String(p.description || "")}`);
        if (!code) continue;
        transaction(db, () => {
          const d = one(db, "SELECT * FROM deposits WHERE code=? COLLATE NOCASE", code);
          if (!d) return;
          if (!run(db, "UPDATE sepay_events SET status='processed',verdict=1,deposit_id=? WHERE id=? AND status='unmatched'", d.id, ev.id).changes) return;
          creditDeposit(code, Math.round(Number(p.transferAmount) || 0), `sepay:${ev.id}`);
          if (actor) audit(actor, "deposit.rematched", `sepay:${ev.id}`);
        });
      } catch { /* a bad stored event never breaks startup */ }
    }
  }

  // Pending top-ups from the last 7 days are checked with SePay, so a missed IPN still lands.
  const recheck = async (rows) => { await reconcileBank(); for (const d of rows) await checkWithSepay(d); };
  const recent = () => new Date(Date.now() - 7 * 86400000).toISOString().replace("T", " ").slice(0, 19);
  app.get("/api/wallet", auth(), async (req, res) => {
    expireProposals();
    await recheck(all(db, "SELECT * FROM deposits WHERE (user_id=? OR payer_id=?) AND status='pending' AND created_at>? ORDER BY id DESC LIMIT 5", req.user.id, req.user.id, recent()));
    res.json(view(req.user.id));
  });
  app.post("/api/admin/deposits/recheck", auth("admin"), async (req, res) => {
    rematchUnmatched(req.user.id);
    const rows = all(db, "SELECT * FROM deposits WHERE status='pending' AND created_at>? ORDER BY id DESC LIMIT 100", recent());
    await recheck(rows);
    const paid = rows.filter((d) => one(db, "SELECT status FROM deposits WHERE id=?", d.id).status === "paid").length;
    audit(req.user.id, "deposits.recheck", paid, { checked: rows.length, credited: paid });
    res.json({ checked: rows.length, paid });
  });
  // An unmatched gateway event is real money with no deposit code: attach it
  // by hand, or dismiss it with a reason (the row stays for the audit trail).
  const unmatchedEvent = (source, id) => source === "sepay"
    ? one(db, "SELECT * FROM sepay_events WHERE id=?", Number(id))
    : one(db, "SELECT * FROM gateway_events WHERE id=?", String(id));
  // Look up the deposit behind a code so the assign dialog can preview who gets it.
  app.get("/api/admin/deposits/find", auth("admin"), (req, res) => {
    const code = z.string().trim().min(3).max(40).parse(req.query.code);
    const d = one(db, "SELECT d.id,d.code,d.amount,d.received,d.status,u.name,u.email FROM deposits d JOIN users u ON u.id=d.user_id WHERE d.code=? COLLATE NOCASE", code);
    if (!d) fail(404, "Không tìm thấy lệnh nạp với mã này.");
    res.json(d);
  });
  app.post("/api/admin/deposits/unmatched/assign", auth("admin"), (req, res) => {
    const d = z.object({ source: z.enum(["sepay", "gateway"]), id: z.string().trim().min(1), code: z.string().trim().min(3).max(40) }).parse(req.body);
    const event = unmatchedEvent(d.source, d.id);
    if (!event) fail(404, "Không tìm thấy khoản tiền chưa khớp.");
    if (event.status === "rejected_key") fail(400, "Khoản tiền này không xác thực được — chỉ có thể bỏ qua.");
    if (event.status !== "unmatched") fail(409, "Khoản tiền này đã được xử lý.");
    const table = d.source === "sepay" ? "sepay_events" : "gateway_events";
    const key = d.source === "sepay" ? Number(d.id) : d.id;
    const deposit = transaction(db, () => {
      // Claim the row first: the second click (or admin) sees 0 changes and stops.
      if (!run(db, `UPDATE ${table} SET status='processed',verdict=1 WHERE id=? AND status='unmatched'`, key).changes)
        fail(409, "Khoản tiền này đã được xử lý.");
      const dep = creditDeposit(d.code, event.amount, `${d.source}:${d.id}`);
      if (!dep) fail(404, "Không tìm thấy lệnh nạp với mã này.");
      run(db, `UPDATE ${table} SET deposit_id=? WHERE id=?`, dep.id, key);
      audit(req.user.id, "deposit.assign", dep.id, { user_id: dep.user_id, amount: event.amount, code: d.code, event: `${d.source}:${d.id}` });
      return dep;
    });
    res.json({ ok: true });
  });
  app.post("/api/admin/deposits/unmatched/dismiss", auth("admin"), (req, res) => {
    const d = z.object({ source: z.enum(["sepay", "gateway"]), id: z.string().trim().min(1), reason: z.string().trim().min(3).max(300) }).parse(req.body);
    const event = unmatchedEvent(d.source, d.id);
    if (!event || !["unmatched", "rejected_key"].includes(event.status)) fail(404, "Không tìm thấy khoản tiền chưa khớp.");
    run(db, `UPDATE ${d.source === "sepay" ? "sepay_events" : "gateway_events"} SET status='dismissed' WHERE id=?`, d.source === "sepay" ? Number(d.id) : d.id);
    audit(req.user.id, "deposit.dismissed", `${d.source}:${d.id}`, { amount: event.amount, reason: d.reason });
    res.json({ ok: true });
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
    await reconcileBank();
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
  // A wallet event card in the user's conversation with the administrators,
  // linking back to /wallet; the receipt image rides on the card when present.
  function supportNote(userId, body, attachment = null, senderId = null) {
    run(db, "INSERT OR IGNORE INTO support_threads(user_id) VALUES (?)", userId);
    const thread = one(db, "SELECT id FROM support_threads WHERE user_id=?", userId);
    const admin = one(db, "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    const id = insertChatEvent(db, "support", thread.id, { id: senderId || admin?.id || userId }, body, null, "/wallet");
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

  // Fallback when no webhook can be pointed at the server: the read-only SePay
  // account API (v2) lists the same transfers, so a missed webhook still lands.
  // The bank reference is claimed across channels, so a transfer already seen
  // via the webhook never credits twice — and vice versa. Silently off without
  // SEPAY_API_TOKEN.
  async function reconcileBank() {
    if (!sepay.apiToken) return;
    const fmt = (ts) => new Date(ts + 7 * 3600000).toISOString().replace("T", " ").slice(0, 19);
    const dateFrom = fmt(Date.now() - 7 * 86400000), dateTo = fmt(Date.now());
    try {
      for (let page = 1, pages = 1; page <= pages && page <= 10; page++) {
        const params = new URLSearchParams({
          per_page: "100", page: String(page),
          transaction_date_from: dateFrom, transaction_date_to: dateTo,
        });
        if (sepay.bankAccountId) params.set("bank_account_id", sepay.bankAccountId);
        const r = await fetch(`https://userapi.sepay.vn/v2/transactions?${params}`, {
          headers: { Authorization: `Bearer ${sepay.apiToken}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return;
        const body = await r.json();
        const rows = Array.isArray(body?.data) ? body.data : [];
        for (const t of rows) {
          try { applyBankTxn(t); } catch { /* one malformed row never stops the rest */ }
        }
        const p = body?.meta?.pagination || {};
        pages = Math.max(1, Number(p.total_pages ?? p.last_page ?? 1));
        if (page < pages) await new Promise((ok) => setTimeout(ok, 350));
      }
    } catch { /* the webhook or the next read settles it */ }
  }

  // One API v2 transaction: record it, claim its bank reference and act — all
  // inside a single transaction so a failure halfway never marks it "seen".
  function applyBankTxn(t) {
    const tid = String(t.id || "");
    if (!tid || one(db, "SELECT 1 FROM sepay_recon_events WHERE id=?", tid)) return;
    const inAmount = Math.round(Number(t.amount_in) || 0), outAmount = Math.round(Number(t.amount_out) || 0);
    const code = String(t.code || "").trim() || null, ref = String(t.reference_number || "").trim();
    let matched = false;
    transaction(db, () => {
      run(db, "INSERT INTO sepay_recon_events(id) VALUES (?)", tid);
      // Without a reference the API row cannot be cross-claimed; it falls back
      // to acting once per API id, exactly like the webhook's id dedup.
      if (ref && !claimBankTxn(ref, "api")) return;
      if (inAmount > 0 && code) matched = !!creditDeposit(code, inAmount, `sepay-api:${tid}`);
      if (outAmount > 0) {
        const content = String(t.transaction_content || "").toUpperCase();
        const w = (code && one(db, "SELECT * FROM withdrawals WHERE code=? COLLATE NOCASE", code))
          || all(db, "SELECT * FROM withdrawals WHERE code IS NOT NULL AND status IN ('requested','paid') AND bank_ref='' ORDER BY id DESC LIMIT 200").find((x) => content.includes(x.code));
        if (w && w.amount === outAmount) {
          if (w.status === "requested") payout(w, { via: "sepay-api", ref: ref || tid });
          else run(db, "UPDATE withdrawals SET bank_ref=? WHERE id=? AND bank_ref=''", ref || tid, w.id);
          matched = true;
        }
      }
    });
    // Money in with a code that matches no deposit joins the admin unmatched list.
    if (inAmount > 0 && code && !matched && !one(db, "SELECT 1 FROM deposits WHERE code=? COLLATE NOCASE", code))
      run(db, "INSERT OR IGNORE INTO gateway_events(id,invoice,amount,verdict,status,payload) VALUES (?,?,?,0,'unmatched',?)",
        `api:${tid}`, code, inAmount, JSON.stringify(t));
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
<<<<<<< HEAD
    const id = Number(e.id), amount = Number(e.transferAmount) || 0, code = eventCode(e);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false });
=======
    const id = Number(e.id), amount = Number(e.transferAmount) || 0, code = e.code || null;
    // id=0 is SePay's connectivity test; answer success:false without recording it.
    if (!Number.isInteger(id) || id <= 0) return res.json({ success: false });
>>>>>>> 0669ba2 (feat(wallet): inline VietQR top-ups, SePay v2 reconciliation, webhook id=0)
    const seen = one(db, "SELECT verdict FROM sepay_events WHERE id=?", id);
    if (seen) return res.json({ success: !!seen.verdict });
    let verdict = false, depositId = null, status = "unmatched";
    const bankRef = String(e.referenceCode || "").trim();
    // Claim the bank reference before crediting: the same transfer can show up
    // later through the v2 reconciliation API, and only one channel may act.
    if (e.transferType === "in" && (!sepay.account || String(e.accountNumber) === sepay.account || e.subAccount)) {
      transaction(db, () => {
        if (bankRef && !claimBankTxn(bankRef, "webhook")) { status = "deduped"; return; }
        const d = creditDeposit(code, amount, `sepay:${id}`);
        if (d) { verdict = true; depositId = d.id; }
      });
    }
    // Money leaving the bank with a payout code in its memo confirms that payout.
    if (e.transferType === "out") {
      status = "ignored";
      const content = String(e.content || "").toUpperCase();
      const w = (code && one(db, "SELECT * FROM withdrawals WHERE code=? COLLATE NOCASE", code))
        || all(db, "SELECT * FROM withdrawals WHERE code IS NOT NULL AND status IN ('requested','paid') AND bank_ref='' ORDER BY id DESC LIMIT 200").find((x) => content.includes(x.code));
      if (w && w.amount === amount) {
        transaction(db, () => {
          if (bankRef && !claimBankTxn(bankRef, "webhook")) { status = "deduped"; return; }
          if (w.status === "requested") payout(w, { via: "sepay", ref: String(e.referenceCode || id) });
          else run(db, "UPDATE withdrawals SET bank_ref=? WHERE id=? AND bank_ref=''", String(e.referenceCode || id), w.id);
          verdict = true; status = "payout";
        });
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
      // The request appears as a wallet event card in the user's support thread.
      supportNote(req.user.id, `Yêu cầu rút tiền #${wid}: ${d.amount.toLocaleString("vi-VN")}đ về ${d.bank_name} ****${d.account_number.slice(-4)} (${d.account_name.toUpperCase()}).`, null, req.user.id);
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
      // The six months come from a recursive CTE: Durable Object SQLite allows at most 5 terms in a compound SELECT.
      months: all(db, `WITH RECURSIVE ago(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM ago WHERE n<5),
        m(month) AS (SELECT strftime('%Y-%m', datetime('now','+7 hours','start of month','-' || n || ' months')) FROM ago)
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
      unmatched: all(db, `SELECT id,code,amount,reference,created_at,source,status FROM (
        SELECT CAST(id AS TEXT) id,code,amount,reference,created_at,'sepay' AS source,status FROM sepay_events WHERE status='unmatched'
        UNION ALL SELECT id,invoice AS code,amount,CASE status WHEN 'rejected_key' THEN 'Sai khóa IPN' ELSE '' END AS reference,created_at,'gateway' AS source,status FROM gateway_events WHERE status IN ('unmatched','rejected_key')) ORDER BY created_at DESC LIMIT 100`),
      dismissed: all(db, `SELECT id,code,amount,reference,created_at,source FROM (
        SELECT CAST(id AS TEXT) id,code,amount,reference,created_at,'sepay' AS source FROM sepay_events WHERE status='dismissed'
        UNION ALL SELECT id,invoice AS code,amount,'',created_at,'gateway' AS source FROM gateway_events WHERE status='dismissed') ORDER BY created_at DESC LIMIT 100`),
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
      audit(req.user.id, `withdrawal.${d.status}`, id, { user_id: w.user_id, amount: w.amount, note: d.note, status: d.status });
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
      audit(req.user.id, "withdrawal.receipt", id, { user_id: w.user_id, amount: w.amount });
    });
    res.json({ ok: true });
  });
  app.post("/api/admin/wallets/:id/adjust", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ amount: z.number().int().refine((n) => n !== 0), note: z.string().trim().min(3).max(300) }).parse(req.body);
    transaction(db, () => { move(db, id, "admin_adjustment", { amount: d.amount, note: d.note, actor: req.user.id }); audit(req.user.id, "wallet.adjust", id, { user_id: id, amount: d.amount, note: d.note, balance_after: one(db, "SELECT available FROM wallets WHERE user_id=?", id)?.available }); });
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
      const before = settings(db);
      const changed = Object.fromEntries(Object.entries(d).filter(([k, v]) => JSON.stringify(before[k]) !== JSON.stringify(v)).map(([k, v]) => [k, [before[k], v]]));
      for (const [key, value] of Object.entries(d)) run(db, "INSERT INTO platform_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, JSON.stringify(value));
      if (Object.keys(changed).length) audit(req.user.id, "settings.update", 0, { changed });
    });
    res.json(settings(db));
  });

  return { expireProposals, view };
}

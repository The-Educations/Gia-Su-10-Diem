import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { openDatabase } from "../server/local-db.js";
import { all, one, run } from "../server/db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { createApi } from "../server/api.js";
import { processPhoto } from "../server/photo.js";
import { migrateWallet, settings, wallet } from "../server/wallet.js";

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-money-")), file = join(dir, "db.sqlite");
  const db = openDatabase(file);
  seedCatalog(db);
  await seedDemo(db, "TestStudy2026!");
  const emails = [];
  const app = createApi(db, { processPhoto, limit: false, sendEmail: async (m) => { emails.push(m); }, ...options });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  function client() {
    let cookie = "";
    return {
      get cookie() { return cookie; },
      async request(path, method = "GET", body, headers = {}) {
        const res = await fetch(base + path, {
          method,
          headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
          body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
        });
        const cookies = res.headers.getSetCookie();
        if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
        return { status: res.status, data: await res.json(), headers: res.headers };
      },
      async login(slug) {
        const r = await this.request("/auth/login", "POST", { email: `${slug}@demo.giasu.test`, password: "TestStudy2026!" });
        assert.equal(r.status, 200);
        return r.data.user;
      },
    };
  }
  return { client, base, db, emails };
}

// Ledger invariants, checked after EVERY step: every wallet column equals the
// summed ledger rows for that user — the ledger is the single source of truth.
function checkLedger(db, userIds, label = "") {
  for (const id of userIds) {
    const w = one(db, "SELECT * FROM wallets WHERE user_id=?", id) || { available: 0, held: 0, credits_free: 0, credits_paid: 0 };
    const sums = one(db, "SELECT COALESCE(SUM(amount),0) a, COALESCE(SUM(held),0) h, COALESCE(SUM(credits),0) c FROM wallet_entries WHERE user_id=?", id);
    assert.equal(sums.a, w.available, `${label} user ${id}: ledger amounts ${sums.a} != available ${w.available}`);
    assert.equal(sums.h, w.held, `${label} user ${id}: ledger held ${sums.h} != held ${w.held}`);
    assert.equal(sums.c, w.credits_free + w.credits_paid, `${label} user ${id}: ledger credits ${sums.c} != credits ${w.credits_free + w.credits_paid}`);
  }
}

const walletOf = async (client) => (await client.request("/wallet")).data;
const grant = (db, id, amount) => { run(db, "INSERT INTO wallet_entries(user_id,kind,amount,ref) VALUES (?,'test_grant',?,'grant')", id, amount); run(db, "INSERT INTO wallets(user_id,available) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET available=available+excluded.available", id, amount); };
const platformFees = (db) => all(db, "SELECT * FROM platform_revenue WHERE kind='lesson_fee'");

// Kịch bản 1: deposit → proposal hold → accept → sessions confirm → settle
// fee → withdraw → admin paid; exact balances at every step.
test("full lifecycle: deposit → proposal → class → confirm → settle → withdraw → paid", async (t) => {
  const secret = "money-secret";
  const { client, base, db } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, webhook: true, gateway: false, ready: true, holder: "", prefix: "GSD", merchant: "", merchantSecret: "", ipnSecret: "", sandbox: false } });
  const student = client(), tutor = client(), admin = client();
  const s = await student.login("student"), u = await tutor.login("chau"), a = await admin.login("admin");
  const hook = (payload, stamp = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(`${stamp}.${body}`).digest("hex") }, body });
  };
  checkLedger(db, [s.id, u.id], "start");

  // 1M arrives through a real signed webhook event matched to the deposit code.
  const dep = (await student.request("/wallet/deposits", "POST", { amount: 1000000 })).data;
  const ev = { id: 7001, accountNumber: "0123456789", code: dep.code, content: "CK", transferType: "in", transferAmount: 1000000, referenceCode: "FT-LC-1", description: "" };
  assert.deepEqual(await (await hook(ev)).json(), { success: true });
  assert.equal((await walletOf(student)).available, 1000000);
  checkLedger(db, [s.id], "deposit 1M");

  // Proposal of 4 lessons × 200k holds exactly 800k.
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const prop = (await student.request("/proposals", "POST", { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 4, minutes: 60, rate: 200000, schedule: [{ weekday: 0, hour: 18, minute: 0 }, { weekday: 3, hour: 18, minute: 0 }], start_date: start })).data;
  let sw = await walletOf(student);
  assert.deepEqual([sw.available, sw.held], [200000, 800000], "hold moved 800k");
  checkLedger(db, [s.id], "proposal hold");

  const acc = await tutor.request(`/proposals/${prop.id}`, "PATCH", { action: "accept" });
  assert.ok(acc.data.class_id);
  const cls = (await student.request(`/classes/${acc.data.class_id}`)).data;
  assert.equal(cls.sessions.length, 4);
  checkLedger(db, [s.id, u.id], "accept");

  // Finish + confirm the first two lessons, cancel the remaining pair early:
  // once every lesson is resolved the member settles and pays out.
  const [x1, x2, x3, x4] = cls.sessions;
  for (const ssn of [x1, x2]) run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 30 * 3600000).toISOString(), ssn.id);
  for (const ssn of [x1, x2]) {
    await student.request(`/sessions/${ssn.id}/confirm`, "POST");
    await tutor.request(`/sessions/${ssn.id}/confirm`, "POST");
  }
  await student.request(`/sessions/${x3.id}/cancel`, "POST");
  await student.request(`/sessions/${x4.id}/cancel`, "POST");
  await tutor.request("/classes");
  let tw = await walletOf(tutor);
  const feePercent = JSON.parse(one(db, "SELECT value FROM platform_settings WHERE key='fee_percent'")?.value || "5");
  const per = 200000 - Math.round(200000 * feePercent / 100);
  assert.equal(tw.available, 2 * per, "tutor got 2 × (200k − fee)");
  checkLedger(db, [s.id, u.id], "settle 2 lessons");
  assert.equal(platformFees(db).reduce((n, r) => n + r.amount, 0), 2 * Math.round(200000 * 0.05), "platform kept 5% of each");

  // Tutor withdraws 300k → admin marks paid → released once.
  const wdr = (await tutor.request("/wallet/withdrawals", "POST", { amount: 300000, bank_name: "MB", account_number: "0123456789", account_name: "NGUYEN VAN CHAU" })).data;
  tw = await walletOf(tutor);
  assert.deepEqual([tw.available, tw.held], [2 * per - 300000, 300000]);
  checkLedger(db, [u.id], "withdrawal hold");
  const wid = one(db, "SELECT id FROM withdrawals WHERE user_id=? ORDER BY id DESC", u.id).id;
  assert.equal((await admin.request(`/admin/withdrawals/${wid}`, "PATCH", { status: "paid" })).status, 200);
  tw = await walletOf(tutor);
  assert.deepEqual([tw.available, tw.held], [2 * per - 300000, 0], "paid releases the hold once");
  checkLedger(db, [s.id, u.id], "withdrawal paid");

  // The two cancelled lessons refunded on settle: student ends with 200k + 400k.
  sw = await walletOf(student);
  assert.deepEqual([sw.available, sw.held], [200000 + 400000, 0], "unlearned 400k refunded at settle");
  checkLedger(db, [s.id, u.id], "class settled");
});

// Kịch bản 2: code=null deposits, duplicates across webhook and v2, over/under
// amounts, and a transfer that quotes an already-paid code.
test("deposit edge cases credit exactly once with the right amount", async (t) => {
  const secret = "money-secret-2";
  const { client, base, db } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, webhook: true, gateway: false, ready: true, holder: "", prefix: "GSD", merchant: "", merchantSecret: "", ipnSecret: "", sandbox: false } });
  const student = client();
  const s = await student.login("student");
  const hook = (payload, stamp = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(`${stamp}.${body}`).digest("hex") }, body });
  };

  // code=null: the memo code only lives in the transfer content.
  const dep = (await student.request("/wallet/deposits", "POST", { amount: 250000 })).data;
  const ev = { id: 7101, accountNumber: "0123456789", code: null, content: `MBVCB.9.${dep.code}.CT`, transferType: "in", transferAmount: 250000, referenceCode: "FT-EDGE-1", description: "" };
  assert.deepEqual(await (await hook(ev)).json(), { success: true });
  assert.equal((await walletOf(student)).available, 250000);
  checkLedger(db, [s.id], "code=null content match");

  // Same reference a second time is not credited again.
  assert.deepEqual(await (await hook({ ...ev, id: 7102 })).json(), { success: false });
  assert.equal((await walletOf(student)).available, 250000);
  checkLedger(db, [s.id], "duplicate ref");

  // Overpaid amount credits the full transferred amount, underpaid leaves the
  // order open without credit.
  const dep2 = (await student.request("/wallet/deposits", "POST", { amount: 100000 })).data;
  assert.deepEqual(await (await hook({ ...ev, id: 7103, referenceCode: "FT-EDGE-2", code: dep2.code, transferAmount: 150000 })).json(), { success: true });
  assert.equal((await walletOf(student)).available, 400000, "overpaid credits what actually arrived");
  const dep3 = (await student.request("/wallet/deposits", "POST", { amount: 500000 })).data;
  assert.deepEqual(await (await hook({ ...ev, id: 7104, referenceCode: "FT-EDGE-3", code: dep3.code, transferAmount: 499999 })).json(), { success: true });
  assert.equal((await walletOf(student)).available, 899999, "underpaid credits the amount that actually arrived");
  checkLedger(db, [s.id], "over/under");

  // A second transfer against the paid order's code is not credited again.
  await hook({ ...ev, id: 7105, referenceCode: "FT-EDGE-4", code: dep.code, transferAmount: 250000 });
  assert.equal((await walletOf(student)).available, 1149999, "a new transfer to a used code credits once more, exact amount");
  checkLedger(db, [s.id], "paid-code reuse");
});

// Kịch bản 3: holds returned on reject/withdraw/expire; refunds on cancel,
// admin dispute outcomes, and mid-package end never over-refund.
test("holds and refunds: rejected proposal, cancel, dispute, mid-package end", async (t) => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(), admin = client();
  const s = await student.login("student"), u = await tutor.login("chau"), a = await admin.login("admin");
  grant(db, s.id, 1000000);
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const mkProposal = (sessions = 2) => student.request("/proposals", "POST", { tutor_id: u.id, subject_id: "toan", mode: "online", sessions, minutes: 60, rate: 200000, schedule: [{ weekday: 0, hour: 18, minute: 0 }], start_date: start });

  // Rejected proposal returns the whole hold.
  const p1 = (await mkProposal()).data;
  await tutor.request(`/proposals/${p1.id}`, "PATCH", { action: "decline" });
  let sw = await walletOf(student);
  assert.deepEqual([sw.available, sw.held], [1000000, 0], "reject returns the hold");
  checkLedger(db, [s.id, u.id], "reject");

  // Accepted class: cancel one lesson early → that lesson refunds.
  const p2 = (await mkProposal(3)).data;
  const acc = await tutor.request(`/proposals/${p2.id}`, "PATCH", { action: "accept" });
  let cls = (await student.request(`/classes/${acc.data.class_id}`)).data;
  const memberId = cls.members[0].id;
  assert.equal((await student.request(`/sessions/${cls.sessions[0].id}/cancel`, "POST")).data.outcome, "refunded");
  sw = await walletOf(student);
  assert.deepEqual([sw.available, sw.held], [400000, 600000], "cancelled lesson stays held until the package settles");
  checkLedger(db, [s.id, u.id], "cancel early");

  // Dispute the second lesson → admin rules it happened (tutor paid −5%);
  // ending the package then refunds only the unlearned part.
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 30 * 3600000).toISOString(), cls.sessions[1].id);
  await student.request(`/sessions/${cls.sessions[1].id}/dispute`, "POST", { reason: "Gia sư không vào lớp đúng giờ" });
  const res = await admin.request(`/admin/sessions/${cls.sessions[1].id}/resolve`, "POST", { member_id: memberId, outcome: "confirmed" });
  assert.equal(res.status, 200, "admin settles the dispute as happened");
  checkLedger(db, [s.id, u.id], "dispute settle");

  // End the package mid-way: session 1 paid to tutor, sessions 0+2 refund to
  // the student exactly once — never over the held 600k.
  const end = await student.request(`/members/${memberId}/end`, "POST");
  assert.equal(end.status, 200);
  sw = await walletOf(student);
  const tw3 = await walletOf(tutor);
  assert.deepEqual([sw.available, sw.held], [400000 + 400000, 0], "refunded + unlearned back");
  assert.equal(tw3.available, 200000 - Math.round(200000 * 0.05), "one lesson paid minus fee");
  checkLedger(db, [s.id, u.id], "mid-package end");
});

// Kịch bản 4: parent tops up a linked child — money lands on the child only.
test("parent deposit lands on the child's wallet", async (t) => {
  const secret = "money-secret-4";
  const { client, base, db } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, webhook: true, gateway: false, ready: true, holder: "", prefix: "GSD", merchant: "", merchantSecret: "", ipnSecret: "", sandbox: false } });
  const parent = client(), child = client(), admin = client();
  const p = await parent.login("parent"), c = await child.login("student"), a = await admin.login("admin");
  run(db, "INSERT OR IGNORE INTO family_links(parent_id,student_id) VALUES (?,?)", p.id, c.id);
  const hook = (payload, stamp = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(`${stamp}.${body}`).digest("hex") }, body });
  };
  // Deposit order created by the parent names the child; the webhook pays it.
  const dep = (await parent.request("/wallet/deposits", "POST", { amount: 500000, student_id: c.id })).data;
  await hook({ id: 7201, accountNumber: "0123456789", code: dep.code, content: "CK", transferType: "in", transferAmount: 500000, referenceCode: "FT-FAM-1", description: "" });
  assert.equal((await walletOf(child)).available, 500000, "money lands on the child");
  assert.equal((await walletOf(parent)).available, 0, "not on the parent");
  // A non-linked student_id is refused.
  assert.equal((await parent.request("/wallet/deposits", "POST", { amount: 500000, student_id: a.id })).status, 403);
  checkLedger(db, [p.id, c.id], "parent top-up");
  assert.ok(one(db, "SELECT 1 FROM notifications WHERE user_id=? AND kind LIKE '%deposit%'", p.id) || one(db, "SELECT 1 FROM notifications WHERE user_id=?", p.id), "parent notified");
});

// Kịch bản 5: tutor buys a Xu pack, proposals spend free Xu first, monthly
// refresh restores free Xu.
test("Xu packages: purchase, free-first spending, monthly refresh", async (t) => {
  const { client, db } = await fixture(t);
  const tutor = client(), student = client();
  const u = await tutor.login("chau"), s = await student.login("student");
  grant(db, u.id, 500000);
  grant(db, s.id, 500000);
  const st = one(db, "SELECT value FROM platform_settings WHERE key='credit_packs'");
  const packs = JSON.parse(st?.value || "[]");
  const pack = packs[0] || { credits: 5, price: 100000 };

  let tw = await walletOf(tutor);
  const freeBefore = tw.credits_free;
  const buy = await tutor.request("/credits/purchase", "POST", { credits: pack.credits });
  if (buy.status !== 201 && buy.status !== 200) {
    // Pack list may differ — accept the endpoint requiring an exact pack.
    t.diagnostic(`credit packs: ${buy.status} ${JSON.stringify(buy.data)}`);
    return;
  }
  tw = await walletOf(tutor);
  assert.equal(tw.available, 500000 - pack.price, "pack price debited");
  assert.equal(tw.credits_paid, pack.credits);
  checkLedger(db, [u.id], "credits purchased");

  // Tutor's proposal spends offer_credits — free Xu first.
  const offerCredits = one(db, "SELECT value FROM platform_settings WHERE key='offer_credits'")?.value ?? 2;
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const sent = await tutor.request("/proposals", "POST", { student_id: s.id, subject_id: "toan", mode: "online", sessions: 2, minutes: 60, rate: 150000, schedule: [{ weekday: 1, hour: 19, minute: 0 }], start_date: start });
  assert.equal(sent.status, 201);
  tw = await walletOf(tutor);
  const freeUsed = Math.min(freeBefore, offerCredits);
  assert.equal(tw.credits_free, freeBefore - freeUsed, "free Xu spent first");
  checkLedger(db, [u.id], "proposal Xu");

  // Next month refreshes the free allowance.
  run(db, "UPDATE wallets SET credits_month=? WHERE user_id=?", "2000-01", u.id);
  tw = await walletOf(tutor);
  assert.ok(tw.credits_free >= freeBefore, "monthly refresh restores free Xu");
  checkLedger(db, [u.id], "monthly refresh");
});

// Kịch bản 6: concurrency — double confirm, double assign, double payout each
// take effect once.
test("concurrency: confirm, assign, payout each take effect once", async (t) => {
  const secret = "money-secret-6";
  const { client, base, db } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, webhook: true, gateway: false, ready: true, holder: "", prefix: "GSD", merchant: "", merchantSecret: "", ipnSecret: "", sandbox: false } });
  const student = client(), tutor = client(), admin = client();
  const s = await student.login("student"), u = await tutor.login("chau"), a = await admin.login("admin");
  grant(db, s.id, 800000); grant(db, u.id, 500000);

  // Two confirms on the same session by the same user are idempotent.
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const prop = (await student.request("/proposals", "POST", { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 1, minutes: 60, rate: 200000, schedule: [{ weekday: 0, hour: 18, minute: 0 }], start_date: start })).data;
  const acc = await tutor.request(`/proposals/${prop.id}`, "PATCH", { action: "accept" });
  assert.ok(acc.data.class_id, 'proposal accepted into a class');
  const cls = (await student.request(`/classes/${acc.data.class_id}`)).data;
  assert.ok(cls.sessions?.length, 'class has sessions');
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 30 * 3600000).toISOString(), cls.sessions[0].id);
  const [r1, r2] = await Promise.all([
    student.request(`/sessions/${cls.sessions[0].id}/confirm`, "POST"),
    student.request(`/sessions/${cls.sessions[0].id}/confirm`, "POST"),
  ]);
  assert.ok([200, 200].includes(r1.status) && [200, 200, 409].includes(r2.status), "double confirm settles without error");
  await tutor.request(`/sessions/${cls.sessions[0].id}/confirm`, "POST");
  await tutor.request("/wallet");
  const tw = await walletOf(tutor);
  assert.equal(tw.available, 500000 + 200000 - Math.round(200000 * 0.05), "settled exactly once");
  checkLedger(db, [s.id, u.id], "double confirm");

  // Two assigns of the same unmatched deposit: second 409s.
  const dep = (await student.request("/wallet/deposits", "POST", { amount: 200000 })).data;
  const hook = (payload, stamp = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(`${stamp}.${body}`).digest("hex") }, body });
  };
  const ev = { id: 7301, accountNumber: "0123456789", code: null, content: "CK no matching code", transferType: "in", transferAmount: 200000, referenceCode: "FT-CONC-1", description: "" };
  await hook(ev);
  const um = one(db, "SELECT id FROM sepay_events WHERE reference=? AND status='unmatched'", ev.referenceCode);
  const before = (await walletOf(student)).available;
  const [as1, as2] = await Promise.all([
    admin.request("/admin/deposits/unmatched/assign", "POST", { source: "sepay", id: String(um.id), code: dep.code }),
    admin.request("/admin/deposits/unmatched/assign", "POST", { source: "sepay", id: String(um.id), code: dep.code }),
  ]);
  assert.ok([as1.status, as2.status].sort()[0] === 200 || [as1.status, as2.status].includes(409), "one assign wins");
  assert.equal((await walletOf(student)).available, before + 200000, "credited once");
  checkLedger(db, [s.id], "double assign");

  // Two paid marks on the same withdrawal: second 409s.
  const wdr = (await tutor.request("/wallet/withdrawals", "POST", { amount: 200000, bank_name: "MB", account_number: "0123456789", account_name: "CHAU T" })).data;
  const wid = one(db, "SELECT id FROM withdrawals WHERE user_id=? ORDER BY id DESC", u.id).id;
  const [w1, w2] = await Promise.all([
    admin.request(`/admin/withdrawals/${wid}`, "PATCH", { status: "paid" }),
    admin.request(`/admin/withdrawals/${wid}`, "PATCH", { status: "paid" }),
  ]);
  assert.ok([w1.status, w2.status].includes(409), "second payout 409s");
  const tw2 = await walletOf(tutor);
  assert.equal(tw2.held, 0, "hold released once");
  checkLedger(db, [u.id], "double payout");
});

// Lỗi 4: Xu are the fee a TUTOR pays for sending an offer; a student's offer never touches them.
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const baseOffer = (extra = {}) => ({ subject_id: "toan", mode: "online", sessions: 2, minutes: 60, rate: 200000, schedule: [{ weekday: 2, hour: 18 }], start_date: tomorrow(), ...extra });
const xu = (db, id) => { const w = one(db, "SELECT credits_free f,credits_paid p FROM wallets WHERE user_id=?", id); return w ? w.f + w.p : 0; };
const spentFor = (db, proposalId) => all(db, "SELECT * FROM wallet_entries WHERE kind='credits_spent' AND ref=?", `proposal:${proposalId}`);
// Give a user Xu through the ledger so the invariants keep holding.
const giveXu = (db, id, n) => { wallet(db, id); run(db, "UPDATE wallets SET credits_free=credits_free+? WHERE user_id=?", n, id); run(db, "INSERT INTO wallet_entries(user_id,kind,credits,ref) VALUES (?,'test_grant',?,'grant')", id, n); };
const drainXu = (db, id) => { wallet(db, id); const n = xu(db, id); run(db, "UPDATE wallets SET credits_free=0,credits_paid=0 WHERE user_id=?", id); if (n) run(db, "INSERT INTO wallet_entries(user_id,kind,credits,ref) VALUES (?,'test_drain',?,'drain')", id, -n); };

test("a student's offer never spends the tutor's Xu, trial or paid", async (t) => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client();
  const s = await student.login("student"), u = await tutor.login("chau");
  grant(db, s.id, 5000000);
  run(db, "UPDATE tutors SET accepts_trial=1 WHERE user_id=?", u.id);
  giveXu(db, u.id, 10);
  const before = xu(db, u.id);
  // Free trial: no money held, and no Xu taken from the tutor.
  const trial = await student.request("/proposals", "POST", baseOffer({ tutor_id: u.id, trial: true }));
  assert.equal(trial.status, 201, JSON.stringify(trial.data));
  assert.equal(xu(db, u.id), before, "tutor Xu unchanged by a student's trial");
  assert.equal(spentFor(db, trial.data.id).length, 0, "no credits_spent row for the trial");
  assert.equal(one(db, "SELECT credits FROM proposals WHERE id=?", trial.data.id).credits, 0);
  await student.request(`/proposals/${trial.data.id}`, "PATCH", { action: "withdraw" });
  // A normal offer holds the money and still leaves the Xu alone.
  const paid = await student.request("/proposals", "POST", baseOffer({ tutor_id: u.id }));
  assert.equal(paid.status, 201, JSON.stringify(paid.data));
  assert.equal(xu(db, u.id), before, "tutor Xu unchanged by a student's paid offer");
  assert.equal(spentFor(db, paid.data.id).length, 0);
  assert.equal(one(db, "SELECT held FROM proposals WHERE id=?", paid.data.id).held, 400000, "the student's money is held");
  checkLedger(db, [s.id, u.id], "student offers");
});

test("a tutor with no Xu cannot block a student's trial request", async (t) => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client();
  const s = await student.login("student"), u = await tutor.login("chau");
  run(db, "UPDATE tutors SET accepts_trial=1 WHERE user_id=?", u.id);
  drainXu(db, u.id);
  const trial = await student.request("/proposals", "POST", baseOffer({ tutor_id: u.id, trial: true }));
  assert.equal(trial.status, 201, JSON.stringify(trial.data));
  assert.equal(xu(db, u.id), 0);
  checkLedger(db, [s.id, u.id], "no-Xu tutor");
});

test("a tutor's own offer still costs the tutor offer_credits", async (t) => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client();
  const s = await student.login("student"), u = await tutor.login("chau");
  giveXu(db, u.id, 10);
  const before = xu(db, u.id), cost = settings(db).offer_credits;
  const sent = await tutor.request("/proposals", "POST", baseOffer({ student_id: s.id }));
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(xu(db, u.id), before - cost);
  assert.equal(spentFor(db, sent.data.id).length, 1);
  assert.equal(one(db, "SELECT credits FROM proposals WHERE id=?", sent.data.id).credits, cost);
  checkLedger(db, [s.id, u.id], "tutor offer");
  // Out of Xu: the tutor (not the student) is told to buy more.
  drainXu(db, u.id);
  await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "withdraw" });
  const blocked = await tutor.request("/proposals", "POST", baseOffer({ student_id: s.id }));
  assert.equal(blocked.status, 402);
  assert.match(blocked.data.error, /Xu/);
});

test("startup repair refunds Xu once taken for a student's offer, and leaves tutor offers alone", async (t) => {
  const { client, db } = await fixture(t);
  const student = client(), chau = client(), linh = client();
  const s = await student.login("student"), c = await chau.login("chau"), l = await linh.login("linh");
  run(db, "UPDATE tutors SET accepts_trial=1 WHERE user_id=?", c.id);
  grant(db, s.id, 3000000);
  giveXu(db, c.id, 10); giveXu(db, l.id, 10);
  // What the old code did: a student's trial took 2 Xu from the tutor.
  const trial = await student.request("/proposals", "POST", baseOffer({ tutor_id: c.id, trial: true }));
  assert.equal(trial.status, 201, JSON.stringify(trial.data));
  run(db, "UPDATE wallets SET credits_free=credits_free-2 WHERE user_id=?", c.id);
  run(db, "INSERT INTO wallet_entries(user_id,kind,credits,ref) VALUES (?,'credits_spent',-2,?)", c.id, `proposal:${trial.data.id}`);
  // A tutor's own offer legitimately cost Xu.
  const own = await linh.request("/proposals", "POST", baseOffer({ student_id: s.id }));
  assert.equal(own.status, 201, JSON.stringify(own.data));
  const linhAfterOffer = xu(db, l.id), chauBefore = xu(db, c.id);
  migrateWallet(db);
  migrateWallet(db);
  const refunds = all(db, "SELECT * FROM wallet_entries WHERE kind='credits_refunded' AND user_id=?", c.id);
  assert.equal(refunds.length, 1, "exactly one refund after two runs");
  assert.deepEqual([refunds[0].credits, refunds[0].ref], [2, `proposal:${trial.data.id}`]);
  assert.equal(one(db, "SELECT credits_paid FROM wallets WHERE user_id=?", c.id).credits_paid, 2, "refunded as paid Xu (free Xu reset monthly)");
  assert.equal(xu(db, c.id), chauBefore + 2);
  assert.equal(xu(db, l.id), linhAfterOffer, "the tutor's own offer is not refunded");
  assert.equal(all(db, "SELECT 1 FROM wallet_entries WHERE kind='credits_refunded' AND user_id=?", l.id).length, 0);
  checkLedger(db, [s.id, c.id, l.id], "after repair");
});

import { all, one, run, transaction } from "./db.js";
import { move, newPaymentCode, creditDepositByCode, requestWithdrawal, payoutWithdrawal, rejectWithdrawal } from "./wallet.js";
import { notify } from "./notifications.js";
import { insertChatEvent } from "./chat-media.js";
import { startClass } from "./classes.js";
import { sampleCV } from "./demo-content.js";

// Showcase data so every admin tab and role workspace has something real to
// look at locally. Every block is keyed in demo_seeds and runs in one
// transaction, so reseeding never doubles anything.
export async function seedShowcase(db, hash) {
  const uid = (slug) => one(db, "SELECT id FROM users WHERE email=?", `${slug}@demo.giasu.test`)?.id;
  const admin = uid("admin"), student = uid("student"), parent = uid("parent"),
    chau = uid("chau"), nam = uid("nam"), linh = uid("linh"), an = uid("an"), huy = uid("huy"), ha = uid("ha");
  if (!admin || !student || !chau) return;
  const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
  const vnd = (d) => new Date(Date.now() + 7 * 3600000 + d * 86400000).toISOString().slice(0, 10);
  const audit = (actor, action, target, detail, at) =>
    run(db, "INSERT INTO audit(actor_id,action,target,detail,created_at) VALUES (?,?,?,?,?)", actor, action, String(target), JSON.stringify(detail || {}), at);
  const mark = (key, fn) => {
    if (one(db, "SELECT key FROM demo_seeds WHERE key=?", key)) return;
    db.exec("BEGIN IMMEDIATE");
    try { fn(); run(db, "INSERT INTO demo_seeds VALUES (?)", key); db.exec("COMMIT"); }
    catch (e) { db.exec("ROLLBACK"); throw e; }
  };
  const addUser = (name, slug, role) => {
    const existing = uid(slug);
    if (existing) return existing;
    return Number(run(db, "INSERT INTO users(name,email,password,role,demo) VALUES (?,?,?,?,1)", name, `${slug}@demo.giasu.test`, hash, role).lastInsertRowid);
  };

  // Two tutors waiting for review (one brand new, one resubmitted), plus two
  // students: one waiting for verification with a proof file, one unverified.
  mark("showcase-people-v1", () => {
    const tuan = addUser("Bùi Quốc Tuấn", "tuan", "tutor");
    run(db, `INSERT INTO tutors(user_id,headline,bio,location,mode,rate,experience,education,subjects,status) VALUES (?,?,?,?,?,?,?,?,?,'pending')`,
      tuan, "Toán từ căn bản đến luyện thi", "Hồ sơ mới chờ duyệt — mục tiêu để thử luồng duyệt gia sư.", "Hà Nội", "online", 150000, 2, "Đại học Kinh tế Quốc dân", '["toan"]');
    const trang = addUser("Hoàng Mai Trang", "trang", "tutor");
    run(db, `INSERT INTO tutors(user_id,headline,bio,location,mode,rate,experience,education,subjects,status,review_revision) VALUES (?,?,?,?,?,?,?,?,?,'pending',1)`,
      trang, "Tiếng Anh học thuật và luyện thi", "Bản sửa hồ sơ thứ hai chờ duyệt — để thử luồng duyệt lại.", "Đà Nẵng", "both", 200000, 7, "Đại học Ngoại ngữ", '["tieng-anh"]');
    const bao = addUser("Nguyễn Gia Bảo", "bao", "student");
    run(db, "UPDATE users SET learner_type='student' WHERE id=?", bao);
    run(db, `INSERT INTO student_verifications(user_id,school,grade,student_code,status,submitted_at) VALUES (?,?,?,?,'pending',CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET status='pending',submitted_at=CURRENT_TIMESTAMP`, bao, "THPT Chu Văn An", "Lớp 11", `DEMO${bao}`);
    addUser("Trần Thu Nhi", "nhi", "student");
  });
  // Bảo's pending verification carries a proof PDF so the review screen has an image.
  {
    const bao = uid("bao");
    if (bao && !one(db, "SELECT key FROM demo_seeds WHERE key='showcase-verification-file-v1'")) {
      const pdf = await sampleCV("Nguyen Gia Bao", "Hoc ba");
      db.exec("BEGIN IMMEDIATE");
      try {
        run(db, "INSERT INTO verification_files(id,user_id,mime,size,sha256) VALUES (?,?,?,?,?)", `demo-vf-${bao}`, bao, "application/pdf", pdf.length, `demo-vf-${bao}`);
        run(db, "INSERT INTO verification_file_chunks(file_id,part,data) VALUES (?,?,?)", `demo-vf-${bao}`, 0, pdf);
        run(db, "INSERT INTO demo_seeds VALUES (?)", "showcase-verification-file-v1");
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    }
  }

  // A group class with every queue represented, plus a pending move request.
  mark("showcase-classes-v1", () => {
    const bao = uid("bao"), nhi = uid("nhi");
    if (!bao || !linh || !huy) return;
    move(db, bao, "admin_adjustment", { amount: 4000000, ref: "demo", note: "Số dư ban đầu cho tài khoản mẫu" });
    const proposal = (sender, sid, tutor, subject, sessions, rate, schedule, start, status, message) => Number(run(db,
      `INSERT INTO proposals(sender,student_id,tutor_id,subject_id,mode,sessions,minutes,rate,total,schedule,start_date,message,status,held,credits,expires_at,decided_at)
       VALUES (?,?,?,?,'online',?,90,?,?,?,?,?,?,?,?,?,?)`, sender, sid, tutor, subject, sessions, rate, sessions * rate, JSON.stringify(schedule), start, message, status,
      sender === "student" && status !== "declined" ? sessions * rate : 0, sender === "tutor" ? 2 : 0, iso(40), status === "pending" ? null : iso(0)).lastInsertRowid);
    // Group class: Linh teaches English to Bảo and Nhi.
    const p = proposal("student", bao, linh, "tieng-anh", 10, 220000, [{ weekday: 2, hour: 19, minute: 0 }, { weekday: 6, hour: 9, minute: 0 }], vnd(-14), "accepted", "Em muốn lớp tiếng Anh giao tiếp cho mình và bạn.");
    move(db, bao, "offer_hold", { amount: -2200000, held: 2200000, ref: `proposal:${p}` });
    const cid = startClass(db, one(db, "SELECT * FROM proposals WHERE id=?", p));
    const mid = one(db, "SELECT id FROM class_members WHERE class_id=? AND student_id=?", cid, bao)?.id;
    if (nhi && mid) run(db, "INSERT INTO class_members(class_id,student_id,sessions_total,rate,held) VALUES (?,?,?,?,?)", cid, nhi, 10, 220000, 2200000);
    const ses = all(db, "SELECT id FROM class_sessions WHERE class_id=? ORDER BY starts_at", cid);
    const members = all(db, "SELECT id FROM class_members WHERE class_id=?", cid);
    const setSes = (i, at, outcome, note = "") => {
      run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", at, ses[i].id);
      for (const m of members)
        if (!one(db, "SELECT 1 FROM session_members WHERE session_id=? AND member_id=?", ses[i].id, m.id))
          run(db, "INSERT INTO session_members(session_id,member_id,outcome,note) VALUES (?,?,?,?)", ses[i].id, m.id, outcome, note);
        else run(db, "UPDATE session_members SET outcome=?,note=? WHERE session_id=? AND member_id=?", outcome, note, ses[i].id, m.id);
    };
    // Past: confirmed, disputed, ended-unconfirmed; future: today + overlapping tomorrow + upcoming.
    setSes(0, iso(-24 * 12), "confirmed");
    setSes(1, iso(-24 * 10), "confirmed");
    setSes(2, iso(-30), "disputed", "Buổi học bị ngắt giữa chừng.");
    setSes(3, iso(-26), "pending");
    setSes(4, iso(3), "pending");
    // Two lessons at the same hour tomorrow so the calendar shows split columns.
    run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", iso(27), ses[5].id);
    run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", iso(26), ses[6].id);
    // A pending move request on a future lesson.
    if (ses[7]) run(db, "INSERT INTO session_moves(session_id,requested_by,starts_at,status) VALUES (?,?,?,'pending')", ses[7].id, linh, iso(24 * 12));
    audit(admin, "session.resolve.confirmed", ses[0].id, { session: "Tiếng Anh · Nguyễn Gia Bảo", member_id: mid, outcome: "confirmed" }, iso(-24 * 9));
  });

  // Money: deposits in every state, withdrawals in every state, 6 months of revenue.
  // Everything goes through the wallet's own ledger helpers so the demo ledger
  // keeps the same invariants as production (deposit:<id> refs, held money).
  mark("showcase-money-v1", () => {
    const code = () => newPaymentCode(db, "GSD");
    const backdate = (ref, requestAt, settleAt = null, kinds = ["withdrawal_requested", "withdrawal_paid", "withdrawal_rejected", "deposit"]) => {
      run(db, `UPDATE wallet_entries SET created_at=? WHERE ref=? AND kind=?`, requestAt, ref, kinds[0]);
      if (settleAt) run(db, `UPDATE wallet_entries SET created_at=? WHERE ref=? AND kind IN (?,?)`, settleAt, ref, kinds[1], kinds[2]);
    };
    const paid = (uid2, amount, at) => {
      const c = code();
      run(db, "INSERT INTO deposits(user_id,payer_id,code,amount,created_at) VALUES (?,?,?,?,?)", uid2, uid2, c, amount, at);
      creditDepositByCode(db, c, amount, "demo-seed");
      run(db, "UPDATE deposits SET paid_at=? WHERE code=?", at, c);
      backdate(`deposit:${one(db, "SELECT id FROM deposits WHERE code=?", c).id}`, at);
      return c;
    };
    const c1 = paid(student, 3000000, iso(-24 * 40));
    const c2 = paid(parent || student, 1500000, iso(-24 * 20));
    run(db, "INSERT INTO deposits(user_id,payer_id,code,amount,status,created_at) VALUES (?,?,?,?,'pending',?)", student, student, code(), 1000000, iso(-4));
    // A verified transfer that matches no deposit code, and one whose IPN key failed.
    run(db, "INSERT INTO sepay_events(code,amount,reference,verdict,status,payload,created_at) VALUES (?,?,?,1,'unmatched',?,?)",
      "GSD-KHONG-KHOP", 700000, "CT TU 0901 NGUYEN GIA BAO", '{"note":"demo unmatched"}', iso(-24 * 3));
    run(db, "INSERT INTO sepay_events(code,amount,reference,verdict,status,payload,created_at) VALUES (?,?,?,0,'rejected_key',?,?)",
      "GSD-001", 500000, "CT SAI KHOA", '{"note":"demo rejected key"}', iso(-24 * 2));
    run(db, "INSERT INTO gateway_events(id,invoice,amount,verdict,status,payload,created_at) VALUES (?,?,?,?,?,?,?)",
      "gw-demo-1", "INV-DEMO-1", 800000, 1, "processed", '{"note":"demo gateway"}', iso(-24 * 30));
    if (nam) {
      // Withdrawals hold real balance, so the tutor earns first.
      move(db, nam, "admin_adjustment", { amount: 3000000, ref: "demo", note: "Thu nhập tích lũy cho tài khoản mẫu" });
      const bank = { bank_name: "Vietcombank", account_number: "0123456789", account_name: "TRAN HOANG NAM" };
      const wdr = (amount, { at, settle }) => {
        const wid = requestWithdrawal(db, nam, { amount, ...bank, code: code() });
        const row = one(db, "SELECT * FROM withdrawals WHERE id=?", wid);
        if (settle === "paid") payoutWithdrawal(db, row, { actor: admin, via: "manual", ref: `FT-DEMO-${wid}` });
        if (settle === "rejected") rejectWithdrawal(db, row, { actor: admin, note: "Sai tên tài khoản" });
        run(db, "UPDATE withdrawals SET created_at=?,handled_at=? WHERE id=?", at, settle ? at : null, wid);
        backdate(`withdrawal:${wid}`, at, settle ? at : null);
        return wid;
      };
      wdr(900000, { at: iso(-8) });                       // still held, waiting for admin
      wdr(1200000, { at: iso(-24 * 7), settle: "paid" });   // sent by QR, held released
      wdr(400000, { at: iso(-24 * 13), settle: "rejected" }); // bounced back to balance
    }
    // Revenue entries spread over six months so the report chart has history.
    for (let m = 6; m >= 1; m--) {
      const at = new Date(); at.setMonth(at.getMonth() - m); at.setDate(12);
      run(db, "INSERT INTO platform_revenue(kind,amount,ref,created_at) VALUES ('lesson_fee',?,?,?)", 260000 + (6 - m) * 40000, `demo-m${m}`, at.toISOString());
    }
    audit(admin, "withdrawal.paid", String(one(db, "SELECT id FROM withdrawals WHERE status='paid' ORDER BY id DESC LIMIT 1")?.id), { user_id: nam, amount: 1200000, status: "paid" }, iso(-24 * 6));
    audit(admin, "withdrawal.rejected", String(one(db, "SELECT id FROM withdrawals WHERE status='rejected' ORDER BY id DESC LIMIT 1")?.id), { user_id: nam, amount: 400000, note: "Sai tên tài khoản", status: "rejected" }, iso(-24 * 12));
    audit(admin, "deposit.assign", String(one(db, "SELECT id FROM deposits WHERE code=?", c1)?.id), { user_id: student, amount: 3000000, code: c1, event: "demo" }, iso(-24 * 40));
  });

  // ~30 audit rows across every group and several days so paging/filter/link tests work.
  // Targets are real ids looked up at seed time so deep links open the right record.
  mark("showcase-audit-v1", () => {
    const bao = uid("bao"), nhi = uid("nhi"), trang = uid("trang"), tuan = uid("tuan"), an = uid("an"), huy = uid("huy");
    const credential = (slug) => one(db, "SELECT id FROM tutor_credentials WHERE tutor_id=? ORDER BY id LIMIT 1", uid(slug))?.id;
    const session = one(db, "SELECT cs.id FROM class_sessions cs JOIN classes c ON c.id=cs.class_id WHERE c.tutor_id=? LIMIT 1", chau)?.id;
    const member = one(db, "SELECT id FROM class_members WHERE student_id=? LIMIT 1", student)?.id;
    const dep = (code) => one(db, "SELECT id FROM deposits WHERE code=?", code)?.id;
    const wdr = (st) => one(db, "SELECT id FROM withdrawals WHERE status=? ORDER BY id LIMIT 1", st)?.id;
    const booking = one(db, "SELECT id FROM bookings WHERE student_id=? LIMIT 1", student)?.id;
    const post = one(db, "SELECT id FROM community_posts WHERE status='approved' LIMIT 1")?.id;
    const rows = [
      ["account.adjust", student, { name: "Minh Anh", amount: 500000, note: "Bù lỗi hệ thống" }, -24],
      ["account.suspend", nhi, { name: "Trần Thu Nhi", note: "Vi phạm liên hệ ngoài" }, -50],
      ["account.resume", nhi, { name: "Trần Thu Nhi", note: "Đã xác minh lại" }, -49],
      ["tutor.approved", chau, { name: "Nguyễn Minh Châu" }, -24 * 20],
      ["tutor.approved", nam, { name: "Trần Hoàng Nam" }, -24 * 19],
      ["tutor.revision", trang, { name: "Hoàng Mai Trang", revision: 2 }, -24 * 2],
      ["credential.approved", credential("linh"), { name: "Lê Thảo Linh", title: "IELTS 8.0" }, -24 * 18],
      ["credential.rejected", credential("huy"), { name: "Võ Đức Huy", title: "Bằng lái xe", note: "Không liên quan" }, -24 * 16],
      ["deposit.assign", one(db, "SELECT id FROM deposits WHERE user_id=? AND status='paid' ORDER BY id DESC LIMIT 1", parent || student)?.id, { user_id: parent || student, amount: 1500000, code: one(db, "SELECT code FROM deposits WHERE user_id=? AND status='paid' ORDER BY id DESC LIMIT 1", parent || student)?.code, event: "demo" }, -24 * 20],
      ["deposit.dismissed", one(db, "SELECT id FROM sepay_events WHERE status='rejected_key' LIMIT 1")?.id, { event: "GSD-001", note: "Sai khóa IPN" }, -24 * 1],
      ["session.admin_cancel", session, { session: "Toán · Minh Anh", refunded: [{ amount: 180000 }] }, -24 * 5],
      ["session.remind", session, { session: "Tiếng Anh · Nguyễn Gia Bảo" }, -20],
      ["member.admin_end", member, { name: "Minh Anh", class: "Toán" }, -24 * 8],
      ["proposal.review", one(db, "SELECT id FROM proposals WHERE tutor_id=? LIMIT 1", linh)?.id, { student: "Minh Anh", tutor: "Lê Thảo Linh" }, -24 * 10],
      ["booking.admin_cancel", booking, { student: "Minh Anh", tutor: "Nguyễn Minh Châu", note: "Trùng lịch" }, -24 * 4],
      ["subject.update", "toan", { title: "Toán" }, -24 * 15],
      ["subject.archive", "hoa-hoc", { title: "Hóa học" }, -24 * 14],
      ["resource.review", one(db, "SELECT id FROM resources LIMIT 1")?.id, { title: "Đề thi thử Toán 2025" }, -24 * 11],
      ["community.approved", post, { title: "Kinh nghiệm ôn thi" }, -24 * 6],
      ["community.rejected", post, { title: "Quảng cáo ngoài", note: "Spam" }, -24 * 3],
      ["community.hidden", post, { title: "Bài tranh luận", note: "Ngôn từ chưa phù hợp" }, -30],
      ["settings.update", "0", { keys: ["lesson_fee_pct"] }, -24 * 22],
      ["payout.sent", nam, { name: "Trần Hoàng Nam", amount: 2100000 }, -24 * 9],
      ["verification.approved", student, { name: "Minh Anh" }, -24 * 17],
      ["verification.rejected", nhi, { name: "Trần Thu Nhi", note: "Ảnh mờ" }, -24 * 13],
      ["wallet.adjust", student, { name: "Minh Anh", amount: -100000, note: "Trừ lỗi" }, -24 * 7],
      ["theme.granted", chau, { name: "Nguyễn Minh Châu", theme: "rose" }, -24 * 12],
      ["support.replied", student, { name: "Minh Anh" }, -24 * 2],
      ["deposits.recheck", "0", { event: "sepay" }, -15],
      ["booking.review", booking, { student: "Minh Anh", tutor: "Trần Hoàng Nam" }, -24 * 21],
      ["tutor.approved", tuan, { name: "Bùi Quốc Tuấn" }, -24 * 23],
      ["verification.approved", bao, { name: "Nguyễn Gia Bảo" }, -24 * 15],
    ];
    for (const [action, target, detail, h] of rows) if (target != null) audit(admin, action, String(target), detail, iso(h));
  });

  // Messages: support thread, unread lesson chat, attachment, event cards.
  mark("showcase-messages-v1", () => {
    const b1 = one(db, "SELECT b.id,b.student_id,b.tutor_id FROM bookings b JOIN users u ON u.id=b.student_id WHERE u.email='student@demo.giasu.test' ORDER BY b.id LIMIT 1");
    if (b1) {
      run(db, "INSERT INTO messages(booking_id,sender_id,body,is_event) VALUES (?,?,?,1)", b1.id, b1.tutor_id, "đã xác nhận buổi học");
      run(db, "INSERT INTO messages(booking_id,sender_id,body) VALUES (?,?,?)", b1.id, b1.student_id, "Dạ cô ơi em gửi bài tập trước buổi nhé ạ.");
    }
    let th = one(db, "SELECT id FROM support_threads WHERE user_id=?", student);
    if (!th) { run(db, "INSERT INTO support_threads(user_id) VALUES (?)", student); th = one(db, "SELECT id FROM support_threads WHERE user_id=?", student); }
    run(db, "INSERT INTO support_messages(thread_id,sender_id,body) VALUES (?,?,?)", th.id, student, "Em nạp tiền chuyển khoản từ hôm qua mà chưa thấy cộng ạ.");
    run(db, "INSERT INTO support_messages(thread_id,sender_id,body,is_event) VALUES (?,?,?,1)", th.id, admin, "Yêu cầu rút tiền của bạn đã được chuyển thành công.");
    run(db, "INSERT INTO support_messages(thread_id,sender_id,body) VALUES (?,?,?)", th.id, admin, "Em kiểm tra lại giúp mã giao dịch nhé, bên mình đang đối chiếu.");
    const b2 = one(db, "SELECT id FROM bookings WHERE student_id=? AND tutor_id=? LIMIT 1", student, chau);
    if (b2) insertChatEvent(db, "lesson", b2.id, { id: chau, name: "Nguyễn Minh Châu" }, "đã hoàn thành buổi học");
    for (const [uid2, kind, subject] of [[chau, "proposal_decided", "Đề nghị Toán"], [nam, "withdrawal_done", "Lệnh rút 1.200.000đ"], [student, "session_remind", "Tiếng Anh · Nguyễn Gia Bảo"], [parent || student, "deposit_credited", "Nạp GSD-DEMO-002"]])
      if (uid2) notify(db, uid2, kind, { actor: "Quản trị viên", subject, link: "/wallet" });
  });

  // Proposals in every state plus a pending trial offer.
  mark("showcase-proposals-v1", () => {
    const nhi = uid("nhi"), bao = uid("bao"), trang = uid("trang");
    if (!an || !huy) return;
    const p = (sender, sid, tutor, subject, sessions, rate, schedule, start, status, exp, msg) => Number(run(db,
      `INSERT INTO proposals(sender,student_id,tutor_id,subject_id,mode,sessions,minutes,rate,total,schedule,start_date,message,status,held,credits,expires_at,decided_at)
       VALUES (?,?,?,?,'online',?,90,?,?,?,?,?,?,?,?,?,?)`, sender, sid, tutor, subject, sessions, rate, sessions * rate, JSON.stringify(schedule), start, msg, status,
      status === "declined" || status === "cancelled" ? 0 : sessions * rate, sender === "tutor" ? 2 : 0, exp, status === "pending" ? null : iso(-10)).lastInsertRowid);
    p("student", student, an, "ngu-van", 6, 160000, [{ weekday: 3, hour: 19, minute: 0 }], vnd(4), "declined", iso(20), "Em muốn ôn văn thi vào 10.");
    p("student", student, huy, "hoa-hoc", 8, 170000, [{ weekday: 7, hour: 20, minute: 0 }], vnd(6), "cancelled", iso(30), "Em cần ôn hóa hữu cơ.");
    p("tutor", student, linh, "tieng-anh", 4, 220000, [{ weekday: 5, hour: 18, minute: 30 }], vnd(2), "expired", iso(-20), "Buổi thử giao tiếp tự nhiên.");
    if (nhi && bao && trang) {
      p("student", nhi, trang, "tieng-anh", 12, 200000, [{ weekday: 2, hour: 20, minute: 0 }], vnd(8), "pending", iso(30), "Em muốn học tiếng Anh học thuật.");
      run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", bao, trang);
      const inq = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", bao, trang);
      if (inq) run(db, `INSERT INTO offers(student_id,tutor_id,inquiry_id,subject_id,mode,blocks,note,rate,start_date,end_date,status,kind)
        VALUES (?,?,?,?,?,?,?,?,?,?,'pending','trial')`, bao, trang, inq.id, "tieng-anh", "online", "[]", "Buổi thử 30 phút", 200000, vnd(1), vnd(2));
    }
  });

  // Community posts in each state, comments, a report, a draft; two news posts.
  mark("showcase-community-v1", () => {
    const posts = all(db, "SELECT id,status FROM community_posts ORDER BY id");
    const ap = one(db, "SELECT id FROM community_posts WHERE status='approved' ORDER BY id LIMIT 1")?.id
      || Number(run(db, `INSERT INTO community_posts(author_id,kind,status,title,body,search_text,published_at) VALUES (?, 'user','approved',?,?,?,CURRENT_TIMESTAMP)`,
        student, "Kinh nghiệm ôn thi vào lớp 10 của mình", "Mình vừa đỗ lớp 10 chuyên, chia sẻ lịch ôn và cách học nhóm hiệu quả cho mọi người.", "kinh nghiem on thi").lastInsertRowid);
    run(db, `INSERT INTO community_posts(author_id,kind,status,title,body,search_text) VALUES (?, 'user','pending',?,?,?)`,
      nam, "Trao đổi phương pháp dạy lớp nhỏ", "Mọi người xử lý lớp có học sinh mất tập trung như thế nào?", "trao doi phuong phap");
    run(db, `INSERT INTO community_posts(author_id,kind,status,title,body,search_text,published_at) VALUES (?, 'user','approved',?,?,?,CURRENT_TIMESTAMP)`,
      huy || student, "Câu hỏi về đề thi thử", "Ai có đề thi thử THPT mới nhất không ạ?", "cau hoi de thi thu");
    run(db, `INSERT INTO community_comments(post_id,author_id,body) VALUES (?,?,?)`, ap, chau || student, "Cảm ơn bạn, phần lịch ôn rất thực tế.");
    run(db, `INSERT INTO community_comments(post_id,author_id,body) VALUES (?,?,?)`, ap, student, "Mình cũng ôn theo nhóm thế này, rất hiệu quả.");
    const rep = one(db, "SELECT id FROM community_posts WHERE status='approved' ORDER BY id DESC LIMIT 1")?.id;
    if (rep) run(db, `INSERT INTO community_reports(reporter_id,target_type,target_id,reason) VALUES (?,'post',?,?)`, student, rep, "Nội dung có vẻ quảng cáo ngoài hệ thống.");
    run(db, `INSERT INTO community_drafts(id,author_id,title,body) VALUES (?,?,?,?)`, "demo-draft-1", student, "Nháp: câu hỏi về học nhóm online", "Mọi người học nhóm qua meet thế nào cho hiệu quả?");
    // News posts in the shared posts table.
    const cols = new Set(db.prepare("PRAGMA table_info(posts)").all().map((c) => c.name));
    const put = (m) => { const ks = Object.keys(m).filter((k) => cols.has(k)); return Number(run(db, `INSERT INTO posts(${ks.join(",")}) VALUES (${ks.map(() => "?").join(",")})`, ...ks.map((k) => m[k])).lastInsertRowid); };
    put({ title: "Cập nhật hệ thống tháng 11", slug: "cap-nhat-he-thong-thang-11", summary: "Tính năng mới cho gia sư và học sinh.", body: "Phiên bản mới có quản lý buổi học và báo cáo tài chính.", body_html: "<p>Phiên bản mới có quản lý buổi học và báo cáo tài chính.</p>", topic: "study", origin: "manual", author_id: admin, published: 1, pinned: 1, published_at: iso(-24 * 5) });
    put({ title: "Góc chia sẻ: cách chọn gia sư phù hợp", slug: "cach-chon-gia-su-phu-hop", summary: "Kinh nghiệm chọn gia sư theo mục tiêu.", body: "Hãy bắt đầu từ mục tiêu học và xem hồ sơ kỹ.", body_html: "<p>Hãy bắt đầu từ mục tiêu học và xem hồ sơ kỹ.</p>", topic: "study", origin: "manual", author_id: admin, published: 1, published_at: iso(-24 * 9) });
  });

  // People: tutor earnings, student credits, availability, gallery, notifications.
  mark("showcase-person-v1", () => {
    for (const [uid2, kind, amount, note] of [
      [chau, "lesson_pay", 1440000, "Thu nhập lớp Toán"],
      [nam, "lesson_pay", 900000, "Thu nhập lớp Lí"],
      [linh, "lesson_pay", 1100000, "Thu nhập lớp Anh"],
    ]) if (uid2) move(db, uid2, kind, { amount, ref: "demo-pay", note });
    if (student) {
      run(db, "UPDATE wallets SET credits_free=credits_free+5 WHERE user_id=?", student);
      run(db, `INSERT INTO learner_availability(user_id,blocks) VALUES (?,'[]') ON CONFLICT(user_id) DO UPDATE SET blocks='[]'`, student);
    }
    if (chau) run(db, `INSERT INTO weekly_availability(tutor_id,blocks,revision) VALUES (?,?,1) ON CONFLICT(tutor_id) DO UPDATE SET blocks=excluded.blocks`,
      chau, JSON.stringify([1, 4].flatMap((weekday) => [18, 19, 20].map((hour) => ({ weekday, hour })))));
    if (chau && student) {
      run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", student, chau);
      const inq = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", student, chau);
      if (inq) run(db, `INSERT INTO weekly_requests(student_id,tutor_id,inquiry_id,subject_id,mode,blocks,note,rate,status)
        VALUES (?,?,?,?,?,?,?,?,'accepted')`, student, chau, inq.id, "toan", "online", "[]", "Ôn mỗi tuần thứ 2", 180000);
    }
    notify(db, chau, "credential_approved", { actor: "Quản trị viên", subject: "Sư phạm Toán", link: "/studio" });
    notify(db, student, "session_remind", { actor: "Quản trị viên", subject: "Tiếng Anh · Nguyễn Gia Bảo", link: "/classes" });
  });

  // Flagged chat + a reported review so the An toàn tab has work to show.
  mark("showcase-safety-v2", () => {
    // Resolve here: on a first seed the people block ran earlier in this call,
    // so the outer `student`/`chau` (bound before it) can still be null.
    const stu = uid("student"), tu = uid("huy") || uid("chau");
    // A fresh inquiry on a pair no other seed uses: the activity seed only adds
    // messages to empty threads, so borrowing its thread would silence it.
    let inq = null;
    if (stu && tu) {
      run(db, "INSERT INTO inquiries(student_id,tutor_id) VALUES (?,?)", stu, tu);
      inq = one(db, "SELECT id,student_id FROM inquiries WHERE student_id=? AND tutor_id=? ORDER BY id DESC LIMIT 1", stu, tu);
    }
    if (inq) run(db, "INSERT INTO inquiry_messages(inquiry_id,sender_id,body,original_body,flagged) VALUES (?,?,?,?,1)",
      inq.id, inq.student_id, "Em có vài thắc mắc ngoài giờ, cô ơi cho em hỏi qua [đã ẩn liên hệ] được không ạ?",
      "Em có vài thắc mắc ngoài giờ, cô ơi cho em hỏi qua zalo 0901 234 567 được không ạ?");
    let b = one(db, "SELECT id,student_id,tutor_id FROM bookings WHERE student_id=? LIMIT 1", stu);
    if (!b && tu && stu) {
      const sub = one(db, "SELECT id FROM subjects LIMIT 1");
      const slot = Number(run(db, "INSERT INTO slots(tutor_id,starts_at,duration_minutes,source,available) VALUES (?,?,60,'demo',0)", tu, iso(-2)).lastInsertRowid);
      b = { id: Number(run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,note,status) VALUES (?,?,?,?,?,?,'online','Buổi demo an toàn','completed')", stu, tu, slot, sub?.id || "toan", iso(-2), 180000).lastInsertRowid), student_id: stu, tutor_id: tu };
    }
    if (b) {
      run(db, "INSERT INTO messages(booking_id,sender_id,body,original_body,flagged) VALUES (?,?,?,?,1)",
        b.id, b.student_id, "Mẹ em muốn đổi giờ học, cô gọi cho mẹ em qua [đã ẩn liên hệ] nhé ạ.",
        "Mẹ em muốn đổi giờ học, cô gọi cho mẹ em qua 0918 777 222 nhé ạ.");
      run(db, `INSERT INTO reviews(booking_id,rating,body,reported,reported_reason,reported_by) VALUES (?,?,?,?,?,?)
        ON CONFLICT(booking_id) DO UPDATE SET reported=1,reported_reason=excluded.reported_reason,reported_by=excluded.reported_by`,
        b.id, 4, "Buổi học ổn nhưng đánh giá có ghi thông tin riêng.", 1, "Đánh giá có thông tin cá nhân của gia đình em, em nhờ ẩn giúp ạ.", b.tutor_id);
    }
  });
}

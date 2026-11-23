import { all, one, run } from "./db.js";
import { move } from "./wallet.js";
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
    move(db, bao, "deposit", { amount: 4000000, ref: "demo", note: "Nạp mẫu" });
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
  mark("showcase-money-v1", () => {
    const paid = (uid2, code, amount, at) => {
      run(db, "INSERT INTO deposits(user_id,payer_id,code,amount,received,status,created_at,paid_at) VALUES (?,?,?,?,?, 'paid',?,?)", uid2, uid2, code, amount, amount, at, at);
      move(db, uid2, "deposit", { amount, ref: `deposit:${code}`, note: `Nạp ${code}` });
    };
    paid(student, "GSD-DEMO-001", 3000000, iso(-24 * 40));
    paid(parent || student, "GSD-DEMO-002", 1500000, iso(-24 * 20));
    run(db, "INSERT INTO deposits(user_id,payer_id,code,amount,status,created_at) VALUES (?,?,?,?,'pending',?)", student, student, "GSD-DEMO-003", 1000000, iso(-4));
    // A verified transfer that matches no deposit code, and one whose IPN key failed.
    run(db, "INSERT INTO sepay_events(code,amount,reference,verdict,status,payload,created_at) VALUES (?,?,?,1,'unmatched',?,?)",
      "GSD-KHONG-KHOP", 700000, "CT TU 0901 NGUYEN GIA BAO", '{"note":"demo unmatched"}', iso(-24 * 3));
    run(db, "INSERT INTO sepay_events(code,amount,reference,verdict,status,payload,created_at) VALUES (?,?,?,0,'rejected_key',?,?)",
      "GSD-001", 500000, "CT SAI KHOA", '{"note":"demo rejected key"}', iso(-24 * 2));
    run(db, "INSERT INTO gateway_events(id,invoice,amount,verdict,status,payload,created_at) VALUES (?,?,?,?,?,?,?)",
      "gw-demo-1", "INV-DEMO-1", 800000, 1, "processed", '{"note":"demo gateway"}', iso(-24 * 30));
    if (nam) {
      run(db, "INSERT INTO withdrawals(user_id,amount,bank_name,account_number,account_name,status,created_at) VALUES (?,?,?,?,?,'requested',?)",
        nam, 900000, "Vietcombank", "0123456789", "TRAN HOANG NAM", iso(-8));
      run(db, "INSERT INTO withdrawals(user_id,amount,bank_name,account_number,account_name,status,note,handled_by,handled_at,created_at) VALUES (?,?,?,?,?,'done',?,?,?,?)",
        nam, 1200000, "Vietcombank", "0123456789", "TRAN HOANG NAM", "Đã chuyển 10:20", admin, iso(-24 * 6), iso(-24 * 7));
      run(db, "INSERT INTO withdrawals(user_id,amount,bank_name,account_number,account_name,status,note,handled_by,handled_at,created_at) VALUES (?,?,?,?,?,'rejected',?,?,?,?)",
        nam, 400000, "Vietcombank", "0123456789", "TRAN HOANG NAM", "Sai tên tài khoản", admin, iso(-24 * 12), iso(-24 * 13));
    }
    // Revenue entries spread over six months so the report chart has history.
    for (let m = 6; m >= 1; m--) {
      const at = new Date(); at.setMonth(at.getMonth() - m); at.setDate(12);
      run(db, "INSERT INTO platform_revenue(kind,amount,ref,created_at) VALUES ('lesson_fee',?,?,?)", 260000 + (6 - m) * 40000, `demo-m${m}`, at.toISOString());
    }
    audit(admin, "withdrawal.done", "2", { name: "Trần Hoàng Nam", amount: 1200000 }, iso(-24 * 6));
    audit(admin, "withdrawal.rejected", "3", { name: "Trần Hoàng Nam", amount: 400000, note: "Sai tên tài khoản" }, iso(-24 * 12));
    audit(admin, "deposit.assign", "1", { code: "GSD-DEMO-001", name: "Minh Anh", amount: 3000000 }, iso(-24 * 40));
  });

  // ~30 audit rows across every group and several days so paging/filter/link tests work.
  mark("showcase-audit-v1", () => {
    const rows = [
      ["account.adjust", "1", { name: "Minh Anh", amount: 500000, note: "Bù lỗi hệ thống" }, -24],
      ["account.suspend", "4", { name: "Trần Thu Nhi", note: "Vi phạm liên hệ ngoài" }, -50],
      ["account.resume", "4", { name: "Trần Thu Nhi", note: "Đã xác minh lại" }, -49],
      ["tutor.approved", "2", { name: "Nguyễn Minh Châu" }, -24 * 20],
      ["tutor.approved", "3", { name: "Trần Hoàng Nam" }, -24 * 19],
      ["tutor.revision", "9", { name: "Hoàng Mai Trang", revision: 2 }, -24 * 2],
      ["credential.approved", "5", { name: "Lê Thảo Linh", title: "IELTS 8.0" }, -24 * 18],
      ["credential.rejected", "7", { name: "Võ Đức Huy", title: "Bằng lái xe", note: "Không liên quan" }, -24 * 16],
      ["deposit.assign", "2", { code: "GSD-DEMO-002", name: "Phụ huynh Lan", amount: 1500000 }, -24 * 20],
      ["deposit.dismissed", "4", { event: "GSD-SAI-KHOA", note: "Sai khóa IPN" }, -24 * 1],
      ["session.admin_cancel", "5", { session: "Toán · Minh Anh", refunded: [{ amount: 180000 }] }, -24 * 5],
      ["session.remind", "6", { session: "Tiếng Anh · Nguyễn Gia Bảo" }, -20],
      ["member.admin_end", "2", { name: "Minh Anh", class: "Toán" }, -24 * 8],
      ["proposal.review", "3", { student: "Minh Anh", tutor: "Lê Thảo Linh" }, -24 * 10],
      ["booking.admin_cancel", "1", { student: "Minh Anh", tutor: "Nguyễn Minh Châu", note: "Trùng lịch" }, -24 * 4],
      ["subject.update", "toan", { title: "Toán" }, -24 * 15],
      ["subject.archive", "hoa-hoc", { title: "Hóa học" }, -24 * 14],
      ["resource.review", "3", { title: "Đề thi thử Toán 2025" }, -24 * 11],
      ["community.approved", "1", { title: "Kinh nghiệm ôn thi" }, -24 * 6],
      ["community.rejected", "2", { title: "Quảng cáo ngoài", note: "Spam" }, -24 * 3],
      ["community.hidden", "4", { title: "Bài tranh luận", note: "Ngôn từ chưa phù hợp" }, -30],
      ["settings.update", "0", { keys: ["lesson_fee_pct"] }, -24 * 22],
      ["payout.sent", "2", { name: "Nguyễn Minh Châu", amount: 2100000 }, -24 * 9],
      ["verification.approved", "1", { name: "Minh Anh" }, -24 * 17],
      ["verification.rejected", "5", { name: "Trần Thu Nhi", note: "Ảnh mờ" }, -24 * 13],
      ["wallet.adjust", "1", { name: "Minh Anh", amount: -100000, note: "Trừ lỗi" }, -24 * 7],
      ["theme.granted", "2", { name: "Nguyễn Minh Châu", theme: "rose" }, -24 * 12],
      ["support.replied", "1", { name: "Minh Anh" }, -24 * 2],
      ["deposits.recheck", "3", { event: "sepay" }, -15],
      ["booking.review", "2", { student: "Minh Anh", tutor: "Trần Hoàng Nam" }, -24 * 21],
    ];
    for (const [action, target, detail, h] of rows) audit(admin, action, target, detail, iso(h));
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
}

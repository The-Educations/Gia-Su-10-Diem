import { all, one, run } from "./db.js";

// Rich class demo data: group/1-1/nearly finished packages, every lesson state,
// notes, assignments in every workflow state and short class announcements.
export function seedClassesRich(db, hash) {
  if (one(db, "SELECT key FROM demo_seeds WHERE key='classes-rich-v1'")) return;
  const id = (slug) => one(db, "SELECT id FROM users WHERE email=?", `${slug}@demo.giasu.test`)?.id;
  const student = id("student"), chau = id("chau");
  if (!student || !chau) return;
  for (const [slug, name] of [["student2", "Trần Quốc Bảo"], ["student3", "Lê Khánh Vy"]])
    if (!id(slug)) run(db, "INSERT INTO users(name,email,password,role,demo) VALUES (?,?,?,?,1)", name, `${slug}@demo.giasu.test`, hash, "student");
  const s2 = id("student2"), s3 = id("student3"), now = Date.now(), iso = (d, h = 18) => new Date(now + d * 86400000 + h * 3600000).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const make = (title, color, minutes, schedule, members, sessionSpecs) => {
      const cid = Number(run(db, "INSERT INTO classes(tutor_id,title,subject_id,mode,area,color,minutes,schedule,meeting_url) VALUES (?,?,?,?,?,?,?,?,?)", chau, title, "toan", "online", "", color, minutes, JSON.stringify(schedule), "https://meet.google.com/demo-lop").lastInsertRowid);
      const mids = new Map();
      for (const [sid, total, rate] of members) mids.set(sid, Number(run(db, "INSERT INTO class_members(class_id,student_id,sessions_total,rate,held) VALUES (?,?,?,?,?)", cid, sid, total, rate, total * rate).lastInsertRowid));
      const sessions = [];
      for (const [at, status, outcome] of sessionSpecs) {
        const ssid = Number(run(db, "INSERT INTO class_sessions(class_id,starts_at,minutes,status) VALUES (?,?,?,?)", cid, at, minutes, status || "scheduled").lastInsertRowid);
        sessions.push([ssid, outcome]);
        for (const mid of mids.values()) run(db, "INSERT INTO session_members(session_id,member_id,outcome,tutor_confirmed_at,student_confirmed_at) VALUES (?,?,?,?,?)", ssid, mid, outcome || "pending", outcome === "confirmed" ? new Date().toISOString() : null, outcome === "confirmed" ? new Date().toISOString() : null);
      }
      return { cid, mids: [...mids.values()], sessions };
    };
    const group = make("Toán 9 · Nhóm chuyên đề", "sky", 90, [{ weekday: 2, hour: 19, minute: 0 }, { weekday: 6, hour: 9, minute: 0 }], [[student, 10, 180000], [s2, 10, 180000], [s3, 10, 180000]], [
      [iso(-5), "scheduled", "confirmed"], [iso(-2), "scheduled", "pending"], [iso(0, 5), "scheduled", "pending"], [iso(2), "scheduled", "pending"], [iso(4), "cancelled", "refunded"], [iso(7), "scheduled", "pending"],
    ]);
    const short = make("Toán 12 · Gần hết gói", "peach", 60, [{ weekday: 4, hour: 18, minute: 30 }], [[student, 4, 200000]], [
      [iso(-14), "scheduled", "confirmed"], [iso(-7), "scheduled", "confirmed"], [iso(1), "scheduled", "pending"], [iso(8), "scheduled", "pending"], [iso(3), "scheduled", "pending"],
    ]);
    run(db, "INSERT INTO session_moves(session_id,requested_by,starts_at) VALUES (?,?,?)", short.sessions[2][0], student, iso(2, 2));
    const note1 = group.sessions[0][0], note2 = short.sessions[1][0];
    run(db, "INSERT INTO session_notes(session_id,body) VALUES (?,?)", note1, "Đã chữa phương trình chứa căn. Bảo còn hay quên điều kiện xác định, Vy làm tốt phần biến đổi. Cả nhóm cần tự trình bày lại ví dụ 3.");
    run(db, "INSERT INTO session_notes(session_id,body) VALUES (?,?)", note2, "Ôn hàm số bậc nhất và đồ thị. Minh Anh đã nắm được cách xét hệ số, cần luyện thêm bài có tham số trước buổi sau.");
    const assignment = (cid, sid, title, note, due, states) => {
      const aid = Number(run(db, "INSERT INTO assignments(class_id,session_id,title,note,due_at) VALUES (?,?,?,?,?)", cid, sid, title, note, due).lastInsertRowid);
      const members = all(db, "SELECT id FROM class_members WHERE class_id=?", cid);
      members.forEach((m, i) => {
        const st = states[i % states.length];
        run(db, "INSERT INTO assignment_submissions(assignment_id,member_id,status,note,feedback,submitted_at,reviewed_at) VALUES (?,?,?,?,?,?,?)", aid, m.id, st,
          st === "pending" ? "" : "https://drive.google.com/file/d/bai-lam-demo/view", st === "reviewed" ? "Trình bày đủ ý, câu 4 cần xét thêm trường hợp." : "",
          st === "pending" ? null : new Date().toISOString(), st === "reviewed" ? new Date().toISOString() : null);
      });
      return aid;
    };
    assignment(group.cid, group.sessions[0][0], "Bài tập phương trình chứa căn", "Làm câu 1–8 trong đề tuần 2, chụp phần trình bày rõ nhất.", iso(-1, 4), ["submitted", "reviewed", "pending"]);
    assignment(group.cid, group.sessions[2][0], "Chuẩn bị chuyên đề bất phương trình", "Xem trước ví dụ 1 và ghi lại câu hỏi còn vướng.", iso(3, 4), ["pending", "pending", "pending"]);
    assignment(short.cid, short.sessions[1][0], "Phiếu luyện hàm số", "Hoàn thành 12 câu trắc nghiệm và tự chấm theo đáp án.", iso(-2, 4), ["reviewed"]);
    assignment(short.cid, short.sessions[2][0], "Ôn cuối gói", "Làm đề tổng hợp 45 phút trước buổi chốt.", iso(5, 4), ["submitted"]);
    for (const [cid, body] of [[group.cid, "Tuần sau vẫn học đúng giờ. Các em nhớ nộp bài căn thức trước tối thứ Tư."], [group.cid, "Buổi thứ Bảy chúng ta sẽ chữa kỹ phần điều kiện xác định, ai chưa nộp bài nhớ mang vở."], [short.cid, "Gói hiện tại còn hai buổi. Em cân nhắc gia hạn nếu muốn ôn tiếp phần hàm số."]])
      run(db, "INSERT INTO class_posts(class_id,author_id,body) VALUES (?,?,?)", cid, chau, body);
    run(db, "INSERT INTO demo_seeds VALUES ('classes-rich-v1')");
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

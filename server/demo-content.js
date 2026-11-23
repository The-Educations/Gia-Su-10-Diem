import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { all, one, run } from "./db.js";
import { saveUpload } from "./uploads.js";
import { normalizeCredential } from "./credentials.js";
import { startClass } from "./classes.js";
import { move, wallet } from "./wallet.js";
import { seedShowcase } from "./demo-showcase.js";

const profiles = [
  [
    "chau",
    "Nguyen Minh Chau",
    "Toan / Mathematics",
    "Tôi dạy Toán THCS và THPT, đặc biệt là giai đoạn chuyển cấp lớp 9. Buổi đầu mình cùng xem cách em giải một bài quen thuộc, tìm phần kiến thức còn thiếu rồi lập kế hoạch theo tuần. Tôi dùng hình vẽ và ví dụ đời thường để giải thích trước khi đi vào công thức.",
    "Ôn nền tảng đại số, hình học và tuyển sinh lớp 10.",
  ],
  [
    "nam",
    "Tran Hoang Nam",
    "Vat li / Physics",
    "Từ một chiếc xe đạp đến mạch điện trong nhà, tôi dùng các tình huống gần gũi để học sinh hiểu bản chất Vật lí. Phù hợp với học sinh THPT cần hệ thống kiến thức hoặc chuẩn bị kỳ thi đánh giá tư duy. Mỗi buổi có phần tự giải thích lại để kiểm tra mức độ hiểu.",
    "Vật lí THPT và tư duy giải quyết vấn đề.",
  ],
  [
    "linh",
    "Le Thao Linh",
    "Tieng Anh / English",
    "Tôi đồng hành cùng học sinh muốn tự tin nói và viết tiếng Anh. Buổi học kết hợp hội thoại, sửa lỗi phát âm và luyện viết theo mục tiêu cá nhân. Với người đi làm, nội dung có thể xoay quanh email, phỏng vấn hoặc giao tiếp trong công việc.",
    "Tiếng Anh giao tiếp, nền tảng ngữ pháp và chứng chỉ ngoại ngữ.",
  ],
  [
    "an",
    "Pham Khanh An",
    "Ngu van / Literature",
    "Tôi hướng dẫn học sinh đọc kỹ, tìm ý và xây dựng lập luận bằng lời của mình. Khi luyện viết, chúng ta cùng sửa từng đoạn thay vì học thuộc bài văn mẫu. Tôi nhận dạy Ngữ văn THCS–THPT và Tiếng Việt cho học sinh tiểu học.",
    "Đọc hiểu, nghị luận và kỹ năng diễn đạt.",
  ],
  [
    "huy",
    "Vo Duc Huy",
    "Khoa hoc / Sciences",
    "Tôi dạy Hóa học, Sinh học và Khoa học tự nhiên bằng sơ đồ, mô hình đơn giản và câu hỏi gợi mở. Học sinh được nối các khái niệm với hiện tượng thực tế, sau đó tự xây dựng cách giải. Nhận học sinh cần củng cố nền tảng hoặc ôn tốt nghiệp THPT.",
    "Khoa học tự nhiên THCS, Hóa học và Sinh học THPT.",
  ],
  [
    "ha",
    "Dang Ngoc Ha",
    "Tieu hoc / Primary school",
    "Tôi ưu tiên nhịp học vừa sức và sự tự tin của học sinh nhỏ. Toán được học qua đồ vật và hình vẽ; Tiếng Việt qua đọc cùng nhau và kể chuyện. Cuối buổi, tôi trao đổi ngắn với phụ huynh về phần con đã hiểu và điều cần luyện thêm.",
    "Toán và Tiếng Việt tiểu học; phối hợp cùng phụ huynh.",
  ],
];
export async function sampleCV(name = "Sample Tutor", subject = "Mathematics") {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.18, 0.18, 0.15),
    red = rgb(0.52, 0.18, 0.21);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 595,
    height: 842,
    color: rgb(0.98, 0.97, 0.94),
  });
  const line = (text, y, size = 12, font = regular, color = ink) =>
    page.drawText(text, { x: 52, y, size, font, color });
  line("GIA SU 10 DIEM", 778, 12, bold, red);
  line("SAMPLE CV - FICTIONAL PROFILE", 750, 10, bold, red);
  line(name, 680, 30, bold);
  line(subject, 645, 15);
  line("TEACHING APPROACH", 570, 11, bold, red);
  line("Build a clear foundation. Explain with examples.", 540);
  line("Adapt each lesson to the student's goals and pace.", 518);
  line("EXPERIENCE", 450, 11, bold, red);
  line("Individual tutoring and weekly learning plans.", 420);
  line("Lesson preparation, feedback and parent communication.", 398);
  line("AVAILABILITY", 330, 11, bold, red);
  line("Online and in-person. View current slots on the profile.", 300);
  line("DEMO DOCUMENT", 160, 11, bold, red);
  line("Created for testing uploads and tutor profile review.", 130);
  line("Not a real CV, qualification or verified tutor identity.", 108);
  return Buffer.from(await pdf.save());
}
async function portrait(index) {
  const colors = [
    ["#ead7cd", "#803b40"],
    ["#dce7e8", "#355a65"],
    ["#e9dfc8", "#7a6540"],
    ["#dfe8d8", "#46624a"],
    ["#e6dfed", "#665375"],
    ["#f0ddce", "#965d46"],
  ];
  const [bg, shirt] = colors[index],
    long = index % 3 !== 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 320 320"><rect width="320" height="320" fill="${bg}"/><circle cx="260" cy="68" r="82" fill="#fff" opacity=".2"/><path d="M40 320c0-82 46-121 120-121s120 39 120 121" fill="${shirt}"/><path d="M${long ? "99 191Q76 59 159 53q89 0 67 138" : "103 125Q85 48 161 50q84 0 61 84"}" fill="#35302b"/><rect x="141" y="174" width="38" height="44" rx="16" fill="#dba984"/><ellipse cx="160" cy="132" rx="53" ry="65" fill="#ebc09c"/><path d="M106 119Q96 58 157 58q65-9 59 64-38-8-65-41-16 31-45 38" fill="#35302b"/><path d="M131 133h10m39 0h10" stroke="#45382e" stroke-width="4" stroke-linecap="round"/><path d="M149 164q12 10 23-1" fill="none" stroke="#a66c55" stroke-width="3" stroke-linecap="round"/><path d="M132 203l28 37 29-37 12 16-41 47-40-47" fill="#faf5ea"/><path d="M73 283h39m-20-19v39" stroke="#fff" opacity=".45" stroke-width="2"/><text x="230" y="290" fill="#fff" opacity=".7" font-family="sans-serif" font-size="14">10đ</text></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 88 }).toBuffer();
}
// Approved credentials with a labelled sample proof, so the verified lines and
// the administrator's review screen have something real to show locally.
const credentials = {
  chau: ["teacher", [
    { kind: "school", catalog_id: "hnue", detail: { field: "Sư phạm Toán", start_year: 2014, end_year: 2018 } },
    { kind: "award", catalog_id: "hoc-sinh-gioi-quoc-gia", detail: { prize: "Giải Nhì", subject: "Toán", end_year: 2013 } },
    { kind: "certificate", catalog_id: "chung-chi-nghiep-vu-su-pham", detail: { end_year: 2018 } },
  ]],
  nam: ["professional", [
    { kind: "school", catalog_id: "hcmut", detail: { field: "Kỹ thuật Cơ khí", start_year: 2016, end_year: 2020 } },
    { kind: "award", catalog_id: "olympic-truyen-thong-30-4", detail: { prize: "Huy chương Vàng", subject: "Vật lí", end_year: 2015 } },
  ]],
  linh: ["teacher", [
    { kind: "school", catalog_id: "ulis", detail: { field: "Sư phạm Tiếng Anh", start_year: 2013, end_year: 2017 } },
    { kind: "certificate", catalog_id: "ielts-academic", detail: { score: "8.0", reference: "VN-2023-118842", end_year: 2023 } },
    { kind: "certificate", catalog_id: "tesol-tefl-celta", detail: { score: "TESOL", end_year: 2019 } },
  ]],
  an: ["student", [
    { kind: "school", catalog_id: "ussh", detail: { field: "Văn học", start_year: 2022, current: true } },
  ]],
  huy: ["student", [
    { kind: "school", catalog_id: "hus", detail: { field: "Hóa học", start_year: 2021, current: true } },
    { kind: "award", catalog_id: "hoc-sinh-gioi-quoc-gia", detail: { prize: "Giải Ba", subject: "Hóa học", end_year: 2020 } },
  ]],
  ha: ["teacher", [
    { kind: "school", catalog_id: "hnue", detail: { field: "Giáo dục Tiểu học", start_year: 2012, end_year: 2016 } },
  ]],
};
async function sampleProof(title) {
  const pdf = await PDFDocument.create(), page = pdf.addPage([420, 300]), font = await pdf.embedFont(StandardFonts.Helvetica);
  const ascii = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  page.drawText("BAN MINH HOA - DEMO PROOF", { x: 32, y: 240, size: 14, font, color: rgb(0.52, 0.18, 0.21) });
  page.drawText(ascii.slice(0, 60), { x: 32, y: 200, size: 11, font });
  return Buffer.from(await pdf.save());
}
async function seedCredentials(db, tutor, slug) {
  const [kind, items] = credentials[slug] || [];
  const key = `credentials-v1-${tutor.id}`;
  if (!items || one(db, "SELECT key FROM demo_seeds WHERE key=?", key)) return;
  const proofs = await Promise.all(items.map((item) => sampleProof(normalizeCredential(item).name)));
  db.exec("BEGIN IMMEDIATE");
  try {
    run(db, "UPDATE tutors SET tutor_kind=? WHERE user_id=? AND tutor_kind=''", kind, tutor.id);
    items.forEach((item, i) => {
      const d = normalizeCredential(item);
      const id = Number(run(db, "INSERT INTO tutor_credentials(tutor_id,kind,catalog_id,name,detail,status,reviewed_at) VALUES (?,?,?,?,?,'approved',CURRENT_TIMESTAMP)", tutor.id, d.kind, d.catalog_id, d.name, JSON.stringify(d.detail)).lastInsertRowid);
      const file = `demo-proof-${tutor.id}-${i}`;
      run(db, "INSERT INTO credential_files(id,credential_id,mime,name,size) VALUES (?,?,?,?,?)", file, id, "application/pdf", "minh-chung-mau.pdf", proofs[i].length);
      run(db, "INSERT INTO credential_file_chunks VALUES (?,?,?)", file, 0, proofs[i]);
    });
    run(db, "INSERT INTO demo_seeds VALUES (?)", key);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
// Money, offers and classes so every role sees a lived-in workspace locally.
function seedClasses(db) {
  if (one(db, "SELECT key FROM demo_seeds WHERE key='classes-v1'")) return;
  const id = (slug) => one(db, "SELECT id FROM users WHERE email=? AND demo=1", `${slug}@demo.giasu.test`)?.id;
  const student = id("student"), chau = id("chau"), linh = id("linh"), nam = id("nam");
  if (!student || !chau || !linh || !nam) return;
  const day = (offset) => new Date(Date.now() + 7 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const proposal = (sender, tutor, subject, sessions, rate, schedule, start, status, message) => Number(run(db,
    `INSERT INTO proposals(sender,student_id,tutor_id,subject_id,mode,sessions,minutes,rate,total,schedule,start_date,message,status,held,credits,expires_at,decided_at)
     VALUES (?,?,?,?,'online',?,90,?,?,?,?,?,?,?,?,?,?)`, sender, student, tutor, subject, sessions, rate, sessions * rate, JSON.stringify(schedule), start, message, status,
    sender === "student" && status !== "declined" ? sessions * rate : 0, sender === "tutor" ? 2 : 0, new Date(Date.now() + 40 * 3600000).toISOString(), status === "pending" ? null : new Date().toISOString()).lastInsertRowid);
  db.exec("BEGIN IMMEDIATE");
  try {
    move(db, student, "deposit", { amount: 5000000, ref: "demo", note: "Nạp mẫu" });
    for (const t of [chau, linh, nam]) wallet(db, t);
    // An ongoing maths class with two lessons already confirmed and one waiting for the student.
    const p1 = proposal("student", chau, "toan", 8, 180000, [{ weekday: 1, hour: 18, minute: 0 }, { weekday: 4, hour: 18, minute: 0 }], day(-12), "accepted", "Em cần ôn thi vào lớp 10.");
    move(db, student, "offer_hold", { amount: -1440000, held: 1440000, ref: `proposal:${p1}` });
    const c1 = startClass(db, one(db, "SELECT * FROM proposals WHERE id=?", p1));
    const sessions = all(db, "SELECT id FROM class_sessions WHERE class_id=? ORDER BY starts_at", c1);
    const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
    [[sessions[0].id, ago(24 * 9), "confirmed", 5], [sessions[1].id, ago(24 * 5), "confirmed", 4], [sessions[2].id, ago(26), "pending", null]].forEach(([sid, at, outcome, rating], i) => {
      run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", at, sid);
      run(db, "UPDATE session_members SET outcome=?,rating=?,tutor_confirmed_at=CURRENT_TIMESTAMP,student_confirmed_at=CASE WHEN ?='confirmed' THEN CURRENT_TIMESTAMP END WHERE session_id=?", outcome, rating, outcome, sid);
    });
    run(db, "UPDATE classes SET meeting_url='https://meet.google.com/abc-defg-hij' WHERE id=?", c1);
    run(db, "INSERT INTO class_materials(class_id,title,url,note) VALUES (?,?,?,?),(?,?,?,?)",
      c1, "Phương trình bậc hai: công thức nghiệm", "https://www.youtube.com/watch?v=8v6jS0g3gqY", "Xem lại trước buổi thứ 3.",
      c1, "Đề luyện tập tuần 2", "https://drive.google.com/file/d/1demoFile/view", "Làm câu 1–8, buổi sau chữa.");
    // A waiting offer to another tutor, and a tutor's offer waiting for the student.
    const p2 = proposal("student", linh, "tieng-anh", 10, 220000, [{ weekday: 2, hour: 19, minute: 30 }], day(5), "pending", "Em muốn luyện nói tiếng Anh giao tiếp.");
    move(db, student, "offer_hold", { amount: -2200000, held: 2200000, ref: `proposal:${p2}` });
    proposal("tutor", nam, "vat-li", 6, 200000, [{ weekday: 5, hour: 9, minute: 0 }], day(3), "pending", "Thầy thấy em cần củng cố phần điện học, mình học 6 buổi nhé.");
    run(db, "UPDATE wallets SET credits_free=8 WHERE user_id=?", nam);
    // A parent linked to the demo student, following the same class.
    const parent = id("parent");
    if (parent) {
      run(db, "UPDATE users SET learner_type='parent',display_name='Mẹ Minh Anh' WHERE id=?", parent);
      run(db, "INSERT OR IGNORE INTO family_links(parent_id,student_id) VALUES (?,?)", parent, student);
      move(db, parent, "deposit", { amount: 1000000, ref: "demo", note: "Nạp mẫu" });
    }
    run(db, "INSERT INTO demo_seeds VALUES ('classes-v1')");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function enrichDemo(db, { activity = false, hash = "" } = {}) {
  for (const [i, [slug, , , bio]] of profiles.entries()) {
    const tutor = one(
      db,
      "SELECT * FROM users WHERE email=? AND demo=1",
      `${slug}@demo.giasu.test`,
    );
    if (!tutor) continue;
    await seedCredentials(db, tutor, slug);
    const key = `profile-media-v1-${tutor.id}`;
    if (one(db, "SELECT key FROM demo_seeds WHERE key=?", key)) continue;
    const photo = await portrait(i);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (
        !one(
          db,
          "SELECT id FROM tutor_uploads WHERE tutor_id=? AND kind='photo'",
          tutor.id,
        )
      )
        saveUpload(db, tutor.id, "photo", photo, "image/webp", "profile.webp");
      run(
        db,
        "UPDATE tutors SET bio=? WHERE user_id=? AND bio LIKE 'Hồ sơ minh họa để trải nghiệm%'",
        bio,
        tutor.id,
      );
      run(db, "INSERT INTO demo_seeds VALUES (?)", key);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  if (activity) {
    seedClasses(db);
    await seedShowcase(db, hash);
  }
  if (
    !activity ||
    one(db, "SELECT key FROM demo_seeds WHERE key='activity-v1'")
  )
    return;
  const student = one(
    db,
    "SELECT id FROM users WHERE email='student@demo.giasu.test' AND demo=1",
  );
  if (!student) return;
  const chau = one(
      db,
      "SELECT id FROM users WHERE email='chau@demo.giasu.test' AND demo=1",
    ),
    linh = one(
      db,
      "SELECT id FROM users WHERE email='linh@demo.giasu.test' AND demo=1",
    );
  if (!chau || !linh) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [offset, tutor, subject, status, note] of [
      [
        2,
        chau.id,
        "toan",
        "accepted",
        "Ôn phương trình bậc hai và chuẩn bị kiểm tra giữa kỳ.",
      ],
      [4, linh.id, "tieng-anh", "pending", "Luyện giao tiếp và sửa phát âm."],
      [
        -5,
        chau.id,
        "toan",
        "completed",
        "Ôn lại các dạng phương trình cơ bản.",
      ],
    ]) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offset);
      date.setUTCHours(11, 0, 0, 0);
      const starts = date.toISOString();
      run(
        db,
        "INSERT OR IGNORE INTO slots(tutor_id,starts_at) VALUES (?,?)",
        tutor,
        starts,
      );
      const slot = one(
        db,
        "SELECT id FROM slots WHERE tutor_id=? AND starts_at=?",
        tutor,
        starts,
      );
      if (
        one(
          db,
          "SELECT id FROM bookings WHERE slot_id=? AND status IN ('pending','accepted','completed')",
          slot.id,
        )
      )
        continue;
      if (
        all(
          db,
          "SELECT starts_at FROM bookings WHERE student_id=? AND status IN ('pending','accepted','completed')",
          student.id,
        ).some((b) => Math.abs(new Date(b.starts_at) - date) < 3600000)
      )
        continue;
      const rate = one(
        db,
        "SELECT rate FROM tutors WHERE user_id=?",
        tutor,
      ).rate;
      const id = Number(
        run(
          db,
          "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,note,status) VALUES (?,?,?,?,?,?,'online',?,?)",
          student.id,
          tutor,
          slot.id,
          subject,
          starts,
          rate,
          note,
          status,
        ).lastInsertRowid,
      );
      run(
        db,
        "INSERT INTO messages(booking_id,sender_id,body) VALUES (?,?,?)",
        id,
        student.id,
        "Em muốn học chắc phần nền tảng trước. Mình có thể bắt đầu từ ví dụ đơn giản không ạ?",
      );
      run(
        db,
        "INSERT INTO messages(booking_id,sender_id,body) VALUES (?,?,?)",
        id,
        tutor,
        "Được nhé. Em chuẩn bị vở và một bài em còn vướng, mình sẽ cùng xem trong buổi học.",
      );
      if (status === "completed")
        run(
          db,
          "INSERT INTO reviews(booking_id,rating,body) VALUES (?,5,?)",
          id,
          "Đánh giá minh họa: Cô giải thích từng bước, mình đã hiểu cách kiểm tra lại kết quả.",
        );
    }
    run(
      db,
      "INSERT OR IGNORE INTO favorites VALUES (?,?)",
      student.id,
      chau.id,
    );
    run(
      db,
      "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)",
      student.id,
      linh.id,
    );
    const thread = one(
      db,
      "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?",
      student.id,
      linh.id,
    );
    if (
      !one(db, "SELECT id FROM inquiry_messages WHERE inquiry_id=?", thread.id)
    ) {
      run(
        db,
        "INSERT INTO inquiry_messages(inquiry_id,sender_id,body) VALUES (?,?,?)",
        thread.id,
        student.id,
        "Chào cô, em muốn tìm hiểu lớp tiếng Anh giao tiếp buổi tối. Cô có nhận học sinh mới không ạ?",
      );
      run(
        db,
        "INSERT INTO inquiry_messages(inquiry_id,sender_id,body) VALUES (?,?,?)",
        thread.id,
        linh.id,
        "Chào em, cô còn lịch buổi tối. Em đang muốn tập trung giao tiếp ở trường hay trong công việc?",
      );
    }
    run(db, "INSERT INTO demo_seeds VALUES ('activity-v1')");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

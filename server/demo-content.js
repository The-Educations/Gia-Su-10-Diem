import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { all, one, run } from "./db.js";
import { saveUpload } from "./uploads.js";

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
export async function enrichDemo(db, { activity = false } = {}) {
  for (const [i, [slug, name, subject, bio]] of profiles.entries()) {
    const tutor = one(
      db,
      "SELECT * FROM users WHERE email=? AND demo=1",
      `${slug}@demo.giasu.test`,
    );
    if (!tutor) continue;
    const key = `profile-media-v1-${tutor.id}`;
    if (one(db, "SELECT key FROM demo_seeds WHERE key=?", key)) continue;
    const photo = await portrait(i),
      cv = await sampleCV(name, subject);
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
      if (
        !one(
          db,
          "SELECT id FROM tutor_uploads WHERE tutor_id=? AND kind='cv'",
          tutor.id,
        )
      )
        saveUpload(
          db,
          tutor.id,
          "cv",
          cv,
          "application/pdf",
          `${slug}-sample-CV.pdf`,
        );
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

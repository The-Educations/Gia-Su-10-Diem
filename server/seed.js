import { enrichDemo } from "./demo-content.js";
import { openDatabase } from "./local-db.js";
import { passwordHash, run, one } from "./db.js";
export { seedCatalog } from "./seed-catalog.js";
import { seedCatalog } from "./seed-catalog.js";
export async function seedDemo(db, password, options = {}) {
  const hash = await passwordHash(password);
  const people = [
    ["Minh Anh", "student", "student"],
    ["Quản trị mẫu", "admin", "admin"],
    [
      "Nguyễn Minh Châu",
      "chau",
      "tutor",
      "Toán dễ hiểu, từ gốc đến nâng cao",
      "Hà Nội",
      180000,
      "Đại học Sư phạm Hà Nội",
      ["toan"],
      5,
      "CMC",
    ],
    [
      "Trần Hoàng Nam",
      "nam",
      "tutor",
      "Học Vật lí bằng những điều gần gũi",
      "TP. Hồ Chí Minh",
      200000,
      "Đại học Bách khoa TP.HCM",
      ["vat-li", "toan"],
      4,
    ],
    [
      "Lê Thảo Linh",
      "linh",
      "tutor",
      "Tự tin dùng tiếng Anh mỗi ngày",
      "Đà Nẵng",
      220000,
      "Đại học Ngoại ngữ",
      ["tieng-anh"],
      6,
    ],
    [
      "Phạm Khánh An",
      "an",
      "tutor",
      "Viết có ý, đọc có chiều sâu",
      "Hà Nội",
      160000,
      "Đại học Khoa học Xã hội và Nhân văn",
      ["ngu-van", "tieng-viet"],
      3,
    ],
    [
      "Võ Đức Huy",
      "huy",
      "tutor",
      "Khám phá khoa học qua từng câu hỏi",
      "TP. Hồ Chí Minh",
      170000,
      "Đại học Khoa học Tự nhiên",
      ["hoa-hoc", "sinh-hoc", "khtn"],
      4,
    ],
    [
      "Đặng Ngọc Hà",
      "ha",
      "tutor",
      "Kiên nhẫn đồng hành cùng học sinh nhỏ",
      "Cần Thơ",
      120000,
      "Đại học Cần Thơ",
      ["toan", "tieng-viet"],
      3,
    ],
  ];
  for (const [
    name,
    slug,
    role,
    headline,
    location,
    rate,
    education,
    subjects,
    experience,
  ] of people) {
    const email = `${slug}@demo.giasu.test`;
    if (one(db, "SELECT id FROM users WHERE email=?", email)) continue;
    const id = Number(
      run(
        db,
        "INSERT INTO users(name,email,password,role,demo) VALUES (?,?,?,?,1)",
        name,
        email,
        hash,
        role,
      ).lastInsertRowid,
    );
    if (role !== "tutor") continue;
    run(
      db,
      `INSERT INTO tutors(user_id,headline,bio,location,mode,rate,experience,education,subjects,status) VALUES (?,?,?,?,?,?,?,?,?,'approved')`,
      id,
      headline,
      "Hồ sơ minh họa để trải nghiệm quy trình tìm gia sư. Mỗi buổi học bắt đầu từ kiến thức còn vướng, cùng làm ví dụ, rồi tự luyện với phản hồi cụ thể.",
      location,
      "both",
      rate,
      experience,
      education,
      JSON.stringify(subjects),
    );
    for (let day = 1; day <= 10; day++)
      for (const hour of [11, 13]) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() + day);
        date.setUTCHours(hour, 0, 0, 0);
        run(
          db,
          "INSERT INTO slots(tutor_id,starts_at) VALUES (?,?)",
          id,
          date.toISOString(),
        );
      }
  }
  const specialisms = [
    [
      "chau",
      ["THCS", "THPT"],
      ["Tuyển sinh lớp 10", "Tốt nghiệp THPT", "Thi chuyên · HSG"],
    ],
    ["nam", ["THPT"], ["Tốt nghiệp THPT", "Đánh giá tư duy TSA"]],
    [
      "linh",
      ["THCS", "THPT", "Người đi làm"],
      ["Chứng chỉ ngoại ngữ", "Tốt nghiệp THPT"],
    ],
    [
      "an",
      ["Tiểu học", "THCS", "THPT"],
      ["Tuyển sinh lớp 10", "Tốt nghiệp THPT"],
    ],
    ["huy", ["THCS", "THPT"], ["Tốt nghiệp THPT", "ĐGNL · V-ACT"]],
    ["ha", ["Tiểu học"], []],
  ];
  for (const [slug, levels, goals] of specialisms)
    run(
      db,
      `UPDATE tutors SET levels=?,goals=? WHERE user_id IN (SELECT id FROM users WHERE email=? AND demo=1) AND levels='[]'`,
      JSON.stringify(levels),
      JSON.stringify(goals),
      `${slug}@demo.giasu.test`,
    );
  await enrichDemo(db, options);
}
if (process.argv[1]?.endsWith("/seed.js")) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seeding is disabled in production.");
  const db = openDatabase();
  seedCatalog(db);
  await seedDemo(db, process.env.DEMO_PASSWORD || "DemoStudy2026!", {
    activity: true,
  });
  db.close();
  console.log("Demo data ready. See README for local demo accounts.");
}

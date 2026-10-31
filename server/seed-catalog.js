import { run, one } from "./db.js";
import { subjects, references } from "./catalog.js";
export function seedCatalog(db) {
  for (const s of subjects)
    run(db, "INSERT OR IGNORE INTO subjects VALUES (?,?,?,?)", ...s);
  if (one(db, "SELECT count(*) AS n FROM resources").n) return;
  for (const [title, subject, category, level, source, url] of references)
    run(
      db,
      `INSERT INTO resources(title,subject_id,category,level,year,description,source_name,source_url) VALUES (?,?,?,?,?,?,?,?)`,
      title,
      subject,
      category,
      level,
      2026,
      "Cổng tham khảo của đơn vị tổ chức. Xem thông báo hiện hành tại nguồn; cấu trúc và lịch thi có thể thay đổi.",
      source,
      url,
    );
}

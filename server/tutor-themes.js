import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";

export const themeCatalog = [
  { id: "paper", name: "Mặc định" },
  { id: "sage", name: "Ngọc bích" },
  { id: "ink", name: "Đỏ cổ điển" },
];
const themeId = z.enum(["paper", "sage", "ink"]);
export const ownsTheme = (db, id, theme) => theme === "paper" || !!one(db, "SELECT 1 FROM tutor_theme_inventory WHERE tutor_id=? AND theme_id=?", id, theme);
export const themeInventory = (db, id) => {
  const owned = all(db, "SELECT theme_id FROM tutor_theme_inventory WHERE tutor_id=?", id).map(t => t.theme_id);
  return themeCatalog.filter(t => t.id === "paper" || owned.includes(t.id));
};
export function registerTutorThemes(app, db, auth, audit) {
  app.put("/api/admin/tutors/:id/themes/:theme", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const theme = themeId.parse(req.params.theme);
    if (!one(db, "SELECT user_id FROM tutors WHERE user_id=?", id)) return res.status(404).json({ error: "Không tìm thấy gia sư." });
    transaction(db, () => {
      if (theme !== "paper") run(db, "INSERT OR IGNORE INTO tutor_theme_inventory(tutor_id,theme_id,granted_by) VALUES (?,?,?)", id, theme, req.user.id);
      audit(req.user.id, "theme.granted", `${id}:${theme}`);
    });
    res.json({ inventory: themeInventory(db, id) });
  });
  app.put("/api/tutor/theme", auth("tutor"), (req, res) => {
    const { theme } = z.object({ theme: themeId }).parse(req.body);
    if (!ownsTheme(db, req.user.id, theme)) return res.status(403).json({ error: "Giao diện này chưa được quản trị viên cấp." });
    run(db, "UPDATE tutors SET profile_theme=? WHERE user_id=?", theme, req.user.id);
    res.json({ profile_theme: theme });
  });
}

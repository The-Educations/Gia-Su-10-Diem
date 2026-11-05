import { all, one, run, transaction } from "./db.js";

export function registerCatalogRemoval(app, db, auth, audit) {
  for (const kind of ["subjects", "resources"]) {
    app.delete(`/api/admin/${kind}/:id`, auth("admin"), (req, res) => {
      const item = one(db, `SELECT * FROM ${kind} WHERE id=? AND archived=0`, req.params.id);
      if (!item) return res.status(404).json({ error: "Mục này đã được bỏ khỏi danh mục." });
      transaction(db, () => {
        run(db, `UPDATE ${kind} SET archived=1 WHERE id=?`, item.id);
        if (kind === "subjects") run(db, "UPDATE resources SET archived=1 WHERE subject_id=?", item.id);
        const goals = new Set(all(db, "SELECT DISTINCT category FROM resources WHERE archived=0 AND published=1").map(r => r.category));
        for (const tutor of all(db, "SELECT user_id,subjects,goals,published FROM tutors")) {
          if (tutor.published) {
            const snapshot = JSON.parse(tutor.published);
            snapshot.subjects = JSON.stringify(JSON.parse(snapshot.subjects).filter(id => kind !== "subjects" || id !== item.id));
            snapshot.goals = JSON.stringify(JSON.parse(snapshot.goals).filter(goal => goals.has(goal)));
            run(db, "UPDATE tutors SET published=? WHERE user_id=?", JSON.stringify(snapshot), tutor.user_id);
          }
          const subjects = JSON.parse(tutor.subjects).filter(id => kind !== "subjects" || id !== item.id);
          const remainingGoals = JSON.parse(tutor.goals).filter(goal => goals.has(goal));
          if (JSON.stringify(subjects) !== tutor.subjects || JSON.stringify(remainingGoals) !== tutor.goals)
            run(db, "UPDATE tutors SET subjects=?,goals=?,review_revision=review_revision+1 WHERE user_id=?", JSON.stringify(subjects), JSON.stringify(remainingGoals), tutor.user_id);
        }
        audit(req.user.id, `${kind === "subjects" ? "subject" : "resource"}.removed`, item.id);
      });
      res.json({ ok: true });
    });
  }
}

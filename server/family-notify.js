import { all, one, run } from "./db.js";
import { bellPrefs, emailPrefs } from "./notifications.js";

// What a linked parent is told about their child's learning. The flows only call
// notifyParents; which kinds exist and which also arrive by email live here.
// Nothing the child wrote (messages, ratings, report reasons) is ever passed on.
export const PARENT_KINDS = {
  child_proposal_new: { email: true },
  child_proposal_sent: { email: false },
  child_class_started: { email: true },
  child_proposal_closed: { email: false },
  child_session_cancelled: { email: true },
  child_session_moved: { email: true },
  child_session_disputed: { email: true },
  child_dispute_resolved: { email: true },
  child_renew_reminder: { email: true },
  child_package_renewed: { email: false },
  child_package_ended: { email: true },
  child_withdrawal_requested: { email: true },
  child_verification: { email: false },
  child_unlinked: { email: true },
};

export const parentsOf = (db, studentId) => all(db, `SELECT f.parent_id FROM family_links f JOIN users u ON u.id=f.parent_id
  WHERE f.student_id=? AND u.status='active' AND u.learner_type='parent'`, studentId).map((r) => r.parent_id);

// Parents cannot open a class page yet, so every lesson notice lands on the child's card.
export const childLink = (studentId) => `/family?child=${studentId}`;

// A class title carries its first student's name, so notices name the subject instead.
export const subjectName = (db, subjectId) => one(db, "SELECT name FROM subjects WHERE id=?", subjectId)?.name || subjectId || "";

// Runs inside the caller's transaction. The bell and the email follow their own
// switches: muting one never silences the other. `parentId` narrows it to one parent.
export function notifyParents(db, studentId, kind, { actor = "", subject = "", link, detail = {}, parentId } = {}) {
  const spec = PARENT_KINDS[kind];
  if (!spec) throw new Error(`Unknown parent notice kind: ${kind}`);
  const parents = parentsOf(db, studentId).filter((id) => id !== studentId && (!parentId || id === parentId));
  if (!parents.length) return;
  const child = one(db, "SELECT name FROM users WHERE id=?", studentId)?.name || "";
  const to = link || childLink(studentId);
  for (const id of parents) {
    if (bellPrefs(db, id).children)
      run(db, "INSERT INTO notifications(user_id,kind,actor_name,subject,link,child_id,detail) VALUES (?,?,?,?,?,?,?)", id, kind, actor, subject, to, studentId, JSON.stringify(detail));
    if (spec.email && emailPrefs(db, id).children)
      run(db, "INSERT INTO email_outbox(user_id,kind,actor_name,subject,detail,link) VALUES (?,?,?,?,?,?)", id, kind, actor, subject, JSON.stringify({ ...detail, child }), to);
  }
}

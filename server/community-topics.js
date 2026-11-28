import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { proposalSchema, failUnlessTeaches } from "./proposals.js";
import { settings, spendCredits } from "./wallet.js";

// Every post has one topic the author picks. "Tìm gia sư" posts take tutors'
// offers (hồ sơ) instead of comments; tutors may add credits to rank in the
// top three, refunded if they are pushed out when the post closes.
export const TOPICS = ["find_tutor", "homework", "experience", "materials", "find_student", "announcement"];
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const BOOSTED = 3;

export function migrateCommunityTopics(db) {
  if (!db.prepare("PRAGMA table_info(community_posts)").all().some((c) => c.name === "topic"))
    db.exec("ALTER TABLE community_posts ADD COLUMN topic TEXT NOT NULL DEFAULT 'experience'");
  db.exec(`CREATE TABLE IF NOT EXISTS community_reactions (
    post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK(kind IN ('like','interest')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(post_id,user_id,kind));`);
  const cols = db.prepare("PRAGMA table_info(proposals)").all().map((c) => c.name);
  if (!cols.includes("post_id")) db.exec("ALTER TABLE proposals ADD COLUMN post_id INTEGER");
  if (!cols.includes("boost")) db.exec("ALTER TABLE proposals ADD COLUMN boost INTEGER NOT NULL DEFAULT 0");
}

export const topicOf = (input, user) => (user?.role === "admin" ? "announcement" : z.enum(TOPICS.filter((t) => t !== "announcement")).catch("experience").parse(input));

export function reactionCounts(db, postId, user) {
  const c = one(db, "SELECT SUM(kind='like') likes, SUM(kind='interest') interests FROM community_reactions WHERE post_id=?", postId);
  const mine = user ? all(db, "SELECT kind FROM community_reactions WHERE post_id=? AND user_id=?", postId, user.id).map((r) => r.kind) : [];
  const pitches = one(db, "SELECT COUNT(*) n FROM proposals WHERE post_id=?", postId).n;
  return { likes: c.likes || 0, interests: c.interests || 0, liked: mine.includes("like"), interested: mine.includes("interest"), pitch_count: pitches };
}

// Trending decays slowly with age (exponent 0.8) so good posts stay visible longer.
export function trendScore(p, now = Date.now()) {
  const hours = Math.max(0, (now - Date.parse((p.published_at || p.created_at).replace(" ", "T") + "Z")) / 3600000);
  return ((p.likes || 0) + 2 * (p.interests || 0) + 3 * (p.replies || 0) + 1) / Math.pow(hours + 2, 0.8);
}

export function registerCommunityTopics(app, db, auth) {
  app.post("/api/community/posts/:id/react", auth(), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { kind, on } = z.object({ kind: z.enum(["like", "interest"]), on: z.boolean() }).parse(req.body);
    if (!one(db, "SELECT 1 FROM community_posts WHERE id=? AND status='approved'", id)) fail(404, "Không tìm thấy bài viết.");
    if (on) run(db, "INSERT OR IGNORE INTO community_reactions(post_id,user_id,kind) VALUES (?,?,?)", id, req.user.id, kind);
    else run(db, "DELETE FROM community_reactions WHERE post_id=? AND user_id=? AND kind=?", id, req.user.id, kind);
    res.json(reactionCounts(db, id, req.user));
  });

  const post = (id) => {
    const p = one(db, "SELECT p.*,u.role AS author_role FROM community_posts p JOIN users u ON u.id=p.author_id WHERE p.id=? AND p.status='approved'", id);
    if (!p) fail(404, "Không tìm thấy bài viết.");
    return p;
  };
  app.get("/api/community/posts/:id/pitches", (req, res) => {
    const p = post(z.coerce.number().int().positive().parse(req.params.id));
    const rows = all(db, `SELECT pr.id,pr.tutor_id,pr.boost,pr.status,pr.sessions,pr.minutes,pr.rate,pr.total,pr.message,pr.created_at,u.name AS tutor_name
      FROM proposals pr JOIN users u ON u.id=pr.tutor_id WHERE pr.post_id=? ORDER BY pr.boost DESC, pr.id`, p.id);
    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1, featured: i < BOOSTED && r.boost > 0 }));
    if (req.user?.id === p.author_id || req.user?.role === "admin") return res.json({ count: rows.length, pitches: ranked, closed: !!p.solved });
    const mine = ranked.find((r) => r.tutor_id === req.user?.id);
    res.json({ count: rows.length, mine: mine ? { rank: mine.rank, boost: mine.boost, featured: mine.featured, status: mine.status } : null, closed: !!p.solved });
  });
  app.post("/api/community/posts/:id/pitches", auth("tutor"), (req, res) => {
    const p = post(z.coerce.number().int().positive().parse(req.params.id));
    if (p.topic !== "find_tutor" || p.author_role !== "student") fail(409, "Chỉ gửi hồ sơ vào bài tìm gia sư.");
    if (p.solved) fail(409, "Người đăng đã tìm được gia sư.");
    const { boost, ...rest } = z.object({ boost: z.number().int().min(0).max(50).default(0) }).passthrough().parse(req.body);
    const d = proposalSchema.parse({ ...rest, student_id: p.author_id });
    failUnlessTeaches(db, req.user.id, d.subject_id, d.mode, true);
    const s = settings(db), cost = s.offer_credits + boost;
    const id = transaction(db, () => {
      if (one(db, "SELECT 1 FROM proposals WHERE post_id=? AND tutor_id=?", p.id, req.user.id)) fail(409, "Bạn đã gửi hồ sơ vào bài này.");
      const pid = Number(run(db, `INSERT INTO proposals(sender,student_id,tutor_id,subject_id,level,mode,area,sessions,minutes,rate,total,schedule,start_date,message,expires_at,credits,post_id,boost)
        VALUES ('tutor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, p.author_id, req.user.id, d.subject_id, d.level, d.mode, d.area, d.sessions, d.minutes, d.rate, d.sessions * d.rate,
        JSON.stringify(d.schedule), d.start_date, d.message, new Date(Date.now() + 7 * 24 * 3600000).toISOString(), cost, p.id, boost).lastInsertRowid);
      spendCredits(db, req.user.id, cost, `proposal:${pid}`);
      notify(db, p.author_id, "pitch_new", { actor: req.user.name, subject: p.title, link: `/community/${p.id}` });
      return pid;
    });
    res.status(201).json({ id });
  });
  // Closing a post refunds the extra credits of tutors outside the top three.
  app.post("/api/community/posts/:id/close", auth("student"), (req, res) => {
    const p = post(z.coerce.number().int().positive().parse(req.params.id));
    if (p.author_id !== req.user.id) fail(403, "Chỉ người đăng đóng được bài.");
    transaction(db, () => {
      run(db, "UPDATE community_posts SET solved=1 WHERE id=?", p.id);
      const rows = all(db, "SELECT id,tutor_id,boost FROM proposals WHERE post_id=? ORDER BY boost DESC, id", p.id);
      rows.slice(BOOSTED).filter((r) => r.boost > 0).forEach((r) => {
        run(db, "UPDATE wallets SET credits_paid=credits_paid+? WHERE user_id=?", r.boost, r.tutor_id);
        run(db, "INSERT INTO wallet_entries(user_id,kind,credits,ref) VALUES (?,?,?,?)", r.tutor_id, "credits_refunded", r.boost, `proposal:${r.id}`);
        run(db, "UPDATE proposals SET boost=0 WHERE id=?", r.id);
      });
    });
    res.json({ ok: true });
  });
}

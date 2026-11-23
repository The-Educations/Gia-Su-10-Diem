import { all, one, run } from "./db.js";
import { findContactInfo } from "./community-policy.js";
import { notify } from "./notifications.js";

// Chat safety: off-platform contact detection. Policy: never block sending;
// the contact detail is masked for the recipient, the sender sees a soft
// warning, and the message is flagged for admin review. The raw text is kept
// in original_body which only admin endpoints return.

// VN phone patterns: 0xxxxxxxxx, +84xxxxxxxxx, spaced or dotted groups, and
// digits written as Vietnamese number words (không chín …).
const PHONE = /(?:\+84|0)\s?[1-9](?:[\s.-]?\d){7,9}/u;
const SPELLED = /(?:không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín)(?:\s+(?:không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín)){6,}/iu;
const PLATFORMS = /\b(?:zalo|facebook|fb|messenger|telegram|tele|whatsapp|viber)\b/i;
const LINK = /(?:t\.me|fb\.me|facebook\.com|instagram\.com|zalo\.me)\S*/i;

export function scanChatText(text) {
  const s = String(text || "");
  if (!s.trim()) return { flagged: false, masked: s };
  let hit = findContactInfo(s, true) || (PHONE.test(s) || SPELLED.test(s) ? "phone" : null) || (PLATFORMS.test(s) ? "platform" : null) || (LINK.test(s) ? "link" : null);
  if (!hit) return { flagged: false, masked: s };
  // Mask digit runs and handles; keep the rest readable.
  const masked = s
    .replace(PHONE, "[đã ẩn liên hệ]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/u, "[đã ẩn email]")
    .replace(/(?:t\.me|fb\.me|facebook\.com|instagram\.com|zalo\.me)\S*/i, "[đã ẩn liên kết]")
    .replace(new RegExp(`(${PLATFORMS.source})\\s*[:@]?\\s*\\S+`, "i"), "[đã ẩn liên hệ]");
  return { flagged: true, reason: hit, masked };
}

// Flagged message queue for admin "An toàn".
export function flaggedList(db) {
  const rows = all(db, `
    SELECT * FROM (
      SELECT 'lesson' AS thread_kind, m.booking_id AS thread_id, m.id, m.sender_id, m.body, m.original_body, m.created_at
      FROM messages m WHERE m.flagged=1
      UNION ALL
      SELECT 'inquiry', i.inquiry_id, i.id, i.sender_id, i.body, i.original_body, i.created_at
      FROM inquiry_messages i WHERE i.flagged=1
    ) ORDER BY created_at DESC LIMIT 100`);
  return rows.map((r) => {
    const u = one(db, "SELECT name FROM users WHERE id=?", r.sender_id);
    const thread = r.thread_kind === "lesson"
      ? one(db, "SELECT s.name AS a, t.name AS b FROM bookings bk JOIN users s ON s.id=bk.student_id JOIN users t ON t.id=bk.tutor_id WHERE bk.id=?", r.thread_id)
      : one(db, "SELECT s.name AS a, t.name AS b FROM inquiries iq JOIN users s ON s.id=iq.student_id JOIN users t ON t.id=iq.tutor_id WHERE iq.id=?", r.thread_id);
    return { ...r, sender_name: u?.name || "?", student_name: thread?.a, tutor_name: thread?.b };
  });
}

// Read-only conversation for admin (original bodies). Caller audits the view.
export function flaggedThread(db, kind, threadId) {
  const table = kind === "inquiry" ? "inquiry_messages" : "messages";
  const column = kind === "inquiry" ? "inquiry_id" : "booking_id";
  const msgs = all(db, `SELECT m.id,m.sender_id,m.body,m.original_body,m.flagged,m.created_at,u.name AS sender_name
    FROM ${table} m JOIN users u ON u.id=m.sender_id WHERE m.${column}=? ORDER BY m.id LIMIT 200`, threadId);
  const parties = kind === "inquiry"
    ? one(db, "SELECT s.name student_name,t.name tutor_name FROM inquiries iq JOIN users s ON s.id=iq.student_id JOIN users t ON t.id=iq.tutor_id WHERE iq.id=?", threadId)
    : one(db, "SELECT s.name student_name,t.name tutor_name FROM bookings bk JOIN users s ON s.id=bk.student_id JOIN users t ON t.id=bk.tutor_id WHERE bk.id=?", threadId);
  return { kind, thread_id: threadId, parties, messages: msgs };
}

export function reviewQueue(db) {
  return all(db, `
    SELECT 'booking' AS kind,r.booking_id,r.rating,r.body,r.hidden,r.reply,r.reported_reason,r.created_at,b.student_id,b.tutor_id,
      s.name AS student_name,t.name AS tutor_name
    FROM reviews r JOIN bookings b ON b.id=r.booking_id
    JOIN users s ON s.id=b.student_id JOIN users t ON t.id=b.tutor_id
    WHERE r.reported=1 OR r.hidden=1
    UNION ALL
    SELECT 'member' AS kind,m.id AS booking_id,m.published_rating AS rating,m.review AS body,m.hidden,m.reply,m.reported_reason,
      COALESCE(m.reviewed_at,m.ended_at) AS created_at,m.student_id,c.tutor_id,s.name AS student_name,t.name AS tutor_name
    FROM class_members m JOIN classes c ON c.id=m.class_id
    JOIN users s ON s.id=m.student_id JOIN users t ON t.id=c.tutor_id
    WHERE (m.reported=1 OR m.hidden=1) AND m.published_rating IS NOT NULL
    ORDER BY created_at DESC,booking_id DESC LIMIT 100`);
}

export function warnThread(db, admin, kind, threadId, note) {
  const sender = one(db, kind === "inquiry"
    ? "SELECT sender_id FROM inquiry_messages WHERE inquiry_id=? AND flagged=1 ORDER BY id DESC LIMIT 1"
    : "SELECT sender_id FROM messages WHERE booking_id=? AND flagged=1 ORDER BY id DESC LIMIT 1", threadId);
  if (!sender) return null;
  run(db, kind === "inquiry"
    ? "INSERT INTO inquiry_messages(inquiry_id,sender_id,body,is_event) VALUES (?,?,?,1)"
    : "INSERT INTO messages(booking_id,sender_id,body,is_event) VALUES (?,?,?,1)", threadId, admin.id, `Nhắc từ quản trị: vui lòng giữ liên hệ và thanh toán trong nền tảng để được bảo vệ.${note ? " " + note : ""}`);
  notify(db, sender.sender_id, "message_new", { actor: "Quản trị viên", link: `/messages?${kind}=${threadId}` });
  return sender.sender_id;
}

import { all, one, run } from "./db.js";

const money = (s) => `${Number(s || 0).toLocaleString("vi-VN")}đ`;
// Parent notices carry a JSON detail with the child's name. A damaged one must not stop the queue.
const facts = (d) => {
  let o = null;
  try { o = JSON.parse(d); } catch { /* fall back to plain words */ }
  return o && typeof o === "object" ? o : {};
};
const when = (iso) => Number.isNaN(Date.parse(iso)) ? "đã hẹn"
  : new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const amount = (n) => money(Number.isFinite(Number(n)) ? n : 0);
const WATCH = "Xem việc học của con";
// Written to the parent. Each takes (actor, subject, facts) and the child's name is in the facts.
const parent = (line) => (a, s, d) => { const f = facts(d); return line(a, s, { ...f, child: f.child || "" }); };
const CHILD_LINES = {
  child_proposal_new: parent((a, s, f) => [`${a} gửi con bạn đề nghị học`, `${a} vừa gửi con bạn ${f.child} đề nghị học ${s}: ${amount(f.amount)}. ${f.short > 0 ? `Số dư của con còn thiếu ${amount(f.short)}.` : "Số dư của con đủ để nhận đề nghị."}`, f.short > 0 ? "Nạp cho con" : "Xem đề nghị"]),
  child_class_started: parent((a, s, f) => [`Con bạn ${f.child} bắt đầu lớp ${s}`, `Con bạn ${f.child} bắt đầu lớp ${s} với ${a}. Tiến độ và buổi kế tiếp nằm trong trang Con của tôi.`, WATCH]),
  child_session_cancelled: parent((a, s, f) => [`Một buổi ${s} của ${f.child} đã bị hủy`, `${a} đã hủy buổi ${s} lúc ${when(f.when)} của con bạn ${f.child}. ${f.charged ? "Con hủy sát giờ nên buổi này vẫn tính phí." : "Buổi này không bị tính phí."}`, WATCH]),
  child_session_moved: parent((_a, s, f) => [`Buổi ${s} của ${f.child} đã đổi giờ`, `Buổi ${s} của con bạn ${f.child} dời từ ${when(f.from)} sang ${when(f.when)}.`, WATCH]),
  child_session_disputed: parent((_a, s, f) => [`Buổi ${s} của ${f.child} đang được xử lý`, `Buổi ${s} lúc ${when(f.when)} của con bạn ${f.child} bị báo có vấn đề và đang được quản trị viên xử lý.`, WATCH]),
  child_dispute_resolved: parent((_a, s, f) => [`Đã xử lý buổi ${s} của ${f.child}`, `Quản trị viên đã xử lý buổi ${s} của con bạn ${f.child}: ${f.outcome !== "refunded" ? "tính là đã học" : f.free ? "buổi học thử nên không tính phí" : "hoàn tiền buổi học"}.`, WATCH]),
  child_renew_reminder: parent((a, s, f) => [`${a} nhắc gia hạn lớp ${s} của ${f.child}`, `${a} nhắc gia hạn lớp ${s} của con bạn ${f.child}. Bạn có thể nạp thêm để con gia hạn.`, "Nạp cho con"]),
  child_package_ended: parent((_a, s, f) => [`Gói ${s} của ${f.child} đã kết thúc`, `Gói ${s} của con bạn ${f.child} đã kết thúc.${f.amount > 0 ? ` ${amount(f.amount)} chưa học đã hoàn vào số dư của con.` : ""}`, WATCH]),
  child_withdrawal_requested: parent((_a, _s, f) => [`${f.child} yêu cầu rút ${amount(f.amount)}`, `Con bạn ${f.child} yêu cầu rút ${amount(f.amount)} về tài khoản ngân hàng ****${f.last4 || ""}.`, WATCH]),
  child_unlinked: parent((_a, _s, f) => [`${f.child} đã gỡ liên kết`, `Con bạn ${f.child} đã gỡ liên kết với tài khoản của bạn. Bạn sẽ không nhận thông báo về ${f.child} nữa.`, WATCH]),
};

// Subject, one plain sentence and the button for each emailed notice.
export const LINES = {
  ...CHILD_LINES,
  proposal_new: (a, s) => [`${a} gửi bạn đề nghị học`, `${a} vừa gửi bạn đề nghị học ${s}. Xem lịch, học phí và trả lời trong 48 giờ.`, "Xem đề nghị"],
  proposal_accepted: (a, s) => [`${a} đã nhận đề nghị học`, `${a} đã nhận đề nghị học ${s}. Lớp học đã được tạo và có trên lịch của bạn.`, "Mở lớp học"],
  proposal_declined: (a, s) => [`${a} chưa nhận đề nghị học`, `${a} đã từ chối đề nghị học ${s}. Số tiền tạm giữ đã trả lại số dư của bạn.`, "Xem đề nghị"],
  deposit_received: (_a, s) => [`Đã nhận ${money(s)} vào số dư`, `Số dư học phí của bạn vừa được cộng ${money(s)}.`, "Xem số dư"],
  package_settled: (_a, s) => [`Đã chuyển ${money(s)} học phí vào số dư`, `Học phí ${money(s)} của gói học vừa kết thúc đã vào số dư của bạn.`, "Xem số dư"],
  withdrawal_paid: (_a, s) => [`Đã chuyển ${money(s)} bạn yêu cầu rút`, `Quản trị viên đã chuyển ${money(s)} về tài khoản ngân hàng của bạn. Biên lai (nếu có) nằm trong lịch sử số dư.`, "Xem số dư"],
  withdrawal_rejected: (_a, s) => [`Yêu cầu rút ${money(s)} chưa được chuyển`, `Yêu cầu rút ${money(s)} chưa được chuyển; số tiền đã trả lại số dư. Lý do nằm trong hội thoại hỗ trợ.`, "Xem số dư"],
  session_confirm: (a, s) => [`Xác nhận buổi học ${s}`, `${a} đã xác nhận buổi học ${s}. Bạn bấm "Đã học xong" giúp nhé; sau 48 giờ buổi học sẽ tự được xác nhận.`, "Xác nhận buổi học"],
  session_move: (a, s) => [`${a} đề nghị dời buổi học`, `${a} đề nghị dời một buổi ${s}. Đồng ý hoặc từ chối trong lớp học.`, "Xem đề nghị dời"],
  // Moderation. `d` is the reason; a removed comment carries JSON {reason, quote}.
  community_post_rejected: (_a, s, d) => [`Bài “${s}” chưa được duyệt`, `Bài “${s}” của bạn chưa được duyệt.\nLý do: ${d}\nBạn có thể sửa bài rồi gửi lại.`, "Xem bài của tôi"],
  community_revision_rejected: (_a, s, d) => [`Bản sửa bài “${s}” chưa được duyệt`, `Bản sửa bài “${s}” của bạn chưa được duyệt; bài gốc vẫn hiển thị.\nLý do: ${d}\nBạn có thể sửa lại rồi gửi lại.`, "Xem bài của tôi"],
  community_post_hidden: (_a, s, d) => [`Bài “${s}” đã bị ẩn`, `Bài “${s}” của bạn đã bị quản trị viên ẩn khỏi Cộng đồng.\nLý do: ${d}`, "Xem bài của tôi"],
  community_comment_removed: (_a, s, d) => { let o; try { o = JSON.parse(d); } catch { o = { reason: d }; } return [`Bình luận của bạn trong bài “${s}” đã được gỡ`, `Bình luận của bạn trong bài “${s}” đã được quản trị viên gỡ.\nLý do: ${o.reason}${o.quote ? `\nNội dung đã gỡ: “${o.quote}”` : ""}`, "Mở bài viết"]; },
  community_profile_removed: (_a, s, d) => [`${s} trong hồ sơ đã được gỡ`, `${s} trong hồ sơ Cộng đồng của bạn đã được quản trị viên gỡ.\nLý do: ${d}`, "Xem hồ sơ"],
};

// Sends what is waiting in the outbox, a few at a time; a failed send is retried later, up to five times.
export function createNoticeMailer(db, { sendEmail, origin }) {
  let running = false;
  async function flush() {
    if (!sendEmail || running || db.isOpen === false) return 0;
    running = true;
    let sent = 0;
    try {
      for (const row of all(db, "SELECT o.*,u.email,u.status FROM email_outbox o JOIN users u ON u.id=o.user_id WHERE o.sent_at IS NULL AND o.attempts<5 AND o.sending_until<=? ORDER BY o.id LIMIT 10", Date.now())) {
        if (!run(db, "UPDATE email_outbox SET sending_until=? WHERE id=? AND sent_at IS NULL AND sending_until<=?", Date.now() + 60000, row.id, Date.now()).changes) continue;
        const line = LINES[row.kind];
        if (!line || row.status !== "active" || !row.email) { run(db, "UPDATE email_outbox SET sent_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=?", row.id); continue; }
        const [subject, message, action] = line(row.actor_name || "Gia Sư 10 Điểm", row.subject, row.detail);
        try {
          await sendEmail({ kind: "notice", to: row.email, subject, message, action, link: `${origin}/app${row.link || "/workspace"}`, settings: `${origin}/app/settings?section=notifications` });
          run(db, "UPDATE email_outbox SET sent_at=CURRENT_TIMESTAMP,sending_until=0,attempts=attempts+1 WHERE id=?", row.id);
          sent++;
        } catch {
          run(db, "UPDATE email_outbox SET sending_until=?,attempts=attempts+1 WHERE id=?", Date.now() + 5 * 60000, row.id);
        }
      }
    } finally { running = false; }
    return sent;
  }
  const pending = () => db.isOpen !== false && !!one(db, "SELECT 1 FROM email_outbox WHERE sent_at IS NULL AND attempts<5 AND sending_until<=? LIMIT 1", Date.now());
  return { flush, pending };
}

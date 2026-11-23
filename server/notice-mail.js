import { all, one, run } from "./db.js";

const money = (s) => `${Number(s || 0).toLocaleString("vi-VN")}đ`;
// Subject, one plain sentence and the button for each emailed notice.
const LINES = {
  proposal_new: (a, s) => [`${a} gửi bạn đề nghị học`, `${a} vừa gửi bạn đề nghị học ${s}. Xem lịch, học phí và trả lời trong 48 giờ.`, "Xem đề nghị"],
  proposal_accepted: (a, s) => [`${a} đã nhận đề nghị học`, `${a} đã nhận đề nghị học ${s}. Lớp học đã được tạo và có trên lịch của bạn.`, "Mở lớp học"],
  proposal_declined: (a, s) => [`${a} chưa nhận đề nghị học`, `${a} đã từ chối đề nghị học ${s}. Số tiền tạm giữ đã trả lại số dư của bạn.`, "Xem đề nghị"],
  deposit_received: (_a, s) => [`Đã nhận ${money(s)} vào số dư`, `Số dư học phí của bạn vừa được cộng ${money(s)}.`, "Xem số dư"],
  package_settled: (_a, s) => [`Đã chuyển ${money(s)} học phí vào số dư`, `Học phí ${money(s)} của gói học vừa kết thúc đã vào số dư của bạn.`, "Xem số dư"],
  withdrawal_paid: (_a, s) => [`Đã chuyển ${money(s)} bạn yêu cầu rút`, `Quản trị viên đã chuyển ${money(s)} về tài khoản ngân hàng của bạn. Biên lai (nếu có) nằm trong lịch sử số dư.`, "Xem số dư"],
  withdrawal_rejected: (_a, s) => [`Yêu cầu rút ${money(s)} chưa được chuyển`, `Yêu cầu rút ${money(s)} chưa được chuyển; số tiền đã trả lại số dư. Lý do nằm trong hội thoại hỗ trợ.`, "Xem số dư"],
  session_confirm: (a, s) => [`Xác nhận buổi học ${s}`, `${a} đã xác nhận buổi học ${s}. Bạn bấm "Đã học xong" giúp nhé; sau 48 giờ buổi học sẽ tự được xác nhận.`, "Xác nhận buổi học"],
  session_move: (a, s) => [`${a} đề nghị dời buổi học`, `${a} đề nghị dời một buổi ${s}. Đồng ý hoặc từ chối trong lớp học.`, "Xem đề nghị dời"],
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
        const [subject, message, action] = line(row.actor_name || "Gia Sư 10 Điểm", row.subject);
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

// The sentences for the notices a parent receives about their child. No imports,
// so the tests can run them on real server rows. The server picks the kinds
// (server/family-notify.js); the English lives in the locale file.
export type ChildNoticeRow = { kind: string; actor_name: string; subject: string; child_name?: string | null; detail?: string };
export type ChildNoticeFormat = {
  t: (vi: string, params?: Record<string, string | number>) => string;
  when: (iso: string) => string;
  money: (amount: number) => string;
};
export type ChildNoticeIcon = "users" | "calendar" | "wallet";

type Facts = {
  amount?: number; short?: number; charged?: boolean; by?: string; outcome?: string;
  when?: string; from?: string; n?: number; last4?: string; status?: string; free?: boolean;
};

const TEXT = {
  offered: "{actor} gửi {child} đề nghị {subject}: {money}",
  offeredShort: "{actor} gửi {child} đề nghị {subject}: {money}. Còn thiếu {short}",
  sent: "{child} gửi đề nghị {subject} cho {actor}, tạm giữ {money}",
  trial: "{child} gửi yêu cầu học thử {subject} cho {actor}",
  started: "{child} bắt đầu lớp {subject} với {actor}",
  closed: "Đề nghị {subject} của {child} đã đóng",
  closedRefund: "Đề nghị {subject} của {child} đã đóng, hoàn {money}",
  cancelled: "{actor} đã hủy buổi {subject} lúc {when} của {child}",
  cancelledCharged: "{actor} đã hủy buổi {subject} lúc {when} của {child}, vẫn tính phí",
  cancelledAdmin: "Quản trị viên đã hủy buổi {subject} lúc {when} của {child}",
  moved: "Buổi {subject} của {child} dời từ {from} sang {when}",
  disputed: "Buổi {subject} lúc {when} của {child} đang được quản trị xử lý",
  resolvedRefund: "Quản trị đã xử lý buổi {subject} của {child}: hoàn tiền",
  resolvedTaught: "Quản trị đã xử lý buổi {subject} của {child}: tính là đã học",
  resolvedFree: "Quản trị đã xử lý buổi {subject} của {child}: không tính phí",
  remind: "{actor} nhắc gia hạn lớp {subject} của {child}",
  renewed: "{child} gia hạn {n} buổi {subject}",
  renewedHeld: "{child} gia hạn {n} buổi {subject}, tạm giữ {money}",
  ended: "Gói {subject} của {child} đã kết thúc",
  endedRefund: "Gói {subject} của {child} đã kết thúc, hoàn {money} vào số dư của con",
  withdrawal: "{child} yêu cầu rút {money} về tài khoản ****{last4}",
  verified: "Tài khoản của {child} đã được xác minh",
  unverified: "Tài khoản của {child} cần bổ sung hồ sơ xác minh",
  unlinked: "{child} đã gỡ liên kết. Bạn sẽ không nhận thông báo về {child} nữa",
};
const FALLBACK_CHILD = "con bạn";
export const CHILD_TEMPLATES: string[] = [...Object.values(TEXT), FALLBACK_CHILD];

const KINDS: Record<string, [ChildNoticeIcon, (f: Facts) => string]> = {
  child_proposal_new: ["wallet", (f) => (f.short ? TEXT.offeredShort : TEXT.offered)],
  child_proposal_sent: ["users", (f) => (f.amount ? TEXT.sent : TEXT.trial)],
  child_class_started: ["users", () => TEXT.started],
  child_proposal_closed: ["wallet", (f) => (f.amount ? TEXT.closedRefund : TEXT.closed)],
  child_session_cancelled: ["calendar", (f) => (f.by === "admin" ? TEXT.cancelledAdmin : f.charged ? TEXT.cancelledCharged : TEXT.cancelled)],
  child_session_moved: ["calendar", () => TEXT.moved],
  child_session_disputed: ["calendar", () => TEXT.disputed],
  child_dispute_resolved: ["calendar", (f) => (f.outcome !== "refunded" ? TEXT.resolvedTaught : f.free ? TEXT.resolvedFree : TEXT.resolvedRefund)],
  child_renew_reminder: ["wallet", () => TEXT.remind],
  child_package_renewed: ["wallet", (f) => (f.amount ? TEXT.renewedHeld : TEXT.renewed)],
  child_package_ended: ["wallet", (f) => (f.amount ? TEXT.endedRefund : TEXT.ended)],
  child_withdrawal_requested: ["wallet", () => TEXT.withdrawal],
  child_verification: ["users", (f) => (f.status === "approved" ? TEXT.verified : TEXT.unverified)],
  child_unlinked: ["users", () => TEXT.unlinked],
};

function facts(detail?: string): Facts {
  try {
    const value = JSON.parse(detail || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

// null for every notice that is not about a child.
export function childNotice(n: ChildNoticeRow, format: ChildNoticeFormat): { text: string; icon: ChildNoticeIcon } | null {
  const kind = KINDS[n.kind];
  if (!kind) return null;
  const [icon, pick] = kind, f = facts(n.detail);
  const when = (iso?: string) => (iso && !Number.isNaN(Date.parse(iso)) ? format.when(iso) : "…");
  return {
    icon,
    text: format.t(pick(f), {
      actor: n.actor_name,
      subject: n.subject,
      child: n.child_name || format.t(FALLBACK_CHILD),
      when: when(f.when),
      from: when(f.from),
      money: format.money(Number(f.amount) || 0),
      short: format.money(Number(f.short) || 0),
      n: f.n ?? 0,
      last4: f.last4 ?? "",
    }),
  };
}

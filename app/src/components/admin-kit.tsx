import { useState, type ReactNode } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { dateTime, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

// Shared pieces of the admin screen: a search box, filter chips that show how many
// rows each choice holds, and a "…" menu that keeps rare row actions out of the way.

export function AdminSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { t } = useI18n();
  return (
    <label className="admin-find">
      <Search aria-hidden="true" />
      <span className="sr-only">{t(placeholder)}</span>
      <Input id="admin-search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={t(placeholder)} />
    </label>
  );
}

export function FilterChips({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  const { t } = useI18n();
  return (
    <div className="admin-chips" role="group" aria-label={t(label)}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {t(o.label)}
          {o.count !== undefined && <span>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function AdminToolbar({ children }: { children: ReactNode }) {
  return <div className="admin-bar">{children}</div>;
}

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; hidden?: boolean };

export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const { t } = useI18n(), [open, setOpen] = useState(false), shown = items.filter((i) => !i.hidden);
  if (!shown.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t(label)}><MoreHorizontal /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="row-menu" role="menu">
        {shown.map((i) => (
          <button key={i.label} type="button" role="menuitem" data-danger={i.danger || undefined} onClick={() => { setOpen(false); i.onSelect(); }}>
            {t(i.label)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// A count beside a tab label, shown only when something waits for the admin.
export function Waiting({ n }: { n?: number }) {
  return n ? <span className="tab-count">{n}</span> : null;
}

// Plain names for the audit codes the server writes; an unknown code shows as it is.
export const AUDIT_LABELS: Record<string, string> = {
  "user.active": "Kích hoạt tài khoản", "user.suspended": "Tạm khóa tài khoản", "user.deleted": "Xóa tài khoản", "user.promoted_to_admin": "Cấp quyền quản trị",
  "student.verification.approved": "Xác minh học sinh", "student.verification.rejected": "Yêu cầu học sinh bổ sung",
  "tutor.approved": "Duyệt hồ sơ gia sư", "tutor.rejected": "Yêu cầu gia sư bổ sung", "tutor.withdrawn": "Gỡ hồ sơ gia sư", "tutor.pending": "Đưa hồ sơ về chờ duyệt", "tutor.update_email_sent": "Gửi email cập nhật hồ sơ",
  "credential.approved": "Xác nhận minh chứng", "credential.rejected": "Từ chối minh chứng", "credential.created": "Thêm minh chứng", "credential.deleted": "Xóa minh chứng", "theme.granted": "Tặng giao diện hồ sơ",
  "withdrawal.paid": "Đã chuyển tiền rút", "withdrawal.rejected": "Từ chối rút tiền", "withdrawal.receipt": "Thêm biên lai", "wallet.adjust": "Điều chỉnh số dư",
  "deposits.recheck": "Kiểm tra lại lệnh nạp", "deposit.assign": "Gán tiền vào lệnh nạp", "deposit.dismissed": "Bỏ qua khoản tiền", "settings.update": "Đổi cài đặt kinh doanh",
  "session.admin_cancel": "Hủy buổi học", "session.remind": "Nhắc xác nhận buổi học", "session.resolve.confirmed": "Xử lý báo cáo: buổi đã diễn ra", "session.resolve.refunded": "Xử lý báo cáo: hoàn tiền", "member.admin_end": "Kết thúc gói học",
  "proposal.created": "Gửi đề nghị", "proposal.accept": "Nhận đề nghị", "proposal.decline": "Từ chối đề nghị", "proposal.withdraw": "Rút đề nghị",
  "subject.save": "Lưu môn học", "subject.removed": "Bỏ môn học", "resource.create": "Thêm kỳ thi", "resource.update": "Sửa kỳ thi", "resource.removed": "Bỏ kỳ thi",
  "community.rules.update": "Sửa quy tắc cộng đồng", "community.post.delete": "Xóa bài cộng đồng", "community.comment.delete": "Gỡ bình luận", "community.comment.remove": "Gỡ bình luận",
  "community.announcement.create": "Đăng thông báo", "community.announcement.update": "Sửa thông báo", "community.report.resolve": "Xử lý báo cáo cộng đồng", "community.user.lock": "Khóa quyền cộng đồng", "community.user.unlock": "Mở quyền cộng đồng",
  "community.revision.approve": "Duyệt bản sửa bài viết", "community.revision.reject": "Từ chối bản sửa bài viết", "community.post.approve": "Duyệt bài cộng đồng", "community.post.reject": "Từ chối bài cộng đồng", "community.post.hide": "Ẩn bài cộng đồng",
  publish_post: "Đăng tin tức", unpublish_post: "Gỡ tin tức", delete_post: "Xóa tin tức", upload_news_image: "Tải ảnh tin tức", pin_post: "Ghim tin tức", unpin_post: "Bỏ ghim tin tức", save_post_draft: "Lưu nháp tin tức",
};

// Audit rows touching one record (a user, a payout, a session): the reverse of the
// log's deep links, so an admin sees what was done to this object without leaving it.
export function AdminAuditTrail({ target, targetUser }: { target?: string | number; targetUser?: number | null }) {
  const { t } = useI18n();
  const url = targetUser ? `/admin/audit?target_user=${targetUser}&limit=8` : `/admin/audit?target=${encodeURIComponent(String(target ?? ""))}&limit=8`;
  const r = useLoad<{ rows: { id: number; action: string; created_at: string; name: string }[] }>(url);
  const rows = r.data?.rows || [];
  if (!rows.length) return null;
  return (
    <section className="audit-trail">
      <h3>{t("Lịch sử quản trị")}</h3>
      <ul className="session-history">
        {rows.map((a) => <li key={a.id}><strong>{t(AUDIT_LABELS[a.action] || a.action)}</strong><span>{a.name} · {dateTime(a.created_at)}</span></li>)}
      </ul>
    </section>
  );
}

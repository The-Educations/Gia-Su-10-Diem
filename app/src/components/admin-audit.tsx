import { useState } from "react";
import { Link } from "react-router-dom";
import { dateTime, fold } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AdminData } from "@/lib/types";
import { Blank } from "./common";
import { AdminSearch, AdminToolbar, FilterChips } from "./admin-kit";
import { AdminUserOverview } from "./admin-classes";
import { Button } from "./ui/button";

// Plain names for the audit codes the server writes; an unknown code shows as it is.
const ACTIONS: Record<string, string> = {
  "user.active": "Kích hoạt tài khoản", "user.suspended": "Tạm khóa tài khoản", "user.deleted": "Xóa tài khoản", "user.promoted_to_admin": "Cấp quyền quản trị",
  "student.verification.approved": "Xác minh học sinh", "student.verification.rejected": "Yêu cầu học sinh bổ sung",
  "tutor.approved": "Duyệt hồ sơ gia sư", "tutor.rejected": "Yêu cầu gia sư bổ sung", "tutor.withdrawn": "Gỡ hồ sơ gia sư", "tutor.pending": "Đưa hồ sơ về chờ duyệt", "tutor.update_email_sent": "Gửi email cập nhật hồ sơ",
  "credential.approved": "Xác nhận minh chứng", "credential.rejected": "Từ chối minh chứng", "credential.created": "Thêm minh chứng", "credential.deleted": "Xóa minh chứng", "theme.granted": "Tặng giao diện hồ sơ",
  "withdrawal.paid": "Đã chuyển tiền rút", "withdrawal.rejected": "Từ chối rút tiền", "withdrawal.receipt": "Thêm biên lai", "wallet.adjust": "Điều chỉnh số dư",
  "deposits.recheck": "Kiểm tra lại lệnh nạp", "settings.update": "Đổi cài đặt kinh doanh",
  "session.admin_cancel": "Hủy buổi học", "session.remind": "Nhắc xác nhận buổi học", "session.resolve.confirmed": "Xử lý báo cáo: buổi đã diễn ra", "session.resolve.refunded": "Xử lý báo cáo: hoàn tiền", "member.admin_end": "Kết thúc gói học",
  "proposal.created": "Gửi đề nghị", "proposal.accept": "Nhận đề nghị", "proposal.decline": "Từ chối đề nghị", "proposal.withdraw": "Rút đề nghị",
  "subject.save": "Lưu môn học", "subject.removed": "Bỏ môn học", "resource.create": "Thêm kỳ thi", "resource.update": "Sửa kỳ thi", "resource.removed": "Bỏ kỳ thi",
  "community.rules.update": "Sửa quy tắc cộng đồng", "community.post.delete": "Xóa bài cộng đồng", "community.comment.delete": "Gỡ bình luận", "community.comment.remove": "Gỡ bình luận",
  "community.announcement.create": "Đăng thông báo", "community.announcement.update": "Sửa thông báo", "community.report.resolve": "Xử lý báo cáo cộng đồng", "community.user.lock": "Khóa quyền cộng đồng", "community.user.unlock": "Mở quyền cộng đồng",
  "community.revision.approve": "Duyệt bản sửa bài viết", "community.revision.reject": "Từ chối bản sửa bài viết", "community.post.approve": "Duyệt bài cộng đồng", "community.post.reject": "Từ chối bài cộng đồng", "community.post.hide": "Ẩn bài cộng đồng",
  publish_post: "Đăng tin tức", unpublish_post: "Gỡ tin tức", delete_post: "Xóa tin tức", upload_news_image: "Tải ảnh tin tức", pin_post: "Ghim tin tức", unpin_post: "Bỏ ghim tin tức", save_post_draft: "Lưu nháp tin tức",
};
const GROUPS: [string, string, RegExp][] = [
  ["accounts", "Tài khoản", /^(user|student)\./],
  ["tutors", "Gia sư", /^(tutor|credential|theme|gallery|upload)\b/],
  ["money", "Tài chính", /^(withdrawal|wallet|deposits|settings)\./],
  ["classes", "Lớp học", /^(session|member|proposal|booking)\./],
  ["catalog", "Danh mục", /^(subject|resource)\./],
  ["content", "Cộng đồng & tin", /^community\.|_post$|news/],
];

export function AdminAudit({ audit }: { audit: AdminData["audit"] }) {
  const { t } = useI18n(), [q, setQ] = useState(""), [group, setGroup] = useState(""), [person, setPerson] = useState<number | null>(null);
  const label = (a: string) => ACTIONS[a] || a;
  const inGroup = (a: string, g: string) => !g || !!GROUPS.find(([id]) => id === g)?.[2].test(a);
  const found = audit.filter((a) => fold(`${a.name} ${a.action} ${label(a.action)}`).includes(fold(q)));
  const rows = found.filter((a) => inGroup(a.action, group));
  // Where an entry points: each action deep-links to the screen holding that record.
  // Older rows keep only a bare id and simply show it — nothing breaks.
  const target = (a: AdminData["audit"][number]) => {
    const json = (() => { try { const p = JSON.parse(a.target); return p && typeof p === "object" ? p : null; } catch { return null; } })();
    const id = String(json?.id ?? a.target), num = Number(id) || 0;
    const go = (to: string, label: string) => <Link className="text-link" to={to}>{t(label)}</Link>;
    if (/^user\.(active|suspended|promoted_to_admin)$/.test(a.action) || a.action === "wallet.adjust" || a.action === "google_admin_granted" || a.action === "community.user.lock" || a.action === "community.user.unlock")
      return <Button size="xs" variant="ghost" onClick={() => setPerson(num)}>{t("Xem tài khoản")}</Button>;
    if (a.action === "user.deleted" || !id || id === "0") return <span className="muted">#{a.target}</span>;
    if (a.action === "student.verification.approved" || a.action === "student.verification.rejected") return go(`/admin?tab=students&student=${num}`, "Xem học sinh");
    if (/^tutor\.|^credential\.|^theme\.granted/.test(a.action)) { const tid = /^credential\./.test(a.action) ? a.credential_tutor : num; return tid ? go(`/admin?tab=tutors&tutor=${tid}`, "Xem hồ sơ") : <span className="muted">#{a.target}</span>; }
    if (/^withdrawal\./.test(a.action)) return go(`/admin?tab=finance&fin=payouts&withdrawal=${num}`, "Xem lệnh rút");
    if (a.action === "deposits.recheck") return go("/admin?tab=finance&fin=deposits", "Xem nạp tiền");
    if (a.action === "settings.update") return go("/admin?tab=finance&fin=settings", "Xem cài đặt");
    if (/^session\./.test(a.action)) return go(`/admin?tab=sessions&session=${num}`, "Xem buổi học");
    if (a.action === "member.admin_end") return go(`/admin?tab=sessions&member=${num}`, "Xem gói học");
    if (/^subject\./.test(a.action)) return go(`/admin?tab=catalog&subject=${encodeURIComponent(id)}`, "Xem môn");
    if (/^resource\./.test(a.action)) return go(`/admin?tab=catalog&resource=${num}`, "Xem kỳ thi");
    if (/^community\./.test(a.action)) return go("/admin?tab=community", "Xem cộng đồng");
    if (/_post$|news/.test(a.action)) return go("/admin?tab=posts", "Xem tin tức");
    return <span className="muted">#{a.target}</span>;
  };
  return (
    <div className="admin-pane">
      <AdminToolbar>
        <AdminSearch value={q} onChange={setQ} placeholder="Tìm người hoặc thao tác…" />
        <FilterChips label="Nhóm thao tác" value={group} onChange={setGroup} options={[
          { value: "", label: "Tất cả", count: found.length },
          ...GROUPS.map(([value, name]) => ({ value, label: name, count: found.filter((a) => inGroup(a.action, value)).length })).filter((o) => o.count),
        ]} />
      </AdminToolbar>
      {rows.length ? (
        <table className="finance-table audit-table">
          <thead><tr><th>{t("Thao tác")}</th><th>{t("Người thực hiện")}</th><th>{t("Đối tượng")}</th><th className="num">{t("Thời gian")}</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{t(label(a.action))}</td>
                <td>{a.name}</td>
                <td>{target(a)}</td>
                <td className="num">{dateTime(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Blank title={t(audit.length ? "Không có kết quả phù hợp" : "Chưa có thao tác quản trị")} />}
      <AdminUserOverview userId={person} onClose={() => setPerson(null)} />
    </div>
  );
}

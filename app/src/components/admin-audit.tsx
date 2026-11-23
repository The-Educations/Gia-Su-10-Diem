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
  "tutor.approved": "Duyệt hồ sơ gia sư", "tutor.rejected": "Yêu cầu gia sư bổ sung", "tutor.withdrawn": "Gỡ hồ sơ gia sư", "tutor.update_email_sent": "Gửi email cập nhật hồ sơ",
  "credential.approved": "Xác nhận minh chứng", "credential.rejected": "Từ chối minh chứng", "credential.created": "Thêm minh chứng", "credential.deleted": "Xóa minh chứng", "theme.granted": "Tặng giao diện hồ sơ",
  "withdrawal.paid": "Đã chuyển tiền rút", "withdrawal.rejected": "Từ chối rút tiền", "withdrawal.receipt": "Thêm biên lai", "wallet.adjust": "Điều chỉnh số dư",
  "deposits.recheck": "Kiểm tra lại lệnh nạp", "settings.update": "Đổi cài đặt kinh doanh",
  "session.admin_cancel": "Hủy buổi học", "session.resolve.confirmed": "Xử lý báo cáo: buổi đã diễn ra", "session.resolve.refunded": "Xử lý báo cáo: hoàn tiền", "member.admin_end": "Kết thúc gói học",
  "proposal.created": "Gửi offer", "proposal.accepted": "Nhận offer", "proposal.declined": "Từ chối offer", "proposal.withdrawn": "Rút offer",
  "subject.save": "Lưu môn học", "subject.removed": "Bỏ môn học", "resource.create": "Thêm kỳ thi", "resource.update": "Sửa kỳ thi", "resource.removed": "Bỏ kỳ thi",
  "community.rules.update": "Sửa quy tắc cộng đồng", "community.post.delete": "Xóa bài cộng đồng", "community.comment.delete": "Gỡ bình luận",
  "community.announcement.create": "Đăng thông báo", "community.announcement.update": "Sửa thông báo",
  publish_post: "Đăng tin tức", unpublish_post: "Gỡ tin tức", delete_post: "Xóa tin tức", upload_news_image: "Tải ảnh tin tức",
};
const GROUPS: [string, string, RegExp][] = [
  ["accounts", "Tài khoản", /^(user|student)\./],
  ["tutors", "Gia sư", /^(tutor|credential|theme|gallery|upload)\b/],
  ["money", "Tiền", /^(withdrawal|wallet|deposits|settings)\./],
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
  // Where an entry points: a person opens their overview, a tutor opens the public profile.
  const target = (a: AdminData["audit"][number]) =>
    /^(user|student|wallet)\./.test(a.action) && a.action !== "user.deleted" ? <Button size="xs" variant="ghost" onClick={() => setPerson(Number(a.target))}>{t("Xem tài khoản")}</Button>
      : /^tutor\./.test(a.action) ? <Link className="text-link" to={`/tutors/${a.target}`}>{t("Xem hồ sơ")}</Link>
      : /^withdrawal\./.test(a.action) ? <Link className="text-link" to="/admin?tab=finance">{t("Xem tài chính")}</Link>
      : <span className="muted">#{a.target}</span>;
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

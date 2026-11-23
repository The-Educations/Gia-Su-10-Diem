import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ErrorState, Loading } from "./common";
import { dayOf, timeOf } from "./session-actions";
import { Button } from "./ui/button";
import "@/money.css";

type Today = {
  students: number;
  tutors: number; credentials: number; withdrawals: number; community: number; sessions_waiting: number;
  violations: { user_id: number; name: string; violations: number }[];
  disputes: { session_id: number; member_id: number; note: string; starts_at: string; class_id: number; title: string; student_name: string; tutor_name: string }[];
};

// The administrator's first screen: what is waiting, in the order it matters.
export function AdminToday() {
  const { t } = useI18n(), { refresh } = useApp(), result = useLoad<Today>("/admin/today");
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  const d = result.data;
  const queues: [number, string, string][] = [
    [d.disputes.length + d.sessions_waiting, "Buổi học cần xử lý", "/admin?tab=sessions&scope=attention"],
    [d.withdrawals, "Yêu cầu rút tiền", "/admin?tab=finance"],
    [d.students, "Học sinh chờ xác minh", "/admin?tab=students"],
    [d.credentials, "Minh chứng chờ đối chiếu", "/admin?tab=tutors"],
    [d.tutors, "Hồ sơ gia sư chờ duyệt", "/admin?tab=tutors&status=pending"],
    [d.community, "Bài cộng đồng chờ duyệt", "/admin?tab=community"],
  ];
  async function resolve(sessionId: number, memberId: number, outcome: "confirmed" | "refunded") {
    try { await api(`/admin/sessions/${sessionId}/resolve`, "POST", { member_id: memberId, outcome }); toast.success(t("Đã xử lý báo cáo")); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="admin-today">
      <ul className="today-queues">
        {queues.map(([n, label, to]) => (
          <li key={label} data-empty={!n || undefined}>
            {to.startsWith("#") ? <a href={to}><strong>{n}</strong><span>{t(label)}</span></a> : <Link to={to}><strong>{n}</strong><span>{t(label)}</span></Link>}
          </li>
        ))}
      </ul>
      <section id="disputes">
        <h2>{t("Buổi học bị báo vấn đề")}</h2>
        {d.disputes.length ? (
          <table className="finance-table">
            <tbody>
              {d.disputes.map((x) => (
                <tr key={`${x.session_id}-${x.member_id}`}>
                  <td><Link to={`/admin?tab=sessions&session=${x.session_id}`}>{x.title}</Link><small>{dayOf(x.starts_at)} {timeOf(x.starts_at)} · {x.tutor_name} / {x.student_name}</small></td>
                  <td>{x.note}</td>
                  <td>
                    <span className="actions">
                      <Button size="sm" onClick={() => resolve(x.session_id, x.member_id, "confirmed")}>{t("Buổi đã diễn ra")}</Button>
                      <Button size="sm" variant="outline" onClick={() => resolve(x.session_id, x.member_id, "refunded")}>{t("Hoàn tiền")}</Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="credential-empty">{t("Không có báo cáo nào.")}</p>}
      </section>
      {d.violations.length > 0 && (
        <section>
          <h2>{t("Gia sư vi phạm nhiều lần")}</h2>
          <ul className="today-violations">{d.violations.map((v) => <li key={v.user_id}><Link to={`/tutors/${v.user_id}`}>{v.name}</Link> · {t("{n} lần hủy sát giờ hoặc không đến", { n: v.violations })}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

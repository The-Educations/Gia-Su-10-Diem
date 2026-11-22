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
  tutors: number; credentials: number; withdrawals: number; community: number;
  violations: { user_id: number; name: string; violations: number }[];
  disputes: { session_id: number; member_id: number; note: string; starts_at: string; class_id: number; title: string; student_name: string; tutor_name: string }[];
};

// The administrator's first screen: what is waiting, in the order it matters.
type PendingStudent = { user_id: number; name: string; email: string; school: string; grade: string; student_code: string; submitted_at: string; files: { id: string; mime: string }[] };

// Students waiting for their school record to be checked.
function StudentChecks() {
  const { t } = useI18n(), list = useLoad<PendingStudent[]>("/admin/verifications");
  async function decide(id: number, status: "approved" | "rejected") {
    const note = status === "rejected" ? prompt(t("Lý do cần bổ sung")) || "" : "";
    if (status === "rejected" && !note) return;
    try { await api(`/admin/verifications/${id}`, "PATCH", { status, note }); toast.success(t(status === "approved" ? "Đã xác minh học sinh" : "Đã yêu cầu bổ sung")); list.reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  if (!list.data?.length) return null;
  return (
    <section id="students">
      <h2>{t("Học sinh chờ xác minh")}</h2>
      <ul className="student-checks">
        {list.data.map((v) => (
          <li key={v.user_id}>
            <div className="student-check-files">
              {v.files.map((f) => f.mime.startsWith("image")
                ? <a key={f.id} href={`/api/verification-files/${f.id}`} target="_blank" rel="noreferrer"><img src={`/api/verification-files/${f.id}`} alt={t("Học bạ của {name}", { name: v.name })} /></a>
                : <a key={f.id} href={`/api/verification-files/${f.id}`} target="_blank" rel="noreferrer" className="credential-file">PDF</a>)}
            </div>
            <dl>
              <div><dt>{t("Họ và tên")}</dt><dd>{v.name}</dd></div>
              <div><dt>{t("Trường đang học")}</dt><dd>{v.school} · {v.grade}</dd></div>
              <div><dt>{t("Mã học sinh")}</dt><dd>{v.student_code}</dd></div>
            </dl>
            <span className="actions">
              <Button size="sm" onClick={() => decide(v.user_id, "approved")}>{t("Khớp, xác minh")}</Button>
              <Button size="sm" variant="outline" onClick={() => decide(v.user_id, "rejected")}>{t("Yêu cầu bổ sung")}</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdminToday() {
  const { t } = useI18n(), { refresh } = useApp(), result = useLoad<Today>("/admin/today");
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState error={result.error} retry={result.reload} />;
  const d = result.data;
  const queues: [number, string, string][] = [
    [d.disputes.length, "Buổi học bị báo vấn đề", "#disputes"],
    [d.withdrawals, "Yêu cầu rút tiền", "/admin?tab=finance"],
    [d.students, "Học sinh chờ xác minh", "#students"],
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
      <StudentChecks />
      <section id="disputes">
        <h2>{t("Buổi học bị báo vấn đề")}</h2>
        {d.disputes.length ? (
          <table className="finance-table">
            <tbody>
              {d.disputes.map((x) => (
                <tr key={`${x.session_id}-${x.member_id}`}>
                  <td><Link to={`/classes/${x.class_id}`}>{x.title}</Link><small>{dayOf(x.starts_at)} {timeOf(x.starts_at)} · {x.tutor_name} / {x.student_name}</small></td>
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

import { useState } from "react";
import { BadgeCheck, CircleAlert, Clock, ExternalLink, FileText, X } from "lucide-react";
import { toast } from "sonner";
import "@/credentials.css";
import { api, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Credential } from "@/lib/types";
import { ErrorState, Loading } from "./common";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

const KIND = { school: "Trường học", award: "Giải thưởng", certificate: "Chứng chỉ" };

function Facts({ c }: { c: Credential }) {
  const { t } = useI18n(),
    d = c.detail;
  const rows: [string, string | number | null][] = c.kind === "school"
    ? [["Chuyên ngành / lớp chuyên", d.field], ["Thời gian", d.start_year ? `${d.start_year} – ${d.current ? t("nay") : d.end_year ?? "?"}` : ""]]
    : c.kind === "award"
      ? [["Giải", d.prize], ["Môn thi", d.subject], ["Năm", d.end_year]]
      : [["Điểm / cấp độ", d.score], ["Số báo danh / mã", d.reference], ["Năm cấp", d.end_year]];
  return (
    <dl className="credential-facts">
      <div><dt>{t(KIND[c.kind])}</dt><dd>{c.name}{!c.catalog_id && <small> · {t("tự nhập")}</small>}</dd></div>
      {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

function Item({ c, onChanged }: { c: Credential; onChanged: () => void }) {
  const { t } = useI18n(),
    [note, setNote] = useState(c.review_note),
    [rejecting, setRejecting] = useState(false),
    [busy, setBusy] = useState(false);
  async function review(status: "approved" | "rejected") {
    setBusy(true);
    try {
      await api(`/admin/credentials/${c.id}`, "PATCH", { status, note: status === "rejected" ? note : "" });
      toast.success(t(status === "approved" ? "Đã xác minh {name}" : "Đã yêu cầu bổ sung {name}", { name: c.name }));
      setRejecting(false);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const Icon = c.status === "approved" ? BadgeCheck : c.status === "rejected" ? CircleAlert : Clock;
  return (
    <li className="credential-review-item" data-status={c.status}>
      <div className="credential-review-files">
        {c.files.length ? c.files.map((f) => f.mime.startsWith("image/") ? (
          <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" aria-label={t("Mở {name}", { name: f.name })}>
            <img src={f.url} alt={t("Minh chứng: {name}", { name: c.name })} />
          </a>
        ) : (
          <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="proof-pdf">
            <FileText aria-hidden="true" />{f.name}<ExternalLink aria-hidden="true" />
          </a>
        )) : <p className="credential-empty">{t("Chưa có tệp minh chứng")}</p>}
      </div>
      <div className="credential-review-side">
        <span className="credential-status"><Icon aria-hidden="true" />{t(c.status === "approved" ? "Đã xác minh" : c.status === "rejected" ? "Cần bổ sung" : "Chờ đối chiếu")}</span>
        <Facts c={c} />
        {c.status === "rejected" && c.review_note && !rejecting && <p className="credential-note">{c.review_note}</p>}
        {rejecting ? (
          <div className="credential-reject">
            <Textarea aria-label={t("Lý do cần bổ sung")} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <div className="actions">
              <Button size="sm" variant="destructive" disabled={busy || !note.trim()} onClick={() => review("rejected")}>{t("Gửi yêu cầu bổ sung")}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(false)}><X data-icon="inline-start" />{t("Hủy")}</Button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <Button size="sm" disabled={busy || !c.files.length || c.status === "approved"} onClick={() => review("approved")}><BadgeCheck data-icon="inline-start" />{t("Khớp, xác minh")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>{t("Yêu cầu bổ sung")}</Button>
          </div>
        )}
      </div>
    </li>
  );
}

// Each declared entry sits next to its proof so an administrator can compare
// names, years and scores before the line appears as verified on the profile.
export function CredentialReview({ tutorId }: { tutorId: number }) {
  const { t } = useI18n(),
    { refresh } = useApp(),
    result = useLoad<Credential[]>(`/admin/tutors/${tutorId}/credentials`);
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  const rows = result.data || [],
    hasSchool = rows.some((c) => c.kind === "school" && c.status === "approved");
  return (
    <section className="credential-review" aria-label={t("Minh chứng")}>
      <h3>{t("Minh chứng")} <span>{t("{n} mục", { n: rows.length })}</span></h3>
      {!hasSchool && <p className="credential-warning"><CircleAlert aria-hidden="true" />{t("Chưa có trường học nào được xác minh.")}</p>}
      {rows.length ? (
        <ul>{rows.map((c) => <Item key={c.id} c={c} onChanged={refresh} />)}</ul>
      ) : (
        <p className="credential-empty">{t("Gia sư chưa gửi minh chứng.")}</p>
      )}
    </section>
  );
}

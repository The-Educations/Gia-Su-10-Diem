import { useState } from "react";
import { BadgeCheck, CircleAlert, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, dateTime, fold, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ErrorState, Loading } from "./common";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import "@/money.css";

type Check = {
  user_id: number; name: string; email: string; school: string; grade: string; student_code: string; status: "pending" | "approved" | "rejected";
  note: string; submitted_at: string | null; reviewed_at: string | null; files: { id: string; mime: string }[];
};
const FILTERS: [Check["status"], string][] = [["pending", "Chờ duyệt"], ["approved", "Đã xác minh"], ["rejected", "Cần bổ sung"]];
const STATE: Record<Check["status"], [string, typeof Clock]> = { pending: ["Chờ duyệt", Clock], approved: ["Đã xác minh", BadgeCheck], rejected: ["Cần bổ sung", CircleAlert] };

// Students' school records (học bạ): compare the photo with the details, then decide.
export function AdminStudents({ query = "" }: { query?: string }) {
  const { t } = useI18n(),
    { refresh } = useApp(),
    list = useLoad<Check[]>("/admin/verifications?status=all"),
    [filter, setFilter] = useState<Check["status"]>("pending"),
    [asking, setAsking] = useState<Check | null>(null),
    [note, setNote] = useState(""),
    [zoom, setZoom] = useState<{ src: string; name: string } | null>(null),
    [busy, setBusy] = useState(0);
  if (list.loading) return <Loading />;
  if (list.error || !list.data) return <ErrorState error={list.error} retry={list.reload} />;
  const rows = list.data.filter((v) => !query || fold(`${v.name} ${v.email} ${v.school} ${v.student_code}`).includes(fold(query)));
  const shown = rows.filter((v) => v.status === filter);
  async function decide(v: Check, status: "approved" | "rejected", reason = "") {
    setBusy(v.user_id);
    try {
      await api(`/admin/verifications/${v.user_id}`, "PATCH", { status, note: reason });
      toast.success(t(status === "approved" ? "Đã xác minh học sinh" : "Đã yêu cầu bổ sung"));
      setAsking(null);
      setNote("");
      list.reload();
      refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(0); }
  }
  return (
    <div className="admin-students">
      <div className="segmented student-filter" role="group" aria-label={t("Lọc theo trạng thái")}>
        {FILTERS.map(([value, label]) => (
          <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {t(label)} <span>{rows.filter((v) => v.status === value).length}</span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className="student-checks">
          {shown.map((v) => {
            const [label, Icon] = STATE[v.status];
            return (
              <li key={v.user_id} data-status={v.status}>
                <div className="student-check-files">
                  {v.files.length ? v.files.map((f, i) => f.mime.startsWith("image")
                    ? <button type="button" key={f.id} onClick={() => setZoom({ src: `/api/verification-files/${f.id}`, name: v.name })} aria-label={t("Phóng to học bạ {n} của {name}", { n: i + 1, name: v.name })}><img src={`/api/verification-files/${f.id}`} alt={t("Học bạ của {name}", { name: v.name })} /></button>
                    : <a key={f.id} href={`/api/verification-files/${f.id}`} target="_blank" rel="noreferrer" className="student-check-pdf"><FileText aria-hidden="true" />PDF</a>)
                    : <span className="student-check-pdf">{t("Chưa có tệp")}</span>}
                </div>
                <div className="student-check-body">
                  <div className="student-check-head">
                    <strong>{v.name}</strong>
                    <span className="student-check-state" data-status={v.status}><Icon aria-hidden="true" />{t(label)}</span>
                  </div>
                  <dl>
                    <div><dt>{t("Email")}</dt><dd>{v.email}</dd></div>
                    <div><dt>{t("Trường đang học")}</dt><dd>{v.school} · {v.grade}</dd></div>
                    <div><dt>{t("Mã học sinh")}</dt><dd>{v.student_code}</dd></div>
                    <div><dt>{t(v.status === "pending" ? "Gửi lúc" : "Duyệt lúc")}</dt><dd>{dateTime((v.status === "pending" ? v.submitted_at : v.reviewed_at) || v.submitted_at || "")}</dd></div>
                  </dl>
                  {v.status === "rejected" && v.note && <p className="credential-note">{v.note}</p>}
                  <span className="actions">
                    {v.status !== "approved" && <Button size="sm" disabled={busy === v.user_id || !v.files.length} onClick={() => decide(v, "approved")}>{t("Khớp, xác minh")}</Button>}
                    {v.status !== "rejected" && <Button size="sm" variant="outline" disabled={busy === v.user_id} onClick={() => { setAsking(v); setNote(""); }}>{t(v.status === "approved" ? "Thu hồi xác minh" : "Yêu cầu bổ sung")}</Button>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="credential-empty">{t(filter === "pending" ? "Không có học bạ nào chờ duyệt." : "Chưa có học sinh trong mục này.")}</p>}
      <Dialog open={!!asking} onOpenChange={(v) => !v && setAsking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(asking?.status === "approved" ? "Thu hồi xác minh" : "Yêu cầu bổ sung")}</DialogTitle>
            <DialogDescription>{asking?.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (asking && note.trim()) void decide(asking, "rejected", note.trim()); }}>
            <label className="sr-only" htmlFor="student-note">{t("Lý do")}</label>
            <Textarea id="student-note" rows={3} required maxLength={500} placeholder={t("Ví dụ: Ảnh bị mờ, chụp lại trang có tên và trường")} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="actions dialog-actions"><Button type="submit" disabled={!note.trim() || !!busy}>{t("Gửi cho học sinh")}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!zoom} onOpenChange={(v) => !v && setZoom(null)}>
        <DialogContent className="student-zoom">
          <DialogHeader><DialogTitle>{zoom && t("Học bạ của {name}", { name: zoom.name })}</DialogTitle><DialogDescription className="sr-only">{t("Ảnh phóng to")}</DialogDescription></DialogHeader>
          {zoom && <img src={zoom.src} alt={t("Học bạ của {name}", { name: zoom.name })} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

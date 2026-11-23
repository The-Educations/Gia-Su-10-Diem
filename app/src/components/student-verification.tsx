import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ErrorState, Submit } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import "@/credentials.css";

export type Verification = { status: "draft" | "pending" | "approved" | "rejected"; school: string; grade: string; student_code: string; note: string; files: { id: string; mime: string }[] };
const GRADES = Array.from({ length: 12 }, (_, i) => `Lớp ${i + 1}`).concat(["Đại học", "Khác"]);

export const useVerification = () => {
  const { user } = useApp();
  return useLoad<Verification>(user?.role === "student" && user.learner_type !== "parent" ? "/account/verification" : null);
};

// A student's school record (học bạ) or transcript, checked by an administrator.
export function StudentVerification() {
  const { user } = useApp(), { t } = useI18n(), result = useVerification(), input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!result.data) return null;
  const v = result.data, locked = v.status === "approved";
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of [...files]) {
        const r = await fetch("/api/account/verification/files", { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file, credentials: "same-origin" });
        if (!r.ok) throw new Error((await r.json()).error);
      }
      result.reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/account/verification", "PUT", { school: f.get("school"), grade: f.get("grade"), student_code: f.get("student_code") });
      toast.success(t("Đã gửi để quản trị viên xác minh"));
      result.reload();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <section className="verify-card" id="verify" data-status={v.status}>
      <header>
        <h2>{locked && <BadgeCheck aria-hidden="true" />}{t("Xác minh học sinh")}</h2>
        <span className="verify-status">{t({ draft: "Chưa xác minh", pending: "Đang chờ duyệt", approved: "Đã xác minh", rejected: "Cần bổ sung" }[v.status])}</span>
      </header>
      {!locked && <p>{t("Gửi ảnh học bạ hoặc bảng điểm có tên và trường của bạn. Sau khi được xác minh, bạn gửi và nhận đề nghị với gia sư.")}</p>}
      {v.status === "rejected" && v.note && <p className="verify-note" role="alert">{v.note}</p>}
      {!locked && (
        <form onSubmit={submit}>
          <FieldGroup>
            <div className="form-two">
              <Field><FieldLabel htmlFor="v-school">{t("Trường đang học")}</FieldLabel><Input id="v-school" name="school" required defaultValue={v.school || user?.school || ""} maxLength={160} /></Field>
              <Field><FieldLabel htmlFor="v-grade">{t("Lớp")}</FieldLabel>
                <select id="v-grade" name="grade" className="native-select" defaultValue={v.grade || ""} required><option value="" disabled>{t("Chọn lớp")}</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select>
              </Field>
            </div>
            <Field><FieldLabel htmlFor="v-code">{t("Mã học sinh hoặc số báo danh trên học bạ")}</FieldLabel><Input id="v-code" name="student_code" required minLength={4} maxLength={40} defaultValue={v.student_code} /></Field>
            <div className="verify-files">
              {v.files.map((f) => (
                <span key={f.id} className="proof-thumb">
                  {f.mime.startsWith("image") ? <img src={`/api/verification-files/${f.id}`} alt={t("Học bạ đã tải lên")} /> : <FileText aria-hidden="true" />}
                  <button type="button" aria-label={t("Xóa tệp")} onClick={async () => { await api(`/account/verification/files/${f.id}`, "DELETE"); result.reload(); }}><Trash2 /></button>
                </span>
              ))}
              {v.files.length < 3 && (
                <label className="proof-drop">
                  <Upload aria-hidden="true" />
                  <span>{t("Ảnh hoặc PDF học bạ, bảng điểm")}</span>
                  <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} />
                </label>
              )}
            </div>
          </FieldGroup>
          {error && <ErrorState error={error} />}
          <div className="actions dialog-actions"><Submit busy={busy} disabled={!v.files.length}>{t(v.status === "pending" ? "Cập nhật & gửi lại" : "Gửi xác minh")}</Submit></div>
        </form>
      )}
    </section>
  );
}

// Shown where a student would send an offer before being verified.
export function VerifyFirst() {
  const { t } = useI18n();
  return (
    <div className="verify-first" role="status">
      <BadgeCheck aria-hidden="true" />
      <span>{t("Xác minh tài khoản học sinh để gửi đề nghị.")}</span>
      <Button asChild size="sm" variant="outline"><Link to="/settings#verify">{t("Xác minh ngay")}</Link></Button>
    </div>
  );
}

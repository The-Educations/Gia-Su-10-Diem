import { useState } from "react";
import { CircleAlert, CircleCheck, Star, Video, X } from "lucide-react";
import { toast } from "sonner";
import { api, useApp } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { celebrate } from "@/lib/celebrate";
import type { ClassSession } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel } from "./ui/field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
export const dayOf = (iso: string, lang = "vi") => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit" });
export const endOf = (s: ClassSession) => Date.parse(s.starts_at) + s.minutes * 60000;

const OUTCOME: Record<string, string> = {
  confirmed: "Đã xác nhận",
  charged: "Hủy sát giờ, vẫn tính phí",
  refunded: "Đã hủy, hoàn tiền",
  disputed: "Đang xử lý báo cáo",
};

// How each student's part of a lesson is described when several are listed together (OUTCOME has no "pending").
export const LESSON_STATUS: Record<string, string> = { ...OUTCOME, pending: "Chờ xác nhận" };

// Everything a person can do with one lesson, shown where the lesson is shown.
export function SessionActions({ s, onChanged, compact = false }: { s: ClassSession; onChanged: () => void; compact?: boolean }) {
  const { user } = useApp(),
    { t } = useI18n(),
    [busy, setBusy] = useState(""),
    [reporting, setReporting] = useState(false),
    [reason, setReason] = useState("");
  const tutor = user?.id === s.tutor_id, now = Date.now(), ended = endOf(s) <= now, started = Date.parse(s.starts_at) <= now;
  const mineConfirmed = tutor ? s.tutor_confirmed_at : s.student_confirmed_at;
  async function call(key: string, path: string, method = "POST", body?: unknown, target?: HTMLElement) {
    setBusy(key);
    try {
      const r = await api<{ outcome?: string; late?: boolean }>(path, method, body);
      if (key === "confirm") { celebrate(target); toast.success(t("Đã xác nhận buổi học")); }
      if (key === "cancel") toast.success(t(r.outcome === "charged" ? "Đã hủy. Hủy sát giờ nên buổi này vẫn tính phí." : "Đã hủy buổi học, tiền buổi này sẽ được hoàn."));
      if (key === "dispute") toast.success(t("Đã gửi báo cáo cho quản trị viên"));
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
      setReporting(false);
    }
  }
  if (s.status === "cancelled" || (s.outcome && s.outcome !== "pending"))
    return (
      <div className="session-actions">
        <span className="session-outcome" data-outcome={s.outcome || "cancelled"}>{t(OUTCOME[s.outcome || ""] || "Đã hủy")}</span>
        {!tutor && ended && s.outcome === "confirmed" && <Stars s={s} onChanged={onChanged} />}
      </div>
    );
  return (
    <div className="session-actions" data-compact={compact || undefined}>
      {!started && s.meeting_url && s.mode === "online" && (
        <Button asChild size="sm" variant="outline"><a href={s.meeting_url} target="_blank" rel="noopener noreferrer"><Video data-icon="inline-start" />{t("Vào phòng học")}</a></Button>
      )}
      {ended && !mineConfirmed && (
        <Button size="sm" disabled={!!busy} onClick={(e) => call("confirm", `/sessions/${s.id}/confirm`, "POST", undefined, e.currentTarget)}>
          <CircleCheck data-icon="inline-start" />{t("Đã học xong")}
        </Button>
      )}
      {ended && mineConfirmed && <span className="session-outcome" data-outcome="waiting">{t("Chờ bên kia xác nhận")}</span>}
      {ended && !tutor && <Stars s={s} onChanged={onChanged} />}
      {ended && !reporting && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setReporting(true)}><CircleAlert data-icon="inline-start" />{t("Báo vấn đề")}</Button>}
      {!started && (
        <Button size="sm" variant="ghost" className="danger-text" disabled={!!busy} onClick={() => { if (confirm(t("Hủy buổi học này?"))) call("cancel", `/sessions/${s.id}/cancel`); }}>
          <X data-icon="inline-start" />{t("Hủy buổi")}
        </Button>
      )}
      {reporting && (
        <div className="session-report">
          <Textarea aria-label={t("Mô tả vấn đề")} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Ví dụ: gia sư không vào lớp, buổi học kết thúc sớm…")} />
          <div className="actions">
            <Button size="sm" variant="destructive" disabled={reason.trim().length < 5 || !!busy} onClick={() => call("dispute", `/sessions/${s.id}/dispute`, "POST", { reason })}>{t("Gửi báo cáo")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>{t("Hủy")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const QUESTIONS = [
  ["on_time", "Gia sư đúng giờ"],
  ["clear", "Giảng dễ hiểu"],
  ["homework", "Có bài tập / tài liệu"],
] as const;

// A short private survey after a lesson: stars, three quick questions and a note.
function Stars({ s, onChanged }: { s: ClassSession; onChanged: () => void }) {
  const { t } = useI18n(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const saved = (() => { try { return JSON.parse(s.survey || "{}") as Record<string, boolean>; } catch { return {}; } })();
  const [rating, setRating] = useState(s.rating || 0), [answers, setAnswers] = useState<Record<string, boolean>>(saved), [comment, setComment] = useState(s.comment || "");
  async function save() {
    setBusy(true);
    try { await api(`/sessions/${s.id}/rating`, "PUT", { rating, answers, comment }); toast.success(t("Cảm ơn bạn đã chấm buổi học")); setOpen(false); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Button size="sm" variant={s.rating ? "ghost" : "outline"} onClick={() => setOpen(true)}>
        <Star data-icon="inline-start" className={s.rating ? "star-filled" : undefined} />{s.rating ? t("Bạn chấm {n}★", { n: s.rating }) : t("Chấm buổi học")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="survey-dialog">
          <DialogHeader>
            <DialogTitle>{t("Buổi học thế nào?")}</DialogTitle>
            <DialogDescription>{t("Chỉ bạn và quản trị viên thấy. Khi gói học kết thúc, số sao trung bình mới được công khai.")}</DialogDescription>
          </DialogHeader>
          <div className="star-row survey-stars" role="radiogroup" aria-label={t("Chấm buổi học (riêng tư)")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={t("{n} sao", { n })} data-on={rating >= n || undefined} onClick={() => setRating(n)}><Star aria-hidden="true" /></button>
            ))}
          </div>
          <ul className="survey-questions">
            {QUESTIONS.map(([key, label]) => (
              <li key={key}>
                <span>{t(label)}</span>
                <span className="survey-answer" role="group" aria-label={t(label)}>
                  {[true, false].map((v) => (
                    <button type="button" key={String(v)} className="chip" aria-pressed={answers[key] === v} data-checked={answers[key] === v || undefined}
                      onClick={() => setAnswers((a) => ({ ...a, [key]: v }))}>{t(v ? "Có" : "Chưa")}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <Field><FieldLabel htmlFor={`survey-${s.id}`}>{t("Góp ý thêm (không bắt buộc)")}</FieldLabel><Textarea id={`survey-${s.id}`} rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("Điều bạn thích hoặc muốn gia sư thay đổi…")} /></Field>
          <div className="actions dialog-actions">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("Để sau")}</Button>
            <Button disabled={busy || !rating} onClick={save}>{t("Gửi đánh giá")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

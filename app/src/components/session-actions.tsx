import { useState } from "react";
import { CircleAlert, CircleCheck, Star, Video, X } from "lucide-react";
import { toast } from "sonner";
import { api, useApp } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { celebrate } from "@/lib/celebrate";
import type { ClassSession } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
export const dayOf = (iso: string, lang = "vi") => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit" });
export const endOf = (s: ClassSession) => Date.parse(s.starts_at) + s.minutes * 60000;

const OUTCOME: Record<string, string> = {
  confirmed: "Đã xác nhận",
  charged: "Hủy sát giờ, vẫn tính phí",
  refunded: "Đã hủy, hoàn tiền",
  disputed: "Đang xử lý báo cáo",
};

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

function Stars({ s, onChanged }: { s: ClassSession; onChanged: () => void }) {
  const { t } = useI18n(), [hover, setHover] = useState(0);
  return (
    <div className="star-row" role="group" aria-label={t("Chấm buổi học (riêng tư)")} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} aria-label={t("{n} sao", { n })} aria-pressed={s.rating === n} data-on={(hover || s.rating || 0) >= n || undefined}
          onMouseEnter={() => setHover(n)}
          onClick={async () => { try { await api(`/sessions/${s.id}/rating`, "PUT", { rating: n }); onChanged(); } catch (e) { toast.error((e as Error).message); } }}>
          <Star aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

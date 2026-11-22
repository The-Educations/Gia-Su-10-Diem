import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { CalendarEvent } from "@/lib/types";
import { ErrorState, Submit } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export const EVENT_COLORS = ["rose", "sky", "sage", "butter", "lilac", "peach", "mint", "sand"];
const COLOR_NAMES: Record<string, string> = { rose: "Hồng", sky: "Xanh trời", sage: "Xanh lá", butter: "Vàng", lilac: "Tím", peach: "Cam đào", mint: "Bạc hà", sand: "Cát" };
const VN = 7 * 3600000;
const localDate = (iso: string) => new Date(Date.parse(iso) + VN).toISOString().slice(0, 10);
const localTime = (iso: string) => new Date(Date.parse(iso) + VN).toISOString().slice(11, 16);
const toIso = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString();

export type EventDraft = Partial<CalendarEvent> & { starts_at: string; ends_at: string };

// Create or edit a personal event. Times are Vietnam time, like lessons.
export function EventDialog({ draft, onClose, onSaved }: { draft: EventDraft | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n(), [busy, setBusy] = useState(false), [error, setError] = useState(""),
    [color, setColor] = useState("sky");
  useEffect(() => { setError(""); setColor(draft?.color || "sky"); }, [draft]);
  if (!draft) return null;
  const editing = !!draft.id;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), date = String(f.get("date"));
    setBusy(true);
    setError("");
    try {
      const body = { title: f.get("title"), note: f.get("note"), color, starts_at: toIso(date, String(f.get("start"))), ends_at: toIso(date, String(f.get("end"))) };
      await api(editing ? `/calendar-events/${draft!.id}` : "/calendar-events", editing ? "PUT" : "POST", body);
      toast.success(t(editing ? "Đã lưu sự kiện" : "Đã thêm sự kiện"));
      onSaved();
      onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(t("Xóa sự kiện này?"))) return;
    await api(`/calendar-events/${draft!.id}`, "DELETE");
    toast.success(t("Đã xóa sự kiện"));
    onSaved();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="event-dialog">
        <DialogHeader><DialogTitle>{t(editing ? "Sửa sự kiện" : "Sự kiện mới")}</DialogTitle></DialogHeader>
        <form onSubmit={save}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="ev-title">{t("Tên sự kiện")}</FieldLabel><Input id="ev-title" name="title" required maxLength={120} defaultValue={draft.title || ""} autoFocus placeholder={t("Ví dụ: Ôn thi Toán, họp nhóm…")} /></Field>
            <div className="event-time">
              <Field><FieldLabel htmlFor="ev-date">{t("Ngày")}</FieldLabel><Input id="ev-date" name="date" type="date" required defaultValue={localDate(draft.starts_at)} /></Field>
              <Field><FieldLabel htmlFor="ev-start">{t("Bắt đầu")}</FieldLabel><Input id="ev-start" name="start" type="time" step={900} required defaultValue={localTime(draft.starts_at)} /></Field>
              <Field><FieldLabel htmlFor="ev-end">{t("Kết thúc")}</FieldLabel><Input id="ev-end" name="end" type="time" step={900} required defaultValue={localTime(draft.ends_at)} /></Field>
            </div>
            <fieldset className="event-colors">
              <legend>{t("Màu")}</legend>
              {EVENT_COLORS.map((c) => (
                <button type="button" key={c} data-color={c} aria-pressed={color === c} aria-label={t(COLOR_NAMES[c])} onClick={() => setColor(c)} />
              ))}
            </fieldset>
            <Field><FieldLabel htmlFor="ev-note">{t("Ghi chú")}</FieldLabel><Textarea id="ev-note" name="note" rows={2} maxLength={1000} defaultValue={draft.note || ""} /></Field>
          </FieldGroup>
          {error && <ErrorState error={error} />}
          <div className="actions dialog-actions">
            {editing && <Button type="button" variant="ghost" className="danger-text event-delete" onClick={remove}><Trash2 data-icon="inline-start" />{t("Xóa")}</Button>}
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("Hủy")}</Button>
            <Submit busy={busy}>{t(editing ? "Lưu" : "Thêm sự kiện")}</Submit>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

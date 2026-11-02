import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, dateTime, useApp } from "@/lib/api";
import type { Tutor, WeeklySchedule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ErrorState, Section } from "@/components/common";
import { AvailabilityGrid, scheduleKeys, scheduleBlocks } from "./availability-grid";

export function ScheduleEditor({ initial, endpoint, tutor = false }: { initial: WeeklySchedule; endpoint: string; tutor?: boolean }) {
  const { refresh } = useApp();
  const [saved, setSaved] = useState(initial);
  const [selected, setSelected] = useState(() => scheduleKeys(initial));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dirty = [...scheduleKeys(saved)].sort().join() !== [...selected].sort().join();
  async function save() {
    setBusy(true); setError("");
    try {
      const result = await api<WeeklySchedule>(endpoint, "PUT", { revision: saved.revision, blocks: scheduleBlocks(selected) });
      setSaved(result); refresh(); toast.success("Đã lưu lịch hằng tuần");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Section title="Lịch lặp hằng tuần">
    <div className="availability-toolbar"><span>Giờ Việt Nam · 1 giờ / ô</span><span aria-live="polite">{selected.size} giờ / tuần{dirty ? " · Chưa lưu" : ""}</span></div>
    <p className="availability-help"><span className="schedule-help-mouse">Nhấp để chọn từng ô hoặc kéo chuột để chọn nhiều giờ. Chọn lại để bỏ chọn.</span><span className="schedule-help-touch">Chạm vào ô để chọn giờ rảnh. Chạm lại để bỏ chọn.</span></p>
    <AvailabilityGrid selected={selected} setSelected={setSelected} busy={busy} />
    {tutor && <p className="availability-note">Mỗi ô mở một buổi học 1 giờ trong 8 tuần tới. Buổi đã đặt được giữ nguyên.</p>}
    {error && <ErrorState error={error} />}
    <div className="actions availability-actions">
      <Button onClick={save} disabled={busy || !dirty}>{busy ? "Đang lưu…" : "Lưu lịch hằng tuần"}</Button>
      <Button variant="outline" disabled={busy || !dirty} onClick={() => setSelected(scheduleKeys(saved))}>Hoàn tác</Button>
      <Button variant="ghost" disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>Bỏ chọn tất cả</Button>
    </div>
  </Section>;
}
export function WeeklyAvailability({ tutor }: { tutor: Tutor }) {
  const { refresh } = useApp();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function remove(id: number) {
    setBusy(true); setError("");
    try { await api(`/tutor/slots/${id}`, "DELETE"); refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const retained = tutor.slots.filter(s => s.source === "manual" || s.reserved);
  return <>
    <ScheduleEditor initial={tutor.weekly_schedule} endpoint="/tutor/availability" tutor />
    {error && <ErrorState error={error} />}
    {!!retained.length && <details className="availability-existing"><summary>Buổi đã đặt & giờ riêng lẻ ({retained.length})</summary>
      <div className="slot-list">{retained.map(s => <div key={s.id}><span>{dateTime(s.starts_at)} · {s.duration_minutes} phút</span>
        {s.reserved ? <span className="state">Đã được đặt</span> : <Button variant="ghost" size="icon" disabled={busy} aria-label={`Xóa giờ ${dateTime(s.starts_at)}`} onClick={() => remove(s.id)}><Trash2 /></Button>}
      </div>)}</div>
    </details>}
  </>;
}

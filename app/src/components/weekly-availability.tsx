import { useEffect, useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, dateTime, useApp } from "@/lib/api";
import type { Tutor, WeeklySchedule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ErrorState, Section } from "@/components/common";

const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const hours = Array.from({ length: 12 }, (_, i) => i * 2);
const time = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const keys = (schedule: WeeklySchedule) => new Set(schedule.blocks.map(b => b.hour / 2 * 7 + b.weekday));

export function WeeklyAvailability({ tutor }: { tutor: Tutor }) {
  const { refresh } = useApp();
  const [saved, setSaved] = useState(tutor.weekly_schedule);
  const [selected, setSelected] = useState(() => keys(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drag = useRef<{ start: number; add: boolean; original: Set<number> } | null>(null);
  const pointerType = useRef("");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const dirty = [...keys(saved)].sort().join() !== [...selected].sort().join();
  useEffect(() => {
    const stop = () => { drag.current = null; };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);
  function toggle(key: number) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function paint(end: number) {
    const stroke = drag.current;
    if (!stroke) return;
    const next = new Set(stroke.original);
    for (let row = Math.min(Math.floor(stroke.start / 7), Math.floor(end / 7)); row <= Math.max(Math.floor(stroke.start / 7), Math.floor(end / 7)); row++) {
      for (let day = Math.min(stroke.start % 7, end % 7); day <= Math.max(stroke.start % 7, end % 7); day++) {
        if (stroke.add) next.add(row * 7 + day); else next.delete(row * 7 + day);
      }
    }
    setSelected(next);
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const result = await api<WeeklySchedule>("/tutor/availability", "PUT", {
        revision: saved.revision,
        blocks: [...selected].sort((a, b) => a - b).map(key => ({ weekday: key % 7, hour: Math.floor(key / 7) * 2 })),
      });
      setSaved(result); refresh(); toast.success("Đã lưu lịch hằng tuần");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(id: number) {
    setBusy(true); setError("");
    try { await api(`/tutor/slots/${id}`, "DELETE"); refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const retained = tutor.slots.filter(s => s.source === "manual" || s.reserved);
  return (
    <Section title="Lịch lặp hằng tuần">
      <div className="availability-toolbar">
        <span>Giờ Việt Nam · 2 giờ / buổi</span>
        <span aria-live="polite">{selected.size} buổi / tuần{dirty ? " · Chưa lưu" : ""}</span>
      </div>
      <div className="availability-scroll" role="region" aria-label="Lịch trống từ thứ 2 đến chủ nhật" tabIndex={0}>
        <table className="availability-grid">
          <thead><tr><th scope="col">Giờ</th>{days.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
          <tbody>{hours.map((hour, row) => <tr key={hour}>
            <th scope="row">{time(hour)}<span>{time(hour + 2)}</span></th>
            {days.map((day, weekday) => {
              const key = row * 7 + weekday;
              return <td key={day}><button
                ref={element => { buttons.current[key] = element; }}
                type="button" disabled={busy}
                aria-label={`${day}, ${time(hour)}–${time(hour + 2)}`}
                aria-pressed={selected.has(key)}
                onPointerDown={e => {
                  pointerType.current = e.pointerType;
                  if (e.pointerType !== "mouse" || e.button !== 0) return;
                  e.preventDefault(); e.currentTarget.focus();
                  drag.current = { start: key, add: !selected.has(key), original: new Set(selected) };
                  paint(key);
                }}
                onPointerEnter={e => { if (e.buttons === 1 && e.pointerType === "mouse") paint(key); }}
                onClick={e => { if (e.detail === 0 || pointerType.current !== "mouse") toggle(key); }}
                onKeyDown={e => {
                  const target = { ArrowLeft: weekday > 0 ? key - 1 : key, ArrowRight: weekday < 6 ? key + 1 : key, ArrowUp: key - 7, ArrowDown: key + 7 }[e.key];
                  if (target !== undefined) { e.preventDefault(); buttons.current[target]?.focus(); }
                }}
              >{selected.has(key) && <Check size={16} aria-hidden="true" />}</button></td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="availability-note">Chọn hoặc kéo qua các ô. Lịch mở trong 8 tuần tới; buổi đã đặt được giữ nguyên.</p>
      {error && <ErrorState error={error} />}
      <div className="actions availability-actions">
        <Button onClick={save} disabled={busy || !dirty}>{busy ? "Đang lưu…" : "Lưu lịch hằng tuần"}</Button>
        <Button variant="outline" disabled={busy || !dirty} onClick={() => setSelected(keys(saved))}>Hoàn tác</Button>
        <Button variant="ghost" disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>Bỏ chọn tất cả</Button>
      </div>
      {!!retained.length && <details className="availability-existing"><summary>Buổi đã đặt & giờ riêng lẻ ({retained.length})</summary>
        <div className="slot-list">{retained.map(s => <div key={s.id}>
          <span>{dateTime(s.starts_at)} · {s.duration_minutes} phút</span>
          {s.reserved ? <span className="state">Đã được đặt</span> : <Button variant="ghost" size="icon" disabled={busy} aria-label={`Xóa giờ ${dateTime(s.starts_at)}`} onClick={() => remove(s.id)}><Trash2 /></Button>}
        </div>)}</div></details>}
    </Section>
  );
}

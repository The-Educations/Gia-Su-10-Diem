import { useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Slot } from "@/lib/types";

const localDay = (date: string) => new Date(Date.parse(date) + 7 * 3600000).toISOString().slice(0, 10);
const dayMs = 86400000;
const midnight = (day: string) => Date.parse(`${day}T00:00:00Z`);
const monday = (day: string) => midnight(day) - ((new Date(midnight(day)).getUTCDay() + 6) % 7) * dayMs;
const clock = (stamp: number) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(stamp);
export function LessonTimePicker({ slots, value, onChange }: { slots: Slot[]; value: string; onChange: (value: string) => void }) {
  const first = localDay(slots[0].starts_at), last = localDay(slots.at(-1)!.starts_at);
  const [week, setWeek] = useState(() => monday(first));
  const [day, setDay] = useState(first);
  const dates = Array.from({ length: 7 }, (_, i) => new Date(week + i * dayMs).toISOString().slice(0, 10));
  const available = slots.filter(slot => localDay(slot.starts_at) === day);
  function move(direction: number) {
    const next = week + direction * 7 * dayMs;
    const nextSlot = slots.find(s => monday(localDay(s.starts_at)) === next);
    setWeek(next); setDay(nextSlot ? localDay(nextSlot.starts_at) : new Date(next).toISOString().slice(0, 10)); onChange("");
  }
  const dateLabel = (date: string) => new Date(midnight(date)).toLocaleDateString("vi-VN", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
  return <fieldset className="lesson-time-picker">
    <legend>Giờ học (Việt Nam)</legend>
    <div className="lesson-week-controls"><strong>{dateLabel(dates[0])} – {dateLabel(dates[6])}</strong>
      <div className="actions"><Button type="button" variant="ghost" size="icon" aria-label="Tuần trước" disabled={week <= monday(first)} onClick={() => move(-1)}><ChevronLeft /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Tuần sau" disabled={week >= monday(last)} onClick={() => move(1)}><ChevronRight /></Button></div>
    </div>
    <div className="lesson-date-grid" role="group" aria-label="Chọn ngày học">{dates.map((date, i) => <Button type="button" key={date} variant={date === day ? "default" : "outline"} aria-pressed={date === day} aria-label={`Ngày ${dateLabel(date)}`} disabled={!slots.some(s => localDay(s.starts_at) === date)} onClick={() => { setDay(date); onChange(""); }}>
      <span>{["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i]}</span><strong>{date.slice(8)}</strong>
    </Button>)}</div>
    <div className="lesson-time-grid" role="group" aria-label="Chọn giờ học">
      {available.map(slot => <Button type="button" key={slot.id} variant={value === String(slot.id) ? "default" : "outline"} aria-pressed={value === String(slot.id)} aria-label={`${clock(Date.parse(slot.starts_at))}–${clock(Date.parse(slot.starts_at) + slot.duration_minutes * 60000)}, ${slot.duration_minutes} phút`} onClick={() => onChange(String(slot.id))}>
        {value === String(slot.id) && <Check size={14} aria-hidden="true" />}{clock(Date.parse(slot.starts_at))}–{clock(Date.parse(slot.starts_at) + slot.duration_minutes * 60000)}
      </Button>)}
    </div>
    {!available.length && <p className="muted">Chưa có giờ trống trong ngày này.</p>}
  </fieldset>;
}

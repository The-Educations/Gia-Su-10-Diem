import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Booking, Slot } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import { State } from "./common";
import { calendarDate, todayVietnam } from "@/lib/offers";
const dayMs = 86400000;
const localDate = (time: string) => new Date(Date.parse(time) + 7 * 3600000).toISOString().slice(0, 10);
const timeLabel = (time: number) => new Date(time).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const monday = (date: string) => {
  const time = Date.parse(`${date}T00:00:00Z`);
  return time - ((new Date(time).getUTCDay() + 6) % 7) * dayMs;
};
export function LessonCalendar({ lessons, freeSlots, onOpen, personName }: { lessons: Booking[]; freeSlots?: Slot[]; onOpen: (lesson: Booking) => void; personName: (lesson: Booking) => string }) {
  const sorted = [...lessons].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const next = sorted.find(b => ["accepted", "pending"].includes(b.status) && Date.parse(b.starts_at) + b.duration_minutes * 60000 > Date.now());
  const initialLesson = next || sorted.at(-1);
  const [week, setWeek] = useState(() => monday(freeSlots ? todayVietnam() : initialLesson ? localDate(initialLesson.starts_at) : todayVietnam()));
  const days = Array.from({ length: 7 }, (_, i) => new Date(week + i * dayMs).toISOString().slice(0, 10));
  const weekLessons = sorted.filter(b => localDate(b.starts_at) >= days[0] && localDate(b.starts_at) <= days[6]);
  const weekFree = (freeSlots || []).filter(s => localDate(s.starts_at) >= days[0] && localDate(s.starts_at) <= days[6] && Date.parse(s.starts_at) > Date.now());
  return <section className="lesson-calendar" aria-label="Lịch học theo ngày">
    <div className="lesson-calendar-toolbar">
      <div className="calendar-week-navigation">
        <Button variant="outline" size="icon" aria-label="Tuần trước" onClick={() => setWeek(week - 7 * dayMs)}><ChevronLeft /></Button>
        <div aria-live="polite"><strong>{calendarDate(days[0])} – {calendarDate(days[6])}</strong><span>{weekLessons.length} buổi trong tuần</span></div>
        <Button variant="outline" size="icon" aria-label="Tuần sau" onClick={() => setWeek(week + 7 * dayMs)}><ChevronRight /></Button>
      </div>
      <div className="calendar-jump">
        <Field><FieldLabel htmlFor="schedule-date" className="sr-only">Đến ngày</FieldLabel><Input id="schedule-date" type="date" aria-label="Đến ngày" value={days[0]} onChange={e => { if (e.target.value && Number.isFinite(Date.parse(e.target.value))) setWeek(monday(e.target.value)); }} /></Field>
        <Button variant="ghost" onClick={() => setWeek(monday(todayVietnam()))}>Hôm nay</Button>
        {next && <Button variant="outline" onClick={() => setWeek(monday(localDate(next.starts_at)))}>Buổi tiếp theo</Button>}
      </div>
    </div>
    {freeSlots && <div className="calendar-legend"><span>Buổi học</span><span className="calendar-free-label">Giờ rảnh · {weekFree.length} khung giờ</span><Link to="/calendar">Chỉnh giờ rảnh</Link></div>}
    <div className="lesson-calendar-week">{days.map((day, i) => {
      const items = weekLessons.filter(b => localDate(b.starts_at) === day);
      const free = weekFree.filter(s => localDate(s.starts_at) === day);
      const entries = [...items.map(lesson => ({ starts_at: lesson.starts_at, lesson, slot: null })), ...free.map(slot => ({ starts_at: slot.starts_at, lesson: null, slot }))].sort((a,b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
      return <section key={day} className={day === todayVietnam() ? "is-today" : ""} data-empty={!entries.length}>
        <h3>{["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][i]}<time dateTime={day}>{new Date(`${day}T00:00:00Z`).getUTCDate()}</time></h3>
        <div className="calendar-day-lessons">{entries.map(({ lesson: b, slot }) => b ? <button key={b.id} className={`dated-lesson dated-lesson-${b.status}`} onClick={() => onOpen(b)}>
          <strong>{timeLabel(Date.parse(b.starts_at))}–{timeLabel(Date.parse(b.starts_at) + b.duration_minutes * 60000)}</strong>
          <span>{b.subject_name}</span><small>{personName(b)}</small><State value={b.status} />
        </button> : slot && <Link key={`free-${slot.id}`} to="/calendar" className="calendar-free-slot" aria-label={`Giờ rảnh ${calendarDate(day)} ${timeLabel(Date.parse(slot.starts_at))}`}>
          <strong>{timeLabel(Date.parse(slot.starts_at))}–{timeLabel(Date.parse(slot.starts_at) + slot.duration_minutes * 60000)}</strong><span>Giờ rảnh</span>
        </Link>)}</div>
      </section>;
    })}</div>
    {!weekLessons.length && !weekFree.length && <div className="calendar-empty" role="status">Không có buổi học trong tuần này.</div>}
  </section>;
}

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Booking } from "@/lib/types";
import { Button } from "./ui/button";
import { calendarDate, todayVietnam } from "@/lib/offers";
const dayMs = 86400000;
const localDate = (time: string) => new Date(Date.parse(time) + 7 * 3600000).toISOString().slice(0,10);
const monday = (date: string) => {
  const time = Date.parse(`${date}T00:00:00Z`);
  return time - ((new Date(time).getUTCDay() + 6) % 7) * dayMs;
};
export function LessonCalendar({ lessons, onOpen }: { lessons: Booking[]; onOpen: (lesson: Booking) => void }) {
  const [week, setWeek] = useState(()=>monday(todayVietnam()));
  const days = Array.from({length:7}, (_,i)=>new Date(week+i*dayMs).toISOString().slice(0,10));
  const next = [...lessons].filter(b=>b.status === "accepted" && Date.parse(b.starts_at)>Date.now()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))[0];
  return <section className="lesson-calendar" aria-label="Lịch học theo ngày">
    <div className="lesson-calendar-toolbar"><div className="actions"><Button variant="outline" size="icon" aria-label="Tuần trước" onClick={()=>setWeek(week-7*dayMs)}><ChevronLeft /></Button><strong>{calendarDate(days[0])} – {calendarDate(days[6])}</strong><Button variant="outline" size="icon" aria-label="Tuần sau" onClick={()=>setWeek(week+7*dayMs)}><ChevronRight /></Button></div><div className="actions"><Button variant="ghost" onClick={()=>setWeek(monday(todayVietnam()))}>Hôm nay</Button>{next && <Button variant="outline" onClick={()=>setWeek(monday(localDate(next.starts_at)))}>Buổi tiếp theo</Button>}</div></div>
    <div className="lesson-calendar-scroll" tabIndex={0} role="region" aria-label="Các buổi học trong tuần"><div className="lesson-calendar-week">{days.map((day,i)=><section key={day} className={day===todayVietnam()?"is-today":""}><h3>{["Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7","Chủ nhật"][i]}<span>{calendarDate(day)}</span></h3>{lessons.filter(b=>localDate(b.starts_at)===day).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).map(b=><button key={b.id} className={`dated-lesson dated-lesson-${b.status}`} onClick={()=>onOpen(b)}><strong>{new Date(b.starts_at).toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"})}</strong><span>{b.subject_name}</span><small>{b.duration_minutes} phút{b.status==="cancelled" ? " · Đã hủy" : b.status==="completed" ? " · Đã học" : ""}</small></button>)}</section>)}</div></div>
  </section>;
}

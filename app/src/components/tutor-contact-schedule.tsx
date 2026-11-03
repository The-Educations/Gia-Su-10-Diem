import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { api, useApp, useLoad, money } from "@/lib/api";
import type { Tutor, Subject, WeeklySchedule } from "@/lib/types";
import { AvailabilityGrid, scheduleKeys, scheduleBlocks } from "./availability-grid";
import { Choose, ErrorState, Submit } from "./common";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { todayVietnam, type OfferPreview } from "@/lib/offers";
import { Button } from "./ui/button";
import { dateTime } from "@/lib/api";
import { Field, FieldGroup, FieldLabel } from "./ui/field";

export function TutorContactSchedule({ tutor, subjects, preview = false }: { tutor: Tutor; subjects: Subject[]; preview?: boolean }) {
  const { user } = useApp(), navigate = useNavigate();
  const own = useLoad<WeeklySchedule>(user?.role === "student" && !preview ? "/account/availability" : null);
  const [selected, setSelected] = useState(new Set<number>());
  const [subject, setSubject] = useState(tutor.subjects[0] || "");
  const [mode, setMode] = useState(tutor.mode === "both" ? "online" : tutor.mode);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weeks, setWeeks] = useState("4");
  const [kind, setKind] = useState("course");
  const period = { start_date: startDate, kind, ...(kind === "course" ? { weeks: Number(weeks) } : {}) };
  const [forecast, setForecast] = useState<OfferPreview | null>(null);
  const available = scheduleKeys({ blocks: tutor.weekly_blocks || [], revision: 0 });
  const preferred = own.data ? scheduleKeys(own.data) : new Set<number>();
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preview) return;
    if (!user) { navigate(`/auth?next=/tutors/${tutor.user_id}`); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ id: number }>("/offers", "POST", { ...period, tutor_id: tutor.user_id, subject_id: subject, mode, blocks: scheduleBlocks(selected), note: new FormData(e.currentTarget).get("note") });
      navigate(`/offers?id=${result.id}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <aside className="booking-panel weekly-booking-panel" id="booking-panel">
    <div className="booking-price">{kind === "trial" ? "Miễn phí" : <>{money(tutor.rate)}<small> / buổi</small></>}</div>
    <h2><CalendarDays size={19} />Đề nghị học</h2>
    <form onSubmit={submit}><FieldGroup>
      <Choose label="Môn học" value={subject} onChange={setSubject} options={tutor.subjects.map(id => ({ value: id, label: subjects.find(s => s.id === id)?.name || id }))} />
      {!!tutor.accepts_trial && <Choose label="Loại đề nghị" value={kind} onChange={value => { setKind(value); setSelected(new Set()); setForecast(null); }} options={[{ value: "course", label: "Học theo khóa" }, { value: "trial", label: "Học thử miễn phí · 60 phút" }]} />}
      <div className="offer-date-fields">
        <Field><FieldLabel htmlFor="offer-start">Ngày bắt đầu</FieldLabel><Input id="offer-start" type="date" min={todayVietnam()} value={startDate} required onChange={e => { setStartDate(e.target.value); setForecast(null); }} /></Field>
        {kind === "course" && <Field><FieldLabel htmlFor="offer-weeks">Số tuần</FieldLabel><Input id="offer-weeks" type="number" min={1} max={52} step={1} value={weeks} required onChange={e => { setWeeks(e.target.value); setForecast(null); }} /></Field>}
      </div>
      {kind === "trial" && <p>Chọn một giờ. Buổi học thử diễn ra vào ngày phù hợp đầu tiên kể từ ngày bắt đầu.</p>}
      <div>
        <div className="availability-toolbar"><span>Giờ Việt Nam · 1 giờ / ô</span><span aria-live="polite">{selected.size} giờ đã chọn</span></div>
        <AvailabilityGrid selected={selected} setSelected={value => { setSelected(value); setForecast(null); }} single={kind === "trial"} available={available} preferred={preferred} busy={busy} />
        <div className="schedule-legend"><span><i className="legend-free" />Gia sư rảnh</span>{preferred.size > 0 && <span><i className="legend-match" />Trùng lịch của bạn</span>}</div>
        {!available.size && <p role="status">Gia sư chưa mở lịch tuần.</p>}
        {!preview && user?.role === "student" && <Link className="text-link" to="/availability">Sửa lịch rảnh của tôi</Link>}
        {own.error && <ErrorState error={own.error} retry={own.reload} />}
      </div>
      {tutor.mode === "both" && <Choose label="Hình thức" value={mode} onChange={setMode} options={[{ value: "online", label: "Trực tuyến" }, { value: "offline", label: "Trực tiếp" }]} />}
      <Field><FieldLabel htmlFor="weekly-note">Mục tiêu học tập</FieldLabel><Textarea id="weekly-note" name="note" maxLength={2000} /></Field>
      <Button type="button" variant="outline" disabled={preview || busy || !user || !startDate || (kind === "course" && (!Number.isInteger(Number(weeks)) || Number(weeks) < 1 || Number(weeks) > 52)) || !selected.size} onClick={async()=>{
        setBusy(true);setError("");setForecast(null);
        try { setForecast(await api<OfferPreview>("/offers/preview","POST",{tutor_id:tutor.user_id,subject_id:subject,mode,...period,blocks:scheduleBlocks(selected)})); }
        catch(e){setError((e as Error).message);} finally{setBusy(false);}
      }}>Xem lịch dự kiến</Button>
      {forecast && <div className="offer-forecast" role="status"><strong>{forecast.sessions.length} buổi · {forecast.conflict_count ? `${forecast.conflict_count} buổi cần điều chỉnh` : "Không trùng lịch"}</strong><div className="offer-sessions">{forecast.sessions.map(s=><div key={s.starts_at} data-conflict={!!s.conflict}><span>{dateTime(s.starts_at)}</span>{s.conflict && <strong>{s.conflict}</strong>}</div>)}</div></div>}
      {error && <ErrorState error={error} />}
      <Submit busy={busy} disabled={preview || !selected.size || (!!user && user.role !== "student")}>Gửi đề nghị học</Submit>
    </FieldGroup></form>
    <p className="booking-policy">Chỉ xác nhận lịch học sau khi gia sư chấp nhận đề nghị.</p>
  </aside>;
}

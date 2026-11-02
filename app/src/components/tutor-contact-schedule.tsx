import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { api, useApp, useLoad, money } from "@/lib/api";
import type { Tutor, Subject, WeeklySchedule } from "@/lib/types";
import { AvailabilityGrid, scheduleKeys, scheduleBlocks } from "./availability-grid";
import { Choose, ErrorState, Submit } from "./common";
import { Textarea } from "./ui/textarea";
import { Field, FieldGroup, FieldLabel } from "./ui/field";

export function TutorContactSchedule({ tutor, subjects, preview = false }: { tutor: Tutor; subjects: Subject[]; preview?: boolean }) {
  const { user } = useApp(), navigate = useNavigate();
  const own = useLoad<WeeklySchedule>(user?.role === "student" && !preview ? "/account/availability" : null);
  const [selected, setSelected] = useState(new Set<number>());
  const [subject, setSubject] = useState(tutor.subjects[0] || "");
  const [mode, setMode] = useState(tutor.mode === "both" ? "online" : tutor.mode);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const available = scheduleKeys({ blocks: tutor.weekly_blocks || [], revision: 0 });
  const preferred = own.data ? scheduleKeys(own.data) : new Set<number>();
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preview) return;
    if (!user) { navigate(`/auth?next=/tutors/${tutor.user_id}`); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ id: number }>("/inquiries", "POST", { tutor_id: tutor.user_id, subject_id: subject, mode, blocks: scheduleBlocks(selected), body: new FormData(e.currentTarget).get("note") });
      navigate(`/messages?inquiry=${result.id}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <aside className="booking-panel weekly-booking-panel" id="booking-panel">
    <div className="booking-price">{money(tutor.rate)}<small> / giờ</small></div>
    <h2><CalendarDays size={19} />Liên hệ gia sư</h2>
    <form onSubmit={submit}><FieldGroup>
      <Choose label="Môn học" value={subject} onChange={setSubject} options={tutor.subjects.map(id => ({ value: id, label: subjects.find(s => s.id === id)?.name || id }))} />
      <div>
        <div className="availability-toolbar"><span>Giờ Việt Nam · 1 giờ / ô</span><span aria-live="polite">{selected.size} giờ đã chọn</span></div>
        <AvailabilityGrid selected={selected} setSelected={setSelected} available={available} preferred={preferred} busy={busy} />
        <div className="schedule-legend"><span><i className="legend-free" />Gia sư rảnh</span>{preferred.size > 0 && <span><i className="legend-match" />Trùng lịch của bạn</span>}</div>
        {!available.size && <p role="status">Gia sư chưa mở lịch tuần.</p>}
        {!preview && user?.role === "student" && <Link className="text-link" to="/availability">Sửa lịch rảnh của tôi</Link>}
        {own.error && <ErrorState error={own.error} retry={own.reload} />}
      </div>
      {tutor.mode === "both" && <Choose label="Hình thức" value={mode} onChange={setMode} options={[{ value: "online", label: "Trực tuyến" }, { value: "offline", label: "Trực tiếp" }]} />}
      <Field><FieldLabel htmlFor="weekly-note">Lời nhắn của bạn</FieldLabel><Textarea id="weekly-note" name="note" maxLength={2000} required /></Field>
      {error && <ErrorState error={error} />}
      <Submit busy={busy} disabled={preview || (!!user && user.role !== "student")}>Gửi lời nhắn</Submit>
    </FieldGroup></form>
    <p className="booking-policy">Trao đổi môn học và lịch phù hợp với gia sư qua tin nhắn.</p>
  </aside>;
}

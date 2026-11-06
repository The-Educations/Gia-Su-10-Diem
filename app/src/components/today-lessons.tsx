import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Video } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { lessonMessageHref } from "@/lib/message-context";
import type { Booking } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Person, State } from "@/components/common";

const START_OPENS_BEFORE = 15 * 60000;
const VN_OFFSET = 7 * 3600000;
const dayKey = (time: number) => new Date(time + VN_OFFSET).toISOString().slice(0, 10);
const clock = (time: number) =>
  new Date(time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const startOf = (b: Booking) => Date.parse(b.starts_at);
const endOf = (b: Booking) => startOf(b) + b.duration_minutes * 60000;

// Lessons to act on now: everything scheduled today, plus earlier lessons that
// are over but were never closed.
export function lessonsToHandle(lessons: Booking[], now = Date.now()) {
  return lessons
    .filter(b => ["accepted", "completed", "missed"].includes(b.status)
      && (dayKey(startOf(b)) === dayKey(now) || (b.status === "accepted" && endOf(b) <= now)))
    .sort((a, b) => startOf(a) - startOf(b) || a.id - b.id)
    .slice(0, 8);
}

export function TodayLessons({ lessons, role, onChanged }: {
  lessons: Booking[]; role: "tutor" | "student"; onChanged: () => void;
}) {
  const [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState<number | null>(null),
    [confirmAbsent, setConfirmAbsent] = useState<number | null>(null),
    [error, setError] = useState("");
  // Re-evaluate every 30 seconds so buttons unlock without a reload.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const rows = lessonsToHandle(lessons, now);
  if (!rows.length) return null;
  async function act(b: Booking, request: () => Promise<unknown>, message: string) {
    setBusy(b.id);
    setError("");
    try {
      await request();
      setConfirmAbsent(null);
      toast.success(message);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const complete = (b: Booking) =>
    act(b, () => api(`/bookings/${b.id}`, "PATCH", { status: "completed" }), "Đã ghi nhận buổi học hoàn thành");
  function tutorActions(b: Booking) {
    if (b.status !== "accepted") return null;
    const over = endOf(b) <= now, begun = startOf(b) <= now;
    if (b.started_at && !over)
      return <Button disabled={busy === b.id} onClick={() => complete(b)}>Kết thúc buổi</Button>;
    if (over)
      return <>
        <Button disabled={busy === b.id} onClick={() => complete(b)}>{b.started_at ? "Kết thúc buổi" : "Hoàn thành"}</Button>
        {!b.started_at && absent(b)}
      </>;
    if (startOf(b) - START_OPENS_BEFORE > now)
      return <Button disabled variant="outline">Mở lúc {clock(startOf(b) - START_OPENS_BEFORE)}</Button>;
    return <>
      <Button disabled={busy === b.id} onClick={() => act(b, () => api(`/bookings/${b.id}/start`, "POST"), "Đã bắt đầu buổi học")}>Bắt đầu buổi</Button>
      {begun && absent(b)}
    </>;
  }
  function absent(b: Booking) {
    return confirmAbsent === b.id
      ? <>
        <Button variant="destructive" disabled={busy === b.id} onClick={() => act(b, () => api(`/bookings/${b.id}`, "PATCH", { status: "missed" }), "Đã ghi nhận học sinh vắng")}>Xác nhận vắng</Button>
        <Button variant="ghost" onClick={() => setConfirmAbsent(null)}>Hủy</Button>
      </>
      : <Button variant="ghost" onClick={() => setConfirmAbsent(b.id)}>Học sinh vắng</Button>;
  }
  function studentActions(b: Booking) {
    if (b.status === "accepted" && endOf(b) <= now)
      return <Button disabled={busy === b.id} onClick={() => complete(b)}>Đã học xong</Button>;
    if (b.status === "completed" && !b.reviewed)
      return <Button asChild variant="outline"><Link to="/bookings?status=completed">Đánh giá gia sư</Link></Button>;
    return null;
  }
  return (
    <section className="today-lessons" aria-labelledby="today-lessons-title">
      <header>
        <h2 id="today-lessons-title">{role === "tutor" ? "Buổi dạy hôm nay" : "Buổi học hôm nay"}</h2>
        <span>Giờ Việt Nam · UTC+7</span>
      </header>
      {error && <p role="alert" className="today-error">{error}</p>}
      <ul>
        {rows.map(b => {
          const over = endOf(b) <= now, live = b.status === "accepted" && !!b.started_at && !over;
          const name = role === "tutor" ? b.student_name : b.tutor_name;
          return (
            <li key={b.id} data-status={b.status} data-live={live || undefined}>
              <div className="today-time">
                <strong>{clock(startOf(b))}</strong>
                <span>{clock(endOf(b))}</span>
              </div>
              <Person name={name} id={role === "tutor" ? b.student_id : b.tutor_id} />
              <div className="today-main">
                <strong>{name}</strong>
                <span>
                  {b.subject_name}
                  {startOf(b) < now - 6 * 3600000 && ` · ${new Date(startOf(b)).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}`}
                  {live && ` · Đang diễn ra${role === "student" ? ", gia sư đã bắt đầu" : ""}`}
                </span>
              </div>
              <State value={b.status} />
              <div className="today-actions">
                {b.meeting_url && ["accepted", "completed"].includes(b.status) && (
                  <Button asChild variant="outline"><a href={b.meeting_url} target="_blank" rel="noopener noreferrer"><Video data-icon="inline-start" />Vào phòng học</a></Button>
                )}
                <Button asChild variant="ghost"><Link to={lessonMessageHref(b)}><MessageCircle data-icon="inline-start" />Nhắn tin</Link></Button>
                {role === "tutor" ? tutorActions(b) : studentActions(b)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

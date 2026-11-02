import { LessonCalendar } from "@/components/lesson-calendar";
import { calendarDate, type StudyOffer } from "@/lib/offers";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessageCircle, ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, money, dateTime } from "@/lib/api";
import type { Booking } from "@/lib/types";
import {
  Page,
  Heading,
  Choose,
  State,
  Blank,
  Loading,
  ErrorState,
  Submit,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function downloadCalendar(b: Booking) {
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GiaSu10Diem//Lessons//VI",
    "BEGIN:VEVENT",
    `UID:lesson-${b.id}@giasu10diem.local`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(new Date(b.starts_at))}`,
    `DTEND:${stamp(new Date(new Date(b.starts_at).getTime() + b.duration_minutes * 60000))}`,
    `SUMMARY:${escape(`${b.subject_name} · ${b.tutor_name}`)}`,
    `DESCRIPTION:${escape(b.note)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `buoi-hoc-${b.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Bookings() {
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") || "",
    setFilter = (v: string) => setParams(previous => { const next = new URLSearchParams(previous); if(v) next.set("status",v); else next.delete("status"); return next; });
  const offerId = params.get("offer");
  const { user, refresh } = useApp(),
    result = useLoad<Booking[]>("/bookings"),
    offers = useLoad<StudyOffer[]>(user?.role === "admin" ? null : "/offers"),
    [view, setView] = useState<Booking | null>(null),
    [edit, setEdit] = useState<Booking | null>(null),
    [review, setReview] = useState<Booking | null>(null),
    [rating, setRating] = useState("5"),
    [action, setAction] = useState<{ booking: Booking; status: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rows = (result.data || []).filter(
    (b) => (!filter || b.status === filter) && (offerId ? String(b.offer_id) === offerId : user?.role === "admin" || !b.offer_id),
  );
  const activeOffer = offers.data?.find(o=>String(o.id)===offerId);
  const courses = (offers.data || []).filter(o=>(result.data || []).some(b=>b.offer_id===o.id && (!filter || b.status===filter)));
  async function mutate(path: string, method: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, method, data);
      setAction(null);
      setEdit(null);
      setView(null);
      setReview(null);
      refresh();
      toast.success("Đã cập nhật buổi học");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <Heading
        title={
          user?.role === "admin"
            ? "Quản lý buổi học"
            : user?.role === "tutor"
              ? "Lịch dạy của tôi"
              : "Lịch học của tôi"
        }
        action={
          <Button asChild variant="outline">
            <Link to={user?.role === "tutor" ? "/studio" : "/tutors"}>
              {user?.role === "tutor" ? "Mở giờ trống" : "Tìm gia sư"}
            </Link>
          </Button>
        }
      />
      {!offerId && offers.loading && <Loading />}
      {offers.error && <ErrorState error={offers.error} retry={offers.reload} />}
      {!offerId && !!courses.length && <div className="offer-list course-list">{courses.map(o=><article className="offer-card" key={o.id}><div><h2>{o.subject_name} · {user?.role === "tutor" ? o.student_name : o.tutor_name}</h2><p>{calendarDate(o.start_date)} – {calendarDate(o.end_date)} · {(result.data || []).filter(b=>b.offer_id===o.id && b.status!=="cancelled").length} buổi</p></div><div className="actions"><Button asChild><Link to={`/bookings?offer=${o.id}`}>Xem lịch học</Link></Button><Button asChild variant="outline"><Link to={`/messages?inquiry=${o.inquiry_id}`}>Nhắn tin</Link></Button></div></article>)}</div>}
      {offerId && <><div className="list-toolbar"><Button asChild variant="outline"><Link to="/bookings">Tất cả lịch học</Link></Button>{activeOffer && <h2>{activeOffer.subject_name} · {user?.role === "tutor" ? activeOffer.student_name : activeOffer.tutor_name}</h2>}</div><LessonCalendar lessons={rows} onOpen={setView} /></>}

      <div className="list-toolbar">
        <span>{rows.length} buổi học</span>
        <Choose
          label="Trạng thái"
          value={filter}
          onChange={setFilter}
          allLabel="Tất cả"
          options={[
            ["pending", "Chờ xác nhận"],
            ["accepted", "Đã xác nhận"],
            ["completed", "Đã hoàn thành"],
            ["cancelled", "Đã hủy"],
            ["declined", "Đã từ chối"],
          ].map(([value, label]) => ({ value, label }))}
        />
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : !rows.length && (offerId || !courses.length) ? (
        <Blank
          title="Chưa có buổi học trong mục này"
          description="Các yêu cầu và buổi học đã xác nhận sẽ xuất hiện ở đây."
        />
      ) : (
        <div className="booking-list">
          {rows.map((b) => (
            <article key={b.id} className="lesson-card">
              <div className="lesson-date">
                <strong>
                  {new Date(b.starts_at).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </strong>
                <span>
                  Tháng{" "}
                  {new Date(b.starts_at).toLocaleDateString("vi-VN", {
                    month: "2-digit",
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </span>
                <small>
                  {new Date(b.starts_at).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </small>
              </div>
              <div className="lesson-main">
                <div className="lesson-title">
                  <h2>{b.subject_name}</h2>
                  <State value={b.status} />
                </div>
                <p>
                  {user?.role === "tutor" ? b.student_name : b.tutor_name} ·{" "}
                  {b.mode === "online" ? "Trực tuyến" : "Trực tiếp"} ·{" "}
                  {money(b.rate * b.duration_minutes / 60)}
                </p>
                <p className="muted">{dateTime(b.starts_at)} · {b.duration_minutes} phút</p>
                {!b.offer_id && b.note && <p className="lesson-note">{b.note}</p>}
                {!b.offer_id && b.lesson_note && (
                  <div className="lesson-notes">
                    <strong>Nội dung & bài tập</strong>
                    <p>{b.lesson_note}</p>
                  </div>
                )}
                {!b.offer_id && b.meeting_url && (
                  <a
                    className="text-link"
                    href={b.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Vào phòng học
                    <ExternalLink size={15} />
                  </a>
                )}
                <div className="actions">
                  <Button variant="outline" onClick={()=>setView(b)}>Xem buổi học</Button>
                  <Button asChild variant="outline">
                    <Link to={b.inquiry_id ? `/messages?inquiry=${b.inquiry_id}` : `/messages?lesson=${b.id}`}>
                      <MessageCircle data-icon="inline-start" />
                      Trao đổi
                    </Link>
                  </Button>
                  {b.status === "accepted" && (
                    <Button variant="ghost" onClick={() => downloadCalendar(b)}>
                      <Download data-icon="inline-start" />
                      Lưu lịch
                    </Button>
                  )}
                  {user?.role === "tutor" &&
                    b.status === "pending" &&
                    new Date(b.starts_at) > new Date() && (
                      <>
                        <Button
                          onClick={() => {
                            setError("");
                            setAction({ booking: b, status: "accepted" });
                          }}
                        >
                          Nhận buổi học
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setError("");
                            setAction({ booking: b, status: "declined" });
                          }}
                        >
                          Từ chối
                        </Button>
                      </>
                    )}
                  {["pending", "accepted"].includes(b.status) &&
                    new Date(b.starts_at) > new Date() && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setError("");
                          setAction({ booking: b, status: "cancelled" });
                        }}
                      >
                        Hủy buổi
                      </Button>
                    )}
                  {user?.role === "tutor" &&
                    ["accepted", "completed"].includes(b.status) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setError("");
                          setEdit(b);
                        }}
                      >
                        Nội dung buổi học
                      </Button>
                    )}
                  {user?.role === "tutor" &&
                    b.status === "accepted" &&
                    new Date(b.starts_at).getTime() + b.duration_minutes * 60000 <= Date.now() && (
                      <Button
                        onClick={() => {
                          setError("");
                          setAction({ booking: b, status: "completed" });
                        }}
                      >
                        Hoàn thành
                      </Button>
                    )}
                  {user?.role === "student" &&
                    b.status === "completed" &&
                    !b.reviewed && (
                      <Button
                        onClick={() => {
                          setError("");
                          setReview(b);
                        }}
                      >
                        Đánh giá
                      </Button>
                    )}
                  {!!b.reviewed && (
                    <span className="muted">Đã đánh giá {b.reviewed}/5</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog open={!!view} onOpenChange={open=>{if(!open)setView(null);}}><DialogContent><DialogHeader><DialogTitle>{view?.subject_name} · {view && dateTime(view.starts_at)}</DialogTitle><DialogDescription>{view && `${user?.role === "tutor" ? view.student_name : view.tutor_name} · ${view.duration_minutes} phút · Giờ Việt Nam`}</DialogDescription></DialogHeader>{view && <><State value={view.status} /><div className="lesson-notes"><h3>Ghi chú & bài tập</h3><p>{view.lesson_note || "Chưa có ghi chú cho buổi học này."}</p></div>{view.meeting_url && <a className="text-link" href={view.meeting_url} target="_blank" rel="noreferrer">Vào phòng học <ExternalLink size={15} /></a>}<div className="actions">{user?.role === "tutor" && ["accepted","completed"].includes(view.status) && <Button onClick={()=>{setEdit(view);setView(null);setError("");}}>Viết ghi chú</Button>}<Button asChild variant="outline"><Link to={view.inquiry_id ? `/messages?inquiry=${view.inquiry_id}` : `/messages?lesson=${view.id}`}>Nhắn tin</Link></Button></div></>}</DialogContent></Dialog>
      <Dialog
        open={!!action}
        onOpenChange={(o) => {
          if (!o) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận thay đổi buổi học</DialogTitle>
            <DialogDescription>
              {action?.status === "accepted"
                ? "Bạn đồng ý dạy buổi học này."
                : action?.status === "completed"
                  ? "Xác nhận buổi học đã diễn ra và hoàn thành."
                  : "Buổi học sẽ bị hủy hoặc từ chối. Khung giờ sẽ được mở lại."}
            </DialogDescription>
          </DialogHeader>
          {error && <ErrorState error={error} />}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (action)
                mutate(`/bookings/${action.booking.id}`, "PATCH", {
                  status: action.status,
                });
            }}
          >
            <Submit busy={busy}>Xác nhận</Submit>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={(o) => {
          if (!o) setEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nội dung buổi học</DialogTitle>
            <DialogDescription>
              Học sinh sẽ thấy ghi chú và liên kết này trong lịch học.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (edit)
                mutate(
                  `/bookings/${edit.id}/lesson`,
                  "PATCH",
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="meeting_url">
                  Liên kết phòng học (HTTPS)
                </FieldLabel>
                <Input
                  id="meeting_url"
                  name="meeting_url"
                  type="url"
                  defaultValue={edit?.meeting_url}
                  placeholder="https://meet.google.com/…"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lesson_note">Ghi chú & bài tập</FieldLabel>
                <Textarea
                  id="lesson_note"
                  name="lesson_note"
                  maxLength={4000}
                  defaultValue={edit?.lesson_note}
                />
              </Field>
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>Lưu nội dung</Submit>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!review}
        onOpenChange={(o) => {
          if (!o) setReview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đánh giá buổi học</DialogTitle>
            <DialogDescription>
              Chia sẻ trải nghiệm học cùng {review?.tutor_name}.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (review)
                mutate(`/bookings/${review.id}/review`, "POST", {
                  rating: Number(rating),
                  body: new FormData(e.currentTarget).get("body"),
                });
            }}
          >
            <FieldGroup>
              <Choose
                label="Mức đánh giá"
                value={rating}
                onChange={setRating}
                options={[5, 4, 3, 2, 1].map((n) => ({
                  value: String(n),
                  label: `${n} / 5 sao`,
                }))}
              />
              <Field>
                <FieldLabel htmlFor="review-body">Nhận xét</FieldLabel>
                <Textarea
                  id="review-body"
                  name="body"
                  required
                  maxLength={1000}
                />
              </Field>
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>Gửi đánh giá</Submit>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

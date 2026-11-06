import { lessonMessageHref } from "@/lib/message-context";
import { LessonCalendar } from "@/components/lesson-calendar";
import { type StudyOffer } from "@/lib/offers";
import { LessonExport } from "@/components/lesson-export";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessageCircle, ExternalLink, CalendarDays, List, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, money, dateTime } from "@/lib/api";
import type { Booking, Tutor, WeeklySchedule } from "@/lib/types";
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
export default function Bookings() {
  const [params, setParams] = useSearchParams();
  const filter = params.get("status") || "";
  const offerId = params.get("offer") || "";
  const inquiryId = params.get("inquiry");
  const lessonId = params.get("lesson");
  const layout = params.get("view") === "list" ? "list" : "week";
  function setParam(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    });
  }
  const { user, refresh } = useApp(),
    result = useLoad<Booking[]>("/bookings"),
    profile = useLoad<Tutor>(user?.role === "tutor" ? "/tutor/profile" : null),
    weekly = useLoad<{ status: string; blocks: WeeklySchedule["blocks"] }[]>(user?.role === "tutor" ? "/weekly-requests" : null),
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
  const allLessons = result.data || [];
  const freeSlots = (profile.data?.slots || []).filter(slot => {
    if (slot.reserved || slot.available === 0) return false;
    const start = Date.parse(slot.starts_at), end = start + slot.duration_minutes * 60000;
    if (allLessons.some(b => ["pending", "accepted", "completed"].includes(b.status) && start < Date.parse(b.starts_at) + b.duration_minutes * 60000 && Date.parse(b.starts_at) < end)) return false;
    return !(weekly.data || []).some(r => r.status === "accepted" && r.blocks.some(block => {
      const local = new Date(start + 7 * 3600000);
      const blockStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), block.hour) - 7 * 3600000;
      return block.weekday === (local.getUTCDay() + 6) % 7 && start < blockStart + 3600000 && blockStart < end;
    }));
  });
  const contextLessons = allLessons.filter(b => (!inquiryId || String(b.inquiry_id) === inquiryId) && (!lessonId || String(b.id) === lessonId));
  const rows = contextLessons.filter(b => (!filter || b.status === filter) && (!offerId || String(b.offer_id) === offerId))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id - b.id);
  const personName = (b: Booking) => user?.role === "tutor" ? b.student_name : user?.role === "admin" ? `${b.student_name} · ${b.tutor_name}` : b.tutor_name;
  const courses = [...new Map(contextLessons.filter(b => b.offer_id).map(b => [b.offer_id!, b])).values()];
  const nextLesson = rows.find(b => b.status === "accepted" && Date.parse(b.starts_at) + b.duration_minutes * 60000 > Date.now());
  const pendingOffers = (offers.data || []).filter(o => o.status === "pending");
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
  // A student reviews each tutor once; later lessons only edit that review.
  const latestCompleted = (b: Booking) => allLessons.filter(x => x.tutor_id === b.tutor_id && x.status === "completed")
    .sort((x, y) => Date.parse(y.starts_at) - Date.parse(x.starts_at) || y.id - x.id)[0]?.id === b.id;
  function openReview(b: Booking) { setError(""); setView(null); setRating(String(b.reviewed ?? 5)); setReview(b); }
  function lessonActions(b: Booking, details = false) {
    const future = Date.parse(b.starts_at) > Date.now();
    const changeStatus = (status: string) => { setError(""); setView(null); setAction({ booking: b, status }); };
    return <>
      {(user?.role !== "admin" || !b.inquiry_id) && <Button asChild variant="outline"><Link to={lessonMessageHref(b)}><MessageCircle data-icon="inline-start" />{details ? "Nhắn tin" : "Trao đổi"}</Link></Button>}
      {user?.role === "tutor" && b.status === "pending" && future && <>
        <Button onClick={() => changeStatus("accepted")}>Nhận buổi học</Button>
        <Button variant="ghost" onClick={() => changeStatus("declined")}>Từ chối</Button>
      </>}
      {["pending", "accepted"].includes(b.status) && future && <Button variant="ghost" onClick={() => changeStatus("cancelled")}>Hủy buổi</Button>}
      {user?.role === "tutor" && ["accepted", "completed"].includes(b.status) && <Button variant="outline" onClick={() => { setError(""); setView(null); setEdit(b); }}>{details ? "Viết ghi chú" : "Nội dung buổi học"}</Button>}
      {user?.role === "tutor" && b.status === "accepted" && Date.parse(b.starts_at) + b.duration_minutes * 60000 <= Date.now() && <Button onClick={() => changeStatus("completed")}>Hoàn thành</Button>}
      {user?.role === "student" && b.status === "accepted" && Date.parse(b.starts_at) + b.duration_minutes * 60000 <= Date.now() && <Button onClick={() => changeStatus("completed")}>Đã học xong</Button>}
      {user?.role === "student" && b.status === "completed" && !b.reviewed && <Button onClick={() => openReview(b)}>Đánh giá</Button>}
      {b.status === "completed" && !!b.reviewed && <span className="muted">Đã đánh giá {b.reviewed}/5</span>}
      {user?.role === "student" && b.status === "completed" && !!b.reviewed && latestCompleted(b) && <Button variant="ghost" onClick={() => openReview(b)}>Sửa đánh giá</Button>}
    </>;
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
        action={<LessonExport lessons={allLessons} role={user?.role || "student"} disabled={result.loading || !!result.error} />}
      />
      <div className="schedule-navigation">
        <span>Giờ Việt Nam · UTC+7</span>
        <div>
          {user?.role !== "admin" && <Button asChild variant="ghost"><Link to="/offers">{pendingOffers.length ? `${pendingOffers.length} đề nghị ${user?.role === "tutor" ? "cần phản hồi" : "chờ xác nhận"}` : "Đề nghị học"}<ArrowRight data-icon="inline-end" /></Link></Button>}
          <Button asChild variant="ghost"><Link to={user?.role === "tutor" ? "/calendar" : "/tutors"}>{user?.role === "tutor" ? "Mở giờ trống" : "Tìm gia sư"}</Link></Button>
        </div>
      </div>
      {(profile.error || weekly.error) && <ErrorState error={profile.error || weekly.error} retry={() => { profile.reload(); weekly.reload(); }} />}
      {offers.error && <ErrorState error={offers.error} retry={offers.reload} />}
      {(inquiryId || lessonId) && <div className="schedule-context"><strong>{contextLessons[0] ? `Lịch cùng ${personName(contextLessons[0])}` : "Lịch từ cuộc trò chuyện"}</strong><Button asChild variant="outline"><Link to="/bookings">Tất cả lịch học</Link></Button></div>}
      {!result.loading && !result.error && nextLesson && <section className="schedule-next" aria-label="Buổi học sắp tới">
        <div><span>{Date.parse(nextLesson.starts_at) <= Date.now() ? "Đang diễn ra" : "Buổi tiếp theo"}</span><h2>{nextLesson.subject_name} · {personName(nextLesson)}</h2><p>{dateTime(nextLesson.starts_at)} · {nextLesson.duration_minutes} phút · {nextLesson.mode === "online" ? "Trực tuyến" : "Trực tiếp"}</p></div>
        <div className="actions">
          {nextLesson.meeting_url && <Button asChild><a href={nextLesson.meeting_url} target="_blank" rel="noreferrer">Vào phòng học<ExternalLink data-icon="inline-end" /></a></Button>}
          <Button variant="outline" onClick={() => setView(nextLesson)}>Chi tiết buổi học</Button>
          {user?.role !== "admin" && <Button asChild variant="outline"><Link to={lessonMessageHref(nextLesson)}><MessageCircle data-icon="inline-start" />{user?.role === "tutor" ? "Nhắn tin" : "Nhắn gia sư"}</Link></Button>}
        </div>
      </section>}
      <Tabs value={layout} onValueChange={value => setParam("view", value)} className="schedule-views">
        <div className="schedule-controls">
          <TabsList aria-label="Cách xem lịch"><TabsTrigger value="week"><CalendarDays aria-hidden="true" />Tuần</TabsTrigger><TabsTrigger value="list"><List aria-hidden="true" />Danh sách</TabsTrigger></TabsList>
          <div className="schedule-filters">
            <Choose label="Khóa học" value={offerId} onChange={value => setParam("offer", value)} allLabel="Tất cả khóa học" options={courses.map(b => ({ value: String(b.offer_id), label: `${b.subject_name} · ${personName(b)} (#${b.offer_id})` }))} />
            <Choose label="Trạng thái" value={filter} onChange={value => setParam("status", value)} allLabel="Tất cả" options={[
              ["pending", "Chờ xác nhận"], ["accepted", "Đã xác nhận"], ["completed", "Đã hoàn thành"], ["missed", "Học sinh vắng"], ["cancelled", "Đã hủy"], ["declined", "Đã từ chối"],
            ].map(([value, label]) => ({ value, label }))} />
          </div>
        </div>
      {result.loading || profile.loading || weekly.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : !rows.length && !(user?.role === "tutor" && layout === "week" && !filter && !offerId && !inquiryId && !lessonId) ? (
        <Blank
          title="Chưa có buổi học trong mục này"
          action={(filter || offerId) ? <Button variant="outline" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.delete("status"); next.delete("offer"); return next; })}>Xóa bộ lọc</Button> : <Button asChild variant="outline"><Link to={user?.role === "tutor" ? "/offers" : "/tutors"}>{user?.role === "tutor" ? "Xem đề nghị học" : "Tìm gia sư"}</Link></Button>}
        />
      ) : (
        <>
        <TabsContent value="week"><LessonCalendar key={`${offerId}:${filter}:${inquiryId}:${lessonId}`} lessons={rows} freeSlots={user?.role === "tutor" && !lessonId && !inquiryId && !offerId && !filter && !profile.error && !weekly.error && !profile.loading && !weekly.loading ? freeSlots : undefined} onOpen={setView} personName={personName} /></TabsContent>
        <TabsContent value="list"><div className="list-toolbar schedule-list-count"><span>{rows.length} buổi học</span></div><div className="booking-list">
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
                  {personName(b)} ·{" "}
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
                  {lessonActions(b)}
                </div>
              </div>
            </article>
          ))}
        </div></TabsContent>
        </>
      )}
      </Tabs>
      <Dialog open={!!view} onOpenChange={open => { if (!open) setView(null); }}>
        <DialogContent className="schedule-detail">
          <DialogHeader><DialogTitle>{view?.subject_name}</DialogTitle><DialogDescription>{view && `${personName(view)} · ${dateTime(view.starts_at)} · Giờ Việt Nam`}</DialogDescription></DialogHeader>
          {view && <>
            <div className="schedule-detail-meta"><State value={view.status} /><span>{view.duration_minutes} phút · {view.mode === "online" ? "Trực tuyến" : "Trực tiếp"} · {money(view.rate * view.duration_minutes / 60)}</span></div>
            {view.meeting_url && ["accepted", "completed"].includes(view.status) && <Button asChild><a href={view.meeting_url} target="_blank" rel="noreferrer">Vào phòng học<ExternalLink data-icon="inline-end" /></a></Button>}
            {view.note && <p className="lesson-note">{view.note}</p>}
            <div className="lesson-notes"><h3>Ghi chú & bài tập</h3><p>{view.lesson_note || "Chưa có ghi chú cho buổi học này."}</p></div>
            <div className="actions">{lessonActions(view, true)}</div>
          </>}
        </DialogContent>
      </Dialog>
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
            <DialogTitle>{review?.reviewed ? "Sửa đánh giá gia sư" : "Đánh giá gia sư"}</DialogTitle>
            <DialogDescription>
              Chia sẻ trải nghiệm học cùng {review?.tutor_name}. Mỗi gia sư một đánh giá, bạn sửa được sau này. Hiển thị công khai là “{user?.display_name || "Thành viên"} - {user?.learner_type === "parent" ? "Phụ huynh" : "Học sinh"}”.
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
                  key={review?.id}
                  id="review-body"
                  name="body"
                  defaultValue={review?.review_body ?? ""}
                  required
                  maxLength={1000}
                />
              </Field>
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>{review?.reviewed ? "Lưu đánh giá" : "Gửi đánh giá"}</Submit>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

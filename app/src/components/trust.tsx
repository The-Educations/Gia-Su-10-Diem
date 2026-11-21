import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Booking, Trust } from "@/lib/types";
import type { StudyOffer } from "@/lib/offers";
import { ErrorState, Submit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Same labels and limit as server/trust-policy.js.
export const LESSON_TAGS = [
  { code: "de_hieu", label: "Dễ hiểu" },
  { code: "kien_nhan", label: "Kiên nhẫn" },
  { code: "nhiet_tinh", label: "Nhiệt tình" },
  { code: "dung_gio", label: "Đúng giờ" },
  { code: "chuan_bi", label: "Chuẩn bị bài kỹ" },
  { code: "hieu_y", label: "Hiểu ý học sinh" },
];
const MAX_TAGS = 3;

export const formatScore = (score: number) => score.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const daysLeft = (until?: string | null) => Math.max(0, Math.ceil((Date.parse(until || "") - Date.now()) / 86400000));

// The number or "Mới", then punctuality. Used on tutor cards and profiles.
export function TrustLine({ trust, reviewCount }: { trust: Trust; reviewCount?: number }) {
  const count = reviewCount ?? trust.review_count;
  return <>
    <span className="trust-score" data-new={trust.is_new || undefined}>
      <Star size={16} />
      {trust.is_new || trust.score === null ? "Mới" : `${formatScore(trust.score)}${count ? ` · ${count} đánh giá` : ""}`}
    </span>
    {trust.punctuality !== null && <span className="trust-punctuality">Đúng hẹn {Math.round(trust.punctuality * 100)}%</span>}
  </>;
}

function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return <div className="star-picker" role="radiogroup" aria-label={label}>
    {[1, 2, 3, 4, 5].map(n =>
      <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} sao`} data-on={n <= value || undefined} onClick={() => onChange(n)}>
        <Star aria-hidden="true" />
      </button>)}
    <span aria-live="polite">{value ? `${value} / 5` : "Chọn số sao"}</span>
  </div>;
}

// Quick, private rating of one finished lesson: stars and up to three tags.
export function LessonRatingDialog({ booking, onClose, onDone }: { booking: Booking | null; onClose: () => void; onDone: () => void }) {
  return <Dialog open={!!booking} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="lesson-rating">
      {booking && <LessonRatingForm key={booking.id} booking={booking} onClose={onClose} onDone={onDone} />}
    </DialogContent>
  </Dialog>;
}
function LessonRatingForm({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(booking.my_rating ?? 0),
    [tags, setTags] = useState<string[]>(booking.my_tags ?? []),
    [busy, setBusy] = useState(false), [error, setError] = useState("");
  const editing = booking.my_rating != null;
  function toggle(code: string) {
    setTags(current => current.includes(code) ? current.filter(c => c !== code) : current.length < MAX_TAGS ? [...current, code] : current);
  }
  async function submit() {
    if (!rating) { setError("Hãy chọn số sao."); return; }
    setBusy(true); setError("");
    try {
      await api(`/bookings/${booking.id}/rating`, "PUT", { rating, tags });
      toast.success(editing ? "Đã cập nhật đánh giá buổi học" : "Cảm ơn bạn đã chấm buổi học");
      onDone(); onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <DialogHeader>
      <DialogTitle>{editing ? "Sửa chấm buổi học" : "Chấm buổi học"}</DialogTitle>
      <DialogDescription>
        {booking.subject_name} cùng {booking.tutor_name}. Chỉ bạn thấy lượt chấm này; gia sư chỉ thấy số liệu tổng hợp.
      </DialogDescription>
    </DialogHeader>
    <FieldGroup>
      <StarPicker value={rating} onChange={setRating} label="Số sao cho buổi học" />
      <div>
        <p className="field-hint">Buổi học này thế nào? (tối đa {MAX_TAGS})</p>
        <div className="tag-choices">
          {LESSON_TAGS.map(tag => <button key={tag.code} type="button" aria-pressed={tags.includes(tag.code)} disabled={!tags.includes(tag.code) && tags.length >= MAX_TAGS} onClick={() => toggle(tag.code)}>{tag.label}</button>)}
        </div>
      </div>
      {error && <ErrorState error={error} />}
      <div className="actions">
        <Button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Đang lưu…" : editing ? "Lưu" : "Gửi"}</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Để sau</Button>
      </div>
    </FieldGroup>
  </>;
}

// Public end-of-course review: stars, optional comment, private "continue?" answer.
export function CourseReviewDialog({ offer, onClose, onDone }: { offer: StudyOffer | null; onClose: () => void; onDone: () => void }) {
  return <Dialog open={!!offer} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent>
      {offer && <CourseReviewForm key={offer.id} offer={offer} onClose={onClose} onDone={onDone} />}
    </DialogContent>
  </Dialog>;
}
const intents = [["yes", "Có"], ["unsure", "Chưa chắc"], ["no", "Không"]] as const;
function CourseReviewForm({ offer, onClose, onDone }: { offer: StudyOffer; onClose: () => void; onDone: () => void }) {
  const mine = offer.my_review;
  const [rating, setRating] = useState(mine?.rating ?? 0),
    [body, setBody] = useState(mine?.body ?? ""),
    [intent, setIntent] = useState<string>(mine?.continue_intent ?? ""),
    [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { setError("Hãy chọn số sao."); return; }
    setBusy(true); setError("");
    try {
      await api(`/offers/${offer.id}/review`, "PUT", { rating, body, continue_intent: intent || null });
      toast.success(mine ? "Đã cập nhật đánh giá khóa học" : "Cảm ơn bạn đã đánh giá khóa học");
      onDone(); onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <DialogHeader>
      <DialogTitle>{mine ? "Sửa đánh giá khóa học" : "Đánh giá khóa học"}</DialogTitle>
      <DialogDescription>
        {offer.subject_name} cùng {offer.tutor_name}. Số sao và nhận xét hiển thị công khai trên hồ sơ gia sư; bạn sửa được trong {daysLeft(offer.review_open_until)} ngày nữa.
      </DialogDescription>
    </DialogHeader>
    <form onSubmit={e => void submit(e)}>
      <FieldGroup>
        <StarPicker value={rating} onChange={setRating} label="Số sao cho khóa học" />
        <Field>
          <FieldLabel htmlFor="course-review-body">Nhận xét (không bắt buộc)</FieldLabel>
          <Textarea id="course-review-body" value={body} onChange={e => setBody(e.target.value)} maxLength={1000} placeholder="Từ 10 ký tự. Không ghi số điện thoại, email hay liên kết." />
        </Field>
        <Field>
          <FieldLabel>Em có muốn học tiếp với gia sư này không? (chỉ lưu nội bộ, không hiện công khai)</FieldLabel>
          <div className="tag-choices" role="group" aria-label="Có muốn học tiếp">
            {intents.map(([value, label]) => <button key={value} type="button" aria-pressed={intent === value} onClick={() => setIntent(intent === value ? "" : value)}>{label}</button>)}
          </div>
        </Field>
        {error && <ErrorState error={error} />}
        <Submit busy={busy}>{mine ? "Lưu đánh giá" : "Gửi đánh giá"}</Submit>
      </FieldGroup>
    </form>
  </>;
}

// Overview card for students: finished courses still waiting for a review.
export function CoursesToReview({ offers, onReview }: { offers: StudyOffer[]; onReview: (offer: StudyOffer) => void }) {
  const rows = offers.filter(o => o.review_eligible && !o.my_review);
  if (!rows.length) return null;
  return <section className="courses-to-review" aria-labelledby="courses-to-review-title">
    <header><h2 id="courses-to-review-title">Khóa học cần đánh giá</h2><span>Đánh giá giúp học sinh khác chọn gia sư</span></header>
    <ul>
      {rows.map(o => <li key={o.id}>
        <div><strong>{o.subject_name} · {o.tutor_name}</strong><span>Đã học {o.completed_lessons} buổi · còn {daysLeft(o.review_open_until)} ngày để đánh giá</span></div>
        <div className="actions">
          <Button onClick={() => onReview(o)}>Đánh giá khóa học</Button>
          <Button asChild variant="ghost"><Link to={`/offers?id=${o.id}`}>Xem khóa học</Link></Button>
        </div>
      </li>)}
    </ul>
  </section>;
}

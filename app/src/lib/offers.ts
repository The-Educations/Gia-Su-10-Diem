import type { WeeklySchedule } from "./types";
export type StudyOffer = {
  id: number; student_id: number; tutor_id: number; inquiry_id: number;
  student_name: string; tutor_name: string; subject_name: string; mode: string;
  start_date: string; end_date: string; blocks: WeeklySchedule["blocks"];
  status: string; rate: number; note: string; kind: "course" | "trial"; weeks: number | null;
  ended?: boolean; ends_at?: string | null; review_open_until?: string | null; review_eligible?: boolean; completed_lessons?: number;
  my_review?: { rating: number; body: string; continue_intent: "yes" | "no" | "unsure" | null; updated_at: string } | null;
};
export type OfferPreview = { sessions: { starts_at: string; duration_minutes: number; conflict: string }[]; conflict_count: number };
export const offerStatuses = (t: (s: string) => string): Record<string, string> => ({ pending: t("Chờ gia sư"), accepted: t("Đã chấp nhận"), declined: t("Đã từ chối"), cancelled: t("Đã hủy") });
export const calendarDate = (date: string) => new Date(`${date}T00:00:00+07:00`).toLocaleDateString("vi-VN", {timeZone:"Asia/Ho_Chi_Minh"});
export const todayVietnam = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

export const offerDuration = (offer: StudyOffer, t: (s: string) => string) => offer.kind === "trial" ? t("Học thử miễn phí · 60 phút · {date}").replace("{date}", calendarDate(offer.start_date)) : `${offer.weeks ? t("{n} tuần · ").replace("{n}", String(offer.weeks)) : ""}${calendarDate(offer.start_date)} – ${calendarDate(offer.end_date)}`;

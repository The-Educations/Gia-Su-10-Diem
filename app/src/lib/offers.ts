import type { WeeklySchedule } from "./types";
export type StudyOffer = {
  id: number; student_id: number; tutor_id: number; inquiry_id: number;
  student_name: string; tutor_name: string; subject_name: string; mode: string;
  start_date: string; end_date: string; blocks: WeeklySchedule["blocks"];
  status: string; rate: number; note: string; kind: "course" | "trial"; weeks: number | null;
};
export type OfferPreview = { sessions: { starts_at: string; duration_minutes: number; conflict: string }[]; conflict_count: number };
export const offerStatuses: Record<string, string> = { pending: "Chờ gia sư", accepted: "Đã chấp nhận", declined: "Đã từ chối", cancelled: "Đã hủy" };
export const calendarDate = (date: string) => new Date(`${date}T00:00:00+07:00`).toLocaleDateString("vi-VN", {timeZone:"Asia/Ho_Chi_Minh"});
export const todayVietnam = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

export const offerDuration = (offer: StudyOffer) => offer.kind === "trial" ? `Học thử miễn phí · 60 phút · ${calendarDate(offer.start_date)}` : `${offer.weeks ? `${offer.weeks} tuần · ` : ""}${calendarDate(offer.start_date)} – ${calendarDate(offer.end_date)}`;

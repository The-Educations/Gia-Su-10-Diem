import type { Booking, MessageContext } from "./types";
import { calendarDate } from "./offers";
import { dateTime } from "./api";

export const contextLabels = { offer: "Đề nghị học", lesson: "Buổi học", "weekly-request": "Lịch học hằng tuần" };
export const contextActions = { offer: "Xem đề nghị", lesson: "Xem buổi học", "weekly-request": "Xem lịch tuần" };
export function contextHref(context: Pick<MessageContext, "kind" | "id">) {
  if (context.kind === "offer") return `/offers?id=${context.id}`;
  if (context.kind === "lesson") return `/bookings?lesson=${context.id}`;
  return `/offers?request=${context.id}`;
}
export function contextDetail(context: MessageContext) {
  if (context.kind === "lesson") return `${dateTime(context.starts_at!)} · ${context.duration_minutes} phút`;
  if (context.kind === "offer") return `${calendarDate(context.start_date!)} – ${calendarDate(context.end_date!)}`;
  return (context.blocks || []).map(b => `${["T2", "T3", "T4", "T5", "T6", "T7", "CN"][b.weekday]} ${String(b.hour).padStart(2, "0")}:00`).join(" · ");
}
export function inquiryMessageHref(inquiry: number, kind: MessageContext["kind"], id: number) {
  return `/messages?inquiry=${inquiry}&context=${kind}&contextId=${id}`;
}
export function lessonMessageHref(lesson: Booking) {
  return lesson.inquiry_id ? inquiryMessageHref(lesson.inquiry_id, "lesson", lesson.id) : `/messages?lesson=${lesson.id}`;
}

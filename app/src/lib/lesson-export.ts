import type { Booking } from "./types";

export const exportableLessons = (lessons: Booking[]) => lessons
  .filter(lesson => ["accepted", "completed"].includes(lesson.status))
  .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id - b.id);

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

// RFC 5545 limits content lines to 75 octets, without splitting UTF-8 characters.
function foldLine(line: string) {
  const encoder = new TextEncoder();
  let result = "", length = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (length + size > 75) { result += "\r\n "; length = 1; }
    result += character;
    length += size;
  }
  return result;
}

export function lessonCalendarFile(lessons: Booking[], role: string, now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GiaSu10Diem//Lessons//VI", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Lịch học · Gia Sư 10 Điểm"];
  for (const lesson of exportableLessons(lessons)) {
    const person = role === "tutor" ? lesson.student_name : role === "admin" ? `${lesson.student_name} · ${lesson.tutor_name}` : lesson.tutor_name;
    const description = [lesson.mode === "online" ? "Trực tuyến" : "Trực tiếp", lesson.note, lesson.lesson_note, lesson.meeting_url].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:lesson-${lesson.id}@giasu10diem.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(new Date(lesson.starts_at))}`,
      `DTEND:${stamp(new Date(Date.parse(lesson.starts_at) + lesson.duration_minutes * 60000))}`,
      `SUMMARY:${escapeText(`${lesson.subject_name} · ${person}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }
  return [...lines, "END:VCALENDAR", ""].map(foldLine).join("\r\n");
}

export function downloadLessonCalendar(lessons: Booking[], role: string) {
  const url = URL.createObjectURL(new Blob([lessonCalendarFile(lessons, role)], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "lich-hoc-gia-su-10-diem.ics";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import type { Booking } from "@/lib/types";
import { downloadLessonCalendar, exportableLessons } from "@/lib/lesson-export";
import { Download } from "lucide-react";
import { Button } from "./ui/button";
import { GoogleCalendar } from "./google-calendar";

export function LessonExport({ lessons, role, disabled }: { lessons: Booking[]; role: string; disabled: boolean }) {
  const count = exportableLessons(lessons).length;
  return <div className="schedule-export">
    <Button variant="outline" onClick={() => downloadLessonCalendar(lessons, role)} disabled={disabled || !count}>
      <Download data-icon="inline-start" />Tải toàn bộ lịch
    </Button>
    {role !== "admin" && <GoogleCalendar />}
  </div>;
}

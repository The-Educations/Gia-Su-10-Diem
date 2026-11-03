import type { Booking } from "@/lib/types";
import { downloadLessonCalendar, exportableLessons } from "@/lib/lesson-export";
import { CalendarPlus, Download, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

export function LessonExport({ lessons, role, disabled }: { lessons: Booking[]; role: string; disabled: boolean }) {
  const count = exportableLessons(lessons).length;
  const download = () => downloadLessonCalendar(lessons, role);
  return <div className="schedule-export">
    <Button variant="outline" onClick={download} disabled={disabled || !count}>
      <Download data-icon="inline-start" />Tải toàn bộ lịch
    </Button>
    <Dialog>
      <DialogTrigger asChild><Button disabled={disabled || !count}><CalendarPlus data-icon="inline-start" />Google Calendar</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nhập lịch vào Google Calendar</DialogTitle>
          <DialogDescription>{count} buổi đã xác nhận hoặc hoàn thành, gồm tất cả khóa học.</DialogDescription>
        </DialogHeader>
        <ol className="calendar-import-steps">
          <li><span>Tải file lịch về máy.</span><Button variant="outline" onClick={download}><Download data-icon="inline-start" />Tải file .ics</Button></li>
          <li><span>Trên Google Calendar bằng máy tính, chọn file vừa tải, chọn lịch đích rồi bấm “Nhập”.</span><Button asChild><a href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noreferrer">Mở trang nhập lịch<ExternalLink data-icon="inline-end" /></a></Button></li>
        </ol>
        <p className="muted">Lịch đã nhập không tự cập nhật khi buổi học thay đổi hoặc bị hủy.</p>
      </DialogContent>
    </Dialog>
  </div>;
}

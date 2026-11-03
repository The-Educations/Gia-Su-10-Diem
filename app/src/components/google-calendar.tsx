import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarPlus, Check, RefreshCw, Settings2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, useLoad } from "@/lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { ErrorState } from "./common";

type CalendarStatus = { available: boolean; connected: boolean; email?: string; lastSynced?: number | null; calendarUrl?: string; error?: string };
const errors: Record<string, string> = {
  cancelled: "Bạn chưa cấp quyền Google Calendar.", expired: "Phiên kết nối đã hết hạn. Vui lòng kết nối lại.",
  unavailable: "Google Calendar chưa sẵn sàng.", failed: "Không thể kết nối Google Calendar. Vui lòng thử lại.",
  permission: "Vui lòng cấp quyền quản lý lịch do ứng dụng tạo.", reconnect: "Quyền Google Calendar đã hết hạn. Vui lòng kết nối lại.",
  api_disabled: "Google Calendar đang chờ quản trị viên bật API. Lịch của bạn chưa được đồng bộ.",
  temporary: "Chưa thể đồng bộ với Google. Hệ thống sẽ tự thử lại.", busy: "Lịch đang đồng bộ. Vui lòng thử lại sau.",
  account_changed: "Hãy ngắt kết nối hiện tại trước khi chọn tài khoản Google khác.",
  calendar_missing: "Lịch trên Google đã bị xóa hoặc không còn truy cập được. Hãy ngắt kết nối rồi kết nối lại.",
  setup_uncertain: "Chưa thể xác nhận lịch trên Google. Hãy kiểm tra Google Calendar, ngắt kết nối rồi kết nối lại.",
};
export function GoogleCalendar() {
  const result = useLoad<CalendarStatus>("/account/google-calendar");
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const data = result.data;
  const callbackError = params.get("calendar_error"), connected = params.get("calendar");
  useEffect(() => {
    if (!callbackError && !connected) return;
    if (callbackError) setError(errors[callbackError] || errors.failed);
    else toast.success("Đã kết nối Google Calendar");
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("calendar_error"); next.delete("calendar"); return next; }, { replace: true });
  }, [callbackError, connected, setParams]);
  useEffect(() => {
    if (!data?.connected) return;
    const timer = setInterval(() => { if (!document.hidden) result.reload(); }, 15000);
    return () => clearInterval(timer);
  }, [data?.connected]);
  async function action(kind: "connect" | "sync" | "disconnect") {
    setBusy(true); setError("");
    try {
      if (kind === "connect") {
        const response = await api<{ url: string }>("/account/google-calendar/connect", "POST");
        const url = new URL(response.url);
        if (url.origin !== "https://accounts.google.com") throw new Error(errors.failed);
        window.location.assign(url.href);
      } else if (kind === "sync") {
        const status = await api<CalendarStatus>("/account/google-calendar/sync", "POST");
        if (status.error) setError(errors[status.error] || errors.failed);
        else toast.success("Đã gửi yêu cầu đồng bộ lịch");
        result.reload();
      } else {
        await api("/account/google-calendar", "DELETE");
        result.reload(); toast.success("Đã ngắt Google Calendar");
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const message = error || result.error || (data?.error ? errors[data.error] || errors.failed : "");
  return <div className="google-calendar-control">
    <div className="google-calendar-buttons">
      <Button disabled={busy || result.loading || (!data?.available && !result.error)} onClick={() => result.error ? result.reload() : void action(!data?.connected || ["reconnect", "permission"].includes(data.error || "") ? "connect" : "sync")}>
        {busy ? <RefreshCw data-icon="inline-start" /> : data?.connected ? <Check data-icon="inline-start" /> : <CalendarPlus data-icon="inline-start" />}
        {busy ? "Đang đồng bộ…" : result.error ? "Thử lại Google Calendar" : ["reconnect", "permission"].includes(data?.error || "") ? "Kết nối lại Google Calendar" : data?.connected ? "Đồng bộ Google Calendar" : "Google Calendar"}
      </Button>
      {data?.connected && <Dialog>
        <DialogTrigger asChild><Button variant="outline" size="icon" aria-label="Cài đặt Google Calendar"><Settings2 /></Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Google Calendar</DialogTitle><DialogDescription>{data.email}</DialogDescription></DialogHeader>
          <p>Lịch “Gia Sư 10 Điểm” tự cập nhật từ ứng dụng, kể cả khi bạn đóng trang.</p>
          <p className="muted">{data.lastSynced ? `Đồng bộ gần nhất: ${new Date(data.lastSynced).toLocaleString("vi-VN")}` : "Đang đồng bộ lịch lần đầu…"}</p>
          {data.calendarUrl && <Button asChild variant="outline"><a href={data.calendarUrl} target="_blank" rel="noreferrer">Mở Google Calendar<ExternalLink data-icon="inline-end" /></a></Button>}
          <p className="muted">Ngắt kết nối sẽ dừng cập nhật. Các sự kiện đã có trên Google được giữ lại.</p>
          <Button variant="outline" disabled={busy} onClick={() => void action("disconnect")}>Ngắt kết nối</Button>
        </DialogContent>
      </Dialog>}
    </div>
    {message && <ErrorState error={message} />}
  </div>;
}

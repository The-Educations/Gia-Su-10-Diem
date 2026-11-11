import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { inquiryMessageHref } from "@/lib/message-context";
import { api, useApp, useLoad, money } from "@/lib/api";
import type { WeeklySchedule } from "@/lib/types";
import { Button } from "./ui/button";
import { Section, ErrorState, Loading } from "./common";

type Request = { id: number; tutor_id: number; student_name: string; tutor_name: string; subject_name: string; inquiry_id: number; blocks: WeeklySchedule["blocks"]; status: string; rate: number; note: string };
const statuses: Record<string, string> = { pending: "Chờ xác nhận", accepted: "Đã xác nhận", declined: "Đã từ chối", cancelled: "Đã hủy" };
export function WeeklyRequests() {
  const { user, refresh } = useApp();
  const [params] = useSearchParams();
  const selected = params.get("request");
  const result = useLoad<Request[]>(user?.role === "admin" ? null : "/weekly-requests");
  const [busy, setBusy] = useState<number | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (!selected || !result.data) return;
    const card = document.getElementById(`weekly-request-${selected}`);
    card?.scrollIntoView({ block: "center" });
    card?.focus({ preventScroll: true });
  }, [selected, result.data]);
  async function update(id: number, status: string) {
    setBusy(id); setError("");
    try { await api(`/weekly-requests/${id}`, "PATCH", { status }); refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  if (user?.role === "admin") return null;
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  if (!result.data?.length) return null;
  return <Section title="Lịch tuần (mẫu cũ)">
    <p className="muted">Mẫu này đã ngừng. Hãy hủy và gửi Đề nghị học để có lịch theo ngày, điểm danh và đánh giá.</p>
    {error && <ErrorState error={error} />}
    <div className="weekly-request-list">{result.data.map(r => <article className="weekly-request-card" id={`weekly-request-${r.id}`} tabIndex={-1} aria-label={`Lịch học hằng tuần #${r.id}`} key={r.id}>
      <div className="section-heading"><h3>{user?.role === "tutor" ? r.student_name : r.tutor_name} · {r.subject_name}</h3><span className="state">{statuses[r.status]}</span></div>
      <ul>{r.blocks.map(b => <li key={`${b.weekday}:${b.hour}`}>{["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][b.weekday]} · {String(b.hour).padStart(2, "0")}:00–{String(b.hour + 1).padStart(2, "0")}:00</li>)}</ul>
      <p>{money(r.rate)} / buổi · Giờ Việt Nam</p>{r.note && <p>{r.note}</p>}
      <div className="actions"><Button asChild variant="outline"><Link to={inquiryMessageHref(r.inquiry_id, "weekly-request", r.id)}>Nhắn tin</Link></Button>
        {user?.role === "student" && ["pending", "accepted"].includes(r.status) && <Button asChild variant="outline"><Link to={`/tutors/${r.tutor_id}`}>Gửi đề nghị học</Link></Button>}
        {r.status === "pending" && user?.id === r.tutor_id && <Button variant="ghost" disabled={busy !== null} onClick={() => void update(r.id, "declined")}>Từ chối</Button>}
        {["pending", "accepted"].includes(r.status) && <Button variant="ghost" disabled={busy !== null} onClick={() => void update(r.id, "cancelled")}>Hủy yêu cầu</Button>}
      </div>
    </article>)}</div>
  </Section>;
}

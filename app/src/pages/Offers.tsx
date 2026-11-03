import { inquiryMessageHref } from "@/lib/message-context";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useApp, useLoad, money, dateTime } from "@/lib/api";
import { calendarDate, offerStatuses, type StudyOffer, type OfferPreview } from "@/lib/offers";
import { Page, Heading, Loading, ErrorState, Blank, Choose } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { WeeklyRequests } from "@/components/weekly-requests";

export default function Offers() {
  const { user, refresh } = useApp();
  const result = useLoad<StudyOffer[]>("/offers");
  const [params, setParams] = useSearchParams();
  const selected = params.get("id");
  const detail = useLoad<StudyOffer & OfferPreview>(selected ? `/offers/${selected}` : null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [cancel, setCancel] = useState(false);
  const offer = detail.data;
  const rows = (result.data || []).filter(o => !filter || o.status === filter);
  async function update(status: string) {
    if (!offer) return;
    setBusy(true); setError("");
    try { await api(`/offers/${offer.id}`, "PATCH", {status}); setCancel(false); refresh(); }
    catch (e) { setError((e as Error).message); detail.reload(); }
    finally { setBusy(false); }
  }
  return <Page>
    <Heading title="Đề nghị học" />
    <div className="list-toolbar"><span>{rows.length} đề nghị</span><Choose label="Trạng thái" value={filter} onChange={setFilter} allLabel="Tất cả" options={Object.entries(offerStatuses).map(([value,label])=>({value,label}))} /></div>
    {result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : !rows.length ? <Blank title="Chưa có đề nghị học" /> : <div className="offer-list">{rows.map(o=><article className="offer-card" key={o.id}>
      <div><span className={`state state-${o.status}`}>{offerStatuses[o.status]}</span><h2>{o.subject_name} · {user?.role === "tutor" ? o.student_name : o.tutor_name}</h2><p>{calendarDate(o.start_date)} – {calendarDate(o.end_date)} · {o.blocks.length} giờ / tuần</p></div>
      <div className="actions"><Button onClick={()=>{setError("");setCancel(false);setParams({id:String(o.id)});}}>Xem đề nghị</Button><Button asChild variant="outline"><Link to={inquiryMessageHref(o.inquiry_id, "offer", o.id)}>Nhắn tin</Link></Button></div>
    </article>)}</div>}
    <WeeklyRequests />
    <Dialog open={!!selected} onOpenChange={open=>{if(!open && !busy){setParams({});setCancel(false);setError("");}}}>
      <DialogContent className="offer-detail">
        <DialogHeader><DialogTitle>Chi tiết đề nghị học{offer ? ` #${offer.id}` : ""}</DialogTitle><DialogDescription>{offer ? `${offer.subject_name} · ${user?.role === "tutor" ? offer.student_name : offer.tutor_name}` : "Lịch học theo ngày đã chọn"}</DialogDescription></DialogHeader>
        {detail.loading ? <Loading /> : detail.error ? <ErrorState error={detail.error} retry={detail.reload} /> : offer && <>
          <div className="offer-summary"><span className={`state state-${offer.status}`}>{offerStatuses[offer.status]}</span><span>{calendarDate(offer.start_date)} – {calendarDate(offer.end_date)}</span><span>{offer.mode === "online" ? "Trực tuyến" : "Trực tiếp"} · {money(offer.rate)} / buổi</span></div>
          <ul className="offer-week">{offer.blocks.map(b=><li key={`${b.weekday}:${b.hour}`}><strong>{["Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7","Chủ nhật"][b.weekday]}</strong>{String(b.hour).padStart(2,"0")}:00–{String(b.hour+1).padStart(2,"0")}:00</li>)}</ul>
          {offer.note && <p className="offer-note">{offer.note}</p>}
          <div className="section-heading"><h3>{offer.sessions.length} {offer.status === "pending" ? "buổi dự kiến" : "buổi học"} · Giờ Việt Nam</h3>{offer.status === "pending" && <span role="status">{offer.conflict_count ? `${offer.conflict_count} buổi cần điều chỉnh` : "Không trùng lịch"}</span>}</div>
          <div className="offer-sessions" role="region" aria-label="Lịch học dự kiến" tabIndex={0}>{offer.sessions.map(s=><div key={s.starts_at} data-conflict={!!s.conflict}><span>{dateTime(s.starts_at)} · 60 phút</span>{s.conflict && <strong>{s.conflict}</strong>}</div>)}</div>
          {error && <ErrorState error={error} />}
          {cancel ? <div className="offer-cancel"><p>Hủy đề nghị và các buổi chưa bắt đầu? Ghi chú và lịch sử buổi đã học được giữ lại.</p><div className="actions"><Button variant="destructive" disabled={busy} onClick={()=>void update("cancelled")}>Xác nhận hủy</Button><Button variant="outline" disabled={busy} onClick={()=>setCancel(false)}>Quay lại</Button></div></div> : <div className="actions">
            {offer.status === "pending" && user?.id === offer.tutor_id && <><Button disabled={busy || !!offer.conflict_count} onClick={()=>void update("accepted")}>{busy ? "Đang xử lý…" : "Chấp nhận"}</Button><Button variant="outline" disabled={busy} onClick={()=>void update("declined")}>Từ chối</Button></>}
            {offer.status === "accepted" && <Button asChild><Link to={`/bookings?offer=${offer.id}`}>{user?.role === "tutor" ? "Mở lịch dạy" : "Mở lịch học"}</Link></Button>}
            <Button asChild variant="outline"><Link to={inquiryMessageHref(offer.inquiry_id, "offer", offer.id)}>Nhắn tin</Link></Button>
            {["pending","accepted"].includes(offer.status) && <Button variant="ghost" disabled={busy} onClick={()=>setCancel(true)}>Hủy đề nghị</Button>}
          </div>}
        </>}
      </DialogContent>
    </Dialog>
  </Page>;
}

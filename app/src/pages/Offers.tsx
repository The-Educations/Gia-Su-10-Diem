import { inquiryMessageHref } from "@/lib/message-context";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, useApp, useLoad, money, dateTime } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { offerDuration, offerStatuses, type StudyOffer, type OfferPreview } from "@/lib/offers";
import { Page, Heading, Loading, ErrorState, Blank, Choose } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { WeeklyRequests } from "@/components/weekly-requests";
import { CourseReviewDialog, daysLeft } from "@/components/trust";

export default function Offers() {
  const { user, refresh } = useApp(), t = useI18n().t;
  const result = useLoad<StudyOffer[]>("/offers");
  const [params, setParams] = useSearchParams();
  const selected = params.get("id");
  const detail = useLoad<StudyOffer & OfferPreview>(selected ? `/offers/${selected}` : null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [cancel, setCancel] = useState(false), [reviewing, setReviewing] = useState<StudyOffer | null>(null);
  const offer = detail.data;
  // An accepted course is ended early, not cancelled: lessons already taught stay and the student can review it.
  const ending = offer?.kind === "course" && offer.status === "accepted" && !offer.ended;
  const rows = (result.data || []).filter(o => !filter || o.status === filter);
  const statusLabels = offerStatuses(t);
  async function update(status: string) {
    if (!offer) return;
    setBusy(true); setError("");
    try { await api(`/offers/${offer.id}`, "PATCH", {status}); setCancel(false); refresh(); }
    catch (e) { setError((e as Error).message); detail.reload(); }
    finally { setBusy(false); }
  }
  return <Page>
    <Heading title={t("Đề nghị học")} />
    <div className="list-toolbar"><span>{t("{n} đề nghị", { n: rows.length })}</span><Choose label={t("Trạng thái")} value={filter} onChange={setFilter} allLabel={t("Tất cả")} options={Object.entries(statusLabels).map(([value,label])=>({value,label}))} /></div>
    {result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.reload} /> : !rows.length ? <Blank title={t("Chưa có đề nghị học")} /> : <div className="offer-list">{rows.map(o=><article className="offer-card" key={o.id}>
      <div><span className={`state state-${o.status}`}>{statusLabels[o.status]}</span><h2>{o.subject_name} · {user?.role === "tutor" ? o.student_name : o.tutor_name}</h2><p>{offerDuration(o, t)}{o.kind !== "trial" && " · " + t("{n} giờ / tuần", { n: o.blocks.length })}</p></div>
      <div className="actions"><Button onClick={()=>{setError("");setCancel(false);setParams({id:String(o.id)});}}>{t("Xem đề nghị")}</Button><Button asChild variant="outline"><Link to={inquiryMessageHref(o.inquiry_id, "offer", o.id)}>{t("Nhắn tin")}</Link></Button>{user?.role === "student" && o.review_eligible && <Button variant="outline" onClick={()=>setReviewing(o)}>{o.my_review ? t("Sửa đánh giá") : t("Đánh giá khóa học")}</Button>}</div>
    </article>)}</div>}
    <WeeklyRequests />
    <CourseReviewDialog offer={reviewing} onClose={()=>setReviewing(null)} onDone={()=>{result.reload();detail.reload();refresh();}} />
    <Dialog open={!!selected} onOpenChange={open=>{if(!open && !busy){setParams({});setCancel(false);setError("");}}}>
      <DialogContent className="offer-detail">
        <DialogHeader><DialogTitle>{t("Chi tiết đề nghị học")}{offer ? ` #${offer.id}` : ""}</DialogTitle><DialogDescription>{offer ? `${offer.subject_name} · ${user?.role === "tutor" ? offer.student_name : offer.tutor_name}` : t("Lịch học theo ngày đã chọn")}</DialogDescription></DialogHeader>
        {detail.loading ? <Loading /> : detail.error ? <ErrorState error={detail.error} retry={detail.reload} /> : offer && <>
          <div className="offer-summary"><span className={`state state-${offer.status}`}>{statusLabels[offer.status]}</span><span>{offerDuration(offer, t)}</span>{offer.ended && <span>{t("Khóa học đã kết thúc")}{offer.review_eligible && !offer.my_review ? " · " + t("còn {n} ngày để đánh giá", { n: daysLeft(offer.review_open_until) }) : ""}</span>}<span>{offer.mode === "online" ? t("Trực tuyến") : t("Trực tiếp")} · {offer.kind === "trial" ? t("Miễn phí") : `${money(offer.rate)} ${t("/ buổi")}`}</span></div>
          <ul className="offer-week">{offer.blocks.map(b=><li key={`${b.weekday}:${b.hour}`}><strong>{t(["Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7","Chủ nhật"][b.weekday])}</strong>{String(b.hour).padStart(2,"0")}:00–{String(b.hour+1).padStart(2,"0")}:00</li>)}</ul>
          {offer.note && <p className="offer-note">{offer.note}</p>}
          <div className="section-heading"><h3>{t("{n} {kind} · Giờ Việt Nam", { n: offer.sessions.length, kind: offer.status === "pending" ? t("buổi dự kiến") : t("buổi học") })}</h3>{offer.status === "pending" && <span role="status">{offer.conflict_count ? t("{n} buổi cần điều chỉnh", { n: offer.conflict_count }) : t("Không trùng lịch")}</span>}</div>
          <div className="offer-sessions" role="region" aria-label={t("Lịch học dự kiến")} tabIndex={0}>{offer.sessions.map(s=><div key={s.starts_at} data-conflict={!!s.conflict}><span>{dateTime(s.starts_at)} · {t("60 phút")}</span>{s.conflict && <strong>{s.conflict}</strong>}</div>)}</div>
          {error && <ErrorState error={error} />}
          {cancel ? <div className="offer-cancel"><p>{ending ? t("Các buổi chưa diễn ra sẽ bị hủy. Buổi đã học và ghi chú được giữ lại. Học sinh sẽ được mời đánh giá khóa học.") : t("Hủy đề nghị và các buổi chưa bắt đầu? Ghi chú và lịch sử buổi đã học được giữ lại.")}</p><div className="actions"><Button variant="destructive" disabled={busy} onClick={()=>void update("cancelled")}>{ending ? t("Xác nhận kết thúc") : t("Xác nhận hủy")}</Button><Button variant="outline" disabled={busy} onClick={()=>setCancel(false)}>{t("Quay lại")}</Button></div></div> : <div className="actions">
            {offer.status === "pending" && user?.id === offer.tutor_id && <><Button disabled={busy || !!offer.conflict_count} onClick={()=>void update("accepted")}>{busy ? t("Đang xử lý…") : t("Chấp nhận")}</Button><Button variant="outline" disabled={busy} onClick={()=>void update("declined")}>{t("Từ chối")}</Button></>}
            {user?.role === "student" && offer.review_eligible && <Button onClick={()=>setReviewing(offer)}>{offer.my_review ? t("Sửa đánh giá") : t("Đánh giá khóa học")}</Button>}
                        {offer.status === "accepted" && <Button asChild><Link to={`/bookings?offer=${offer.id}`}>{user?.role === "tutor" ? t("Mở lịch dạy") : t("Mở lịch học")}</Link></Button>}
            <Button asChild variant="outline"><Link to={inquiryMessageHref(offer.inquiry_id, "offer", offer.id)}>{t("Nhắn tin")}</Link></Button>
            {(offer.status === "pending" || (offer.status === "accepted" && !offer.ended)) && <Button variant="ghost" disabled={busy} onClick={()=>setCancel(true)}>{ending ? t("Kết thúc khóa sớm") : t("Hủy đề nghị")}</Button>}
          </div>}
        </>}
      </DialogContent>
    </Dialog>
  </Page>;
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, MessageCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { api, money, useApp } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Subject, Tutor } from "@/lib/types";
import { ProposalComposer } from "./proposal-composer";
import { VerifyFirst, useVerification } from "./student-verification";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

type Rating = { average: number | null; count: number };

// The tutor page's sticky card: price, stars, verified count and the two ways
// to start — an offer (pays into a held package) or a free message first.
export function BookingCard({ tutor, subjects }: { tutor: Tutor & { rating?: Rating }; subjects: Subject[] }) {
  const { user } = useApp(), { t } = useI18n(), navigate = useNavigate(),
    verification = useVerification(),
    [asking, setAsking] = useState(false), [body, setBody] = useState(""), [busy, setBusy] = useState(false);
  const r = tutor.rating;
  async function ask() {
    if (!user) return navigate(`/auth?next=/tutors/${tutor.user_id}`);
    setBusy(true);
    try {
      const d = await api<{ id: number }>("/inquiries", "POST", { tutor_id: tutor.user_id, body });
      navigate(`/messages?inquiry=${d.id}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <aside className="booking-card" aria-label={t("Đặt gia sư")}>
      <div className="booking-card-price"><strong>{money(tutor.rate)}</strong><span>/ {t("buổi")}</span></div>
      <div className="booking-card-meta">
        {r?.average ? <span><Star aria-hidden="true" className="star-filled" />{r.average.toFixed(1)} · {t("{n} đánh giá", { n: r.count })}</span> : <span className="muted">{t("Chưa có đánh giá")}</span>}
        {!!tutor.verified?.length && <span><BadgeCheck aria-hidden="true" />{t("{n} mục đã xác minh", { n: tutor.verified.length })}</span>}
      </div>
      {(!user || (user.role === "student" && user.learner_type !== "parent")) && (verification.data && verification.data.status !== "approved" ? <VerifyFirst /> : <ProposalComposer tutor={tutor} subjects={subjects} />)}
      {(!user || user.role === "student") && (asking ? (
        <div className="booking-ask">
          <Textarea aria-label={t("Câu hỏi cho gia sư")} rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("Hỏi về lịch, cách dạy, mục tiêu…")} />
          <div className="actions"><Button variant="ghost" size="sm" onClick={() => setAsking(false)}>{t("Hủy")}</Button><Button size="sm" disabled={busy || body.trim().length < 2} onClick={ask}>{t("Gửi câu hỏi")}</Button></div>
        </div>
      ) : (
        <Button variant="outline" className="booking-message" onClick={() => (user ? setAsking(true) : navigate(`/auth?next=/tutors/${tutor.user_id}`))}>
          <MessageCircle data-icon="inline-start" />{t("Nhắn tin trước")}
        </Button>
      ))}
      <ol className="booking-steps">
        <li>{t("Gửi offer: số buổi, lịch và học phí")}</li>
        <li>{t("Tiền được giữ an toàn đến khi gia sư nhận")}</li>
        <li>{t("Học xong mỗi buổi, hai bên cùng xác nhận")}</li>
      </ol>
    </aside>
  );
}

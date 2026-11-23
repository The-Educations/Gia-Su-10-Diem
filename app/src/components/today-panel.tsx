import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BellRing, CalendarDays, CircleCheck, Coins, Send, Wallet } from "lucide-react";
import { money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ClassInfo, ClassSession, Proposal, Wallet as WalletData } from "@/lib/types";
import { SessionActions, dayOf, endOf, timeOf } from "./session-actions";
import "@/calendar.css";
import "@/money.css";

type Child = { id: number; name: string; available: number; classes: { id: number; title: string; color: string; next_at: string | null }[]; pending_offers: number };

// The top of the overview: what needs this person today, in order.
export function TodayPanel() {
  const { user } = useApp(), { t } = useI18n();
  const tutor = user?.role === "tutor", parent = user?.learner_type === "parent";
  // Fixed once per visit so the request key stays the same between renders.
  const [{ from, to }] = useState(() => ({ from: new Date(Date.now() - 3 * 86400000).toISOString(), to: new Date(Date.now() + 8 * 86400000).toISOString() }));
  const schedule = useLoad<ClassSession[]>(`/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    proposals = useLoad<Proposal[]>("/proposals"),
    wallet = useLoad<WalletData>("/wallet"),
    classes = useLoad<ClassInfo[]>(tutor ? "/classes" : null),
    family = useLoad<{ role: string; children?: Child[] }>(parent ? "/family" : null);
  const now = Date.now(), rows = schedule.data || [];
  const toConfirm = rows.filter((s) => endOf(s) <= now && s.outcome === "pending" && !(tutor ? s.tutor_confirmed_at : s.student_confirmed_at))
    .filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);
  const next = rows.filter((s) => endOf(s) > now && s.status === "scheduled").sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const answer = (proposals.data || []).filter((p) => p.status === "pending" && p.incoming);
  const ending = (classes.data || []).flatMap((c) => c.members.filter((m) => m.status === "active" && m.sessions_total - m.done <= 2).map((m) => ({ c, m })));
  const w = wallet.data;
  return (
    <section className="today-panel" aria-label={t("Việc cần làm")}>
      {next ? (
        <Link to={`/classes/${next.class_id}`} className="today-next" data-color={next.color}>
          <span><CalendarDays aria-hidden="true" />{t(tutor ? "Buổi dạy tiếp theo" : "Buổi học tiếp theo")}</span>
          <strong>{dayOf(next.starts_at)} · {timeOf(next.starts_at)}</strong>
          <small>{next.title}</small>
        </Link>
      ) : (
        <Link to={tutor ? "/proposals" : "/tutors"} className="today-next" data-color="sand">
          <span><CalendarDays aria-hidden="true" />{t("Chưa có buổi sắp tới")}</span>
          <strong>{t(tutor ? "Nhận đề nghị để mở lớp" : "Tìm gia sư và gửi đề nghị")}</strong>
        </Link>
      )}
      <div className="today-stats">
        {w && (
          <Link to="/wallet">
            <Wallet aria-hidden="true" /><span>{t("Số dư")}</span><strong>{money(w.available)}</strong>
            {tutor && <small><Coins aria-hidden="true" />{w.credits_free + w.credits_paid} {t("Xu")}</small>}
          </Link>
        )}
        <Link to="/proposals" data-alert={answer.length > 0 || undefined}>
          <Send aria-hidden="true" /><span>{t("Đề nghị cần trả lời")}</span><strong>{answer.length}</strong>
        </Link>
      </div>
      {toConfirm.length > 0 && (
        <div className="today-list">
          <h2><CircleCheck aria-hidden="true" />{t("Buổi cần xác nhận")}</h2>
          <ul>
            {toConfirm.map((s) => (
              <li key={s.id} data-color={s.color}>
                <div><strong>{s.title}</strong><small>{dayOf(s.starts_at)} · {timeOf(s.starts_at)}</small></div>
                <SessionActions s={s} onChanged={schedule.reload} compact />
              </li>
            ))}
          </ul>
        </div>
      )}
      {ending.length > 0 && (
        <div className="today-list">
          <h2><BellRing aria-hidden="true" />{t("Sắp hết gói")}</h2>
          <ul>
            {ending.map(({ c, m }) => (
              <li key={m.id} data-color={c.color}>
                <div><strong>{m.name}</strong><small>{t("Còn {n} buổi", { n: Math.max(0, m.sessions_total - m.done) })} · {c.title}</small></div>
                <Link className="text-link" to={`/classes/${c.id}?tab=people`}>{t("Nhắc gia hạn")}<ArrowUpRight aria-hidden="true" /></Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {parent && (family.data?.children || []).length > 0 && (
        <div className="today-list">
          <h2>{t("Con của tôi")}</h2>
          <ul>
            {family.data!.children!.map((k) => {
              const nextClass = k.classes.filter((c) => c.next_at).sort((a, b) => a.next_at!.localeCompare(b.next_at!))[0];
              return (
                <li key={k.id} data-color={nextClass?.color || "sand"}>
                  <div><strong>{k.name}</strong><small>{nextClass ? `${dayOf(nextClass.next_at!)} · ${timeOf(nextClass.next_at!)} · ${nextClass.title}` : t("Chưa có buổi sắp tới")}</small></div>
                  <span className="today-child-balance">{money(k.available)}</span>
                </li>
              );
            })}
          </ul>
          <Link className="text-link" to="/family">{t("Xem chi tiết")}<ArrowUpRight aria-hidden="true" /></Link>
        </div>
      )}
    </section>
  );
}

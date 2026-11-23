import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Clock, Laptop, House, MessageSquareQuote } from "lucide-react";
import { toast } from "sonner";
import { api, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { celebrate } from "@/lib/celebrate";
import type { Proposal } from "@/lib/types";
import { Blank, ErrorState, Heading, Loading, Page, Person } from "@/components/common";
import { WEEKDAYS, timeLabel } from "@/components/proposal-composer";
import { Button } from "@/components/ui/button";
import "@/money.css";

const STATUS: Record<Proposal["status"], string> = {
  pending: "Chờ trả lời",
  accepted: "Đã nhận",
  declined: "Đã từ chối",
  expired: "Hết hạn",
  withdrawn: "Đã rút",
};
const TABS = [
  { id: "inbox", label: "Cần trả lời" },
  { id: "sent", label: "Đã gửi" },
  { id: "done", label: "Lịch sử" },
] as const;

function Card({ p, focused, onChanged }: { p: Proposal; focused: boolean; onChanged: () => void }) {
  const { user } = useApp(),
    { t, ago } = useI18n(),
    [busy, setBusy] = useState("");
  const other = user?.role === "tutor" ? p.student_name : p.tutor_name;
  async function act(action: "accept" | "decline" | "withdraw", target: HTMLElement) {
    setBusy(action);
    try {
      await api(`/proposals/${p.id}`, "PATCH", { action });
      if (action === "accept") celebrate(target);
      toast.success(t(action === "accept" ? "Đã nhận offer" : action === "decline" ? "Đã từ chối offer" : "Đã rút offer"));
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const schedule = p.schedule.map((s) => `${t(WEEKDAYS[s.weekday])} ${timeLabel(s)}`).join(" · ");
  return (
    <article className="proposal-card" data-status={p.status} data-focused={focused || undefined}>
      <header>
        <Person name={other} id={user?.role === "tutor" ? p.student_id : p.tutor_id} />
        <div>
          <strong>{other}</strong>
          <span>{t(p.incoming ? "gửi bạn" : "bạn gửi")} · {ago(p.created_at)}</span>
        </div>
        <span className="proposal-status">{t(STATUS[p.status])}</span>
      </header>
      <h3>{p.subject_name}{p.level && ` · ${p.level}`}</h3>
      <ul className="proposal-facts">
        <li><CalendarDays aria-hidden="true" />{t("{n} buổi từ {date}", { n: p.sessions, date: new Date(p.start_date).toLocaleDateString("vi-VN") })}</li>
        <li><Clock aria-hidden="true" />{schedule} · {t("{n} phút", { n: p.minutes })}</li>
        <li>{p.mode === "online" ? <Laptop aria-hidden="true" /> : <House aria-hidden="true" />}{t(p.mode === "online" ? "Trực tuyến" : "Trực tiếp")}{p.area && ` · ${p.area}`}</li>
      </ul>
      {p.message && <blockquote><MessageSquareQuote aria-hidden="true" />{p.message}</blockquote>}
      <footer>
        <div className="proposal-money">
          <strong>{money(p.total)}</strong>
          <span>{t("{n} × {rate}", { n: p.sessions, rate: money(p.rate) })}</span>
          {user?.role === "tutor" && <span className="payout">{t("Bạn nhận {amount} sau phí {fee}%", { amount: money(p.payout), fee: p.fee_percent })}</span>}
        </div>
        {p.status === "pending" && user?.learner_type !== "parent" && (
          <div className="actions">
            {p.incoming ? (
              <>
                <Button variant="outline" disabled={!!busy} onClick={(e) => act("decline", e.currentTarget)}>{t("Từ chối")}</Button>
                <Button disabled={!!busy} onClick={(e) => act("accept", e.currentTarget)}>{t(user?.role === "student" ? "Nhận & thanh toán" : "Nhận offer")}</Button>
              </>
            ) : (
              <Button variant="ghost" className="danger-text" disabled={!!busy} onClick={(e) => act("withdraw", e.currentTarget)}>{t("Rút offer")}</Button>
            )}
          </div>
        )}
      </footer>
      {p.status === "pending" && <p className="proposal-expiry">{t("Hết hạn {when}", { when: ago(p.expires_at) })}</p>}
    </article>
  );
}

export default function Proposals() {
  const { user } = useApp(),
    { t } = useI18n(),
    [params, setParams] = useSearchParams(),
    result = useLoad<Proposal[]>("/proposals");
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  const rows = result.data || [],
    focus = Number(params.get("id")) || 0,
    focused = rows.find((p) => p.id === focus);
  const groups = {
    inbox: rows.filter((p) => p.status === "pending" && p.incoming),
    sent: rows.filter((p) => p.status === "pending" && !p.incoming),
    done: rows.filter((p) => p.status !== "pending"),
  };
  const tab = (params.get("tab") as keyof typeof groups) || (focused ? (focused.status !== "pending" ? "done" : focused.incoming ? "inbox" : "sent") : groups.inbox.length ? "inbox" : "sent");
  return (
    <Page>
      <Heading title={t("Offer")} action={user?.role === "student" ? <Button asChild variant="outline"><Link to="/tutors">{t("Tìm gia sư")}</Link></Button> : <Button asChild variant="outline"><Link to="/community">{t("Tìm học sinh")}</Link></Button>} />
      <nav className="segmented" aria-label={t("Nhóm offer")}>
        {TABS.map((x) => (
          <Link key={x.id} to={`/proposals?tab=${x.id}`} aria-current={tab === x.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); setParams({ tab: x.id }); }}>
            {t(x.label)}{groups[x.id].length > 0 && <span className="segmented-count">{groups[x.id].length}</span>}
          </Link>
        ))}
      </nav>
      {groups[tab].length ? (
        <div className="proposal-list">{groups[tab].map((p) => <Card key={p.id} p={p} focused={p.id === focus} onChanged={result.reload} />)}</div>
      ) : (
        <Blank title={t(tab === "inbox" ? "Không có offer cần trả lời" : tab === "sent" ? "Chưa có offer đang chờ" : "Chưa có offer nào")} />
      )}
    </Page>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, dateTime, fold, money, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Blank, ErrorState, Loading } from "./common";
import { AdminSearch, AdminToolbar, FilterChips, RowMenu } from "./admin-kit";
import { AdminUserOverview } from "./admin-classes";
import { dayOf, timeOf } from "./session-actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel } from "./ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import "@/money.css";

// One row per (lesson, student) or per standalone booking from /api/admin/sessions.
type Row = {
  id: number; source: "lesson" | "booking"; class_id: number | null; starts_at: string; minutes: number; status: string; moved_from: string | null;
  title: string; color: string; class_status: string; tutor_id: number; tutor_name: string;
  member_id: number | null; student_id: number | null; member_status: string | null; rate: number | null; held: number | null; sessions_total: number | null;
  outcome: string | null; note: string | null; tutor_confirmed_at: string | null; student_confirmed_at: string | null; rating: number | null; settled: number | null;
  student_name: string | null;
};
type Ses = Omit<Row, "member_id" | "student_id" | "member_status" | "held" | "sessions_total" | "outcome" | "tutor_confirmed_at" | "student_confirmed_at" | "rating" | "settled"> & { members: Row[] };
type Detail = {
  session: Ses & { outcome: string | null; note: string | null };
  students: (Row & { status: string; sessions_total: number; held: number; proposal_id: number | null })[];
  moves: { id: number; requested_by: number; requested_name: string; starts_at: string; status: string; created_at: string }[];
  history: { id: number; action: string; created_at: string; name: string }[];
};
type BookingDetail = {
  booking: { id: number; status: string; starts_at: string; duration_minutes: number; rate: number; mode: string; note: string; lesson_note: string; meeting_url: string; started_at: string | null; student_id: number; tutor_id: number; student_name: string; student_email: string; tutor_name: string; tutor_email: string; subject_name: string };
  history: { id: number; action: string; created_at: string; name: string }[];
};
type Summary = { today: number; running: number; waiting: number; confirmed7: number; ended7: number };
const SCOPES: [string, string][] = [["attention", "Cần xử lý"], ["today", "Hôm nay"], ["upcoming", "Sắp tới"], ["done", "Đã xong"], ["cancelled", "Đã hủy"], ["", "Tất cả"]];
const OUTCOME: Record<string, string> = { pending: "Chờ xác nhận", confirmed: "Đã xác nhận", charged: "Đã tính phí", refunded: "Đã hoàn tiền", disputed: "Đang báo vấn đề" };
const BOOKING_STATE: Record<string, string> = {
  pending: "Chờ gia sư xác nhận", accepted: "Đã lên lịch", completed: "Đã xong", cancelled: "Đã hủy", declined: "Đã từ chối",
  missed: "Báo học sinh vắng", tutor_missed: "Báo gia sư vắng",
};

const endOf = (s: { starts_at: string; minutes: number }) => Date.parse(s.starts_at) + s.minutes * 60000;
const vnDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10);
const isAttention = (s: Ses) =>
  s.source === "booking" ? ["missed", "tutor_missed"].includes(s.status) || (s.status === "pending" && endOf(s) <= Date.now())
  : s.status === "scheduled" && (s.members.some((m) => m.outcome === "disputed") || (endOf(s) <= Date.now() && s.members.some((m) => m.outcome === "pending")));
const scopeOf = (s: Ses) => {
  if (s.source === "booking") {
    if (["cancelled", "declined"].includes(s.status)) return "cancelled";
    if (isAttention(s)) return "attention";
    if (s.status === "accepted" || s.status === "pending") return endOf(s) > Date.now() ? (vnDay(s.starts_at) === vnDay(new Date().toISOString()) ? "today" : "upcoming") : "done";
    return "done";
  }
  return s.status === "cancelled" ? "cancelled"
    : isAttention(s) ? "attention"
    : endOf(s) > Date.now() ? (vnDay(s.starts_at) === vnDay(new Date().toISOString()) ? "today" : "upcoming")
    : "done";
};
const stateOf = (s: Ses) =>
  s.source === "booking" ? BOOKING_STATE[s.status] || s.status
  : s.status === "cancelled" ? "Đã hủy"
  : s.members.some((m) => m.outcome === "disputed") ? "Có báo cáo"
  : s.members.some((m) => m.outcome === "pending") ? (endOf(s) <= Date.now() ? "Quá giờ chưa xác nhận" : "Đã lên lịch")
  : s.members.every((m) => m.outcome === "confirmed") ? "Đã xác nhận"
  : s.members.every((m) => m.outcome === "refunded") ? "Đã hoàn tiền"
  : "Đã tính phí";

function group(rows: Row[]): Ses[] {
  const map = new Map<string, Ses>();
  for (const r of rows) {
    const { member_id, student_id, member_status, rate, held, sessions_total, outcome, note, tutor_confirmed_at, student_confirmed_at, rating, settled, student_name, ...s } = r;
    const key = `${r.source}${r.id}`;
    if (!map.has(key)) map.set(key, { ...s, student_name: null, rate: null, note: null, members: [] });
    if (r.source === "booking") Object.assign(map.get(key)!, { student_name, rate, note });
    if (member_id) map.get(key)!.members.push(r);
  }
  return [...map.values()];
}

const csv = (rows: Ses[]) =>
  [["Nguồn", "Buổi học", "Thời gian", "Phút", "Gia sư", "Học sinh", "Trạng thái", "Học phí"].join(",")]
    .concat(rows.map((s) => [s.source === "booking" ? "Đặt lịch lẻ" : "Lớp học", `"${s.title.replaceAll('"', '""')}"`, s.starts_at, String(s.minutes), `"${s.tutor_name.replaceAll('"', '""')}"`, `"${s.members.map((m) => m.student_name).join(", ").replaceAll('"', '""') || s.student_name || ""}"`, stateOf(s), String(s.source === "booking" ? s.rate || 0 : s.members.reduce((a, m) => a + (m.rate || 0), 0))].join(",")))
    .join("\n");

// Every lesson and standalone booking: queues by urgency, filters, a detail drawer.
export function AdminSessions({ standalone = false }: { standalone?: boolean }) {
  const { t, lang } = useI18n(),
    { refresh } = useApp(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    [q, setQ] = useState(""),
    [picked, setPicked] = useState<Set<string>>(new Set()),
    [cancelOf, setCancelOf] = useState<Ses | null>(null),
    [cancelBooking, setCancelBooking] = useState<number | null>(null),
    [overview, setOverview] = useState<number | null>(null),
    [busy, setBusy] = useState(false);
  const scope = SCOPES.some(([v]) => v === params.get("scope")) ? params.get("scope")! : "attention";
  const onlyClass = Number(params.get("class")) || 0, onlyMember = Number(params.get("member")) || 0;
  const from = params.get("from") || "", to = params.get("to") || "";
  const openId = Number(params.get("session")) || null, openBooking = Number(params.get("booking")) || null;
  const result = useLoad<Row[]>(`/admin/sessions${from || to ? `?${from ? `from=${from}` : ""}${from && to ? "&" : ""}${to ? `to=${to}` : ""}` : ""}`),
    summary = useLoad<Summary>(standalone ? "/admin/sessions/summary" : null);
  const sessions = useMemo(() => group(result.data || []), [result.data]);
  const found = sessions.filter((s) => fold(`${s.title} ${s.tutor_name} ${s.student_name || ""} ${s.members.map((m) => m.student_name).join(" ")}`).includes(fold(q)));
  const shown = found.filter((s) => (!scope || scopeOf(s) === scope || (scope === "today" && vnDay(s.starts_at) === vnDay(new Date().toISOString()))) && (!onlyClass || s.class_id === onlyClass) && (!onlyMember || s.members.some((m) => m.member_id === onlyMember)));
  const remindable = (s: Ses) => s.source === "lesson" && s.status === "scheduled" && endOf(s) <= Date.now() && s.members.some((m) => m.outcome === "pending") && !s.members.some((m) => m.outcome === "disputed");
  const mutate = (f: (n: URLSearchParams) => void) => setParams((p) => { const n = new URLSearchParams(p); f(n); if (standalone) n.delete("tab"); else n.set("tab", "sessions"); return n; });
  const open = (s: Ses | null) => mutate((n) => { n.delete("session"); n.delete("booking"); if (s) n.set(s.source === "booking" ? "booking" : "session", String(s.id)); });
  const choose = (k: string, v: string) => mutate((n) => { n.delete("session"); n.delete("booking"); if (v) n.set(k, v); else n.delete(k); });
  async function remind() {
    setBusy(true);
    try {
      const r = await api<{ reminded: number }>("/admin/sessions/remind", "POST", { ids: [...picked].map((k) => Number(k.slice(6))) });
      toast.success(t(r.reminded ? "Đã nhắc xác nhận {n} buổi" : "Không có buổi nào cần nhắc", { n: r.reminded }));
      setPicked(new Set());
      result.reload();
      refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  function exportCsv() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv(shown)], { type: "text/csv;charset=utf-8" }));
    a.download = `buoi-hoc-${vnDay(new Date().toISOString())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={result.reload} />;
  const pick = (s: Ses, v: boolean) => setPicked((set) => { const n = new Set(set); v ? n.add(`${s.source}${s.id}`) : n.delete(`${s.source}${s.id}`); return n; });
  const rate7 = summary.data?.ended7 ? Math.round(((summary.data.confirmed7 || 0) * 100) / summary.data.ended7) : null;
  return (
    <div className="admin-pane">
      {standalone && summary.data && (
        <p className="sessions-track">
          {t("Hôm nay {n} buổi", { n: summary.data.today })} · {t("đang diễn ra {n}", { n: summary.data.running })} · {t("cần xử lý {n}", { n: summary.data.waiting })}
          {rate7 !== null && <> · {t("{r}% buổi đã xác nhận trong 7 ngày", { r: rate7 })}</>}
        </p>
      )}
      <AdminToolbar>
        <AdminSearch value={q} onChange={setQ} placeholder="Tìm buổi, lớp, gia sư hoặc học sinh…" />
        <FilterChips label="Giai đoạn buổi học" value={scope} onChange={(v) => choose("scope", v)} options={SCOPES.map(([value, label]) => ({ value, label, count: found.filter((s) => (value === "today" ? vnDay(s.starts_at) === vnDay(new Date().toISOString()) : scopeOf(s) === value) || (!value && true)).length }))} />
        {standalone && (
          <>
            <Input type="date" value={from} aria-label={t("Từ ngày")} onChange={(e) => choose("from", e.target.value)} />
            <Input type="date" value={to} aria-label={t("Đến ngày")} onChange={(e) => choose("to", e.target.value)} />
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!shown.length}><Download data-icon="inline-start" />{t("Xuất CSV ({n})", { n: shown.length })}</Button>
          </>
        )}
        {picked.size > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={remind}>{t("Nhắc xác nhận ({n})", { n: picked.size })}</Button>}
      </AdminToolbar>
      {!!(onlyClass || onlyMember) && (
        <p className="finance-status" data-state="simulated">
          {t(onlyMember ? "Đang lọc theo một gói học" : "Đang lọc theo một lớp")} ·{" "}
          <button type="button" className="text-link" onClick={() => mutate((n) => { n.delete("class"); n.delete("member"); })}>{t("Bỏ lọc")}</button>
        </p>
      )}
      {shown.length ? (
        <div className="admin-list admin-rows session-rows">
          {shown.map((s) => (
            <article key={`${s.source}${s.id}`} data-attention={isAttention(s) || undefined} className="session-row">
              <span className="session-check">
                {remindable(s) ? <input type="checkbox" aria-label={t("Chọn buổi {day} {time}", { day: dayOf(s.starts_at), time: timeOf(s.starts_at) })} checked={picked.has(`${s.source}${s.id}`)} onChange={(e) => pick(s, e.target.checked)} /> : null}
              </span>
              <button type="button" className="admin-row-title" onClick={() => open(s)}>
                <strong>{s.title}</strong>
                <small>{dayOf(s.starts_at, lang)} {timeOf(s.starts_at)} · {s.minutes} {t("phút")}{s.moved_from ? ` · ${t("Đã dời lịch")}` : ""}</small>
              </button>
              <span className="admin-row-meta">
                {s.tutor_name}
                <small>{s.members.map((m) => m.student_name).join(", ") || s.student_name || "—"}</small>
              </span>
              <span className="admin-row-state">
                <span className="session-state" data-state={["cancelled", "declined"].includes(s.status) || (s.source === "lesson" && s.status === "cancelled") ? "cancelled" : isAttention(s) ? "attention" : "ok"}>{t(stateOf(s))}</span>
                <span className="admin-flag">{t(s.source === "booking" ? "Đặt lịch lẻ" : "Lớp học")}</span>
                {s.source === "lesson" && s.class_status !== "active" && <span className="admin-flag">{t("Lớp đã kết thúc")}</span>}
                {s.members.some((m) => m.note) && <small className="danger-text">{s.members.find((m) => m.note)?.note}</small>}
                {s.source === "booking" && s.note && <small>{s.note}</small>}
              </span>
              <span className="session-fee">{s.source === "booking" ? money(s.rate || 0) : s.members.length ? money(s.members.reduce((a, m) => a + (m.rate || 0), 0)) : "—"}</span>
              <RowMenu label={t("Thao tác buổi {day} {time}", { day: dayOf(s.starts_at), time: timeOf(s.starts_at) })} items={[
                { label: "Chi tiết buổi học", onSelect: () => open(s) },
                ...(s.source === "lesson" ? [
                  { label: "Mở lớp học", onSelect: () => navigate(`/classes/${s.class_id}`) },
                  { label: "Mở trên lịch", onSelect: () => navigate(`/schedule?user=${s.tutor_id}`) },
                  { label: "Hủy buổi học", danger: true, hidden: s.status !== "scheduled" || Date.parse(s.starts_at) <= Date.now(), onSelect: () => setCancelOf(s) },
                ] : [
                  { label: "Hủy buổi đặt lịch", danger: true, hidden: !["pending", "accepted"].includes(s.status), onSelect: () => setCancelBooking(s.id) },
                ]),
              ]} />
            </article>
          ))}
        </div>
      ) : <Blank title={t(found.length || q ? "Không có buổi học phù hợp" : "Không có buổi nào trong mục này")} action={scope || q || onlyClass || onlyMember || from || to ? <Button variant="outline" onClick={() => { setQ(""); mutate((n) => { n.delete("class"); n.delete("member"); n.delete("from"); n.delete("to"); n.delete("scope"); }); }}>{t("Xem tất cả buổi học")}</Button> : undefined} />}
      <SessionDrawer id={openId} onClose={() => open(null)} onChanged={() => { result.reload(); summary.reload?.(); refresh(); }} onOverview={setOverview} />
      <BookingDrawer id={openBooking} onClose={() => open(null)} onChanged={() => { result.reload(); summary.reload?.(); refresh(); }} onOverview={setOverview} onCancel={setCancelBooking} />
      <CancelDialog s={cancelOf} onClose={() => setCancelOf(null)} onDone={() => { setCancelOf(null); result.reload(); refresh(); }} />
      <CancelBookingDialog id={cancelBooking} onClose={() => setCancelBooking(null)} onDone={() => { setCancelBooking(null); result.reload(); summary.reload?.(); refresh(); }} />
      <AdminUserOverview userId={overview} onClose={() => setOverview(null)} />
    </div>
  );
}

// One lesson's full picture: people, money, history and the actions an admin can take.
function SessionDrawer({ id, onClose, onChanged, onOverview }: { id: number | null; onClose: () => void; onChanged: () => void; onOverview: (u: number) => void }) {
  const { t } = useI18n(), result = useLoad<Detail>(id ? `/admin/sessions/${id}` : null), d = result.data, [busy, setBusy] = useState(0);
  useEffect(() => { if (id) result.reload(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = d ? ({ ...d.session, source: "lesson" as const, members: d.students } as Ses) : null;
  const ended = s ? endOf(s) <= Date.now() : false;
  async function act(body: () => Promise<unknown>, key: number, done: string) {
    setBusy(key);
    try { await body(); toast.success(t(done)); result.reload(); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(0); }
  }
  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="tutor-review-dialog session-drawer">
        <DialogHeader>
          <DialogTitle>{s ? s.title : t("Chi tiết buổi học")}</DialogTitle>
          <DialogDescription>{s && `${dayOf(s.starts_at)} ${timeOf(s.starts_at)} · ${s.minutes} ${t("phút")} · ${t(stateOf(s))}`}</DialogDescription>
        </DialogHeader>
        {!d || !s ? <Loading /> : (
          <div className="admin-finance">
            <div className="actions">
              <Button asChild size="sm" variant="outline"><Link to={`/classes/${s.class_id}`} onClick={onClose}>{t("Mở lớp học")}</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to={`/schedule?user=${s.tutor_id}`} onClick={onClose}><CalendarDays data-icon="inline-start" />{t("Mở trên lịch")}</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/messages" onClick={onClose}>{t("Tin nhắn")}<ExternalLink data-icon="inline-end" /></Link></Button>
            </div>
            <section>
              <h2>{t("Học sinh và học phí")}</h2>
              <div className="session-people">
                {d.students.map((m) => (
                  <div key={m.member_id} className="session-person">
                    <div className="session-person-main">
                      <button type="button" className="text-link" onClick={() => onOverview(m.student_id!)}>{m.student_name}</button>
                      <small>{t("Gói {n} buổi · còn giữ {held}", { n: m.sessions_total, held: money(m.held) })}{m.settled ? ` · ${t("Đã đối chiếu")}` : ""}</small>
                      {m.note ? <small className="danger-text">{t("Báo cáo")}: {m.note}</small> : null}
                    </div>
                    <div className="session-person-side">
                      <span className="session-state" data-state={m.outcome === "disputed" ? "attention" : m.outcome === "confirmed" || m.outcome === "charged" ? "ok" : ""}>{t(OUTCOME[m.outcome || ""] || m.outcome || "—")}</span>
                      <small>{[m.tutor_confirmed_at && t("Gia sư đã xác nhận"), m.student_confirmed_at && t("Học sinh đã xác nhận"), m.rating && t("Chấm {n} sao", { n: m.rating })].filter(Boolean).join(" · ")}</small>
                      <span className="session-fee">{money(m.rate || 0)}</span>
                    </div>
                    {(m.outcome === "disputed" || (m.outcome === "pending" && m.status === "active")) && (
                      <span className="actions">
                        {m.outcome === "disputed" && (
                          <>
                            <Button size="xs" disabled={busy === m.member_id} onClick={() => act(() => api(`/admin/sessions/${id}/resolve`, "POST", { member_id: m.member_id, outcome: "confirmed" }), m.member_id!, "Đã ghi nhận buổi đã diễn ra")}>{t("Buổi đã diễn ra")}</Button>
                            <Button size="xs" variant="outline" disabled={busy === m.member_id} onClick={() => act(() => api(`/admin/sessions/${id}/resolve`, "POST", { member_id: m.member_id, outcome: "refunded" }), m.member_id!, "Đã hoàn tiền buổi này")}>{t("Hoàn tiền")}</Button>
                          </>
                        )}
                        {m.outcome === "pending" && m.status === "active" && (
                          <Button size="xs" variant="ghost" disabled={busy === m.member_id} onClick={() => {
                            if (confirm(t("Kết thúc gói của {name}? Các buổi tới sẽ được hoàn tiền cho học sinh.", { name: m.student_name || "" })))
                              void act(() => api(`/admin/members/${m.member_id}/end`, "POST"), m.member_id!, "Đã kết thúc gói học");
                          }}>{t("Kết thúc gói")}</Button>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
            {(d.history.length > 0 || d.moves.length > 0) && (
              <section>
                <h2>{t("Lịch sử")}</h2>
                <ul className="session-history">
                  {d.moves.map((m) => <li key={`m${m.id}`}><strong>{t(m.status === "pending" ? "Đề nghị dời đang chờ" : m.status === "accepted" ? "Đã dời lịch" : m.status === "declined" ? "Từ chối dời lịch" : "Đề nghị dời cũ")}</strong><span>{m.requested_name} → {dateTime(m.starts_at)}</span></li>)}
                  {d.history.map((h) => <li key={`a${h.id}`}><strong>{t(h.action === "session.admin_cancel" ? "Quản trị viên hủy buổi" : h.action === "session.remind" ? "Quản trị viên nhắc xác nhận" : h.action === "session.resolve.confirmed" ? "Xử lý báo cáo: buổi đã diễn ra" : h.action === "session.resolve.refunded" ? "Xử lý báo cáo: hoàn tiền" : h.action)}</strong><span>{h.name} · {dateTime(h.created_at)}</span></li>)}
                </ul>
              </section>
            )}
            <SessionActions s={s} ended={ended} onDone={onChanged} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// One standalone booking: the two people, the fee, the message thread and history.
function BookingDrawer({ id, onClose, onChanged, onOverview, onCancel }: { id: number | null; onClose: () => void; onChanged: () => void; onOverview: (u: number) => void; onCancel: (id: number) => void }) {
  const { t, lang } = useI18n(), result = useLoad<BookingDetail>(id ? `/admin/bookings/${id}` : null), d = result.data;
  useEffect(() => { if (id) result.reload(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = d?.booking;
  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="tutor-review-dialog session-drawer">
        <DialogHeader>
          <DialogTitle>{b ? `${b.subject_name} · ${b.student_name}` : t("Chi tiết buổi đặt lịch")}</DialogTitle>
          <DialogDescription>{b && `${dayOf(b.starts_at, lang)} ${timeOf(b.starts_at)} · ${b.duration_minutes} ${t("phút")} · ${t(BOOKING_STATE[b.status] || b.status)} · ${t("Đặt lịch lẻ")}`}</DialogDescription>
        </DialogHeader>
        {!d || !b ? <Loading /> : (
          <div className="admin-finance">
            <div className="actions">
              <Button asChild size="sm" variant="outline"><Link to={`/messages?c=lesson-${b.id}`} onClick={onClose}>{t("Tin nhắn")}<ExternalLink data-icon="inline-end" /></Link></Button>
            </div>
            <section>
              <h2>{t("Hai bên tham gia")}</h2>
              <div className="session-people">
                <div className="session-person">
                  <div className="session-person-main">
                    <button type="button" className="text-link" onClick={() => onOverview(b.student_id)}>{b.student_name}</button>
                    <small>{b.student_email}</small>
                  </div>
                  <div className="session-person-side">
                    <span className="session-state" data-state="ok">{t("Học sinh")}</span>
                    <span className="session-fee">{money(b.rate)}</span>
                  </div>
                </div>
                <div className="session-person">
                  <div className="session-person-main">
                    <button type="button" className="text-link" onClick={() => onOverview(b.tutor_id)}>{b.tutor_name}</button>
                    <small>{b.tutor_email}</small>
                  </div>
                  <div className="session-person-side">
                    <span className="session-state" data-state="ok">{t("Gia sư")}</span>
                    <small>{t(b.mode === "online" ? "Trực tuyến" : "Trực tiếp")}{b.started_at ? ` · ${t("Đã mở lớp")}` : ""}</small>
                  </div>
                </div>
              </div>
              {b.note ? <p><small>{t("Ghi chú")}: {b.note}</small></p> : null}
              {b.lesson_note ? <p><small>{t("Nhận xét buổi học")}: {b.lesson_note}</small></p> : null}
            </section>
            {d.history.length > 0 && (
              <section>
                <h2>{t("Lịch sử")}</h2>
                <ul className="session-history">
                  {d.history.map((h) => <li key={h.id}><strong>{t(h.action === "booking.admin_cancel" ? "Quản trị viên hủy buổi đặt lịch" : h.action)}</strong><span>{h.name} · {dateTime(h.created_at)}</span></li>)}
                </ul>
              </section>
            )}
            {["pending", "accepted"].includes(b.status) && (
              <section className="session-admin">
                <h2>{t("Thao tác của quản trị viên")}</h2>
                <div className="actions">
                  <Button size="sm" variant="destructive" onClick={() => { onClose(); onCancel(b.id); }}>{t("Hủy buổi đặt lịch")}</Button>
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Cancel the lesson (refund rule spelled out) or nudge its unconfirmed parties.
function SessionActions({ s, ended, onDone }: { s: Ses; ended: boolean; onDone: () => void }) {
  const { t } = useI18n(), [open, setOpen] = useState(false);
  const canCancel = s.status === "scheduled" && !ended;
  const canRemind = s.status === "scheduled" && ended && s.members.some((m) => m.outcome === "pending");
  if (!canCancel && !canRemind) return null;
  return (
    <section className="session-admin">
      <h2>{t("Thao tác của quản trị viên")}</h2>
      <div className="actions">
        {canCancel && <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>{t("Hủy buổi học")}</Button>}
        {canRemind && <RemindButton id={s.id} onDone={onDone} />}
      </div>
      <CancelDialog s={open ? s : null} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone(); }} />
    </section>
  );
}

function RemindButton({ id, onDone }: { id: number; onDone: () => void }) {
  const { t } = useI18n(), [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = await api<{ reminded: number }>("/admin/sessions/remind", "POST", { ids: [id] }); toast.success(t(r.reminded ? "Đã nhắc hai bên xác nhận" : "Không còn ai cần nhắc")); onDone(); }
      catch (e) { toast.error((e as Error).message); }
      finally { setBusy(false); }
    }}>{t("Nhắc xác nhận")}</Button>
  );
}

// Cancelling a lesson refunds each student's held money for it; the dialog says who gets what.
function CancelDialog({ s, onClose, onDone }: { s: Ses | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n(), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const total = s ? s.members.filter((m) => m.outcome === "pending" || m.outcome === "disputed").reduce((a, m) => a + (m.rate || 0), 0) : 0;
  async function save() {
    if (!s) return;
    setBusy(true);
    try { await api(`/admin/sessions/${s.id}/cancel`, "POST", { note }); toast.success(t("Đã hủy buổi học")); setNote(""); onDone(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={!!s} onOpenChange={(v) => { if (!v && !busy) { setNote(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Hủy buổi học?")}</DialogTitle>
          <DialogDescription>{s && t("{title} · {day} {time}. Học phí buổi này ({amount}) sẽ được hoàn về số dư của {n} học sinh; gia sư không được trả buổi này.", { title: s.title, day: dayOf(s.starts_at), time: timeOf(s.starts_at), amount: money(total), n: s.members.length })}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="session-cancel-note">{t("Lý do gửi cho hai bên")}</FieldLabel>
          <Textarea id="session-cancel-note" rows={2} required minLength={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>{t("Giữ buổi học")}</Button>
          <Button variant="destructive" disabled={busy || note.trim().length < 3} onClick={save}>{t("Xác nhận hủy và hoàn tiền")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Cancelling a standalone booking charges nobody — the dialog says both sides get told.
function CancelBookingDialog({ id, onClose, onDone }: { id: number | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n(), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  async function save() {
    if (!id) return;
    setBusy(true);
    try { await api(`/admin/bookings/${id}/cancel`, "POST", { note }); toast.success(t("Đã hủy buổi đặt lịch")); setNote(""); onDone(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={!!id} onOpenChange={(v) => { if (!v && !busy) { setNote(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Hủy buổi đặt lịch?")}</DialogTitle>
          <DialogDescription>{t("Buổi đặt lịch sẽ chuyển sang Đã hủy; hai bên nhận được thông báo kèm lý do. Buổi đặt lịch lẻ không giữ tiền nên không có khoản nào cần hoàn.")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="booking-cancel-note">{t("Lý do gửi cho hai bên")}</FieldLabel>
          <Textarea id="booking-cancel-note" rows={2} required minLength={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>{t("Giữ buổi đặt lịch")}</Button>
          <Button variant="destructive" disabled={busy || note.trim().length < 3} onClick={save}>{t("Xác nhận hủy")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

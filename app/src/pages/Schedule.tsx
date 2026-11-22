import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { CalendarEvent, ClassSession } from "@/lib/types";
import { EventDialog, type EventDraft } from "@/components/event-dialog";
import { ErrorState, Heading, Page } from "@/components/common";
import { SessionActions, timeOf } from "@/components/session-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import "@/calendar.css";

type View = "day" | "week" | "month";
const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i); // 06:00–22:00
const ROW = 48; // px per hour
const DAY = 86400000;
const VN = 7 * 3600000;
// Calendar maths in Vietnam time: a "day" is a UTC date shifted by +7h.
const vnDate = (ms: number) => new Date(ms + VN).toISOString().slice(0, 10);
const startOfDay = (key: string) => Date.parse(`${key}T00:00:00+07:00`);
const weekStart = (key: string) => { const d = startOfDay(key), w = (new Date(d + VN).getUTCDay() + 6) % 7; return vnDate(d - w * DAY); };
const minutesInDay = (iso: string) => { const d = new Date(Date.parse(iso) + VN); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

function range(view: View, anchor: string) {
  if (view === "day") return [anchor];
  if (view === "week") { const s = startOfDay(weekStart(anchor)); return Array.from({ length: 7 }, (_, i) => vnDate(s + i * DAY)); }
  const first = `${anchor.slice(0, 7)}-01`, s = startOfDay(weekStart(first));
  return Array.from({ length: 42 }, (_, i) => vnDate(s + i * DAY));
}

export default function Schedule() {
  const { user } = useApp(),
    { t, lang } = useI18n(),
    reduce = useReducedMotion(),
    today = vnDate(Date.now()),
    [view, setView] = useState<View>(() => (matchMedia("(max-width: 760px)").matches ? "day" : "week")),
    [anchor, setAnchor] = useState(today),
    [open, setOpen] = useState<{ s: ClassSession; el: HTMLElement } | null>(null),
    [now, setNow] = useState(Date.now()),
    [direction, setDirection] = useState(0);
  const days = range(view, anchor);
  const from = new Date(startOfDay(days[0])).toISOString(), to = new Date(startOfDay(days.at(-1)!) + DAY).toISOString();
  // Administrators see every lesson, or one person's with ?user=.
  const only = new URLSearchParams(location.search).get("user");
  const result = useLoad<ClassSession[]>(`${user?.role === "admin" ? "/admin/schedule" : "/schedule"}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${only ? `&user=${only}` : ""}`);
  const events = useLoad<CalendarEvent[]>(user && user.role !== "admin" ? `/calendar-events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : null),
    [editing, setEditing] = useState<EventDraft | null>(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(id); }, []);
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    // One block per lesson even when a group lesson has several students.
    const lessons = (result.data || []).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);
    for (const item of asItems(lessons, events.data || []).sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
      const key = vnDate(Date.parse(item.starts_at));
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [result.data, events.data]);
  async function moveEvent(e: CalendarEvent, startsAt: number) {
    const length = Date.parse(e.ends_at) - Date.parse(e.starts_at);
    try { await api(`/calendar-events/${e.id}`, "PUT", { ...e, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(startsAt + length).toISOString() }); events.reload(); }
    catch (err) { toast.error((err as Error).message); }
  }
  const newEvent = () => {
    const start = Math.ceil(Date.now() / 1800000) * 1800000;
    setEditing({ starts_at: new Date(start).toISOString(), ends_at: new Date(start + 3600000).toISOString() });
  };
  function shift(n: number) {
    setDirection(n);
    const step = view === "day" ? DAY : view === "week" ? 7 * DAY : 0;
    if (step) setAnchor(vnDate(startOfDay(anchor) + n * step));
    else { const [y, m] = anchor.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); setAnchor(d.toISOString().slice(0, 10)); }
  }
  async function propose(s: ClassSession, startsAt: number) {
    const when = new Date(startsAt);
    if (!confirm(t("Đề nghị dời buổi {title} sang {when}?", { title: s.title, when: `${when.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} ${timeOf(when.toISOString())}` }))) return;
    try { await api(`/sessions/${s.id}/move`, "POST", { starts_at: when.toISOString() }); toast.success(t("Đã gửi đề nghị dời lịch. Bên kia đồng ý thì lịch tự cập nhật.")); }
    catch (e) { toast.error((e as Error).message); }
  }
  const title = new Date(startOfDay(anchor) + VN).toLocaleDateString(lang === "en" ? "en-GB" : "vi-VN", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <Page>
      <Heading title={t("Lịch")} action={
        <span className="actions">
          {user?.role !== "admin" && <Button onClick={newEvent}><Plus data-icon="inline-start" />{t("Sự kiện mới")}</Button>}
          <Button asChild variant="outline"><Link to="/classes">{t("Lớp học")}</Link></Button>
        </span>
      } />
      <div className="cal-toolbar">
        <div className="cal-nav">
          <Button variant="ghost" size="icon" aria-label={t("Trước")} onClick={() => shift(-1)}><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => { setDirection(0); setAnchor(today); }}>{t("Hôm nay")}</Button>
          <Button variant="ghost" size="icon" aria-label={t("Sau")} onClick={() => shift(1)}><ChevronRight /></Button>
          <h2>{title}</h2>
        </div>
        <div className="segmented" role="group" aria-label={t("Chế độ xem")}>
          {(["day", "week", "month"] as View[]).map((v) => (
            <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>{t(v === "day" ? "Ngày" : v === "week" ? "Tuần" : "Tháng")}</button>
          ))}
        </div>
      </div>
      {result.error && <ErrorState error={result.error} retry={result.reload} />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${view}-${days[0]}`} className="cal-frame"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: direction * 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -24 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
          {view === "month" ? (
            <div className="cal-month">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <span key={d} className="cal-month-head">{t(d)}</span>)}
              {days.map((key) => (
                <button type="button" key={key} className="cal-month-cell" data-other={key.slice(0, 7) !== anchor.slice(0, 7) || undefined} data-today={key === today || undefined}
                  onClick={() => { setAnchor(key); setView("day"); }}>
                  <span className="cal-month-date">{Number(key.slice(8))}</span>
                  {(byDay.get(key) || []).slice(0, 3).map((s) => <span key={s.key} className="cal-chip" data-kind={s.kind} data-color={s.color}>{timeOf(s.starts_at)} {s.title}</span>)}
                  {(byDay.get(key) || []).length > 3 && <small>+{(byDay.get(key) || []).length - 3}</small>}
                </button>
              ))}
            </div>
          ) : (
            <TimeGrid days={days} byDay={byDay} today={today} now={now} lang={lang} onOpen={(s, el) => setOpen({ s, el })} onDrop={propose}
              onOpenEvent={(e) => setEditing(e)} onMoveEvent={moveEvent}
              onCreate={(a, b) => setEditing({ starts_at: new Date(a).toISOString(), ends_at: new Date(b).toISOString() })} canDrag={!!user && user.role !== "admin"} />
          )}
        </motion.div>
      </AnimatePresence>
      {view !== "month" && !result.loading && !byDay.size && <p className="cal-empty">{t("Chưa có gì trong khoảng này. Kéo trên lịch để thêm sự kiện.")}</p>}
      <EventDialog draft={editing} onClose={() => setEditing(null)} onSaved={events.reload} />
      <Popover open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        {open && <PopoverAnchor virtualRef={{ current: open.el }} />}
        <PopoverContent className="cal-popover" side="right" align="start">
          {open && (
            <>
              <span className="cal-popover-bar" data-color={open.s.color} />
              <h3>{open.s.title}</h3>
              <p>{new Date(open.s.starts_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit" })} · {timeOf(open.s.starts_at)}–{timeOf(new Date(Date.parse(open.s.starts_at) + open.s.minutes * 60000).toISOString())}</p>
              <p className="muted">{user?.id === open.s.tutor_id ? open.s.student_name : open.s.tutor_name} · {t(open.s.mode === "online" ? "Trực tuyến" : "Trực tiếp")}</p>
              <SessionActions s={open.s} onChanged={() => { result.reload(); setOpen(null); }} compact />
              <Link className="text-link" to={`/classes/${open.s.class_id}`}>{t("Mở lớp học")}</Link>
            </>
          )}
        </PopoverContent>
      </Popover>
    </Page>
  );
}

type Item = { key: string; kind: "lesson" | "event"; title: string; color: string; starts_at: string; minutes: number; lesson?: ClassSession; event?: CalendarEvent };
export const asItems = (lessons: ClassSession[], events: CalendarEvent[]): Item[] => [
  ...lessons.map((l) => ({ key: `l${l.id}`, kind: "lesson" as const, title: l.title, color: l.color, starts_at: l.starts_at, minutes: l.minutes, lesson: l })),
  ...events.map((e) => ({ key: `e${e.id}`, kind: "event" as const, title: e.title, color: e.color, starts_at: e.starts_at, minutes: Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000), event: e })),
];

function TimeGrid({ days, byDay, today, now, lang, onOpen, onDrop, onOpenEvent, onMoveEvent, onCreate, canDrag }: {
  days: string[]; byDay: Map<string, Item[]>; today: string; now: number; lang: string;
  onOpen: (s: ClassSession, el: HTMLElement) => void; onDrop: (s: ClassSession, startsAt: number) => void;
  onOpenEvent: (e: CalendarEvent) => void; onMoveEvent: (e: CalendarEvent, startsAt: number) => void; onCreate: (start: number, end: number) => void; canDrag: boolean;
}) {
  const { t } = useI18n(), body = useRef<HTMLDivElement>(null),
    drag = useRef<{ item: Item; y: number; x: number; moved: boolean } | null>(null),
    making = useRef<{ day: number; from: number } | null>(null);
  const [ghost, setGhost] = useState<{ key: string; day: number; top: number; height: number } | null>(null);
  const [draft, setDraft] = useState<{ day: number; from: number; to: number } | null>(null);
  useEffect(() => { body.current?.scrollTo({ top: Math.max(0, ((new Date(now + VN).getUTCHours() - 7) * ROW)) }); }, []);
  const nowTop = ((minutesInDay(new Date(now).toISOString()) - HOURS[0] * 60) / 60) * ROW;
  const topOf = (minutes: number) => ((minutes - HOURS[0] * 60) / 60) * ROW;
  function geometry(e: React.PointerEvent, step = 30) {
    const grid = body.current!.querySelector(".cal-columns")!.getBoundingClientRect();
    const day = Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - grid.left) / grid.width) * days.length)));
    const minutes = Math.round((((e.clientY - grid.top) / ROW) * 60) / step) * step + HOURS[0] * 60;
    return { day, minutes: Math.max(HOURS[0] * 60, Math.min(23 * 60, minutes)) };
  }
  function onPointerDown(e: React.PointerEvent, item: Item) {
    e.stopPropagation();
    const movable = item.kind === "event" || Date.parse(item.starts_at) > Date.now();
    if (!canDrag || !movable || e.button !== 0) { drag.current = { item, y: e.clientY, x: e.clientX, moved: false }; return; }
    drag.current = { item, y: e.clientY, x: e.clientX, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || (d.item.kind === "lesson" && Date.parse(d.item.starts_at) <= Date.now())) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    const { day, minutes } = geometry(e, d.item.kind === "event" ? 15 : 30);
    setGhost({ key: d.item.key, day, top: topOf(minutes), height: (d.item.minutes / 60) * ROW - 3 });
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    if (!d.moved) return d.item.lesson ? onOpen(d.item.lesson, e.currentTarget as HTMLElement) : onOpenEvent(d.item.event!);
    const { day, minutes } = geometry(e, d.item.kind === "event" ? 15 : 30);
    const at = startOfDay(days[day]) + minutes * 60000;
    if (at === Date.parse(d.item.starts_at)) return;
    if (d.item.lesson) onDrop(d.item.lesson, at);
    else onMoveEvent(d.item.event!, at);
  }
  // Drag down an empty part of a day to block out a new event, like Apple Calendar.
  function startMaking(e: React.PointerEvent, day: number) {
    if (!canDrag || e.button !== 0 || e.target !== e.currentTarget) return;
    const { minutes } = geometry(e, 15);
    making.current = { day, from: minutes };
    setDraft({ day, from: minutes, to: minutes + 60 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moveMaking(e: React.PointerEvent) {
    const m = making.current;
    if (!m) return;
    const { minutes } = geometry(e, 15);
    setDraft({ day: m.day, from: Math.min(m.from, minutes), to: Math.max(m.from + 15, minutes, m.from + (minutes > m.from ? 0 : 60)) });
  }
  function endMaking() {
    const m = making.current;
    making.current = null;
    if (!m || !draft) return setDraft(null);
    const base = startOfDay(days[draft.day]);
    onCreate(base + draft.from * 60000, base + Math.max(draft.to, draft.from + 15) * 60000);
    setDraft(null);
  }
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return (
    <div className="cal-grid" style={{ "--cols": days.length } as React.CSSProperties}>
      <div className="cal-head">
        <span />
        {days.map((key) => (
          <span key={key} data-today={key === today || undefined}>
            <small>{new Date(startOfDay(key) + VN).toLocaleDateString(lang === "en" ? "en-GB" : "vi-VN", { weekday: "short", timeZone: "UTC" })}</small>
            <strong>{Number(key.slice(8))}</strong>
          </span>
        ))}
      </div>
      <div className="cal-body" ref={body}>
        <div className="cal-hours">{HOURS.map((h) => <span key={h} style={{ height: ROW }}>{String(h).padStart(2, "0")}:00</span>)}</div>
        <div className="cal-columns" style={{ height: HOURS.length * ROW }}>
          {days.map((key, i) => (
            <div key={key} className="cal-col" data-today={key === today || undefined} data-weekend={i >= 5 && days.length === 7 || undefined}
              onPointerDown={(e) => startMaking(e, i)} onPointerMove={moveMaking} onPointerUp={endMaking} onPointerCancel={() => { making.current = null; setDraft(null); }}>
              {(byDay.get(key) || []).map((item) => {
                const top = topOf(minutesInDay(item.starts_at)), height = Math.max(22, (item.minutes / 60) * ROW - 3);
                const past = Date.parse(item.starts_at) + item.minutes * 60000 < now;
                const pending = past && item.lesson?.outcome === "pending";
                return (
                  <button type="button" key={item.key} className="cal-event" data-kind={item.kind} data-color={item.color} data-past={past || undefined} data-attention={pending || undefined}
                    data-dragging={ghost?.key === item.key || undefined}
                    style={{ top, height }} aria-label={`${item.title}, ${timeOf(item.starts_at)}${pending ? `, ${t("cần xác nhận")}` : ""}`}
                    onPointerDown={(e) => onPointerDown(e, item)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); item.lesson ? onOpen(item.lesson, e.currentTarget) : onOpenEvent(item.event!); } }}>
                    <strong>{item.title}</strong>
                    <span>{timeOf(item.starts_at)}</span>
                  </button>
                );
              })}
              {ghost && ghost.day === i && <span className="cal-ghost" style={{ top: ghost.top, height: ghost.height }} />}
              {draft && draft.day === i && <span className="cal-draft" style={{ top: topOf(draft.from), height: Math.max(18, ((draft.to - draft.from) / 60) * ROW - 2) }}>{clock(draft.from)}–{clock(draft.to)}</span>}
              {key === today && nowTop >= 0 && nowTop <= HOURS.length * ROW && <span className="cal-now" style={{ top: nowTop }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

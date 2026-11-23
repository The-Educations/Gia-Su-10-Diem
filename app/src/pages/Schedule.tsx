import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { CalendarEvent, ClassSession, Tutor } from "@/lib/types";
import { EventDialog, EventPopover, type EventDraft } from "@/components/event-dialog";
import { ErrorState, Heading, Page } from "@/components/common";
import { SessionActions, timeOf } from "@/components/session-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { freeRuns } from "@/lib/free-hours";
import "@/calendar.css";

type View = "day" | "tri" | "week" | "month";
const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i); // 06:00–22:00
const ZOOM = [32, 48, 72, 96]; // px per hour
const DAY = 86400000;
const VN = 7 * 3600000;
// Calendar maths in Vietnam time: a "day" is a UTC date shifted by +7h.
const vnDate = (ms: number) => new Date(ms + VN).toISOString().slice(0, 10);
const startOfDay = (key: string) => Date.parse(`${key}T00:00:00+07:00`);
const weekStart = (key: string) => { const d = startOfDay(key), w = (new Date(d + VN).getUTCDay() + 6) % 7; return vnDate(d - w * DAY); };
const minutesInDay = (iso: string) => { const d = new Date(Date.parse(iso) + VN); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

function range(view: View, anchor: string) {
  if (view === "day") return [anchor];
  if (view === "tri") { const s = startOfDay(anchor); return Array.from({ length: 3 }, (_, i) => vnDate(s + i * DAY)); }
  if (view === "week") { const s = startOfDay(weekStart(anchor)); return Array.from({ length: 7 }, (_, i) => vnDate(s + i * DAY)); }
  const first = `${anchor.slice(0, 7)}-01`, s = startOfDay(weekStart(first));
  return Array.from({ length: 42 }, (_, i) => vnDate(s + i * DAY));
}

// Apple-style side-by-side layout for overlapping events in one day:
// cluster transitively overlapping events, give each the first free column,
// then stretch it right over the columns no concurrent neighbour occupies.
export function layoutDay(items: { key: string; starts_at: string; minutes: number }[]) {
  const sorted = [...items].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || b.minutes - a.minutes);
  const layout = new Map<string, { left: number; width: number }>();
  let cluster: typeof sorted = [], clusterEnd = -Infinity;
  const flush = () => {
    const ends: number[] = [], placed = new Map<string, { col: number; start: number; end: number }>();
    for (const item of cluster) {
      const start = Date.parse(item.starts_at), end = start + item.minutes * 60000;
      let col = ends.findIndex((e) => e <= start);
      if (col < 0) { col = ends.length; ends.push(0); }
      ends[col] = end;
      placed.set(item.key, { col, start, end });
    }
    const cols = Math.max(1, ends.length);
    for (const item of cluster) {
      const me = placed.get(item.key)!;
      let span = 1;
      for (let c = me.col + 1; c < cols; c++) {
        const blocked = cluster.some((o) => placed.get(o.key)!.col === c && placed.get(o.key)!.start < me.end && placed.get(o.key)!.end > me.start);
        if (blocked) break;
        span++;
      }
      layout.set(item.key, { left: me.col / cols, width: span / cols });
    }
    cluster = []; clusterEnd = -Infinity;
  };
  for (const item of sorted) {
    const start = Date.parse(item.starts_at), end = start + item.minutes * 60000;
    if (cluster.length && start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return layout;
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
    [editing, setEditing] = useState<EventDraft | null>(null),
    [mine, setMine] = useState<CalendarEvent[]>([]),
    [picked, setPicked] = useState<{ id: number; el: HTMLElement } | null>(null),
    [zoom, setZoom] = useState(() => Math.min(ZOOM.length - 1, Math.max(0, Number(localStorage.getItem("cal-zoom") ?? 1)))),
    profile = useLoad<Tutor>(user?.role === "tutor" ? "/tutor/profile" : null);
  // Personal events are edited in place, then saved; the list follows the server after each reload.
  useEffect(() => { setMine(events.data || []); }, [events.data]);
  useEffect(() => { localStorage.setItem("cal-zoom", String(zoom)); }, [zoom]);
  const free = profile.data?.weekly_schedule?.blocks;
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(id); }, []);
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    // One block per lesson even when a group lesson has several students.
    const lessons = (result.data || []).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);
    for (const item of asItems(lessons, mine).sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
      const key = vnDate(Date.parse(item.starts_at));
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [result.data, mine]);
  async function saveEvent(next: CalendarEvent) {
    const before = mine;
    setMine((list) => list.map((e) => (e.id === next.id ? next : e)));
    try { await api(`/calendar-events/${next.id}`, "PUT", next); return true; }
    catch (err) { setMine(before); toast.error((err as Error).message); return false; }
  }
  const moveEvent = (e: CalendarEvent, startsAt: number) => {
    const length = Date.parse(e.ends_at) - Date.parse(e.starts_at);
    return saveEvent({ ...e, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(startsAt + length).toISOString() });
  };
  // Dragging on empty time makes the block at once; a click on it opens its panel.
  async function createEvent(start: number, end: number) {
    const temp: CalendarEvent = { id: -Date.now(), title: t("Sự kiện mới"), color: "sky", note: "", starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() };
    setMine((list) => [...list, temp]);
    try {
      const saved = await api<CalendarEvent>("/calendar-events", "POST", temp);
      setMine((list) => list.map((e) => (e.id === temp.id ? saved : e)));
    } catch (err) { setMine((list) => list.filter((e) => e.id !== temp.id)); toast.error((err as Error).message); }
  }
  async function deleteEvent(e: CalendarEvent) {
    setPicked(null);
    setMine((list) => list.filter((x) => x.id !== e.id));
    try { await api(`/calendar-events/${e.id}`, "DELETE"); toast.success(t("Đã xóa sự kiện")); }
    catch (err) { toast.error((err as Error).message); events.reload(); }
  }
  const newEvent = () => {
    const start = Math.ceil(Date.now() / 1800000) * 1800000;
    setEditing({ starts_at: new Date(start).toISOString(), ends_at: new Date(start + 3600000).toISOString() });
  };
  function shift(n: number) {
    setDirection(n);
    const step = view === "day" ? DAY : view === "tri" ? 3 * DAY : view === "week" ? 7 * DAY : 0;
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
        {view !== "month" && (
          <div className="cal-zoom" role="group" aria-label={t("Thu phóng lịch")}>
            <Button variant="ghost" size="icon-sm" aria-label={t("Thu nhỏ")} disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}><Minus /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("Phóng to")} disabled={zoom === ZOOM.length - 1} onClick={() => setZoom((z) => Math.min(ZOOM.length - 1, z + 1))}><Plus /></Button>
          </div>
        )}
        <div className="segmented" role="group" aria-label={t("Chế độ xem")}>
          {(["day", "tri", "week", "month"] as View[]).map((v) => (
            <button type="button" key={v} data-view={v} aria-pressed={view === v} onClick={() => setView(v)}>{t(v === "day" ? "Ngày" : v === "tri" ? "3 ngày" : v === "week" ? "Tuần" : "Tháng")}</button>
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
            <TimeGrid days={days} byDay={byDay} today={today} now={now} lang={lang} row={ZOOM[zoom]} free={free} onZoom={(n) => setZoom((z) => Math.min(ZOOM.length - 1, Math.max(0, z + n)))}
              onOpen={(s, el) => setOpen({ s, el })} onDrop={propose}
              onOpenEvent={(e, el) => e.id > 0 && setPicked({ id: e.id, el })} onMoveEvent={moveEvent}
              onResizeEvent={(e, end) => saveEvent({ ...e, ends_at: new Date(end).toISOString() })}
              onCreate={createEvent} canDrag={!!user && user.role !== "admin"} />
          )}
        </motion.div>
      </AnimatePresence>
      {view !== "month" && !result.loading && !byDay.size && <p className="cal-empty">{t("Chưa có gì trong khoảng này. Kéo trên lịch để thêm sự kiện.")}</p>}
      <EventDialog draft={editing} onClose={() => setEditing(null)} onSaved={events.reload} />
      <EventPopover event={mine.find((e) => e.id === picked?.id) || null} anchor={picked?.el || null} onClose={() => setPicked(null)} onChange={saveEvent} onDelete={deleteEvent} />
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

type Drag = { item: Item; y: number; x: number; moved: boolean; resize?: boolean };
function TimeGrid({ days, byDay, today, now, lang, row, free, onZoom, onOpen, onDrop, onOpenEvent, onMoveEvent, onResizeEvent, onCreate, canDrag }: {
  days: string[]; byDay: Map<string, Item[]>; today: string; now: number; lang: string; row: number; free?: { weekday: number; hour: number }[]; onZoom: (n: number) => void;
  onOpen: (s: ClassSession, el: HTMLElement) => void; onDrop: (s: ClassSession, startsAt: number) => void;
  onOpenEvent: (e: CalendarEvent, el: HTMLElement) => void; onMoveEvent: (e: CalendarEvent, startsAt: number) => void;
  onResizeEvent: (e: CalendarEvent, endsAt: number) => void; onCreate: (start: number, end: number) => void; canDrag: boolean;
}) {
  const { t } = useI18n(), body = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    making = useRef<{ day: number; from: number } | null>(null);
  const [ghost, setGhost] = useState<{ key: string; day: number; from: number; to: number } | null>(null);
  const [draft, setDraft] = useState<{ day: number; from: number; to: number } | null>(null);
  // On open, land near "now" (one screen-hour back) or the earliest event shown.
  useEffect(() => {
    const nowTop = ((minutesInDay(new Date(now).toISOString()) - HOURS[0] * 60) / 60) * row;
    const earliest = Math.min(...days.flatMap((key) => (byDay.get(key) || []).map((i) => topOf(minutesInDay(i.starts_at)))), Infinity);
    const target = days.includes(today) ? nowTop - row * 1.25 : Number.isFinite(earliest) ? earliest - row * 0.5 : 0;
    body.current?.scrollTo({ top: Math.max(0, target) });
  }, []);
  // Keep the same hour at the top when zooming.
  const lastRow = useRef(row);
  useEffect(() => { const b = body.current; if (b && lastRow.current !== row) b.scrollTop = (b.scrollTop / lastRow.current) * row; lastRow.current = row; }, [row]);
  // Pinch on a trackpad (or Ctrl/⌘ + wheel) zooms the hours.
  useEffect(() => {
    const b = body.current;
    if (!b) return;
    let acc = 0;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) > 40) { onZoom(acc < 0 ? 1 : -1); acc = 0; }
    };
    b.addEventListener("wheel", wheel, { passive: false });
    return () => b.removeEventListener("wheel", wheel);
  }, [onZoom]);
  const nowTop = ((minutesInDay(new Date(now).toISOString()) - HOURS[0] * 60) / 60) * row;
  const topOf = (minutes: number) => ((minutes - HOURS[0] * 60) / 60) * row;
  const heightOf = (minutes: number) => Math.max(18, (minutes / 60) * row - 3);
  function geometry(e: React.PointerEvent, step = 30) {
    const grid = body.current!.querySelector(".cal-columns")!.getBoundingClientRect();
    const day = Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - grid.left) / grid.width) * days.length)));
    const minutes = Math.round((((e.clientY - grid.top) / row) * 60) / step) * step + HOURS[0] * 60;
    return { day, minutes: Math.max(HOURS[0] * 60, Math.min(23 * 60, minutes)) };
  }
  function onPointerDown(e: React.PointerEvent, item: Item, resize = false) {
    e.stopPropagation();
    drag.current = { item, y: e.clientY, x: e.clientX, moved: false, resize };
    const movable = item.kind === "event" || Date.parse(item.starts_at) > Date.now();
    if (canDrag && movable && e.button === 0) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !canDrag || (d.item.kind === "lesson" && Date.parse(d.item.starts_at) <= Date.now())) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    const start = minutesInDay(d.item.starts_at);
    if (d.resize) {
      const { minutes } = geometry(e, 15);
      return setGhost({ key: d.item.key, day: days.indexOf(vnDate(Date.parse(d.item.starts_at))), from: start, to: Math.max(start + 15, minutes) });
    }
    const { day, minutes } = geometry(e, d.item.kind === "event" ? 15 : 30);
    setGhost({ key: d.item.key, day, from: minutes, to: minutes + d.item.minutes });
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current, g = ghost;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    const el = (e.currentTarget as HTMLElement).closest(".cal-event") as HTMLElement;
    if (!d.moved || !g) return d.item.lesson ? onOpen(d.item.lesson, el) : onOpenEvent(d.item.event!, el);
    if (d.resize) return onResizeEvent(d.item.event!, startOfDay(days[g.day]) + g.to * 60000);
    const at = startOfDay(days[g.day]) + g.from * 60000;
    if (at === Date.parse(d.item.starts_at)) return;
    if (d.item.lesson) onDrop(d.item.lesson, at);
    else onMoveEvent(d.item.event!, at);
  }
  // Drag down an empty part of a day to block out a new event, like Apple Calendar.
  function startMaking(e: React.PointerEvent, day: number) {
    if (!canDrag || e.button !== 0 || e.target !== e.currentTarget) return;
    e.preventDefault();
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
    <div className="cal-grid" style={{ "--cols": days.length, "--row": `${row}px` } as React.CSSProperties} data-compact={row < 40 || undefined}>
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
        <div className="cal-hours">{HOURS.map((h) => <span key={h} style={{ height: row }}>{String(h).padStart(2, "0")}:00</span>)}</div>
        <div className="cal-columns" style={{ height: HOURS.length * row }}>
          {days.map((key, i) => (
            <div key={key} className="cal-col" data-today={key === today || undefined} data-weekend={i >= 5 && days.length === 7 || undefined}
              onPointerDown={(e) => startMaking(e, i)} onPointerMove={moveMaking} onPointerUp={endMaking} onPointerCancel={() => { making.current = null; setDraft(null); }}>
              {free && freeRuns(free, (new Date(startOfDay(key) + VN).getUTCDay() + 6) % 7).map(([a, b]) => (
                <span key={a} className="cal-free" style={{ top: topOf(a * 60), height: (b - a) * row }}><small>{t("Rảnh")} {clock(a * 60)}–{clock(b * 60)}</small></span>
              ))}
              {(() => { const laid = layoutDay(byDay.get(key) || []); return (byDay.get(key) || []).map((item) => {
                const top = topOf(minutesInDay(item.starts_at)), height = heightOf(item.minutes);
                const past = Date.parse(item.starts_at) + item.minutes * 60000 < now;
                const pending = past && item.lesson?.outcome === "pending";
                const end = new Date(Date.parse(item.starts_at) + item.minutes * 60000).toISOString();
                const place = laid.get(item.key) || { left: 0, width: 1 };
                return (
                  <button type="button" key={item.key} className="cal-event" data-kind={item.kind} data-color={item.color} data-past={past || undefined} data-attention={pending || undefined}
                    data-dragging={ghost?.key === item.key || undefined} data-new={item.event && item.event.id < 0 || undefined} data-narrow={place.width < 0.34 || undefined}
                    style={{ top, height, left: `calc(${(place.left * 100).toFixed(2)}% + 3px)`, width: `calc(${(place.width * 100).toFixed(2)}% - 6px)` }}
                    title={`${item.title} · ${timeOf(item.starts_at)}–${timeOf(end)}`}
                    aria-label={`${item.title}, ${timeOf(item.starts_at)}–${timeOf(end)}${pending ? `, ${t("cần xác nhận")}` : ""}`}
                    onPointerDown={(e) => onPointerDown(e, item)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); item.lesson ? onOpen(item.lesson, e.currentTarget) : onOpenEvent(item.event!, e.currentTarget); } }}>
                    <strong>{item.title}</strong>
                    <span>{timeOf(item.starts_at)}–{timeOf(end)}</span>
                    {item.kind === "event" && canDrag && <span className="cal-resize" aria-hidden="true" onPointerDown={(e) => onPointerDown(e, item, true)} />}
                  </button>
                );
              }); })()}
              {ghost && ghost.day === i && <span className="cal-ghost" style={{ top: topOf(ghost.from), height: heightOf(ghost.to - ghost.from) }}>{clock(ghost.from)}–{clock(ghost.to)}</span>}
              {draft && draft.day === i && <span className="cal-draft" style={{ top: topOf(draft.from), height: heightOf(draft.to - draft.from) }}><strong>{t("Sự kiện mới")}</strong>{clock(draft.from)}–{clock(draft.to)}</span>}
              {key === today && nowTop >= 0 && nowTop <= HOURS.length * row && <span className="cal-now" style={{ top: nowTop }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

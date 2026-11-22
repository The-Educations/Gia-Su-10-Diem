import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ClassSession } from "@/lib/types";
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
  const result = useLoad<ClassSession[]>(`/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(id); }, []);
  const byDay = useMemo(() => {
    const map = new Map<string, ClassSession[]>();
    // One block per lesson even when a group lesson has several students.
    const seen = new Set<number>();
    for (const s of result.data || []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const key = vnDate(Date.parse(s.starts_at));
      map.set(key, [...(map.get(key) || []), s]);
    }
    return map;
  }, [result.data]);
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
      <Heading title={t("Lịch")} action={<Button asChild variant="outline"><Link to="/classes">{t("Lớp học")}</Link></Button>} />
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
                  {(byDay.get(key) || []).slice(0, 3).map((s) => <span key={s.id} className="cal-chip" data-color={s.color}>{timeOf(s.starts_at)} {s.title}</span>)}
                  {(byDay.get(key) || []).length > 3 && <small>+{(byDay.get(key) || []).length - 3}</small>}
                </button>
              ))}
            </div>
          ) : (
            <TimeGrid days={days} byDay={byDay} today={today} now={now} lang={lang} onOpen={(s, el) => setOpen({ s, el })} onDrop={propose} canDrag={!!user} />
          )}
        </motion.div>
      </AnimatePresence>
      {view !== "month" && !result.loading && !(result.data || []).length && <p className="cal-empty">{t("Không có buổi học trong khoảng này.")}</p>}
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

function TimeGrid({ days, byDay, today, now, lang, onOpen, onDrop, canDrag }: {
  days: string[]; byDay: Map<string, ClassSession[]>; today: string; now: number; lang: string;
  onOpen: (s: ClassSession, el: HTMLElement) => void; onDrop: (s: ClassSession, startsAt: number) => void; canDrag: boolean;
}) {
  const { t } = useI18n(), body = useRef<HTMLDivElement>(null), drag = useRef<{ s: ClassSession; y: number; x: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ id: number; day: number; top: number; height: number } | null>(null);
  useEffect(() => { body.current?.scrollTo({ top: Math.max(0, ((new Date(now + VN).getUTCHours() - 7) * ROW)) }); }, []);
  const nowTop = ((minutesInDay(new Date(now).toISOString()) - HOURS[0] * 60) / 60) * ROW;
  function onPointerDown(e: React.PointerEvent, s: ClassSession) {
    if (!canDrag || Date.parse(s.starts_at) <= Date.now() || e.button !== 0) return;
    drag.current = { s, y: e.clientY, x: e.clientX, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function geometry(e: React.PointerEvent) {
    const grid = body.current!.querySelector(".cal-columns")!.getBoundingClientRect();
    const day = Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - grid.left) / grid.width) * days.length)));
    const minutes = Math.round((((e.clientY - grid.top) / ROW) * 60) / 30) * 30 + HOURS[0] * 60;
    return { day, minutes: Math.max(HOURS[0] * 60, Math.min(22 * 60, minutes)) };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    const { day, minutes } = geometry(e);
    setGhost({ id: d.s.id, day, top: ((minutes - HOURS[0] * 60) / 60) * ROW, height: (d.s.minutes / 60) * ROW - 3 });
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    if (!d.moved) return onOpen(d.s, e.currentTarget as HTMLElement);
    const { day, minutes } = geometry(e);
    const at = startOfDay(days[day]) + minutes * 60000;
    if (at !== Date.parse(d.s.starts_at)) onDrop(d.s, at);
  }
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
            <div key={key} className="cal-col" data-today={key === today || undefined} data-weekend={i >= 5 && days.length === 7 || undefined}>
              {(byDay.get(key) || []).map((s) => {
                const top = ((minutesInDay(s.starts_at) - HOURS[0] * 60) / 60) * ROW, height = Math.max(22, (s.minutes / 60) * ROW - 3);
                const past = Date.parse(s.starts_at) + s.minutes * 60000 < now;
                const pending = past && s.outcome === "pending";
                return (
                  <button type="button" key={s.id} className="cal-event" data-color={s.color} data-past={past || undefined} data-attention={pending || undefined}
                    data-dragging={ghost?.id === s.id || undefined}
                    style={{ top, height }} aria-label={`${s.title}, ${timeOf(s.starts_at)}${pending ? `, ${t("cần xác nhận")}` : ""}`}
                    onPointerDown={(e) => onPointerDown(e, s)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(s, e.currentTarget); } }}>
                    <strong>{s.title}</strong>
                    <span>{timeOf(s.starts_at)}</span>
                  </button>
                );
              })}
              {ghost && ghost.day === i && <span className="cal-ghost" style={{ top: ghost.top, height: ghost.height }} />}
              {key === today && nowTop >= 0 && nowTop <= HOURS.length * ROW && <span className="cal-now" style={{ top: nowTop }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

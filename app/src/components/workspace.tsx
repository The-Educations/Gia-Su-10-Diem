import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { CountingNumber } from "@animate-ui/react/primitives/texts/counting-number";
import { Effects } from "@animate-ui/react/primitives/effects/effect";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Blank, State } from "./common";
import type { Booking } from "@/lib/types";

export function WorkspaceStats({
  items,
}: {
  items: { label: string; value: number; icon: LucideIcon; to?: string }[];
}) {
  return (
    <div className="workspace-metrics">
      {items.map(({ label, value, icon: Icon, to }) => (
        <div className="workspace-metric" key={label}>
          <span className="metric-icon">
            <Icon size={20} />
          </span>
          <span>{label}</span>
          <strong>
            <CountingNumber number={value} inView />
          </strong>
          {to && (
            <Link to={to} aria-label={`Xem ${label.toLowerCase()}`}>
              <ArrowUpRight size={18} />
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
export function WorkspacePanels({
  children,
}: {
  children: React.ReactElement[];
}) {
  return (
    <Effects
      fade
      slide={{ offset: 16 }}
      blur={{ initialBlur: 4 }}
      holdDelay={80}
    >
      {children}
    </Effects>
  );
}
export function WorkspacePanel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`workspace-panel ${className}`}>
      <header className="workspace-panel-heading">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
const localDay = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export function WeekAgenda({
  bookings,
  tutor = false,
}: {
  bookings: Booking[];
  tutor?: boolean;
}) {
  const today = localDay(new Date().toISOString()),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState(today);
  const date = new Date(today + "T00:00:00Z"),
    monday = new Date(date);
  monday.setUTCDate(
    date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + offset * 7,
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return { key: d.toISOString().slice(0, 10), date: d };
  });
  const active = bookings.filter((b) =>
      ["accepted", "pending"].includes(b.status),
    ),
    rows = active
      .filter((b) => localDay(b.starts_at) === selected)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  function move(direction: number) {
    const start = new Date(monday);
    start.setUTCDate(start.getUTCDate() + direction * 7);
    setOffset((o) => o + direction);
    setSelected(
      direction + offset === 0 ? today : start.toISOString().slice(0, 10),
    );
  }
  const month = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(days[0].date);
  return (
    <WorkspacePanel
      title="Lịch trong tuần"
      className="week-agenda"
      action={
        <div className="agenda-controls">
          <span>{month}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Tuần trước"
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Tuần sau"
            onClick={() => move(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      }
    >
      <ToggleGroup
        type="single"
        value={selected}
        onValueChange={(v) => {
          if (v) setSelected(v);
        }}
        className="week-days"
        aria-label="Chọn ngày xem lịch"
      >
        {days.map((d, i) => {
          const count = active.filter(
            (b) => localDay(b.starts_at) === d.key,
          ).length;
          return (
            <ToggleGroupItem
              key={d.key}
              value={d.key}
              className="week-day"
              aria-label={`${d.date.toLocaleDateString("vi-VN", { timeZone: "UTC" })}, ${count} buổi`}
            >
              <span>{["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i]}</span>
              <strong>{d.date.getUTCDate()}</strong>
              <span className="agenda-dots" aria-hidden="true">
                {count > 0 ? "●" : d.key === today ? "○" : "·"}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <div className="agenda-lessons" aria-live="polite">
        {rows.length ? (
          rows.map((b) => (
            <Link
              key={b.id}
              to={`/bookings?status=${b.status}`}
              className="agenda-lesson"
            >
              <time>
                {new Date(b.starts_at).toLocaleTimeString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <div>
                <strong>{b.subject_name}</strong>
                <span>{tutor ? b.student_name : b.tutor_name}</span>
              </div>
              <State value={b.status} />
            </Link>
          ))
        ) : (
          <Blank
            title="Ngày này chưa có lịch"
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={tutor ? "/studio?tab=slots" : "/tutors"}>
                  <CalendarDays data-icon="inline-start" />
                  {tutor ? "Mở giờ trống" : "Tìm gia sư"}
                </Link>
              </Button>
            }
          />
        )}
      </div>
    </WorkspacePanel>
  );
}

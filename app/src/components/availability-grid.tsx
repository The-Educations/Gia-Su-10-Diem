import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import type { WeeklySchedule } from "@/lib/types";

const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const hours = Array.from({ length: 24 }, (_, i) => i);
const time = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
export const scheduleKeys = (schedule: WeeklySchedule) => new Set(schedule.blocks.map(b => b.hour * 7 + b.weekday));

export const scheduleBlocks = (selected: Set<number>) => [...selected].sort((a, b) => a - b).map(key => ({ weekday: key % 7, hour: Math.floor(key / 7) }));
export function AvailabilityGrid({ selected, setSelected, busy = false }: { selected: Set<number>; setSelected: Dispatch<SetStateAction<Set<number>>>; busy?: boolean }) {
  const drag = useRef<{ start: number; add: boolean; original: Set<number> } | null>(null);
  const pointerType = useRef("");
  const scroll = useRef<HTMLDivElement>(null);
  function jump(hour: number) {
    const container = scroll.current, cell = buttons.current[hour * 7];
    if (container && cell) container.scrollTop += cell.getBoundingClientRect().top - container.getBoundingClientRect().top - (container.querySelector("thead")?.getBoundingClientRect().height || 0) - 3;
  }
  useEffect(() => { jump(7); }, []);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const stop = () => { drag.current = null; };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);
  function toggle(key: number) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function paint(end: number) {
    const stroke = drag.current;
    if (!stroke) return;
    const next = new Set(stroke.original);
    for (let row = Math.min(Math.floor(stroke.start / 7), Math.floor(end / 7)); row <= Math.max(Math.floor(stroke.start / 7), Math.floor(end / 7)); row++) {
      for (let day = Math.min(stroke.start % 7, end % 7); day <= Math.max(stroke.start % 7, end % 7); day++) {
        if (stroke.add) next.add(row * 7 + day); else next.delete(row * 7 + day);
      }
    }
    setSelected(next);
  }
  return (<>
      <div className="availability-jumps" role="group" aria-label="Đến khung giờ">
        <Button type="button" variant="ghost" onClick={() => jump(6)}>Sáng</Button>
        <Button type="button" variant="ghost" onClick={() => jump(12)}>Chiều</Button>
        <Button type="button" variant="ghost" onClick={() => jump(18)}>Tối</Button>
      </div>
      <div ref={scroll} className="availability-scroll" role="region" aria-label="Lịch trống từ thứ 2 đến chủ nhật" tabIndex={0}>
        <table className="availability-grid">
          <thead><tr><th scope="col">Giờ</th>{days.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
          <tbody>{hours.map((hour, row) => <tr key={hour}>
            <th scope="row">{time(hour)}<span>{time(hour + 1)}</span></th>
            {days.map((day, weekday) => {
              const key = row * 7 + weekday;
              return <td key={day}><button
                ref={element => { buttons.current[key] = element; }}
                type="button" disabled={busy}
                aria-label={`${day}, ${time(hour)}–${time(hour + 1)}`}
                aria-pressed={selected.has(key)}
                onPointerDown={e => {
                  pointerType.current = e.pointerType;
                  if (e.pointerType !== "mouse" || e.button !== 0) return;
                  e.preventDefault(); e.currentTarget.focus();
                  drag.current = { start: key, add: !selected.has(key), original: new Set(selected) };
                  paint(key);
                }}
                onPointerEnter={e => { if (e.buttons === 1 && e.pointerType === "mouse") paint(key); }}
                onClick={e => { if (e.detail === 0 || pointerType.current !== "mouse") toggle(key); }}
                onKeyDown={e => {
                  const target = { ArrowLeft: weekday > 0 ? key - 1 : key, ArrowRight: weekday < 6 ? key + 1 : key, ArrowUp: key - 7, ArrowDown: key + 7 }[e.key];
                  if (target !== undefined) { e.preventDefault(); buttons.current[target]?.focus(); }
                }}
              >{selected.has(key) && <Check size={16} aria-hidden="true" />}</button></td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
  </>);
}

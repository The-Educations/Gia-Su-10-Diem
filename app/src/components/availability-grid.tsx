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
export function AvailabilityGrid({ selected, setSelected, busy = false, available, preferred }: { selected: Set<number>; setSelected: Dispatch<SetStateAction<Set<number>>>; busy?: boolean; available?: Set<number>; preferred?: Set<number> }) {
  const visibleHours = available ? hours.filter(hour => days.some((_, day) => available.has(hour * 7 + day))) : hours;
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
      if (available && !available.has(key)) return previous;
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
        if (available && !available.has(row * 7 + day)) continue;
        if (stroke.add) next.add(row * 7 + day); else next.delete(row * 7 + day);
      }
    }
    setSelected(next);
  }
  return (<>
      {!available && <div className="availability-jumps" role="group" aria-label="Đến khung giờ">
        <Button type="button" variant="ghost" onClick={() => jump(6)}>Sáng</Button>
        <Button type="button" variant="ghost" onClick={() => jump(12)}>Chiều</Button>
        <Button type="button" variant="ghost" onClick={() => jump(18)}>Tối</Button>
      </div>}
      <div ref={scroll} className="availability-scroll" role="region" aria-label="Lịch trống từ thứ 2 đến chủ nhật" tabIndex={0}>
        <table className="availability-grid">
          <thead><tr><th scope="col">Giờ</th>{days.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
          <tbody>{visibleHours.map(hour => <tr key={hour}>
            <th scope="row">{time(hour)}<span>{time(hour + 1)}</span></th>
            {days.map((day, weekday) => {
              const key = hour * 7 + weekday;
              if (available && !available.has(key)) return <td key={day} aria-label={`${day}, ${time(hour)}–${time(hour + 1)}: không có lịch`} />;
              return <td key={day}><button
                ref={element => { buttons.current[key] = element; }}
                type="button" disabled={busy || (available !== undefined && !available.has(key))}
                data-preferred={preferred?.has(key) || undefined}
                aria-label={`${day}, ${time(hour)}–${time(hour + 1)}${preferred?.has(key) ? ", trùng lịch của bạn" : ""}`}
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
                  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
                  if (step !== undefined) {
                    e.preventDefault();
                    for (let target = key + step; target >= 0 && target < 168; target += step) {
                      if (Math.abs(step) === 1 && Math.floor(target / 7) !== hour) break;
                      const button = buttons.current[target];
                      if (button && !button.disabled) { button.focus(); break; }
                    }
                  }
                }}
              >{selected.has(key) && <Check size={16} aria-hidden="true" />}</button></td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
  </>);
}

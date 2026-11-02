import { useId, useRef } from "react";
import { GraduationCap, School, Plus, Trash2 } from "lucide-react";
import type { EducationEntry } from "@/lib/types";
import { Choose } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";

const levels = [
  { value: "high_school", label: "THPT" },
  { value: "college", label: "Cao đẳng" },
  { value: "university", label: "Đại học" },
  { value: "postgraduate", label: "Sau đại học" },
  { value: "other", label: "Đào tạo khác" },
];
export const newEducation = (): EducationEntry => ({ level: "university", institution: "", field: "", start_year: new Date().getFullYear(), end_year: null });
export function EducationEditor({ value, onChange, required = false }: { value: EducationEntry[]; onChange: (value: EducationEntry[]) => void; required?: boolean }) {
  const id = useId();
  const keys = useRef(value.map(() => crypto.randomUUID()));
  const addButton = useRef<HTMLButtonElement>(null);
  function update(index: number, patch: Partial<EducationEntry>) { onChange(value.map((entry, i) => i === index ? { ...entry, ...patch } : entry)); }
  function add() {
    keys.current.push(crypto.randomUUID());
    onChange([...value, newEducation()]);
    requestAnimationFrame(() => document.getElementById(`${id}-${value.length}-institution`)?.focus());
  }
  return <FieldSet className="education-editor">
    <FieldLegend>Quá trình học tập</FieldLegend>
    {value.map((entry, index) => <fieldset key={keys.current[index]} className="education-entry">
      <legend><GraduationCap size={16} aria-hidden="true" /> Học vấn {index + 1}</legend>
      <Choose label={`Bậc học ${index + 1}`} value={entry.level} onChange={level => update(index, { level: level as EducationEntry["level"] })} options={levels} />
      <Field><FieldLabel htmlFor={`${id}-${index}-institution`}>Tên trường {index + 1}</FieldLabel><Input id={`${id}-${index}-institution`} value={entry.institution} onChange={e => update(index, { institution: e.target.value })} required maxLength={160} autoComplete="organization" /></Field>
      <Field><FieldLabel htmlFor={`${id}-${index}-field`}>Ngành học / chương trình {index + 1}</FieldLabel><Input id={`${id}-${index}-field`} value={entry.field} onChange={e => update(index, { field: e.target.value })} maxLength={160} /></Field>
      <div className="form-two">
        <Field><FieldLabel htmlFor={`${id}-${index}-start`}>Năm bắt đầu {index + 1}</FieldLabel><Input id={`${id}-${index}-start`} type="number" min={1950} max={new Date().getFullYear()} value={entry.start_year || ""} onChange={e => update(index, { start_year: Number(e.target.value) })} required /></Field>
        <Field><FieldLabel htmlFor={`${id}-${index}-end`}>Năm kết thúc {index + 1}</FieldLabel><Input id={`${id}-${index}-end`} type="number" min={entry.start_year || 1950} max={new Date().getFullYear()} value={entry.end_year ?? ""} disabled={entry.end_year === null} onChange={e => update(index, { end_year: Number(e.target.value) })} required={entry.end_year !== null} /></Field>
      </div>
      <div className="education-entry-actions">
        <label><input type="checkbox" checked={entry.end_year === null} onChange={e => update(index, { end_year: e.target.checked ? null : Math.max(entry.start_year, new Date().getFullYear()) })} />Đang theo học</label>
        <Button type="button" variant="ghost" size="sm" disabled={required && value.length === 1} aria-label={`Xóa học vấn ${index + 1}`} onClick={() => { keys.current.splice(index, 1); onChange(value.filter((_, i) => i !== index)); addButton.current?.focus(); }}><Trash2 aria-hidden="true" />Xóa</Button>
      </div>
    </fieldset>)}
    <Button ref={addButton} type="button" variant="outline" disabled={value.length >= 8} onClick={add}><Plus aria-hidden="true" />Thêm học vấn</Button>
  </FieldSet>;
}
export function EducationTimeline({ entries }: { entries: EducationEntry[] }) {
  return <ol className="education-timeline">{[...entries].sort((a, b) => a.start_year - b.start_year).map((entry, i) => {
    const Icon = entry.level === "high_school" ? School : GraduationCap;
    return <li key={i}><span className="education-marker"><Icon size={18} aria-hidden="true" /></span><div>
      <p className="education-dates">{entry.start_year || "…"} — {entry.end_year === null ? "Hiện tại" : entry.end_year || "…"} · {levels.find(l => l.value === entry.level)?.label}</p>
      <p className="education-school">{entry.institution || "Tên trường"}</p>
      {entry.field && <p>{entry.field}</p>}
    </div></li>;
  })}</ol>;
}

import { useId, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ProfileSection } from "@/lib/types";
import { Choose, Section } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel, FieldSet, FieldLegend } from "./ui/field";

const options = ["Kinh nghiệm giảng dạy", "Chứng chỉ", "Ngôn ngữ", "Kỹ năng giảng dạy", "Thành tích", "Mục tùy chỉnh"];
export function ProfileSectionsEditor({ value, onChange }: { value: ProfileSection[]; onChange: (value: ProfileSection[]) => void }) {
  const id = useId(), keys = useRef(value.map(() => crypto.randomUUID()));
  const [template, setTemplate] = useState(options[0]);
  const addButton = useRef<HTMLButtonElement>(null);
  function update(index: number, patch: Partial<ProfileSection>) { onChange(value.map((entry, i) => i === index ? { ...entry, ...patch } : entry)); }
  return <FieldSet><FieldLegend>Thông tin chuyên môn</FieldLegend>
    {value.map((entry, index) => <fieldset key={keys.current[index]} className="education-entry">
      <legend>Mục {index + 1}</legend>
      <Field><FieldLabel htmlFor={`${id}-${index}-title`}>Tiêu đề mục {index + 1}</FieldLabel><Input id={`${id}-${index}-title`} value={entry.title} required maxLength={80} onChange={e => update(index, { title: e.target.value })} /></Field>
      <Field><FieldLabel htmlFor={`${id}-${index}-body`}>Nội dung mục {index + 1}</FieldLabel><Textarea id={`${id}-${index}-body`} value={entry.body} required maxLength={2000} rows={4} onChange={e => update(index, { body: e.target.value })} /></Field>
      <Button type="button" variant="ghost" size="sm" aria-label={`Xóa mục ${index + 1}`} onClick={() => { keys.current.splice(index, 1); onChange(value.filter((_, i) => i !== index)); addButton.current?.focus(); }}><Trash2 aria-hidden="true" />Xóa mục</Button>
    </fieldset>)}
    <Choose label="Thêm thông tin" value={template} onChange={setTemplate} options={options.map(label => ({ value: label, label }))} />
    <Button ref={addButton} type="button" variant="outline" disabled={value.length >= 10} onClick={() => {
      keys.current.push(crypto.randomUUID()); onChange([...value, { title: template === "Mục tùy chỉnh" ? "" : template, body: "" }]);
      requestAnimationFrame(() => document.getElementById(`${id}-${value.length}-${template === "Mục tùy chỉnh" ? "title" : "body"}`)?.focus());
    }}><Plus aria-hidden="true" />Thêm mục</Button>
  </FieldSet>;
}
export function ProfileSections({ sections }: { sections: ProfileSection[] }) {
  return <>{sections.map((section, index) => <Section key={index} title={section.title}><p className="reading-text">{section.body}</p></Section>)}</>;
}

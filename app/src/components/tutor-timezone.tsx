import { useId } from "react";
import { Clock3 } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const zones = Array.from(new Set(["Asia/Ho_Chi_Minh", "UTC", ...Intl.supportedValuesOf("timeZone")]));
export function TimezoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>Múi giờ của bạn</FieldLabel>
    <Input id={id} name="timezone" list={`${id}-zones`} value={value} required maxLength={80} onChange={e => {
      const next = e.target.value;
      try { new Intl.DateTimeFormat("en", { timeZone: next }); e.target.setCustomValidity(""); }
      catch { e.target.setCustomValidity("Chọn một múi giờ hợp lệ trong danh sách."); }
      onChange(next);
    }} />
    <datalist id={`${id}-zones`}>{zones.map(zone => <option key={zone} value={zone} />)}</datalist>
  </Field>;
}
export function timezoneLabel(zone: string, compact = false) {
  try {
    const offset = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(new Date()).find(part => part.type === "timeZoneName")?.value;
    return `${(compact ? zone.split("/").at(-1)! : zone).replaceAll("_", " ")} · ${offset}`;
  } catch { return ""; }
}
export function TimezoneTag({ zone }: { zone: string }) {
  const label = timezoneLabel(zone);
  return label ? <Badge variant="outline" className="timezone-tag"><Clock3 aria-hidden="true" />{label}</Badge> : null;
}

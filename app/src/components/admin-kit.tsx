import { useState, type ReactNode } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

// Shared pieces of the admin screen: a search box, filter chips that show how many
// rows each choice holds, and a "…" menu that keeps rare row actions out of the way.

export function AdminSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { t } = useI18n();
  return (
    <label className="admin-find">
      <Search aria-hidden="true" />
      <span className="sr-only">{t(placeholder)}</span>
      <Input id="admin-search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={t(placeholder)} />
    </label>
  );
}

export function FilterChips({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  const { t } = useI18n();
  return (
    <div className="admin-chips" role="group" aria-label={t(label)}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {t(o.label)}
          {o.count !== undefined && <span>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function AdminToolbar({ children }: { children: ReactNode }) {
  return <div className="admin-bar">{children}</div>;
}

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; hidden?: boolean };

export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const { t } = useI18n(), [open, setOpen] = useState(false), shown = items.filter((i) => !i.hidden);
  if (!shown.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t(label)}><MoreHorizontal /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="row-menu" role="menu">
        {shown.map((i) => (
          <button key={i.label} type="button" role="menuitem" data-danger={i.danger || undefined} onClick={() => { setOpen(false); i.onSelect(); }}>
            {t(i.label)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// A count beside a tab label, shown only when something waits for the admin.
export function Waiting({ n }: { n?: number }) {
  return n ? <span className="tab-count">{n}</span> : null;
}

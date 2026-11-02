import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { api, useApp } from "@/lib/api";
import type { ProfileTheme, Tutor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common";

export function TutorInventory({ tutor, catalog }: { tutor: Tutor; catalog?: ProfileTheme[] }) {
  const { refresh } = useApp();
  const [owned, setOwned] = useState(tutor.theme_inventory);
  const [equipped, setEquipped] = useState(tutor.profile_theme);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  async function select(theme: ProfileTheme) {
    setBusy(theme.id); setError("");
    try {
      if (catalog) {
        const result = await api<{ inventory: ProfileTheme[] }>(`/admin/tutors/${tutor.user_id}/themes/${theme.id}`, "PUT");
        setOwned(result.inventory); toast.success(`Đã cấp ${theme.name}`);
      } else {
        await api("/tutor/theme", "PUT", { theme: theme.id });
        setEquipped(theme.id); toast.success(`Đã trang bị ${theme.name}`);
      }
      refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  }
  return <section className="tutor-inventory" aria-label="Kho giao diện"><h2>Kho giao diện</h2>
    <div className="theme-inventory-grid">{(catalog || owned).map(theme => {
      const granted = owned.some(item => item.id === theme.id);
      const active = equipped === theme.id;
      return <article className="theme-item" key={theme.id}>
        <div className="theme-preview" data-theme={theme.id} aria-hidden="true"><div className="theme-preview-avatar" /><div><i /><i /></div></div>
        <h3>{theme.name}</h3>
        <Button type="button" variant={active && !catalog ? "secondary" : "outline"} disabled={!!busy || (catalog ? granted : active)} onClick={() => select(theme)}>
          {(catalog ? granted : active) && <Check size={14} />}{busy === theme.id ? "Đang lưu…" : catalog ? granted ? "Đã cấp" : `Cấp ${theme.name}` : active ? "Đang dùng" : `Trang bị ${theme.name}`}
        </Button>
      </article>;
    })}</div>
    {error && <ErrorState error={error} />}
  </section>;
}

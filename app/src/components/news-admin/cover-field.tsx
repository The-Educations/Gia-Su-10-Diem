import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { isSafeImage } from "@/lib/news";
import { ErrorState } from "@/components/common";
import { useI18n } from "@/lib/i18n";

export const NEWS_IMAGE_UPLOAD = "/api/admin/news/images";
export const NEWS_IMAGE_BASE = "/api/news/images";

// Cover image: upload or paste an https link (the path n8n uses).
export function CoverField({ form, set, uploading }: {
  form: { cover_url: string; cover_alt: string; cover_credit: string };
  set: (patch: Partial<{ cover_url: string; cover_alt: string; cover_credit: string }>) => void;
  uploading: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [broken, setBroken] = useState("");
  const url = form.cover_url.trim();
  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) return setError("Ảnh tối đa 5 MB.");
    setBusy(true); uploading(true); setError("");
    try {
      const response = await fetch(NEWS_IMAGE_UPLOAD, { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type }, body: file });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tải ảnh.");
      set({ cover_url: data.url });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); uploading(false); }
  }
  return <fieldset className="news-cover-field">
    <legend>{t("Ảnh bìa")}</legend>
    <div className="news-cover-row">
      <div className="news-cover-preview">
        {url && isSafeImage(url) && broken !== url
          ? <img src={url} alt="Xem trước ảnh bìa" referrerPolicy="no-referrer" onError={() => setBroken(url)} />
          : <span>{url && broken === url ? "Không tải được ảnh này" : url ? "Ảnh bìa phải là liên kết https:// hoặc ảnh tải lên" : "Chưa có ảnh"}</span>}
      </div>
      <div className="news-cover-inputs">
        <Field>
          <FieldLabel htmlFor="news-cover-file">{t("Tải ảnh lên · JPG, PNG, WebP · tối đa 5 MB")}</FieldLabel>
          <Input id="news-cover-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
        </Field>
        <Field>
          <FieldLabel htmlFor="news-cover-url">{t("Hoặc dán liên kết https")}</FieldLabel>
          <Input id="news-cover-url" type="url" inputMode="url" placeholder="https://…" value={form.cover_url} maxLength={500}
            onChange={(e) => set({ cover_url: e.target.value })} />
        </Field>
        {url && <button type="button" className="text-link" onClick={() => set({ cover_url: "" })}>{t("Bỏ ảnh bìa")}</button>}
        {busy && <span role="status">{t("Đang tải ảnh…")}</span>}
      </div>
    </div>
    {error && <ErrorState error={error} />}
    <div className="news-field-pair">
      <Field><FieldLabel htmlFor="news-cover-alt">{t("Mô tả ảnh")}</FieldLabel>
        <Input id="news-cover-alt" value={form.cover_alt} maxLength={300} onChange={(e) => set({ cover_alt: e.target.value })} /></Field>
      <Field><FieldLabel htmlFor="news-cover-credit">{t("Nguồn ảnh")}</FieldLabel>
        <Input id="news-cover-credit" value={form.cover_credit} maxLength={120} placeholder="Ví dụ: Tuổi Trẻ" onChange={(e) => set({ cover_credit: e.target.value })} /></Field>
    </div>
  </fieldset>;
}

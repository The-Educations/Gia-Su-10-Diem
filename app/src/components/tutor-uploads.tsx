import { useEffect, useState } from "react";
import { Camera, Image, Upload, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import type { Tutor } from "@/lib/types";
import { api, useApp } from "@/lib/api";
import { Person, ErrorState, Submit } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel, FieldDescription } from "./ui/field";

type Assets = Pick<Tutor, "photo_url" | "banner_url">;
function UploadField({ kind, assets, name, onChange }: { kind: "photo" | "banner"; assets: Assets; name: string; onChange: (a: Assets, pending: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [inputKey, setInputKey] = useState(0);
  const photo = kind === "photo", existing = photo ? assets.photo_url : assets.banner_url;
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function upload(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault(); if (!file) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tutor/uploads/${kind}`, {
        method: "PUT", credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tải ảnh.");
      onChange(data, true); setFile(null); setInputKey(k => k + 1);
      toast.success("Đã tải lên. Hồ sơ sẽ được duyệt lại.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { onChange(await api<Assets>(`/tutor/uploads/${kind}`, "DELETE"), false); toast.success("Đã xóa ảnh"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="upload-card">
    <div className="upload-card-heading">{photo ? <Camera /> : <Image />}<h3>{photo ? "Ảnh đại diện" : "Ảnh bìa"}</h3>{existing && <Check className="upload-check" aria-label="Đã tải lên" />}</div>
    {photo ? <div className="upload-preview"><Person name={name} src={preview || existing || undefined} large /></div> :
      <div className="banner-preview">{preview || existing ? <img src={preview || existing!} alt={preview ? "Ảnh bìa đã chọn" : "Ảnh bìa của bạn"} /> : <Image aria-hidden="true" />}</div>}
    <form onSubmit={upload} className="upload-form">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={`upload-${kind}`}>{photo ? "Chọn ảnh đại diện" : "Chọn ảnh bìa"}</FieldLabel>
        <div className="file-picker" data-busy={busy}>
          <div aria-hidden="true" className="file-picker-label"><Upload /><span>{file ? file.name : "Chọn ảnh hoặc kéo thả vào đây"}</span></div>
          <Input className="file-picker-input" key={inputKey} id={`upload-${kind}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-invalid={!!error} aria-describedby={`upload-${kind}-help`} onChange={e => {
            setError(""); const f = e.target.files?.[0] || null;
            if (f && f.size > 5 * 1024 * 1024) { setFile(null); setError("Ảnh quá lớn. Chọn ảnh tối đa 5 MB."); return; }
            setFile(f);
          }} />
        </div>
        <FieldDescription id={`upload-${kind}-help`}>{photo ? "JPG, PNG hoặc WebP · tối đa 5 MB" : "Ảnh ngang 4:1 · cắt ở giữa · JPG, PNG, WebP · tối đa 5 MB"}</FieldDescription>
      </Field>
      {error && <ErrorState error={error} />}
      <div className="actions">
        {file && <Submit busy={busy}><Upload data-icon="inline-start" />{photo ? "Lưu ảnh" : "Lưu ảnh bìa"}</Submit>}
        {existing && <><Button variant="outline" asChild><a href={existing} target="_blank" rel="noreferrer">{photo ? "Xem ảnh" : "Xem ảnh bìa"}</a></Button>
          <Button variant="ghost" type="button" disabled={busy} onClick={remove} aria-label={photo ? "Xóa ảnh đại diện" : "Xóa ảnh bìa"}><Trash2 data-icon="inline-start" />Xóa</Button></>}
      </div>
    </form>
  </section>;
}
export function TutorUploads({ t, onPending }: { t: Tutor; onPending: () => void }) {
  const { refresh } = useApp();
  const [assets, setAssets] = useState<Assets>({ photo_url: t.photo_url, banner_url: t.banner_url });
  function changed(a: Assets, pending: boolean) { setAssets(a); refresh(); if (pending) onPending(); }
  return <div className="upload-grid">
    <UploadField kind="photo" assets={assets} name={t.name || "Gia sư"} onChange={changed} />
    <UploadField kind="banner" assets={assets} name={t.name || "Gia sư"} onChange={changed} />
  </div>;
}

import { useEffect, useState } from "react";
import {
  Camera,
  FileText,
  Upload,
  Trash2,
  Download,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { Tutor } from "@/lib/types";
import { api } from "@/lib/api";
import { Person, ErrorState, Submit } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel, FieldDescription } from "./ui/field";

type Assets = Pick<Tutor, "photo_url" | "cv">;
function UploadField({
  kind,
  assets,
  name,
  onChange,
}: {
  kind: "photo" | "cv";
  assets: Assets;
  name: string;
  onChange: (a: Assets, pending: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [inputKey, setInputKey] = useState(0);
  const photo = kind === "photo",
    existing = photo ? assets.photo_url : assets.cv?.url;
  useEffect(() => {
    if (!file || !photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, photo]);
  async function upload(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/tutor/uploads/${kind}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tải tệp.");
      onChange(data, true);
      setFile(null);
      setInputKey((k) => k + 1);
      toast.success("Đã tải lên. Hồ sơ sẽ được duyệt lại.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      onChange(await api<Assets>(`/tutor/uploads/${kind}`, "DELETE"), false);
      toast.success("Đã xóa tệp");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="upload-card">
      <div className="upload-card-heading">
        {photo ? <Camera /> : <FileText />}
        <h3>{photo ? "Ảnh đại diện" : "CV của bạn"}</h3>
        {existing && <Check className="upload-check" aria-label="Đã tải lên" />}
      </div>
      {photo ? (
        <div className="upload-preview">
          <Person
            name={name}
            src={preview || assets.photo_url || undefined}
            large
          />
          <p>
            {preview
              ? "Ảnh đã chọn"
              : assets.photo_url
                ? "Ảnh trên hồ sơ"
                : "Thêm ảnh để học sinh nhận ra bạn"}
          </p>
        </div>
      ) : (
        <div className="cv-preview">
          <FileText />
          <div>
            <strong>{file?.name || assets.cv?.name || "Chưa có CV"}</strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(0)} KB`
                : assets.cv
                  ? `${(assets.cv.size / 1024).toFixed(0)} KB · PDF`
                  : "Học vấn, kinh nghiệm và cách dạy"}
            </span>
          </div>
        </div>
      )}
      <form onSubmit={upload} className="upload-form">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`upload-${kind}`}>
            {photo ? "Chọn ảnh đại diện" : "Chọn CV (PDF)"}
          </FieldLabel>
          <div className="file-picker" data-busy={busy}>
            <div aria-hidden="true" className="file-picker-label">
              <Upload />
              <span>{file ? file.name : "Chọn tệp hoặc kéo thả vào đây"}</span>
            </div>
            <Input
              className="file-picker-input"
              key={inputKey}
              id={`upload-${kind}`}
              type="file"
              accept={
                photo ? "image/jpeg,image/png,image/webp" : "application/pdf"
              }
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby={`upload-${kind}-help`}
              onChange={(e) => {
                setError("");
                const f = e.target.files?.[0] || null;
                if (f && f.size > 5 * 1024 * 1024) {
                  setFile(null);
                  setError("Tệp quá lớn. Chọn tệp tối đa 5 MB.");
                  return;
                }
                setFile(f);
              }}
            />
          </div>
          <FieldDescription id={`upload-${kind}-help`}>
            {photo
              ? "JPG, PNG hoặc WebP · tối đa 5 MB"
              : "PDF · tối đa 5 MB, 20 trang. Công khai sau khi duyệt."}
          </FieldDescription>
        </Field>
        {error && <ErrorState error={error} />}
        <div className="actions">
          {file && (
            <Submit busy={busy}>
              <Upload data-icon="inline-start" />
              {photo ? "Lưu ảnh" : "Tải CV lên"}
            </Submit>
          )}
          {existing && (
            <>
              <Button variant="outline" asChild>
                <a href={existing} target="_blank" rel="noreferrer">
                  <Download data-icon="inline-start" />
                  {photo ? "Xem ảnh" : "Tải CV"}
                </a>
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={remove}
                aria-label={photo ? "Xóa ảnh đại diện" : "Xóa CV"}
              >
                <Trash2 data-icon="inline-start" />
                Xóa
              </Button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
export function TutorUploads({
  t,
  onPending,
}: {
  t: Tutor;
  onPending: () => void;
}) {
  const [assets, setAssets] = useState<Assets>({
    photo_url: t.photo_url,
    cv: t.cv,
  });
  return (
    <div className="upload-grid">
      <UploadField
        kind="photo"
        assets={assets}
        name={t.name || "Gia sư"}
        onChange={(a, pending) => {
          setAssets(a);
          if (pending) onPending();
        }}
      />
      <UploadField
        kind="cv"
        assets={assets}
        name={t.name || "Gia sư"}
        onChange={(a, pending) => {
          setAssets(a);
          if (pending) onPending();
        }}
      />
    </div>
  );
}

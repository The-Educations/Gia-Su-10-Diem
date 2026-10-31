import { GallerySocial } from "./gallery-social";
import { useEffect, useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { GalleryPhoto } from "@/lib/types";
import { api, useApp } from "@/lib/api";
import { Blank, ErrorState, Submit } from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel, FieldGroup, FieldDescription } from "./ui/field";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "./ui/dialog";

export function TutorGallery({
  images,
  name,
}: {
  images: GalleryPhoto[];
  name: string;
}) {
  const opener = useRef<HTMLButtonElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const index = images.findIndex((image) => image.id === activeId),
    active = images[index];
  if (!images.length) return null;
  function move(delta: number) {
    setActiveId(images[(index + delta + images.length) % images.length].id);
  }
  return (
    <section className="tutor-gallery" aria-label={`Thư viện ảnh của ${name}`}>
      <div className="section-heading">
        <h2>Góc dạy & học</h2>
        <span className="muted">{images.length} ảnh</span>
      </div>
      <div className="gallery-grid">
        {images.map((image, i) => (
          <button
            key={image.id}
            type="button"
            className="gallery-tile"
            onClick={(e) => {
              opener.current = e.currentTarget;
              setActiveId(image.id);
            }}
            aria-label={`Xem ảnh ${i + 1}: ${image.caption || name}`}
          >
            <img
              src={image.url}
              alt={image.caption || `Ảnh ${i + 1} của ${name}`}
              loading="lazy"
            />
            {image.caption && <span>{image.caption}</span>}
          </button>
        ))}
      </div>
      <Dialog
        open={!!active}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
          className="gallery-viewer"
          onKeyDown={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "input,textarea,[contenteditable]",
              )
            )
              return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              move(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>
              Ảnh {index + 1} / {images.length}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <img
              className="gallery-full-image"
              src={active.url}
              alt={active.caption || `Ảnh của ${name}`}
            />
          )}
          {active?.caption && <p className="reading-text">{active.caption}</p>}
          {active && <GallerySocial key={active.id} imageId={active.id} />}
          {images.length > 1 && (
            <div className="gallery-navigation">
              <Button
                variant="outline"
                onClick={() => move(-1)}
                aria-label="Ảnh trước"
              >
                <ChevronLeft />
                Trước
              </Button>
              <Button
                variant="outline"
                onClick={() => move(1)}
                aria-label="Ảnh tiếp theo"
              >
                Tiếp
                <ChevronRight />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function GalleryEditorItem({
  image,
  index,
  onChange,
}: {
  image: GalleryPhoto;
  index: number;
  onChange: (images: GalleryPhoto[], pending: boolean) => void;
}) {
  const [caption, setCaption] = useState(image.caption),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function update(remove: boolean) {
    setBusy(true);
    setError("");
    try {
      const images = await api<GalleryPhoto[]>(
        `/tutor/gallery/${image.id}`,
        remove ? "DELETE" : "PATCH",
        remove ? undefined : { caption },
      );
      onChange(images, !remove);
      toast.success(
        remove ? "Đã xóa ảnh" : "Đã lưu chú thích. Hồ sơ sẽ được duyệt lại.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="gallery-editor-item">
      <img
        src={image.url}
        alt={image.caption || `Ảnh ${index + 1}`}
        loading="lazy"
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void update(false);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`caption-${image.id}`}>
              Chú thích ảnh {index + 1}
            </FieldLabel>
            <Textarea
              id={`caption-${image.id}`}
              maxLength={500}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={busy}
              rows={3}
            />
          </Field>
          {error && <ErrorState error={error} />}
          <div className="actions">
            <Submit busy={busy}>Lưu chú thích</Submit>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              aria-label={`Xóa ảnh ${index + 1}`}
              onClick={() => void update(true)}
            >
              <Trash2 />
              Xóa
            </Button>
          </div>
        </FieldGroup>
      </form>
    </article>
  );
}

export function TutorGalleryEditor({
  images,
  onPending,
}: {
  images: GalleryPhoto[];
  onPending: () => void;
}) {
  const { refresh } = useApp();
  const [items, setItems] = useState(images),
    [files, setFiles] = useState<File[]>([]),
    [previews, setPreviews] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  useEffect(() => {
    setItems(images);
  }, [images]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  function changed(next: GalleryPhoto[], pending: boolean) {
    setItems(next);
    refresh();
    if (pending) onPending();
  }
  async function upload(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    let completed = 0;
    try {
      for (const file of files) {
        setProgress(`Đang tải ảnh ${completed + 1} / ${files.length}`);
        const response = await fetch("/api/tutor/gallery", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không thể tải ảnh.");
        completed++;
        setItems(data);
      }
      setFiles([]);
      form.reset();
      toast.success("Đã tải ảnh. Hồ sơ sẽ được duyệt lại.");
    } catch (e) {
      setFiles(files.slice(completed));
      setError(
        `${completed ? `Đã lưu ${completed} ảnh. ` : ""}${(e as Error).message}`,
      );
    } finally {
      if (completed) {
        refresh();
        onPending();
      }
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <section className="gallery-editor" aria-label="Quản lý thư viện ảnh">
      <div className="section-heading">
        <h2>
          <Images /> Góc dạy & học
        </h2>
        <span>{items.length} / 12 ảnh</span>
      </div>
      <form onSubmit={upload} className="gallery-upload">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="gallery-files">Thêm ảnh vào hồ sơ</FieldLabel>
            <Input
              id="gallery-files"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || items.length >= 12}
              aria-describedby="gallery-help"
              onChange={(e) => {
                const selected = Array.from(e.target.files || []);
                setError("");
                if (
                  items.length + selected.length > 12 ||
                  selected.some(
                    (file) =>
                      file.size > 5 * 1024 * 1024 ||
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type,
                      ),
                  )
                ) {
                  setFiles([]);
                  e.target.value = "";
                  setError(
                    "Tối đa 12 ảnh; mỗi ảnh JPG, PNG hoặc WebP không quá 5 MB.",
                  );
                  return;
                }
                setFiles(selected);
              }}
            />
            <FieldDescription id="gallery-help">
              JPG, PNG, WebP · 5 MB/ảnh · Công khai sau khi duyệt.
            </FieldDescription>
          </Field>
          {!!files.length && (
            <div className="gallery-selection">
              {previews.map((url, i) => (
                <img key={url} src={url} alt={`Ảnh đã chọn ${i + 1}`} />
              ))}
            </div>
          )}
          {error && <ErrorState error={error} />}
          {progress && <p role="status">{progress}</p>}
          {!!files.length && (
            <Submit busy={busy}>
              <Upload />
              Tải {files.length} ảnh lên
            </Submit>
          )}
        </FieldGroup>
      </form>
      {items.length ? (
        <div className="gallery-editor-grid">
          {items.map((image, index) => (
            <GalleryEditorItem
              key={image.id}
              image={image}
              index={index}
              onChange={changed}
            />
          ))}
        </div>
      ) : (
        <Blank title="Chưa có ảnh trong thư viện" />
      )}
    </section>
  );
}

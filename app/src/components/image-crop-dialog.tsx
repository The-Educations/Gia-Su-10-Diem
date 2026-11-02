import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { ErrorState } from "./common";

// The canvas is both the preview and exported image, so positioning is identical.
export function ImageCropDialog({
  file,
  aspect,
  onCancel,
  onApply,
}: {
  file: File;
  aspect?: number;
  onCancel: () => void;
  onApply: (file: File) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(file),
      img = new Image();
    img.onload = () => {
      if (!active) return;
      if (img.naturalWidth * img.naturalHeight > 16000000) {
        setError("Chọn ảnh không quá 16 megapixel.");
        return;
      }
      setSource(img);
    };
    img.onerror = () => {
      if (active) setError("Không đọc được ảnh. Chọn JPG, PNG hoặc WebP khác.");
    };
    img.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => {
    if (!source || !canvas.current) return;
    const ratio = aspect || source.naturalWidth / source.naturalHeight;
    const width = Math.max(1, Math.round(Math.min(1280, 1280 * ratio)));
    const height = Math.max(1, Math.round(width / ratio));
    const el = canvas.current;
    el.width = width;
    el.height = height;
    const scale =
      Math.max(width / source.naturalWidth, height / source.naturalHeight) *
      zoom;
    const cropWidth = width / scale,
      cropHeight = height / scale;
    const x = ((source.naturalWidth - cropWidth) * position.x) / 100;
    const y = ((source.naturalHeight - cropHeight) * position.y) / 100;
    const context = el.getContext("2d")!;
    context.clearRect(0, 0, width, height);
    context.drawImage(source, x, y, cropWidth, cropHeight, 0, 0, width, height);
  }, [source, aspect, position, zoom]);
  function apply() {
    if (!source || !canvas.current) return;
    setBusy(true);
    setError("");
    canvas.current.toBlob(
      (blob) => {
        setBusy(false);
        if (!blob) {
          setError("Không thể cắt ảnh. Vui lòng thử lại.");
          return;
        }
        onApply(
          new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-crop.webp`, {
            type: "image/webp",
          }),
        );
      },
      "image/webp",
      0.92,
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="crop-dialog" closeDisabled={busy}>
        <DialogHeader>
          <DialogTitle>Điều chỉnh ảnh</DialogTitle>
          <DialogDescription>
            Kéo ảnh hoặc dùng thanh trượt để căn vị trí.
          </DialogDescription>
        </DialogHeader>
        <div className="crop-preview" data-round={aspect === 1}>
          <canvas
            ref={canvas}
            aria-label="Xem trước ảnh sau khi cắt"
            onPointerDown={(e) => {
              if (!source || busy) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                left: position.x,
                top: position.y,
              };
            }}
            onPointerMove={(e) => {
              if (!drag.current || !source) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const scale =
                Math.max(
                  rect.width / source.naturalWidth,
                  rect.height / source.naturalHeight,
                ) * zoom;
              const overflowX = source.naturalWidth * scale - rect.width,
                overflowY = source.naturalHeight * scale - rect.height;
              setPosition({
                x:
                  overflowX > 0.1
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          drag.current.left -
                            ((e.clientX - drag.current.x) * 100) / overflowX,
                        ),
                      )
                    : 50,
                y:
                  overflowY > 0.1
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          drag.current.top -
                            ((e.clientY - drag.current.y) * 100) / overflowY,
                        ),
                      )
                    : 50,
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="crop-zoom">Thu phóng</FieldLabel>
            <input
              id="crop-zoom"
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={!source || busy}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="crop-x">Vị trí ngang</FieldLabel>
            <input
              id="crop-x"
              type="range"
              min="0"
              max="100"
              value={position.x}
              disabled={!source || busy}
              onChange={(e) =>
                setPosition((p) => ({ ...p, x: Number(e.target.value) }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="crop-y">Vị trí dọc</FieldLabel>
            <input
              id="crop-y"
              type="range"
              min="0"
              max="100"
              value={position.y}
              disabled={!source || busy}
              onChange={(e) =>
                setPosition((p) => ({ ...p, y: Number(e.target.value) }))
              }
            />
          </Field>
        </FieldGroup>
        {error && <ErrorState error={error} />}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Hủy
          </Button>
          <Button disabled={!source || busy} onClick={apply}>
            {busy ? "Đang xử lý…" : "Dùng ảnh này"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

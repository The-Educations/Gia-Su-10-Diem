import { useRef, useState } from "react";
import { toast } from "sonner";
import { api, useApp } from "@/lib/api";
import type { CommunityMember } from "@/lib/types";
import { ErrorState, Submit } from "@/components/common";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function ProfileEditor({
  profile,
  close,
}: {
  profile: CommunityMember;
  close: () => void;
}) {
  const { user, setUser, refresh } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const saving = useRef(false);
  const [bio, setBio] = useState(profile.bio);
  const [crop, setCrop] = useState<{
    file: File;
    kind: "avatar" | "cover";
  } | null>(null);
  async function image(kind: "avatar" | "cover", file?: File) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      if (file) {
        const response = await fetch(`/api/community/me/${kind}`, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không thể tải ảnh.");
      } else await api(`/community/me/${kind}`, "DELETE");
      refresh();
      toast.success(file ? "Đã cập nhật ảnh" : "Đã xóa ảnh");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !saving.current && !crop) close();
        }}
      >
        <DialogContent
          className="community-profile-editor"
          closeDisabled={busy}
        >
          <DialogHeader>
            <DialogTitle>Chỉnh sửa hồ sơ</DialogTitle>
            <DialogDescription className="sr-only">
              Ảnh và giới thiệu trong cộng đồng
            </DialogDescription>
          </DialogHeader>
          <div className="member-image-fields">
            {(["avatar", "cover"] as const).map((kind) => (
              <Field key={kind}>
                <FieldLabel htmlFor={`member-${kind}`}>
                  {kind === "avatar" ? "Ảnh đại diện" : "Ảnh bìa"}
                </FieldLabel>
                <Input
                  id={`member-${kind}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type,
                      ) ||
                      file.size > 5 * 1024 * 1024
                    ) {
                      setError("Chọn ảnh JPG, PNG hoặc WebP tối đa 5 MB.");
                      return;
                    }
                    setError("");
                    setCrop({ file, kind });
                  }}
                />
                {(kind === "avatar"
                  ? profile.has_avatar
                  : profile.has_cover) && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => image(kind)}
                  >
                    {kind === "avatar" ? "Xóa ảnh đại diện" : "Xóa ảnh bìa"}
                  </Button>
                )}
              </Field>
            ))}
          </div>
          <p className="member-image-notice">
            Dùng ảnh phù hợp, không chứa thông tin liên hệ, ảnh người khác hoặc
            nội dung phản cảm. Tối đa 5 MB.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving.current) return;
              saving.current = true;
              setBusy(true);
              setError("");
              const display_name = String(
                new FormData(e.currentTarget).get("display_name"),
              );
              try {
                await api("/community/me/profile", "PUT", {
                  display_name,
                  bio,
                });
                if (user) setUser({ ...user, display_name });
                refresh();
                toast.success("Đã lưu hồ sơ");
                close();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                saving.current = false;
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="member-name">Tên hiển thị</FieldLabel>
                <Input
                  id="member-name"
                  name="display_name"
                  defaultValue={
                    profile.display_name ||
                    user?.name.trim().split(/\s+/).at(-1)
                  }
                  minLength={2}
                  maxLength={30}
                  required
                  disabled={busy}
                />
                {["admin", "tutor"].includes(profile.tier) && (
                  <p>Bạn đang hiển thị bằng họ tên thật.</p>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="member-bio">
                  Giới thiệu <span>{bio.length}/300</span>
                </FieldLabel>
                <Textarea
                  id="member-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={300}
                  rows={4}
                  disabled={busy}
                />
              </Field>
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>Lưu hồ sơ</Submit>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      {crop && (
        <ImageCropDialog
          file={crop.file}
          aspect={crop.kind === "avatar" ? 1 : 4}
          onCancel={() => setCrop(null)}
          onApply={(file) => {
            const kind = crop.kind;
            setCrop(null);
            void image(kind, file);
          }}
        />
      )}
    </>
  );
}

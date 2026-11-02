import { useId, useState } from "react";
import { toast } from "sonner";
import { api, useApp } from "@/lib/api";
import type { CommunityPostData } from "@/lib/types";
import { ErrorState, Submit } from "@/components/common";
import { Input } from "@/components/ui/input";
import RichEditor, { plainToHtml } from "./RichEditor";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export const POST_NOTICE =
  "Chỉ đăng nội dung về học tập — tìm gia sư, xin review, kinh nghiệm học, trò chuyện và chia sẻ kiến thức. Bài không liên quan đến giáo dục sẽ không được đăng. Bài được quản trị viên đọc và duyệt trước khi hiện, và sau khi được duyệt sẽ hiển thị công khai (có thể xuất hiện trên Google). Đừng ghi số điện thoại, email, Zalo hay địa chỉ nhà.";
export default function Compose({
  post,
  close,
  saved,
  endpoint,
}: {
  post?: CommunityPostData;
  close: () => void;
  saved: (post: CommunityPostData) => void;
  endpoint?: string;
}) {
  const { user, refresh } = useApp(),
    id = useId();
  const [title, setTitle] = useState(post?.revision_title || post?.title || ""),
    [body, setBody] = useState(
      post?.revision_status ? post.revision_body || "" : post?.body || "",
    );
  const [html, setHtml] = useState(
    post?.revision_body_html ||
      (post?.revision_body
        ? plainToHtml(post.revision_body)
        : post?.body_html) ||
      plainToHtml(post?.body || ""),
  );
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !uploading) close();
      }}
    >
      <DialogContent className="community-compose">
        <DialogHeader>
          <DialogTitle>
            {endpoint?.endsWith("rules")
              ? "Sửa Quy tắc cộng đồng"
              : post
                ? "Sửa bài viết"
                : user?.role === "admin"
                  ? "Đăng thông báo"
                  : "Đăng bài"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Soạn nội dung cộng đồng
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertDescription>
            <span>
              <strong>Lưu ý: </strong>
              {POST_NOTICE}
            </span>
          </AlertDescription>
        </Alert>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (uploading || busy) return;
            setBusy(true);
            setError("");
            setFields({});
            try {
              const d = await api<CommunityPostData>(
                endpoint ||
                  (post ? `/community/posts/${post.id}` : "/community/posts"),
                post || endpoint?.endsWith("rules") ? "PUT" : "POST",
                { title, body, body_html: html },
              );
              refresh();
              toast.success(
                user?.role === "admin"
                  ? "Đã lưu nội dung"
                  : "Đã gửi bài chờ duyệt",
              );
              saved(d);
              close();
            } catch (e) {
              const problem = e as Error & {
                fields?: { path: string; message: string }[];
              };
              const errors = Object.fromEntries(
                (problem.fields || []).map((f) => [f.path, f.message]),
              );
              setFields(errors);
              setError(Object.keys(errors).length ? "" : problem.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FieldGroup>
            <Field data-invalid={!!fields.title}>
              <FieldLabel htmlFor={`${id}-title`}>Tiêu đề</FieldLabel>
              <Input
                aria-invalid={!!fields.title}
                aria-describedby={
                  fields.title ? `${id}-title-error` : undefined
                }
                id={`${id}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
              />
              {fields.title && (
                <p
                  id={`${id}-title-error`}
                  role="alert"
                  className="text-destructive"
                >
                  {fields.title}
                </p>
              )}
              <span className="community-counter">{title.length}/120</span>
            </Field>
            <Field data-invalid={!!fields.body}>
              <FieldLabel htmlFor={`${id}-body`}>Nội dung</FieldLabel>
              <RichEditor
                id={`${id}-body`}
                initial={html}
                invalid={!!fields.body}
                errorId={fields.body ? `${id}-body-error` : undefined}
                uploading={setUploading}
                change={(html, text) => {
                  setHtml(html);
                  setBody(text);
                }}
              />
              {fields.body && (
                <p
                  id={`${id}-body-error`}
                  role="alert"
                  className="text-destructive"
                >
                  {fields.body}
                </p>
              )}
              <span className="community-counter">{body.length}/5000</span>
            </Field>
            {error && <ErrorState error={error} />}
            <div className="community-compose-footer">
              <span>
                {user?.role === "admin"
                  ? "Nội dung được công khai ngay."
                  : "Bài được duyệt sẽ công khai, có thể xuất hiện trên Google."}
              </span>
              <Submit busy={busy || uploading}>
                {user?.role === "admin"
                  ? "Lưu và công khai"
                  : "Gửi bài chờ duyệt"}
              </Submit>
            </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

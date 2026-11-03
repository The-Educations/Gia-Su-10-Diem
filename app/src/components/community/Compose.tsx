import { useEffect, useId, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api, useApp } from "@/lib/api";
import type { CommunityPostData, CommunityDraft } from "@/lib/types";
import { ErrorState, Submit } from "@/components/common";
import { Input } from "@/components/ui/input";
import { useCommunityGate } from "./shared";
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
  page = false,
  draft,
}: {
  post?: CommunityPostData;
  close: () => void;
  saved: (post: CommunityPostData) => void;
  endpoint?: string;
  page?: boolean;
  draft?: CommunityDraft;
}) {
  const { user, refresh } = useApp(),
    id = useId();
  const [title, setTitle] = useState(
      draft?.title || post?.revision_title || post?.title || "",
    ),
    [body, setBody] = useState(
      draft?.body ||
        (post?.revision_status ? post.revision_body || "" : post?.body || ""),
    );
  const [html, setHtml] = useState(
    draft?.body_html ||
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
  const navigate = useNavigate();
  const gate = useCommunityGate();
  const [savedDraft, setSavedDraft] = useState(draft);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!page) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [page]);
  const heading = endpoint?.endsWith("rules")
    ? "Sửa Quy tắc cộng đồng"
    : post
      ? "Sửa bài viết"
      : user?.role === "admin"
        ? "Viết bài"
        : "Đăng bài";
  const blocker = useBlocker(() => page && dirtyRef.current);
  const saveDraft = async () => {
    if (busy || uploading) return;
    setBusy(true);
    setError("");
    setFields({});
    try {
      const d = await api<CommunityDraft>(
        savedDraft ? `/community/drafts/${savedDraft.id}` : "/community/drafts",
        savedDraft ? "PUT" : "POST",
        { title, body_html: html, version: savedDraft?.version },
      );
      setSavedDraft(d);
      setDirty(false);
      dirtyRef.current = false;
      toast.success("Đã lưu bản nháp");
      navigate(`/community/write?draft=${d.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const notice = (
    <Alert>
      <AlertDescription>
        <span>
          <strong>Lưu ý: </strong>
          {POST_NOTICE}
        </span>
      </AlertDescription>
    </Alert>
  );
  const form = (
    <>
      {page ? (
        <details className="community-write-rules">
          <summary>Quy tắc đăng bài</summary>
          {notice}
        </details>
      ) : (
        notice
      )}
      <form
        inert={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          if (uploading || busy) return;
          gate.run(async () => {
            setBusy(true);
            setError("");
            setFields({});
            try {
              const d = await api<CommunityPostData>(
                endpoint ||
                  (post ? `/community/posts/${post.id}` : "/community/posts"),
                post || endpoint?.endsWith("rules") ? "PUT" : "POST",
                {
                  title,
                  body,
                  body_html: html,
                  ...(savedDraft
                    ? {
                        draft_id: savedDraft.id,
                        draft_version: savedDraft.version,
                      }
                    : {}),
                },
              );
              setDirty(false);
              dirtyRef.current = false;
              refresh();
              toast.success(
                user?.role === "admin"
                  ? "Đã lưu nội dung"
                  : "Đã gửi bài chờ duyệt",
              );
              saved(d);
              if (!page) close();
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
          }, true);
        }}
      >
        <FieldGroup>
          <Field data-invalid={!!fields.title}>
            <FieldLabel htmlFor={`${id}-title`}>Tiêu đề</FieldLabel>
            <Input
              aria-invalid={!!fields.title}
              aria-describedby={fields.title ? `${id}-title-error` : undefined}
              id={`${id}-title`}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
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
                setDirty(true);
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
            {!page && (
              <span>
                {user?.role === "admin"
                  ? "Nội dung được công khai ngay."
                  : "Bài được duyệt sẽ công khai, có thể xuất hiện trên Google."}
              </span>
            )}
            {page && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || uploading}
                onClick={saveDraft}
              >
                Lưu nháp
              </Button>
            )}
            <Submit busy={busy || uploading}>
              {user?.role === "admin"
                ? "Lưu và công khai"
                : "Gửi bài chờ duyệt"}
            </Submit>
          </div>
        </FieldGroup>
      </form>
    </>
  );
  if (page)
    return (
      <section className="community-write" aria-label={heading}>
        <header className="community-write-header">
          <Button variant="ghost" disabled={busy || uploading} onClick={close}>
            ← Bài của tôi
          </Button>
          <span role="status">
            {busy
              ? "Đang lưu…"
              : dirty
                ? "Chưa lưu"
                : savedDraft
                  ? "Đã lưu nháp"
                  : "Bản nháp mới"}
          </span>
        </header>
        <h1>{heading}</h1>
        {form}
        {gate.dialog}
        <Dialog
          open={blocker.state === "blocked"}
          onOpenChange={(open) => {
            if (!open && blocker.state === "blocked") blocker.reset();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bản nháp chưa được lưu</DialogTitle>
              <DialogDescription>
                Lưu nháp trước khi rời trang để giữ nội dung.
              </DialogDescription>
            </DialogHeader>
            <div className="community-compose-footer">
              <Button
                variant="outline"
                onClick={() => blocker.state === "blocked" && blocker.reset()}
              >
                Tiếp tục viết
              </Button>
              <Button
                variant="destructive"
                onClick={() => blocker.state === "blocked" && blocker.proceed()}
              >
                Rời trang
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !uploading) close();
      }}
    >
      <DialogContent className="community-compose">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription className="sr-only">
            Soạn nội dung cộng đồng
          </DialogDescription>
        </DialogHeader>
        {form}
        {gate.dialog}
      </DialogContent>
    </Dialog>
  );
}

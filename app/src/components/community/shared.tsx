import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Pin, MessageCircle, ThumbsUp, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, dateTime, accountDestination } from "@/lib/api";
import type { CommunityAuthor, CommunityPostData } from "@/lib/types";
import { Person, ErrorState, Submit } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function AuthorLabel({ author }: { author: CommunityAuthor }) {
  return (
    <span className="community-author">
      <Person name={author.name_part} />
      {author.tier === "tutor" ? (
        <Link className="text-link" to={`/tutors/${author.tutor_id}`}>
          {author.label}
        </Link>
      ) : author.tier === "admin" ? (
        <Badge variant="secondary">
          <ShieldCheck aria-hidden="true" />
          {author.label}
        </Badge>
      ) : (
        <strong>{author.label}</strong>
      )}
    </span>
  );
}
export function ReadMore({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null),
    id = useId();
  const [expanded, setExpanded] = useState(false),
    [long, setLong] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () =>
      setLong(
        node.scrollHeight >
          parseFloat(getComputedStyle(node).lineHeight) * 6 + 1,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [text]);
  return (
    <div>
      <div
        id={id}
        ref={ref}
        className={`community-body${expanded ? "" : " community-clamped"}`}
      >
        {text}
      </div>
      {long && (
        <Button
          variant="link"
          className="community-read-more"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Thu gọn" : "Xem thêm"}
        </Button>
      )}
    </div>
  );
}
export const postStates: Record<string, string> = {
  pending: "Đang chờ duyệt",
  approved: "Đã đăng",
  rejected: "Bị từ chối",
  hidden: "Đã bị ẩn",
  deleted: "Đã xóa",
};
export function ReviewState({ post }: { post: CommunityPostData }) {
  return (
    <>
      {post.status && post.status !== "approved" && (
        <p className="community-review-state">
          <Badge variant="outline">{postStates[post.status]}</Badge>
          {post.review_note && <span>{post.review_note}</span>}
        </p>
      )}
      {post.revision_status && (
        <p className="community-review-state">
          <Badge variant="outline">
            {post.revision_status === "pending"
              ? "Bản sửa đang chờ duyệt"
              : "Bản sửa bị từ chối"}
          </Badge>
          {post.revision_note && <span>{post.revision_note}</span>}
        </p>
      )}
    </>
  );
}
export function PostCard({ post }: { post: CommunityPostData }) {
  const rules = post.kind === "rules";
  return (
    <article className={`community-card${rules ? " community-rules" : ""}`}>
      <div className="community-card-meta">
        {rules ? (
          <span className="community-pin">
            <Pin size={16} aria-hidden="true" />
            Ghim
          </span>
        ) : (
          <AuthorLabel author={post.author} />
        )}
        {post.published_at && !rules && (
          <time dateTime={post.published_at}>
            {dateTime(post.published_at)}
          </time>
        )}
      </div>
      <h2>
        {post.id ? (
          <Link to={`/community/${post.id}`}>{post.title}</Link>
        ) : (
          post.title
        )}
      </h2>
      <ReviewState post={post} />
      <ReadMore text={post.body} />
      {!rules && (
        <div className="community-card-footer">
          <Link to={`/community/${post.id}`}>
            <MessageCircle size={16} aria-hidden="true" />
            {post.comment_count} bình luận
          </Link>
          <span>
            <ThumbsUp size={16} aria-hidden="true" />
            {post.helpful_count} hữu ích
          </span>
          {post.solved && (
            <Badge variant="secondary">
              <Check aria-hidden="true" />
              Đã giải quyết
            </Badge>
          )}
        </div>
      )}
    </article>
  );
}
export function useCommunityGate() {
  const { user, setUser } = useApp(),
    loc = useLocation(),
    navigate = useNavigate();
  const [guest, setGuest] = useState(false),
    [naming, setNaming] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<(() => void) | null>(null);
  const run = (action: () => void, needsName = false, allowLocked = false) => {
    if (!user) {
      setGuest(true);
      return;
    }
    if (user.email_verification_required) {
      navigate(accountDestination(user, loc.pathname + loc.search));
      return;
    }
    if (user.community_locked && !allowLocked) {
      toast.error(
        `Quyền đăng bài của bạn đang bị khóa: ${user.community_lock_reason}`,
      );
      return;
    }
    if (needsName && user.role !== "admin" && !user.display_name) {
      pending.current = action;
      setError("");
      setNaming(true);
      return;
    }
    action();
  };
  const dialog = (
    <>
      <Dialog open={guest} onOpenChange={setGuest}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tham gia cộng đồng</DialogTitle>
            <DialogDescription>
              Đăng nhập hoặc tạo tài khoản để viết bài và bình luận.
            </DialogDescription>
          </DialogHeader>
          <Button asChild>
            <Link
              to={`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`}
            >
              Đăng nhập / Tạo tài khoản
            </Link>
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={naming}
        onOpenChange={(open) => {
          if (!busy) setNaming(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tên hiển thị của bạn</DialogTitle>
            <DialogDescription>
              Tên này sẽ xuất hiện công khai trong cộng đồng.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const name = String(
                new FormData(e.currentTarget).get("display_name"),
              );
              try {
                const d = await api<{ display_name: string }>(
                  "/community/me/display-name",
                  "PUT",
                  { display_name: name },
                );
                if (user) setUser({ ...user, display_name: d.display_name });
                setNaming(false);
                pending.current?.();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="community-name">Tên hiển thị</FieldLabel>
                <Input
                  id="community-name"
                  name="display_name"
                  defaultValue={user?.name.trim().split(/\s+/).at(-1)}
                  minLength={2}
                  maxLength={30}
                  required
                />
              </Field>
              {error && <ErrorState error={error} />}
              <Submit busy={busy}>Lưu tên và tiếp tục</Submit>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
  return { run, dialog };
}

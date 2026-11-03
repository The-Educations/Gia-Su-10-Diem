import { useState } from "react";
import { Check, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, dateTime } from "@/lib/api";
import type { CommunityComment, CommunityPostData } from "@/lib/types";
import { Loading, ErrorState, Blank, Submit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { AuthorLabel, ReadMore, useCommunityGate } from "./shared";
import ActionDialog, { type CommunityAction } from "./ActionDialog";

type CommentPage = {
  items: CommunityComment[];
  best: CommunityComment | null;
  more: boolean;
  next: number;
};
function CommentForm({
  postId,
  parentId,
  initial = "",
  commentId,
  done,
}: {
  postId: number;
  parentId?: number;
  initial?: string;
  commentId?: number;
  done: () => void;
}) {
  const [body, setBody] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { refresh } = useApp(),
    gate = useCommunityGate();
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api(
        commentId
          ? `/community/comments/${commentId}`
          : `/community/posts/${postId}/comments`,
        commentId ? "PATCH" : "POST",
        { body, parent_id: parentId },
      );
      setBody("");
      refresh();
      toast.success(commentId ? "Đã sửa bình luận" : "Đã gửi bình luận");
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="community-comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        gate.run(() => {
          void submit();
        }, true);
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel
            htmlFor={`comment-text-${commentId || parentId || "new"}`}
          >
            {commentId ? "Sửa bình luận" : parentId ? "Trả lời" : "Bình luận"}
          </FieldLabel>
          <Textarea
            id={`comment-text-${commentId || parentId || "new"}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={3}
            required
            placeholder="Chia sẻ ý kiến của bạn…"
          />
          <span className="community-counter">{body.length}/1000</span>
        </Field>
        {error && <ErrorState error={error} />}
        <div className="community-actions">
          {(commentId || parentId) && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={done}
            >
              Hủy
            </Button>
          )}
          <Submit busy={busy}>
            {commentId ? "Lưu bình luận" : "Gửi bình luận"}
          </Submit>
        </div>
      </FieldGroup>
      {gate.dialog}
    </form>
  );
}
function CommentItem({
  comment: c,
  post,
  best = false,
}: {
  comment: CommunityComment;
  post: CommunityPostData;
  best?: boolean;
}) {
  const { user, refresh } = useApp(),
    gate = useCommunityGate();
  const [reply, setReply] = useState(false),
    [edit, setEdit] = useState(false),
    [allReplies, setAllReplies] = useState(false),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState<CommunityAction | null>(null);
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      await api(path, method, body);
      refresh();
      toast.success("Đã cập nhật");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={`community-comment${best ? " community-best" : ""}`}
      id={`comment-${c.id}`}
    >
      {best && (
        <Badge variant="secondary">
          <Check aria-hidden="true" />
          Câu trả lời hay nhất
        </Badge>
      )}
      {c.removed ? (
        <p className="community-removed">
          {c.removed_by_admin
            ? "Bình luận đã bị quản trị viên gỡ"
            : "Bình luận đã bị gỡ"}
        </p>
      ) : (
        <>
          <div className="community-card-meta">
            {c.author && <AuthorLabel author={c.author} />}
            <time>
              {dateTime(c.created_at)}
              {c.edited ? " · đã sửa" : ""}
            </time>
          </div>
          {edit ? (
            <CommentForm
              postId={post.id}
              initial={c.body}
              commentId={c.id}
              done={() => setEdit(false)}
            />
          ) : (
            <ReadMore text={c.body} />
          )}
          <div className="community-comment-actions">
            {user?.role !== "admin" && !c.mine ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-pressed={c.helpful_by_me}
                onClick={() =>
                  gate.run(() => {
                    void mutate(
                      `/community/comments/${c.id}/helpful`,
                      c.helpful_by_me ? "DELETE" : "PUT",
                    );
                  })
                }
              >
                <ThumbsUp data-icon="inline-start" />
                Hữu ích ({c.helpful_count})
              </Button>
            ) : (
              <span>{c.helpful_count} hữu ích</span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => gate.run(() => setReply(!reply), true)}
            >
              Trả lời
            </Button>
            {c.mine && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => gate.run(() => setEdit(!edit))}
                >
                  Sửa
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    gate.run(() =>
                      setAction({
                        title: "Xóa bình luận",
                        path: `/community/comments/${c.id}`,
                        method: "DELETE",
                      }),
                    )
                  }
                >
                  Xóa
                </Button>
              </>
            )}
            {post.mine && !c.mine && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  gate.run(() => {
                    void mutate(`/community/posts/${post.id}/solve`, "POST", {
                      solved: post.solved,
                      best_comment_id:
                        post.best_comment_id === c.id ? null : c.id,
                    });
                  })
                }
              >
                {post.best_comment_id === c.id
                  ? "Bỏ câu trả lời hay nhất"
                  : "Chọn câu trả lời hay nhất"}
              </Button>
            )}
            {user?.role === "admin" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setAction({
                    title: "Gỡ bình luận",
                    path: `/admin/community/comments/${c.id}`,
                    method: "DELETE",
                    reasonField: "note",
                  })
                }
              >
                Gỡ bình luận
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  gate.run(() =>
                    setAction({
                      title: "Báo cáo bình luận",
                      path: "/community/reports",
                      method: "POST",
                      body: { target_type: "comment", target_id: c.id },
                      report: true,
                    }),
                  )
                }
              >
                Báo cáo
              </Button>
            )}
          </div>
          {reply && (
            <CommentForm
              postId={post.id}
              parentId={c.id}
              done={() => setReply(false)}
            />
          )}
        </>
      )}
      {!!c.replies?.length && (
        <div className="community-replies">
          {(allReplies ? c.replies : c.replies.slice(0, 3)).map((r) =>
            r.id === post.best_comment_id ? null : (
              <CommentItem key={r.id} comment={r} post={post} />
            ),
          )}
          {c.replies.length > 3 && (
            <Button
              variant="link"
              onClick={() => setAllReplies(!allReplies)}
              aria-expanded={allReplies}
            >
              {allReplies
                ? "Thu gọn trả lời"
                : `Xem thêm trả lời (${c.replies.length - 3})`}
            </Button>
          )}
        </div>
      )}
      {action && <ActionDialog action={action} close={() => setAction(null)} />}
      {gate.dialog}
    </article>
  );
}
function CommentPages({
  post,
  after = 0,
}: {
  post: CommunityPostData;
  after?: number;
}) {
  const result = useLoad<CommentPage>(
      `/community/posts/${post.id}/comments?after=${after}`,
    ),
    [more, setMore] = useState(false);
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={result.reload} />;
  const d = result.data!;
  return (
    <>
      {after === 0 && d.best && (
        <CommentItem comment={d.best} post={post} best />
      )}
      {after === 0 && !d.items.length && <Blank title="Chưa có bình luận" />}
      {d.items.map((c) =>
        c.id === d.best?.id ? (
          <div key={c.id} className="community-replies">
            {c.replies
              ?.filter((r) => r.id !== d.best?.id)
              .map((r) => (
                <CommentItem key={r.id} comment={r} post={post} />
              ))}
          </div>
        ) : (
          <CommentItem key={c.id} comment={c} post={post} />
        ),
      )}
      {d.more &&
        (more ? (
          <CommentPages post={post} after={d.next} />
        ) : (
          <Button variant="outline" onClick={() => setMore(true)}>
            Tải thêm bình luận
          </Button>
        ))}
    </>
  );
}
export default function CommentThread({ post }: { post: CommunityPostData }) {
  const { user } = useApp(),
    gate = useCommunityGate();
  return (
    <section className="community-discussion">
      <h2>Bình luận ({post.comment_count})</h2>
      {user ? (
        <CommentForm postId={post.id} done={() => {}} />
      ) : (
        <Button variant="outline" onClick={() => gate.run(() => {})}>
          Đăng nhập để bình luận
        </Button>
      )}
      <CommentPages post={post} />
      {gate.dialog}
    </section>
  );
}

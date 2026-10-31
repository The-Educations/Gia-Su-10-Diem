import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Heart, Trash2 } from "lucide-react";
import { api, useApp, useLoad, dateTime } from "@/lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Field, FieldLabel, FieldGroup } from "./ui/field";
import { ErrorState, Loading, Submit } from "./common";

type Social = {
  likes: number;
  liked: boolean;
  comment_count: number;
  can_interact: boolean;
  can_moderate: boolean;
  next: number | null;
  comments: {
    id: number;
    student_id: number;
    name: string;
    body: string;
    created_at: string;
  }[];
};

export function GallerySocial({ imageId }: { imageId: string }) {
  const { user } = useApp(),
    location = useLocation();
  const [before, setBefore] = useState<number | null>(null),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const social = useLoad<Social>(
    `/gallery/${imageId}/social${before ? `?before=${before}` : ""}`,
  );
  async function mutate(path: string, method: string, data?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(`/gallery/${imageId}/${path}`, method, data);
      if (method === "POST") {
        setBody("");
        setBefore(null);
      }
      social.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (social.loading) return <Loading />;
  if (social.error || !social.data)
    return <ErrorState error={social.error} retry={social.reload} />;
  const data = social.data;
  return (
    <section className="gallery-social" aria-label="Lượt thích và bình luận">
      <div className="gallery-social-summary">
        <Button
          variant={data.liked ? "secondary" : "outline"}
          disabled={busy || social.refreshing || !data.can_interact}
          aria-pressed={data.liked}
          onClick={() => void mutate("like", data.liked ? "DELETE" : "PUT")}
        >
          <Heart fill={data.liked ? "currentColor" : "none"} />
          {data.liked ? "Đã thích" : "Thích"} · {data.likes}
        </Button>
        <span>{data.comment_count} bình luận</span>
      </div>
      {error && <ErrorState error={error} />}
      {data.can_interact && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate("comments", "POST", { body });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`comment-${imageId}`}>
                Bình luận công khai
              </FieldLabel>
              <Textarea
                id={`comment-${imageId}`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                maxLength={1000}
                rows={2}
                disabled={busy}
              />
            </Field>
            <Submit busy={busy}>Gửi bình luận</Submit>
          </FieldGroup>
        </form>
      )}
      {!user && (
        <Button variant="link" asChild>
          <Link to={`/auth?next=${encodeURIComponent(location.pathname)}`}>
            Đăng nhập để thích và bình luận
          </Link>
        </Button>
      )}
      <div className="gallery-comments">
        {data.comments.map((comment) => (
          <article key={comment.id}>
            <div className="gallery-comment-heading">
              <strong>{comment.name}</strong>
              <time>{dateTime(comment.created_at)}</time>
              {(data.can_moderate || user?.id === comment.student_id) && (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Xóa bình luận của ${comment.name}`}
                  onClick={() =>
                    void mutate(`comments/${comment.id}`, "DELETE")
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <p className="reading-text">{comment.body}</p>
          </article>
        ))}
        {!data.comment_count && <p className="muted">Chưa có bình luận.</p>}
      </div>
      <div className="actions">
        {before && (
          <Button variant="ghost" onClick={() => setBefore(null)}>
            Bình luận mới nhất
          </Button>
        )}
        {data.next && (
          <Button variant="outline" onClick={() => setBefore(data.next)}>
            Bình luận trước
          </Button>
        )}
      </div>
    </section>
  );
}

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { api, useApp, useLoad, dateTime } from "@/lib/api";
import type { CommunityPostData } from "@/lib/types";
import { Page, Loading, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AuthorLabel,
  ReviewState,
  useCommunityGate,
} from "@/components/community/shared";
import Compose from "@/components/community/Compose";
import CommentThread from "@/components/community/CommentThread";
import ActionDialog, {
  type CommunityAction,
} from "@/components/community/ActionDialog";
export default function CommunityPost() {
  const { id } = useParams(),
    { user, refresh } = useApp(),
    navigate = useNavigate(),
    gate = useCommunityGate();
  const result = useLoad<CommunityPostData>(`/community/posts/${id}`),
    [edit, setEdit] = useState(false),
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
  if (result.loading) return <Loading />;
  if (result.error || !result.data)
    return (
      <div className="community-page">
        <Link className="text-link" to="/community">
          ← Cộng đồng
        </Link>
        <ErrorState
          error={result.error || "Không tìm thấy bài viết."}
          retry={result.reload}
        />
      </div>
    );
  const p = result.data,
    live = p.public,
    editable = p.mine && p.kind !== "rules" && p.status !== "hidden";
  return (
    <Page>
      <div className="community-page">
        <Link className="text-link" to="/community">
          ← Cộng đồng
        </Link>
        <article className="community-card community-detail">
          <div className="community-card-meta">
            <AuthorLabel author={p.author} />
            {p.published_at && <time>{dateTime(p.published_at)}</time>}
          </div>
          <h1>{p.title}</h1>
          <ReviewState post={p} />
          {p.solved && (
            <Badge variant="secondary">
              <Check aria-hidden="true" />
              Đã giải quyết
            </Badge>
          )}
          <div className="community-body">{p.body}</div>
          <div className="community-actions">
            {live && (
              <Button
                variant="outline"
                disabled={busy}
                aria-pressed={p.following}
                onClick={() =>
                  gate.run(
                    () => {
                      void mutate(
                        `/community/posts/${id}/follow`,
                        p.following ? "DELETE" : "PUT",
                      );
                    },
                    false,
                    true,
                  )
                }
              >
                <Bookmark data-icon="inline-start" />
                {p.following ? "Bỏ theo dõi" : "Theo dõi"}
              </Button>
            )}
            {live && user?.role !== "admin" && (
              <Button
                variant="ghost"
                onClick={() =>
                  gate.run(() =>
                    setAction({
                      title: "Báo cáo bài viết",
                      path: "/community/reports",
                      method: "POST",
                      body: { target_type: "post", target_id: p.id },
                      report: true,
                    }),
                  )
                }
              >
                Báo cáo
              </Button>
            )}
            {editable && (
              <>
                <Button
                  variant="outline"
                  onClick={() => gate.run(() => setEdit(true))}
                >
                  {p.status === "rejected" ? "Sửa và gửi lại" : "Sửa bài"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    gate.run(() =>
                      setAction({
                        title: "Xóa bài viết",
                        path: `/community/posts/${id}`,
                        method: "DELETE",
                      }),
                    )
                  }
                >
                  Xóa bài
                </Button>
                {live && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    aria-pressed={p.solved}
                    onClick={() =>
                      gate.run(() => {
                        void mutate(`/community/posts/${id}/solve`, "POST", {
                          solved: !p.solved,
                        });
                      })
                    }
                  >
                    {p.solved
                      ? "Bỏ đánh dấu đã giải quyết"
                      : "Đánh dấu đã giải quyết"}
                  </Button>
                )}
                {p.revision_status && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      gate.run(() =>
                        setAction({
                          title: "Hủy bản sửa",
                          path: `/community/posts/${id}/revision`,
                          method: "DELETE",
                        }),
                      )
                    }
                  >
                    Hủy bản sửa
                  </Button>
                )}
              </>
            )}
            {user?.role === "admin" && p.kind !== "rules" && (
              <Button
                variant="outline"
                onClick={() =>
                  setAction({
                    title: p.status === "hidden" ? "Khôi phục bài" : "Ẩn bài",
                    path: `/admin/community/posts/${id}/${p.status === "hidden" ? "restore" : "hide"}`,
                    method: "POST",
                    ...(p.status === "hidden"
                      ? {}
                      : { reasonField: "note" as const }),
                  })
                }
              >
                {p.status === "hidden" ? "Khôi phục bài" : "Ẩn bài"}
              </Button>
            )}
          </div>
          {p.mine && p.revision_body && (
            <details className="community-revision">
              <summary>Xem bản sửa</summary>
              <h2>{p.revision_title}</h2>
              <div className="community-body">{p.revision_body}</div>
            </details>
          )}
        </article>
        {live && <CommentThread post={p} />}
        {edit && (
          <Compose
            post={p}
            close={() => setEdit(false)}
            saved={() => result.reload()}
          />
        )}
        {action && (
          <ActionDialog
            action={action}
            close={() => setAction(null)}
            done={() => {
              if (
                action.path === `/community/posts/${id}` &&
                action.method === "DELETE"
              )
                navigate("/community/mine");
            }}
          />
        )}
        {gate.dialog}
      </div>
    </Page>
  );
}

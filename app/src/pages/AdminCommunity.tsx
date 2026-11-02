import { useState } from "react";
import { Link } from "react-router-dom";
import { useLoad } from "@/lib/api";
import type {
  CommunityOwner,
  CommunityPostData,
  CommunityReview,
} from "@/lib/types";
import { Loading, ErrorState, Blank, Choose } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Compose from "@/components/community/Compose";
import ActionDialog, {
  type CommunityAction,
} from "@/components/community/ActionDialog";
import { postStates } from "@/components/community/shared";

export function CommunityLock({ owner }: { owner: CommunityOwner }) {
  const [action, setAction] = useState<CommunityAction | null>(null);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setAction({
            title: owner.community_locked
              ? "Mở quyền Cộng đồng"
              : "Khóa quyền Cộng đồng",
            path: `/admin/community/users/${owner.id}/lock`,
            method: "PATCH",
            body: { locked: !owner.community_locked },
            reasonField: "reason",
          })
        }
      >
        {owner.community_locked ? "Mở quyền Cộng đồng" : "Khóa quyền Cộng đồng"}
      </Button>
      {action && <ActionDialog action={action} close={() => setAction(null)} />}
    </>
  );
}
function Owner({ owner }: { owner: CommunityOwner }) {
  return (
    <div className="community-review-owner">
      <div>
        <strong>{owner.name}</strong>
        <span>{owner.email}</span>
        {!!owner.community_locked && (
          <Badge variant="outline">Đã khóa quyền Cộng đồng</Badge>
        )}
      </div>
      <CommunityLock owner={owner} />
    </div>
  );
}
type Report = {
  id: number;
  target_id: number;
  target_type: "post" | "comment";
  reason: string;
  detail: string;
  report_count: number;
  target: {
    title?: string;
    body: string;
    post_id?: number;
    status: string;
  } | null;
  owner: CommunityOwner | null;
};
export default function AdminCommunity() {
  const [tab, setTab] = useState("queue"),
    [status, setStatus] = useState("approved"),
    [page, setPage] = useState(1),
    [action, setAction] = useState<CommunityAction | null>(null),
    [editor, setEditor] = useState<"announcement" | "rules" | null>(null);
  const queue = useLoad<CommunityReview[]>(
      tab === "queue" ? "/admin/community/queue" : null,
    ),
    reports = useLoad<Report[]>(
      tab === "reports" ? "/admin/community/reports" : null,
    ),
    posts = useLoad<{ items: CommunityReview[]; more: boolean }>(
      tab === "posts"
        ? `/admin/community/posts?status=${status}&page=${page}`
        : null,
    ),
    rules = useLoad<CommunityPostData>("/admin/community/rules");
  const result = tab === "queue" ? queue : tab === "reports" ? reports : posts;
  const review = (
    id: number,
    actionName: string,
    title: string,
    reason = false,
    version?: number,
  ) =>
    setAction({
      title,
      path: `/admin/community/posts/${id}/${actionName}`,
      method: "POST",
      ...(version === undefined ? {} : { body: { expected_version: version } }),
      ...(reason ? { reasonField: "note" as const } : {}),
    });
  return (
    <section className="community-admin">
      <Button
        variant="outline"
        onClick={() => {
          queue.reload();
          reports.reload();
          posts.reload();
        }}
      >
        Tải lại danh sách
      </Button>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="community-admin-tabs">
          <TabsTrigger value="queue">Chờ duyệt</TabsTrigger>
          <TabsTrigger value="reports">Báo cáo</TabsTrigger>
          <TabsTrigger value="posts">Bài đã đăng</TabsTrigger>
          <TabsTrigger value="publish">Thông báo & Quy tắc</TabsTrigger>
        </TabsList>
        {tab !== "publish" &&
          (result.loading ? (
            <Loading />
          ) : result.error ? (
            <ErrorState error={result.error} retry={result.reload} />
          ) : null)}
        <TabsContent value="queue">
          {queue.data?.length === 0 && <Blank title="Không có bài chờ duyệt" />}
          <div className="community-feed">
            {queue.data?.map((p) => (
              <article className="community-card" key={p.id}>
                <Owner owner={p.owner} />
                <Badge variant="outline">
                  {p.revision_status === "pending" ? "Bản sửa" : "Bài mới"}
                </Badge>
                {p.revision_status === "pending" ? (
                  <div className="community-comparison">
                    <section>
                      <h3>Bản đang hiển thị</h3>
                      <h4>{p.title}</h4>
                      <div className="community-body">{p.body}</div>
                    </section>
                    <section>
                      <h3>Bản sửa chờ duyệt</h3>
                      <h4>{p.revision_title}</h4>
                      <div className="community-body">{p.revision_body}</div>
                    </section>
                  </div>
                ) : (
                  <>
                    <h2>{p.title}</h2>
                    <div className="community-body">{p.body}</div>
                  </>
                )}
                <div className="community-actions">
                  <Button
                    onClick={() =>
                      review(
                        p.id,
                        "approve",
                        "Duyệt bài",
                        false,
                        p.review_version,
                      )
                    }
                  >
                    Duyệt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      review(
                        p.id,
                        "reject",
                        "Từ chối bài",
                        true,
                        p.review_version,
                      )
                    }
                  >
                    Từ chối
                  </Button>
                  <Link className="text-link" to={`/community/${p.id}`}>
                    Xem chi tiết
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="reports">
          {reports.data?.length === 0 && (
            <Blank title="Không có báo cáo chờ xử lý" />
          )}
          <div className="community-feed">
            {reports.data?.map((r) => (
              <article className="community-card" key={r.id}>
                {r.owner && <Owner owner={r.owner} />}
                <h2>
                  {r.reason}{" "}
                  <Badge variant="secondary">{r.report_count} báo cáo</Badge>
                </h2>
                {r.detail && <p>{r.detail}</p>}
                {r.target && (
                  <>
                    <h3>{r.target.title || "Bình luận được báo cáo"}</h3>
                    <div className="community-body">{r.target.body}</div>
                    <Link
                      className="text-link"
                      to={`/community/${r.target_type === "post" ? r.target_id : r.target.post_id}`}
                    >
                      Xem bài viết
                    </Link>
                  </>
                )}
                <div className="community-actions">
                  {r.target_type === "post" &&
                    r.target?.status === "approved" && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          review(r.target_id, "hide", "Ẩn bài", true)
                        }
                      >
                        Ẩn bài
                      </Button>
                    )}
                  {r.target_type === "comment" &&
                    r.target?.status === "visible" && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setAction({
                            title: "Gỡ bình luận",
                            path: `/admin/community/comments/${r.target_id}`,
                            method: "DELETE",
                            reasonField: "note",
                          })
                        }
                      >
                        Gỡ bình luận
                      </Button>
                    )}
                  <Button
                    onClick={() =>
                      setAction({
                        title: "Kết thúc báo cáo / Bỏ qua",
                        path: `/admin/community/reports/${r.id}/resolve`,
                        method: "POST",
                        reasonField: "resolution",
                      })
                    }
                  >
                    Kết thúc báo cáo / Bỏ qua
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="posts">
          <Choose
            label="Trạng thái bài"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: "approved", label: "Đã đăng" },
              { value: "hidden", label: "Đã ẩn" },
              { value: "deleted", label: "Đã xóa" },
            ]}
          />
          {posts.data?.items.length === 0 && (
            <Blank title="Không có bài viết" />
          )}
          <div className="community-feed">
            {posts.data?.items.map((p) => (
              <article className="community-card" key={p.id}>
                <Owner owner={p.owner} />
                <h2>{p.title}</h2>
                <Badge variant="outline">
                  {postStates[p.status || "approved"]}
                </Badge>
                <div className="community-body">{p.body}</div>
                {p.review_note && <p>{p.review_note}</p>}
                <div className="community-actions">
                  {p.status !== "deleted" && (
                    <Link className="text-link" to={`/community/${p.id}`}>
                      Xem bài viết
                    </Link>
                  )}
                  {p.status === "hidden" ? (
                    <Button
                      onClick={() => review(p.id, "restore", "Khôi phục bài")}
                    >
                      Khôi phục
                    </Button>
                  ) : p.status === "approved" ? (
                    <Button
                      variant="outline"
                      onClick={() => review(p.id, "hide", "Ẩn bài", true)}
                    >
                      Ẩn bài
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {(page > 1 || posts.data?.more) && (
            <div className="community-pagination">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Trang trước
              </Button>
              <span>Trang {page}</span>
              <Button
                variant="outline"
                disabled={!posts.data?.more}
                onClick={() => setPage(page + 1)}
              >
                Trang sau
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="publish">
          <div className="community-actions">
            <Button onClick={() => setEditor("announcement")}>
              Đăng thông báo
            </Button>
            <Button
              variant="outline"
              disabled={!rules.data}
              onClick={() => setEditor("rules")}
            >
              Sửa Quy tắc cộng đồng
            </Button>
          </div>
          {rules.loading ? (
            <Loading />
          ) : rules.error ? (
            <ErrorState error={rules.error} retry={rules.reload} />
          ) : (
            rules.data && (
              <article className="community-card">
                <h2>{rules.data.title}</h2>
                <div className="community-body">{rules.data.body}</div>
              </article>
            )
          )}
        </TabsContent>
      </Tabs>
      {editor && (
        <Compose
          post={editor === "rules" ? rules.data! : undefined}
          endpoint={
            editor === "rules"
              ? "/admin/community/rules"
              : "/admin/community/posts"
          }
          close={() => setEditor(null)}
          saved={() => {}}
        />
      )}
      {action && <ActionDialog action={action} close={() => setAction(null)} />}
    </section>
  );
}

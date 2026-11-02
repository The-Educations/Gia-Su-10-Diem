import { Link, useSearchParams } from "react-router-dom";
import { useLoad } from "@/lib/api";
import type { CommunityFeed } from "@/lib/types";
import { Page, Heading, Loading, ErrorState, Blank } from "@/components/common";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/community/shared";
import Drafts from "@/components/community/Drafts";
import CommunityWorkspace from "@/components/community/Workspace";
export default function CommunityMine() {
  const [params, setParams] = useSearchParams(),
    page = Number(params.get("page") || 1),
    result = useLoad<CommunityFeed>(`/community/mine?page=${page}`);
  return (
    <Page>
      <div className="community-page">
        <Heading title="Bài của tôi" />
        <CommunityWorkspace />
        <Drafts />
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorState error={result.error} retry={result.reload} />
        ) : !result.data?.items.length ? (
          <Blank
            title="Bạn chưa có bài viết"
            action={
              <Button asChild>
                <Link to="/community">Đến cộng đồng</Link>
              </Button>
            }
          />
        ) : (
          [
            {
              title: "Đang chờ duyệt",
              matches: (p: CommunityFeed["items"][number]) =>
                p.status === "pending" ||
                (p.status === "approved" && p.revision_status === "pending"),
            },
            {
              title: "Bị từ chối",
              matches: (p: CommunityFeed["items"][number]) =>
                p.status === "rejected" ||
                (p.status === "approved" && p.revision_status === "rejected"),
            },
            {
              title: "Đã đăng",
              matches: (p: CommunityFeed["items"][number]) =>
                p.status === "approved" && !p.revision_status,
            },
            {
              title: "Đã bị ẩn",
              matches: (p: CommunityFeed["items"][number]) =>
                p.status === "hidden",
            },
          ].map((group) => {
            const posts = result.data!.items.filter(group.matches);
            return (
              posts.length > 0 && (
                <section
                  className="community-feed"
                  key={group.title}
                  aria-label={group.title}
                >
                  <h2 className="community-group-title">{group.title}</h2>
                  {posts.map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </section>
              )
            );
          })
        )}
        {(page > 1 || result.data?.more) && (
          <nav className="community-pagination" aria-label="Trang bài của tôi">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setParams({ page: String(page - 1) })}
            >
              Trang trước
            </Button>
            <span>Trang {page}</span>
            <Button
              variant="outline"
              disabled={!result.data?.more}
              onClick={() => setParams({ page: String(page + 1) })}
            >
              Trang sau
            </Button>
          </nav>
        )}
      </div>
    </Page>
  );
}

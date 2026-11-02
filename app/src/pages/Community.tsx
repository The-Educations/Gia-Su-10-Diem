import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PenLine, Search, ArrowLeft, ArrowRight } from "lucide-react";
import { useApp, useLoad } from "@/lib/api";
import type { CommunityFeed, Subject } from "@/lib/types";
import {
  Page,
  Heading,
  Loading,
  ErrorState,
  Blank,
  Choose,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PostCard, useCommunityGate } from "@/components/community/shared";
import CommunityWorkspace from "@/components/community/Workspace";
export default function Community() {
  const { user } = useApp(),
    [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const [query, setQuery] = useState(params.get("q") || "");
  const gate = useCommunityGate(),
    subjects = useLoad<Subject[]>("/subjects"),
    result = useLoad<CommunityFeed>(`/community/posts?${params}`);
  const page = Number(params.get("page") || 1);
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  };
  return (
    <Page>
      <div className="community-page">
        <Heading title="Cộng đồng" />
        <CommunityWorkspace />
        {result.data?.rules && <PostCard post={result.data.rules} />}
        <section className="community-toolbar" aria-label="Tìm bài viết">
          <Button onClick={() => gate.run(() => navigate("/community/write"), true)}>
            <PenLine data-icon="inline-start" />
            {user?.role === "admin" ? "Đăng thông báo" : "Đăng bài"}
          </Button>
          <form
            className="community-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              filter("q", query);
            }}
          >
            <Input
              aria-label="Tìm bài viết"
              placeholder="Tìm trong cộng đồng…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={80}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Tìm kiếm"
            >
              <Search />
            </Button>
          </form>
          <div className="community-filters">
            <Choose
              label="Môn học"
              value={params.get("subject") || ""}
              onChange={(v) => filter("subject", v)}
              allLabel="Tất cả môn"
              options={(subjects.data || []).map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
            <Choose
              label="Cấp học"
              value={params.get("level") || ""}
              onChange={(v) => filter("level", v)}
              allLabel="Tất cả cấp học"
              options={["Tiểu học", "THCS", "THPT", "Người đi làm"].map(
                (s) => ({ value: s, label: s }),
              )}
            />
            <Choose
              label="Sắp xếp"
              value={params.get("sort") || "new"}
              onChange={(v) => filter("sort", v)}
              options={[
                { value: "new", label: "Mới nhất" },
                { value: "helpful", label: "Hữu ích" },
              ]}
            />
          </div>
        </section>
        {subjects.error && (
          <ErrorState error={subjects.error} retry={subjects.reload} />
        )}
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorState error={result.error} retry={result.reload} />
        ) : !result.data?.items.length ? (
          <Blank
            title="Chưa có bài viết phù hợp"
            action={
              params.size > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setParams({});
                    setQuery("");
                  }}
                >
                  Xóa bộ lọc
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="community-feed">
            {result.data.items.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
        {(page > 1 || result.data?.more) && (
          <nav className="community-pagination" aria-label="Trang bài viết">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("page", String(page - 1));
                setParams(next);
                window.scrollTo(0, 0);
              }}
            >
              <ArrowLeft data-icon="inline-start" />
              Trang trước
            </Button>
            <span>Trang {page}</span>
            <Button
              variant="outline"
              disabled={!result.data?.more}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("page", String(page + 1));
                setParams(next);
                window.scrollTo(0, 0);
              }}
            >
              Trang sau
              <ArrowRight data-icon="inline-end" />
            </Button>
          </nav>
        )}
        {gate.dialog}
      </div>
    </Page>
  );
}

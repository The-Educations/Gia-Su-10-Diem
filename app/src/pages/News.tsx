import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { api, useLoad } from "@/lib/api";
import type { NewsCard, NewsDetail, NewsList } from "@/lib/types";
import { Page, Heading, Loading, ErrorState, Blank } from "@/components/common";
import { Button } from "@/components/ui/button";
import { NEWS_TOPICS, isNewsTopic } from "@/lib/news-topics";
import { newsPath } from "@/lib/news";
import { NewsArticle } from "@/components/news/news-article";
import { NewsCardItem } from "@/components/news/news-cards";

const ID_SLUG = /^(\d+)(?:-[a-z0-9-]*)?$/;

function NewsDetailPage({ idSlug }: { idSlug: string }) {
  const id = idSlug.match(ID_SLUG)?.[1];
  const detail = useLoad<NewsDetail>(id ? `/posts/${id}` : null);
  if (!id) return <Page><Blank title="Không tìm thấy bài viết" action={<Link className="text-link" to="/news">← Tin tức</Link>} /></Page>;
  if (detail.loading) return <Loading />;
  if (detail.error) return <Page><ErrorState error={detail.error} retry={detail.reload} /><Link className="text-link" to="/news">← Tin tức</Link></Page>;
  if (!detail.data) return null;
  // Missing or wrong slug: send the reader (and Google) to the one canonical path.
  if (newsPath(detail.data) !== `/news/${idSlug}`) return <Navigate replace to={newsPath(detail.data)} />;
  return <Page><NewsArticle post={detail.data} /></Page>;
}

type Feed = { key: string; pinned: NewsCard | null; items: NewsCard[]; hasMore: boolean; page: number; loading: boolean; more: boolean; error: string };
const empty = (key: string): Feed => ({ key, pinned: null, items: [], hasMore: false, page: 0, loading: true, more: false, error: "" });

function NewsListPage() {
  const [params] = useSearchParams();
  const raw = params.get("topic");
  const topic = isNewsTopic(raw) ? raw : "";
  const [feed, setFeed] = useState<Feed>(() => empty(topic)), [attempt, setAttempt] = useState(0);
  const query = (page: number) => new URLSearchParams({ ...(topic ? { topic } : {}), page: String(page) }).toString();
  useEffect(() => {
    let active = true;
    setFeed(empty(topic));
    api<NewsList>(`/news?${query(0)}`)
      .then((d) => active && setFeed({ key: topic, pinned: d.pinned, items: d.items, hasMore: d.has_more, page: 0, loading: false, more: false, error: "" }))
      .catch((e) => active && setFeed({ ...empty(topic), loading: false, error: (e as Error).message }));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, attempt]);
  const loadMore = useCallback(async () => {
    setFeed((f) => ({ ...f, more: true, error: "" }));
    try {
      const d = await api<NewsList>(`/news?${query(feed.page + 1)}`);
      setFeed((f) => f.key !== topic ? f : { ...f, items: [...f.items, ...d.items.filter((n) => !f.items.some((x) => x.id === n.id))], hasMore: d.has_more, page: f.page + 1, more: false });
    } catch (e) { setFeed((f) => ({ ...f, more: false, error: (e as Error).message })); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.page, topic]);
  const showPinned = !topic && feed.pinned;
  return <Page>
    <Heading title="Tin tức" description="Thông tin tuyển sinh, thi cử và chính sách giáo dục cho học sinh và phụ huynh." />
    <nav className="news-chips" aria-label="Lọc theo chủ đề">
      <Link to="/news" aria-current={!topic ? "true" : undefined}>Tất cả</Link>
      {NEWS_TOPICS.map((t) => <Link key={t.id} to={`/news?topic=${t.id}`} aria-current={topic === t.id ? "true" : undefined}>{t.label}</Link>)}
    </nav>
    {feed.loading ? <Loading />
      : feed.error && !feed.items.length && !feed.pinned ? <ErrorState error={feed.error} retry={() => setAttempt((n) => n + 1)} />
      : !feed.items.length && !showPinned ? <Blank title="Chưa có tin trong mục này." action={topic ? <Link className="text-link" to="/news">Xem tất cả tin</Link> : undefined} />
      : <>
        {showPinned && <NewsCardItem post={feed.pinned!} featured />}
        <div className="news-feed">{feed.items.map((post) => <NewsCardItem key={post.id} post={post} />)}</div>
        {feed.error && <ErrorState error={feed.error} />}
        {feed.hasMore && <div className="news-more"><Button variant="outline" disabled={feed.more} onClick={loadMore}>
          {feed.more && <LoaderCircle className="animate-spin" data-icon="inline-start" />}Xem thêm tin</Button></div>}
      </>}
  </Page>;
}

export default function News() {
  const { idSlug } = useParams();
  return idSlug ? <NewsDetailPage idSlug={idSlug} /> : <NewsListPage />;
}

import { Link, useParams } from "react-router-dom";
import { useLoad } from "@/lib/api";
import type { Post } from "@/lib/types";
import { Page, Heading, Loading, ErrorState, Blank } from "@/components/common";

export default function News() {
  const { id } = useParams();
  const list = useLoad<Post[]>(id ? null : "/posts");
  const detail = useLoad<Post>(id ? `/posts/${id}` : null);
  if (list.loading || detail.loading) return <Loading />;
  if (list.error || detail.error) return <ErrorState error={list.error || detail.error} retry={id ? detail.reload : list.reload} />;
  if (id && detail.data) return <Page><article className="news-article">
    <Link className="text-link" to="/news">← Tin tức</Link>
    <h1>{detail.data.title}</h1><p className="news-summary">{detail.data.summary}</p>
    <div className="news-body">{detail.data.body}</div>
  </article></Page>;
  return <Page><Heading title="Tin tức" />
    {!list.data?.length ? <Blank title="Chưa có bài viết" /> : <div className="news-list">{list.data.map(post =>
      <article key={post.id}><h2><Link to={`/news/${post.id}`}>{post.title}</Link></h2><p>{post.summary}</p></article>
    )}</div>}
  </Page>;
}

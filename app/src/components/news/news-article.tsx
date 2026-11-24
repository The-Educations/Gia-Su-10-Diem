import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseNewsBody } from "@/lib/news-body";
import { formatDate, newsCanonical } from "@/lib/news";
import { topicLabel } from "@/lib/news-topics";
import type { NewsArticleData } from "@/lib/types";
import { NewsCardItem, NewsCover } from "./news-cards";
import { useI18n } from "@/lib/i18n";

function Share({ post }: { post: NewsArticleData }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = newsCanonical(post);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Sao chép liên kết", url); }
  }
  return <div className="news-share" role="group" aria-label="Chia sẻ bài viết">
    <span>{t("Chia sẻ:")}</span>
    <Button asChild variant="outline" size="sm">
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Facebook</a>
    </Button>
    <Button type="button" variant="outline" size="sm" onClick={copy}><Link2 data-icon="inline-start" />{copied ? "Đã sao chép" : "Sao chép link"}</Button>
    {typeof navigator !== "undefined" && typeof navigator.share === "function" &&
      <Button type="button" variant="outline" size="sm" onClick={() => navigator.share({ title: post.title, url }).catch(() => {})}><Share2 data-icon="inline-start" />{t("Chia sẻ…")}</Button>}
  </div>;
}

// Shared by the public article page and the admin preview. `preview` keeps every link inert so a click cannot drop unsaved edits.
export function NewsArticle({ post, preview = false }: { post: NewsArticleData; preview?: boolean }) {
  const { t } = useI18n();
  const published = formatDate(post.published_at), revised = formatDate(post.revised_at);
  const dates = [published, revised && `Cập nhật ${revised}`, `${post.reading_minutes} phút đọc`].filter(Boolean).join(" · ");
  return <article className="news-article" onClickCapture={preview ? (e) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); } : undefined}>
    <nav className="news-breadcrumb" aria-label="Đường dẫn">
      <Link to="/news">{t("Tin tức")}</Link><span aria-hidden="true"> › </span><Link to={`/news?topic=${post.topic}`}>{topicLabel(post.topic)}</Link>
    </nav>
    <h1>{post.title}</h1>
    <p className="news-summary">{post.summary}</p>
    <p className="news-meta">{dates}</p>
    {post.cover_url && <figure className="news-figure news-cover">
      <NewsCover src={post.cover_url} alt={post.cover_alt || post.title} topic={post.topic} fallback="hide" />
      {post.cover_credit && <figcaption>Ảnh: {post.cover_credit}</figcaption>}
    </figure>}
    {/* body_html is HTML that the server sanitized when the post was saved (sanitize-html allow-list, images only from
        /api/news/images). Never feed this prop anything that skipped that step. Older posts keep plain text in `body`. */}
    {post.body_html
      ? <div className="news-body news-rich community-rich" dangerouslySetInnerHTML={{ __html: post.body_html }} />
      : <div className="news-body">{parseNewsBody(post.body).map((part, i) => part.kind === "text"
        ? <div className="news-text" key={i}>{part.text}</div>
        : <figure className="news-figure" key={i}>
            <img src={part.url} alt={part.alt || post.title} loading="lazy" decoding="async" referrerPolicy="no-referrer"
              onError={(e) => { const box = e.currentTarget.closest("figure"); if (box) box.hidden = true; }} />
            {part.credit && <figcaption>Ảnh: {part.credit}</figcaption>}
          </figure>)}</div>}
    {(post.source_name || post.source_url) && <aside className="news-source">
      <span>{t("Nguồn:")} <strong>{post.source_name || "Bài gốc"}</strong></span>
      {/^https?:\/\//.test(post.source_url) && <a href={post.source_url} target="_blank" rel="noopener noreferrer nofollow">{t("Xem bài gốc")}<ExternalLink size={14} /></a>}
    </aside>}
    <Share post={post} />
    {post.cta && <aside className="news-cta">
      <div><h2>{post.cta.heading}</h2><p>{post.cta.text}</p></div>
      <Button asChild><Link to={post.cta.href}>{post.cta.button}</Link></Button>
    </aside>}
    {!!post.related?.length && <section className="news-related" aria-labelledby="news-related-title">
      <h2 id="news-related-title">{t("Tin liên quan")}</h2>
      <div>{post.related.map((item) => <NewsCardItem key={item.id} post={item} />)}</div>
    </section>}
  </article>;
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { newsPath, relativeOrDate } from "@/lib/news";
import { topicLabel } from "@/lib/news-topics";
import type { NewsCard, NewsTopic } from "@/lib/types";

// A cover that never leaves an empty frame or a broken icon: no URL or a failed load shows a tinted topic tile.
export function NewsCover({ src, alt, topic, fallback = "tile", className = "" }: {
  src: string; alt: string; topic: NewsTopic; fallback?: "tile" | "hide"; className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    if (fallback === "hide") return null;
    return <div className={`news-tile ${className}`} data-topic={topic} role="img" aria-label={topicLabel(topic)}><span>{topicLabel(topic)}</span></div>;
  }
  return <img className={`news-cover-img ${className}`} src={src} alt={alt} loading="lazy" decoding="async"
    referrerPolicy="no-referrer" onError={() => setFailed(src)} />;
}

export function NewsCardItem({ post, featured = false }: { post: NewsCard; featured?: boolean }) {
  const when = relativeOrDate(post.published_at);
  return <article className={featured ? "news-card news-card-featured" : "news-card"}>
    <Link className="news-card-media" to={newsPath(post)} tabIndex={-1} aria-hidden="true">
      <NewsCover src={post.cover_url} alt="" topic={post.topic} />
    </Link>
    <div className="news-card-text">
      {featured && <p className="news-eyebrow">Tin nổi bật</p>}
      <span className="news-topic-tag" data-topic={post.topic}>{topicLabel(post.topic)}</span>
      <h2><Link to={newsPath(post)}>{post.title}</Link></h2>
      <p className="news-card-summary">{post.summary}</p>
      <p className="news-meta">{[when, `${post.reading_minutes} phút đọc`].filter(Boolean).join(" · ")}</p>
    </div>
  </article>;
}

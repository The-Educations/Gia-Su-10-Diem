import { useLoad } from "@/lib/api";
import type { NewsDetail, CommunityPostData } from "@/lib/types";
import { SITE_ORIGIN } from "@/lib/news";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import pages from "../../../shared/seo-pages.json";

export function PageMetadata() {
  const { pathname } = useLocation();
  // News URLs are /news/<id>[-<slug>]; the slug is optional so old id-only links still resolve.
  const match = pathname.match(/^\/news\/(\d+)(?:-[a-z0-9-]*)?$/);
  const post = useLoad<NewsDetail>(match ? `/posts/${match[1]}` : null);
  const communityMatch = pathname.match(/^\/community\/(\d+)$/);
  const community = useLoad<CommunityPostData>(communityMatch ? `/community/posts/${communityMatch[1]}` : null);
  useEffect(() => {
    // A loaded article is always described by its canonical id-slug address.
    const path = post.data && match ? `/app/news/${post.data.id}${post.data.slug ? `-${post.data.slug}` : ""}` : `/app${pathname}`;
    const approved = community.data?.public ? community.data : null;
    const page = approved ? { title: `${approved.title} | Cộng đồng Gia Sư 10 Điểm`, description: approved.body.replace(/\s+/g, " ").trim().slice(0, 160) } : post.data ? { title: `${post.data.title} | Gia Sư 10 Điểm`, description: post.data.summary } : pages[path as keyof typeof pages];
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach(element => element.remove());
    const cover = post.data?.cover_url ? (post.data.cover_url.startsWith("/") ? SITE_ORIGIN + post.data.cover_url : post.data.cover_url) : "";
    const iso = (value: string | null | undefined) => (value ? value.replace(" ", "T") + "Z" : undefined);
    if (post.data && !approved) {
      const schema = document.createElement("script");
      schema.type = "application/ld+json";
      schema.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: post.data.title.slice(0, 110), description: post.data.summary, datePublished: iso(post.data.published_at), dateModified: iso(post.data.revised_at || post.data.published_at), image: [cover || `${SITE_ORIGIN}/assets/social-preview.png`], mainEntityOfPage: `${SITE_ORIGIN}${path}`, inLanguage: "vi-VN", publisher: { "@type": "Organization", name: "Gia Sư 10 Điểm", url: SITE_ORIGIN } }).replace(/</g, "\\u003c");
      document.head.append(schema);
    }
    if (approved) {
      const schema = document.createElement("script");
      schema.type = "application/ld+json";
      schema.textContent = JSON.stringify({ "@context":"https://schema.org", "@type":"DiscussionForumPosting", headline:approved.title, text:approved.body, author:{"@type":"Person",name:approved.author.name_part}, url:`https://giasudiem10.online${path}`, datePublished:approved.published_at?.replace(" ","T")+"Z", dateModified:approved.updated_at.replace(" ","T")+"Z" });
      document.head.append(schema);
    }
    document.title = page?.title || "Tài khoản | Gia Sư 10 Điểm";
    const meta = (name: string, content: string, property = false) => {
      const attr = property ? "property" : "name";
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attr, name);
        document.head.append(element);
      }
      element.content = content;
    };
    meta("description", page?.description || "Gia Sư 10 Điểm — kết nối học sinh và gia sư.");
    meta("robots", page ? "index, follow, max-image-preview:large" : "noindex, follow");
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelectorAll('meta[property^="og:"], meta[name="twitter:card"]').forEach(element => element.remove());
    if (page) {
      const canonical = `https://giasudiem10.online${path}`;
      const link = document.createElement("link");
      link.rel = "canonical";
      link.href = canonical;
      document.head.append(link);
      meta("og:title", page.title, true);
      meta("og:description", page.description, true);
      meta("og:url", canonical, true);
      meta("og:type", post.data && !approved ? "article" : "website", true);
      meta("og:locale", "vi_VN", true);
      meta("og:site_name", "Gia Sư 10 Điểm", true);
      meta("og:image", cover || "https://giasudiem10.online/assets/social-preview.png", true);
      meta("twitter:card", "summary_large_image");
    }
  }, [pathname, post.data, community.data]);
  return null;
}

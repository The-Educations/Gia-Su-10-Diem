import { useLoad } from "@/lib/api";
import type { Post } from "@/lib/types";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import pages from "../../../shared/seo-pages.json";

export function PageMetadata() {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/news\/(\d+)$/);
  const post = useLoad<Post>(match ? `/posts/${match[1]}` : null);
  useEffect(() => {
    const path = `/app${pathname}`;
    const page = post.data ? { title: `${post.data.title} | Gia Sư 10 Điểm`, description: post.data.summary } : pages[path as keyof typeof pages];
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
      meta("og:type", "website", true);
      meta("og:locale", "vi_VN", true);
      meta("og:site_name", "Gia Sư 10 Điểm", true);
      meta("og:image", "https://giasudiem10.online/assets/social-preview.png", true);
      meta("twitter:card", "summary_large_image");
    }
  }, [pathname, post.data]);
  return null;
}

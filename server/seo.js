import { description } from "./community-policy.js";
import pages from "../shared/seo-pages.json" with { type: "json" };

export const siteOrigin = "https://giasudiem10.online";
export const robots = `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`;
export const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(pages).map(path => `<url><loc>${siteOrigin}${path}</loc></url>`).join("")}</urlset>`;
const escape = (value) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const privateRoutes = new Set(["/app", "/app/community/write", "/app/community/mine", "/app/auth", "/app/forgot-password", "/app/reset-password", "/app/verify-email", "/app/onboarding", "/app/workspace", "/app/bookings", "/app/calendar", "/app/offers", "/app/proposals", "/app/wallet", "/app/schedule", "/app/family", "/app/classes", "/app/messages", "/app/settings", "/app/availability", "/app/studio", "/app/sessions", "/app/admin", "/app/favorites"]);

// News paths are /app/news/<id>[-<slug>]; the slug is only ever a-z, 0-9 and dashes.
export const NEWS_PATH = /^\/app\/news\/(\d+)(?:-[a-z0-9-]*)?$/;
export const newsPath = (post) => {
  const slug = String(post.slug || "").replace(/[^a-z0-9-]/g, "");
  return `/app/news/${Number(post.id)}${slug ? "-" + slug : ""}`;
};
const isoTime = (value) => value ? (String(value).includes("T") ? String(value) : String(value).replace(" ", "T") + "Z") : undefined;
// JSON inside <script>: "<" is escaped so no text can close the tag early.
const jsonLd = (data) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const defaultImage = `${siteOrigin}/assets/social-preview.png`;
const newsImage = (post) => /^\//.test(post.cover_url || "") ? siteOrigin + post.cover_url : /^https:\/\//.test(post.cover_url || "") ? post.cover_url : "";

export function newsSitemap(posts, community = []) {
  const news = posts.map(post => {
    const lastmod = isoTime(post.revised_at || post.published_at || post.updated_at);
    return `<url><loc>${siteOrigin}${newsPath(post)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  });
  return sitemap.replace("</urlset>", news.join("") + community.map(post => `<url><loc>${siteOrigin}/app/community/${Number(post.id)}</loc></url>`).join("") + "</urlset>");
}
export function pageSeo(path, post = null, community = null) {
  const canonicalNews = NEWS_PATH.test(path) && post ? newsPath(post) : null;
  if (canonicalNews && path !== canonicalNews)
    return { title: post.title, description: post.summary, robots: "noindex, follow", canonical: null, status: 301, redirect: canonicalNews };
  const page = /^\/app\/community\/\d+$/.test(path) && community
    ? { title: `${community.title} | Cộng đồng Gia Sư 10 Điểm`, description: description(community.body) }
    : canonicalNews
    ? { title: `${post.title} | Gia Sư 10 Điểm`, description: post.summary }
    : Object.hasOwn(pages, path) ? pages[path] : null;
  const known = page || /^\/app\/community\/members\/[^/]+$/.test(path) || privateRoutes.has(path) || /^\/app\/(?:tutors|classes)\/\d+$/.test(path);
  return {
    title: page?.title || (known ? "Tài khoản | Gia Sư 10 Điểm" : "Không tìm thấy trang | Gia Sư 10 Điểm"),
    description: page?.description || "Gia Sư 10 Điểm — kết nối học sinh và gia sư.",
    robots: page ? "index, follow, max-image-preview:large" : "noindex, follow",
    canonical: page ? siteOrigin + path : null,
    status: known ? 200 : 404,
  };
}

export function renderSeo(html, path, post = null, community = null) {
  const page = pageSeo(path, post, community);
  const article = page.canonical && post && NEWS_PATH.test(path) ? post : null;
  const cover = article ? newsImage(article) : "";
  const tags = [
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}">`,
    `<meta name="robots" content="${page.robots}">`,
    ...(page.canonical ? [
      `<link rel="canonical" href="${page.canonical}">`,
      `<meta property="og:type" content="${article ? "article" : "website"}">`,
      '<meta property="og:locale" content="vi_VN">',
      '<meta property="og:site_name" content="Gia Sư 10 Điểm">',
      `<meta property="og:title" content="${escape(page.title)}">`,
      `<meta property="og:description" content="${escape(page.description)}">`,
      `<meta property="og:url" content="${page.canonical}">`,
      `<meta property="og:image" content="${escape(cover || defaultImage)}">`,
      ...(cover ? [] : ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">']),
      `<meta property="og:image:alt" content="${escape(cover ? (article.cover_alt || article.title) : "Gia Sư 10 Điểm — Tìm gia sư, học theo cách của em")}">`,
      '<meta name="twitter:card" content="summary_large_image">',
    ] : []),
    ...(article ? [
      `<meta property="article:published_time" content="${isoTime(article.published_at) || ""}">`,
      `<meta property="article:modified_time" content="${isoTime(article.revised_at || article.published_at) || ""}">`,
      `<script type="application/ld+json">${jsonLd({
        "@context": "https://schema.org", "@type": "NewsArticle", headline: article.title.slice(0, 110), description: article.summary,
        datePublished: isoTime(article.published_at), dateModified: isoTime(article.revised_at || article.published_at),
        image: [cover || defaultImage], mainEntityOfPage: page.canonical, inLanguage: "vi-VN",
        publisher: { "@type": "Organization", name: "Gia Sư 10 Điểm", url: siteOrigin },
      })}</script>`,
    ] : []),
    ...(community && /^\/app\/community\/\d+$/.test(path) ? [`<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "DiscussionForumPosting", headline: community.title,
      text: community.body, author: { "@type": "Person", name: community.author.name_part },
      datePublished: community.published_at?.replace(" ", "T") + "Z", dateModified: community.updated_at?.replace(" ", "T") + "Z",
      url: page.canonical,
    }).replace(/</g, "\\u003c")}</script>`] : []),
    ...(path === "/" ? [`<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "WebSite", name: "Gia Sư 10 Điểm", url: siteOrigin + "/", inLanguage: "vi-VN",
    })}</script>`] : []),
  ].join("\n");
  return html.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/g, "")
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+name=["'](?:description|robots)["'][^>]*>/gi, "")
    .replace("</head>", `<!--seo:start-->${tags}<!--seo:end-->\n</head>`);
}

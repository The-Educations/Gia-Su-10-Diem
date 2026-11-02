import { description } from "./community-policy.js";
import pages from "../shared/seo-pages.json" with { type: "json" };

export const siteOrigin = "https://giasudiem10.online";
export const robots = `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`;
export const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(pages).map(path => `<url><loc>${siteOrigin}${path}</loc></url>`).join("")}</urlset>`;
const escape = (value) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const privateRoutes = new Set(["/app/community/write", "/app/community/mine", "/app/auth", "/app/verify-email", "/app/onboarding", "/app/workspace", "/app/bookings", "/app/messages", "/app/settings", "/app/availability", "/app/studio", "/app/admin", "/app/favorites"]);

export function newsSitemap(posts, community = []) {
  return sitemap.replace("</urlset>", posts.map(post => `<url><loc>${siteOrigin}/app/news/${Number(post.id)}</loc></url>`).join("") + community.map(post => `<url><loc>${siteOrigin}/app/community/${Number(post.id)}</loc></url>`).join("") + "</urlset>");
}
export function pageSeo(path, post = null, community = null) {
  const page = /^\/app\/community\/\d+$/.test(path) && community
    ? { title: `${community.title} | Cộng đồng Gia Sư 10 Điểm`, description: description(community.body) }
    : /^\/app\/news\/\d+$/.test(path) && post
    ? { title: `${post.title} | Gia Sư 10 Điểm`, description: post.summary }
    : Object.hasOwn(pages, path) ? pages[path] : null;
  const known = page || privateRoutes.has(path) || /^\/app\/tutors\/\d+$/.test(path);
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
  const tags = [
    `<title>${escape(page.title)}</title>`,
    `<meta name="description" content="${escape(page.description)}">`,
    `<meta name="robots" content="${page.robots}">`,
    ...(page.canonical ? [
      `<link rel="canonical" href="${page.canonical}">`,
      '<meta property="og:type" content="website">',
      '<meta property="og:locale" content="vi_VN">',
      '<meta property="og:site_name" content="Gia Sư 10 Điểm">',
      `<meta property="og:title" content="${escape(page.title)}">`,
      `<meta property="og:description" content="${escape(page.description)}">`,
      `<meta property="og:url" content="${page.canonical}">`,
      `<meta property="og:image" content="${siteOrigin}/assets/social-preview.png">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta property="og:image:alt" content="Gia Sư 10 Điểm — Tìm gia sư, học theo cách của em">',
      '<meta name="twitter:card" content="summary_large_image">',
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

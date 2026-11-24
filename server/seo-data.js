// Shared between server/index.js (SQLite via db queries) and worker/index.js
// (Durable Object over the public /api endpoints): both build the same `tutor`
// and `crawl` payloads that pageSeo/renderSeo consume, so the two entry points
// cannot drift.

import { newsPath } from "./seo.js";

// Normalizes a tutor row into the shape pageSeo/renderSeo expect. Works both
// with the local db row (rating is a {average,count} object from classRatings,
// subjects a JSON id array) and with the public /api/tutors/:id payload.
export const tutorSeoProfile = (row, subjectName = () => "") => {
  if (!row) return null;
  const ids = Array.isArray(row.subjects) ? row.subjects : JSON.parse(row.subjects || "[]");
  const names = ids.map(subjectName).filter(Boolean);
  const rating = row.rating;
  return {
    user_id: row.user_id,
    name: row.name,
    bio: row.bio || "",
    headline: row.headline || "",
    education: row.education || "",
    subjects: names,
    subject_name: names[0] || "",
    rating: typeof rating === "object" ? rating?.average ?? null : rating ?? null,
    review_count: row.review_count ?? rating?.count ?? 0,
  };
};

export const tutorSitemapIds = (rows) => rows.map((t) => ({ user_id: t.user_id }));

// Crawlable <noscript> content for the public list pages. Each key is a lazy
// fetcher invoked only when its page needs it, so a request pays only for the
// sources it uses (db queries locally, DO fetches in the worker).
export const crawlLinks = async (path, fetch = {}) => {
  if (path === "/app/tutors")
    return {
      heading: "Tìm gia sư theo môn học và mục tiêu",
      links: ((await fetch.tutors?.()) || []).slice(0, 20).map((t) => ({ href: `/app/tutors/${t.user_id}`, text: `Gia sư ${t.name}` })),
    };
  if (path === "/app/news")
    return {
      heading: "Tin tức học tập",
      links: ((await fetch.posts?.()) || []).slice(0, 20).map((p) => ({ href: newsPath(p), text: p.title })),
    };
  if (path === "/app/community")
    return {
      heading: "Cộng đồng",
      links: ((await fetch.community?.()) || []).slice(0, 20).map((p) => ({ href: `/app/community/${p.id}`, text: p.title })),
    };
  if (path === "/app/library")
    return {
      heading: "Tìm môn học và gia sư",
      links: ((await fetch.subjects?.()) || []).slice(0, 20).map((s) => ({ href: `/app/tutors?subject=${s.id}`, text: s.name })),
    };
  return null;
};

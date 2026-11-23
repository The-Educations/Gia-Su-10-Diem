import { NEWS_TOPICS } from "./news-topics";
import type { NewsCta, NewsTopic } from "./types";

export const SITE_ORIGIN = "https://giasudiem10.online";
export const TIME_ZONE = "Asia/Ho_Chi_Minh";
export const CTA_TEXT = "Tìm gia sư đã xác minh, học thử trước khi đăng ký.";
export const NEWS_LEVELS = ["Tiểu học", "THCS", "THPT", "Người đi làm"];

export const newsPath = (post: { id: number; slug: string }) => `/news/${post.id}${post.slug ? `-${post.slug}` : ""}`;
export const newsCanonical = (post: { id: number; slug: string }) => `${SITE_ORIGIN}/app${newsPath(post)}`;

// The database stores UTC as "YYYY-MM-DD HH:MM:SS"; ISO strings pass through.
export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
export const formatDate = (value: string | null | undefined) => {
  const date = parseServerDate(value);
  return date ? dateFormat.format(date) : "";
};
export const formatClock = (date: Date) => timeFormat.format(date);
// Under 24 hours reads "2 giờ trước"; older reads dd/MM/yyyy.
export function relativeOrDate(value: string | null | undefined, now = Date.now()) {
  const date = parseServerDate(value);
  if (!date) return "";
  const minutes = Math.floor((now - date.getTime()) / 60000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} giờ trước`;
  return dateFormat.format(date);
}

export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
// Same formula as the server: max(1, round(words / 200)).
export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 200));

export function htmlToText(html: string) {
  const spaced = html.replace(/<\/(p|h2|h3|li|blockquote|pre)>|<br\s*\/?>/gi, " ");
  return new DOMParser().parseFromString(spaced, "text/html").body.textContent ?? "";
}
// Opening a legacy plain-text article in the editor: escape, blank line = new paragraph, newline = <br>.
export function plainBodyToHtml(text: string) {
  const escape = (line: string) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text.trim() ? text.trim().split(/\n{2,}/).map((block) => `<p>${block.split("\n").map(escape).join("<br>")}</p>`).join("") : "";
}

// Mirrors the server's CTA (section 7.3); only the admin preview uses it.
export function buildCta(topic: NewsTopic, level: string, goal: string): NewsCta {
  const config = NEWS_TOPICS.find((item) => item.id === topic) ?? NEWS_TOPICS[2];
  const params = new URLSearchParams();
  if (topic === "policy") goal = "";
  if (level) params.set("level", level);
  if (goal) params.set("goal", goal);
  const query = params.toString();
  return {
    heading: goal ? `Cần người kèm ${goal}?` : config.cta.heading,
    text: CTA_TEXT,
    button: config.cta.button,
    href: `/tutors${query ? `?${query}` : ""}`,
  };
}

export const isSafeImage = (url: string) => /^https:\/\/\S+$/.test(url) || /^\/api\/news\/images\/[a-f0-9-]{36}$/.test(url);

// Pure rules for the news section: topics, slugs, sanitizing, publish checks, CTA.
// Nothing here touches the database, so the Worker and the Node server share it.
import topics from "../shared/news-topics.json" with { type: "json" };
import { cleanPostHtml } from "./community-rich.js";
import { fold } from "./community-policy.js";

export const TOPICS = topics;
export const TOPIC_IDS = topics.map((t) => t.id);
export const NEWS_IMAGE_PATH = /^\/api\/news\/images\/([a-f0-9-]{36})$/;
export const LEVELS = ["Tiểu học", "THCS", "THPT", "Người đi làm"];
export const LIMITS = { slug: 80, minWords: 50, shortWords: 150, longTitle: 100, longSummary: 300, wordsPerMinute: 200 };
const CTA_TEXT = "Tìm gia sư đã xác minh, học thử trước khi đăng ký.";

export const wordCount = (text) => (String(text ?? "").match(/\S+/g) || []).length;
export const readingMinutes = (text) => Math.max(1, Math.round(wordCount(text) / LIMITS.wordsPerMinute));

export function slugify(title) {
  const slug = fold(String(title ?? ""))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, "");
  return slug || "tin-tuc";
}

export const searchText = ({ title, summary, body }) =>
  fold(`${title ?? ""} ${summary ?? ""} ${body ?? ""}`).replace(/\s+/g, " ").trim();

const IMAGE_LINE = /^!\[([^\]]*)\]\((https:\/\/[^\s()]+)\)\s*$/;
const CREDIT_LINE = /^Ảnh:\s*(.+)$/;
const SOURCE_LINE = /^Nguồn:\s*(.+?)\s+-\s+(https?:\/\/\S+)\s*$/;

// Older n8n posts carry the cover as a leading markdown image (+ "Ảnh: <credit>")
// and the source as a final "Nguồn: <name> - <url>" line. Lift both into fields.
export function splitLegacyBody(body, { cover = true, source = true } = {}) {
  const result = { body, cover_url: "", cover_alt: "", cover_credit: "", source_name: "", source_url: "" };
  const lines = String(body ?? "").replace(/\r\n/g, "\n").split("\n");
  let changed = false;
  if (source) {
    let last = lines.length - 1;
    while (last >= 0 && !lines[last].trim()) last--;
    const match = last >= 0 ? lines[last].match(SOURCE_LINE) : null;
    if (match) {
      result.source_name = match[1].trim();
      result.source_url = match[2];
      lines.length = last;
      changed = true;
    }
  }
  if (cover) {
    let first = 0;
    while (first < lines.length && !lines[first].trim()) first++;
    const image = lines[first]?.match(IMAGE_LINE);
    if (image) {
      const credit = lines[first + 1]?.match(CREDIT_LINE);
      result.cover_url = image[2];
      result.cover_alt = image[1].trim();
      result.cover_credit = credit ? credit[1].trim() : "";
      lines.splice(0, first + (credit ? 2 : 1));
      changed = true;
    }
  }
  if (changed) result.body = lines.join("\n").replace(/^\n+|\n+$/g, "");
  return result;
}

// body_html is stored only after this runs; the public page renders it as trusted HTML.
export const cleanNewsHtml = (html) => cleanPostHtml(html, NEWS_IMAGE_PATH);

export function publishProblems(post) {
  const problems = [];
  if (!String(post.title ?? "").trim()) problems.push("Thiếu tiêu đề");
  if (!String(post.summary ?? "").trim()) problems.push("Thiếu tóm tắt");
  if (wordCount(post.body) < LIMITS.minWords) problems.push(`Nội dung cần ít nhất ${LIMITS.minWords} chữ`);
  if (!TOPIC_IDS.includes(post.topic)) problems.push("Chủ đề không hợp lệ");
  return problems;
}

export function postWarnings(post) {
  const warnings = [];
  if (!post.cover_url) warnings.push("Thiếu ảnh bìa");
  if (post.origin === "auto" && !post.source_name) warnings.push("Bài tự động chưa ghi nguồn");
  if (wordCount(post.body) < LIMITS.shortWords) warnings.push(`Bài ngắn (dưới ${LIMITS.shortWords} chữ)`);
  if (String(post.title ?? "").length > LIMITS.longTitle) warnings.push(`Tiêu đề dài hơn ${LIMITS.longTitle} ký tự`);
  if (String(post.summary ?? "").length > LIMITS.longSummary) warnings.push(`Tóm tắt dài hơn ${LIMITS.longSummary} ký tự`);
  return warnings;
}

// Invitation shown under the article. `goal` is only used where it can filter tutors.
export function buildCta({ topic, cta_level = "", cta_goal = "" }) {
  const entry = TOPICS.find((t) => t.id === topic) ?? TOPICS.find((t) => t.id === "study");
  const useGoal = entry.id !== "policy" && !!cta_goal;
  const params = new URLSearchParams();
  if (cta_level) params.set("level", cta_level);
  if (useGoal) params.set("goal", cta_goal);
  const query = params.toString();
  return {
    heading: useGoal ? `Cần người kèm ${cta_goal}?` : entry.cta.heading,
    text: CTA_TEXT,
    button: entry.cta.button,
    href: query ? `/tutors?${query}` : "/tutors",
  };
}

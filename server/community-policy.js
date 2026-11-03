import { cleanPostHtml } from "./community-rich.js";
import { z, text } from "./validation.js";

export const LIMITS = {
  title: 120,
  body: 5000,
  comment: 1000,
  page: 20,
  postsPerDay: 3,
  commentsPerMinute: 5,
  reportsPerHour: 10,
};
export const RULES_TITLE = "Quy tắc cộng đồng";
export const RULES_BODY = `1. Chỉ đăng nội dung về học tập: tìm gia sư, xin review, kinh nghiệm học, chia sẻ kiến thức.
2. Có thể thêm ảnh và liên kết học tập. Không đăng số điện thoại, email, Zalo hoặc địa chỉ nhà.
3. Không quảng cáo, không chèo kéo, không tự khen mình.
4. Góp ý tôn trọng, không lăng mạ, không bôi nhọ cá nhân.
5. Bài được admin duyệt trước khi hiện. Bài bị từ chối sẽ có lý do để bạn sửa lại.
6. Vi phạm lặp lại có thể bị khóa quyền đăng.`;
export const fold = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
export const description = (value) =>
  value.replace(/\s+/g, " ").trim().slice(0, 160);
export function findContactInfo(value, allowLinks = false) {
  const s = fold(
    allowLinks ? value.replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, "") : value,
  );
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/u.test(s)) return "email";
  if (
    !allowLinks &&
    /(?:https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|vn|net|org|edu|gov|io|me|co|info|biz|app|dev|xyz|online|link|site|tech|ai|uk|us)\b)/i.test(
      s,
    )
  )
    return "link";
  if (/(?:^|[^\d])(?:\+?84|0)(?:[\s.()\-]*\d){8,10}(?![\s.()\-]*\d)/u.test(s))
    return "số điện thoại";
  if (
    /\b(?:zalo|facebook|messenger|telegram|tele)(?:\s*[:@]\s*\S+|\s+(?!meeting\b)[a-z0-9_@][a-z0-9_.-]*)/i.test(
      s,
    )
  )
    return "Zalo hoặc tài khoản liên hệ";
  return null;
}
export const content = (max) =>
  z
    .string()
    .trim()
    .min(1, "Vui lòng nhập nội dung.")
    .max(max, `Tối đa ${max} ký tự.`)
    .superRefine((s, ctx) => {
      const contact = findContactInfo(s);
      if (contact)
        ctx.addIssue({
          code: "custom",
          message: `Vui lòng không đăng ${contact}.`,
        });
    });
export const postSchema = z
  .object({
    title: content(LIMITS.title),
    body: z.string().max(LIMITS.body).default(""),
    body_html: z.string().max(50000).optional(),
  })
  .transform((d) => ({
    title: d.title,
    ...(d.body_html !== undefined
      ? cleanPostHtml(d.body_html)
      : { body: d.body.trim(), body_html: "", image_ids: [], image_count: 0 }),
  }))
  .superRefine((d, ctx) => {
    if ((!d.body && !d.image_ids.length) || d.body.length > LIMITS.body)
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "Nhập nội dung hoặc ảnh, tối đa 5.000 ký tự.",
      });
    const contact = findContactInfo(d.body, true);
    if (contact)
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: `Vui lòng không đăng ${contact}.`,
      });
    if (d.image_count > 5)
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "Mỗi bài tối đa 5 ảnh.",
      });
  });
export const displayNameSchema = content(30)
  .min(2)
  .refine(
    (s) => !/(admin|quan\s*tri)/.test(fold(s)),
    "Tên hiển thị không được chứa Admin hoặc Quản trị.",
  );
export function authorLabel(u) {
  const tier =
    u.role === "admin"
      ? "admin"
      : u.role === "tutor" && u.tutor_status === "approved"
        ? "tutor"
        : u.role === "student" && u.learner_type === "parent"
          ? "parent"
          : "student";
  const name =
    tier === "admin" || tier === "tutor"
      ? u.name
      : u.display_name || "Thành viên";
  return {
    label: `${name} - ${{ admin: "Quản trị viên", tutor: "Gia sư", parent: "Phụ huynh", student: "Học sinh" }[tier]}`,
    name_part: name,
    tier,
    ...(tier === "tutor" ? { tutor_id: u.id } : {}),
  };
}
export const subjectAliases = {
  "tieng-anh": ["tieng anh", "anh van", "english"],
  "ngu-van": ["ngu van", "van"],
  "vat-li": ["vat li", "vat ly"],
  "dia-li": ["dia li", "dia ly"],
};
export const levelAliases = {
  "Tiểu học": ["tieu hoc", "cap 1", ...[1, 2, 3, 4, 5].map((n) => `lop ${n}`)],
  THCS: ["thcs", "cap 2", ...[6, 7, 8, 9].map((n) => `lop ${n}`)],
  THPT: ["thpt", "cap 3", ...[10, 11, 12].map((n) => `lop ${n}`)],
  "Người đi làm": ["nguoi di lam", "di lam"],
};

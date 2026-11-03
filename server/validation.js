import provinces from "../shared/vietnam-addresses.json" with { type: "json" };
import { z } from "zod";
const text = (max = 200) => z.string().trim().min(1).max(max);
export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
});
export const registerSchema = loginSchema.extend({
  name: text(80),
  role: z.enum(["student", "tutor"]).default("student"),
});
const educationEntry = z.object({
  level: z.enum(["high_school", "college", "university", "postgraduate", "other"]),
  institution: text(160),
  field: z.string().trim().max(160).default(""),
  start_year: z.number().int().min(1950).refine(year => year <= new Date().getUTCFullYear(), "Năm học không được ở tương lai."),
  end_year: z.number().int().min(1950).refine(year => year <= new Date().getUTCFullYear(), "Năm học không được ở tương lai.").nullable(),
}).refine(entry => entry.end_year === null || entry.end_year >= entry.start_year, { message: "Năm kết thúc phải từ năm bắt đầu trở đi.", path: ["end_year"] });
export const timezoneSchema = z.string().max(80).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Múi giờ không hợp lệ.").optional();
export const availabilitySchema = z.object({
  revision: z.number().int().nonnegative(),
  blocks: z.array(z.object({ weekday: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) })).max(168),
}).refine(d => new Set(d.blocks.map(b => `${b.weekday}:${b.hour}`)).size === d.blocks.length, "Khung giờ bị trùng.");

export const tutorSchema = z.object({
  accepts_trial: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  province_code: z.string().max(5).optional(),
  ward_code: z.string().max(5).optional(),
  availability: availabilitySchema.optional(),
  headline: text(120),
  timezone: timezoneSchema,
  education_history: z.array(educationEntry).max(8).optional(),
  profile_sections: z.array(z.object({ title: text(80), body: text(2000) })).max(10).optional(),
  teaching_style: z.string().trim().max(1500).default(""),
  lesson_plan: z.string().trim().max(1500).default(""),
  profile_theme: z.enum(["paper", "sage", "ink"]).optional(),
  bio: text(2000),
  location: text(100),
  mode: z.enum(["online", "offline", "both"]),
  rate: z.number().int().min(50000).max(3000000),
  experience: z.number().int().min(0).max(60),
  education: text(200),
  subjects: z.array(text(50)).min(1).max(25),
  levels: z
    .array(z.enum(["Tiểu học", "THCS", "THPT", "Người đi làm"]))
    .max(4)
    .default([]),
  goals: z.array(text(80)).max(20).default([]),
});
export const resourceSchema = z.object({
  title: text(200),
  subject_id: text(50),
  category: text(80),
  level: text(80),
  year: z.number().int().min(2000).max(2100),
  description: text(2000),
  source_name: text(200),
  source_url: z.url().refine((s) => s.startsWith("https://")),
  published: z.boolean(),
});
export const subjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,50}$/),
  name: text(100),
  stage: text(100),
  description: text(500),
});
export { z, text };

export const addressSchema = z.object({
  province_code: z.string().max(5), ward_code: z.string().max(5),
}).refine(d => (!d.province_code && !d.ward_code) || provinces.some(p => p.code === d.province_code && p.wards.some(w => w.code === d.ward_code)), "Chọn phường / xã thuộc tỉnh / thành phố.");
export function addressLabel(address) {
  const province = provinces.find(p => p.code === address.province_code);
  const ward = province?.wards.find(w => w.code === address.ward_code);
  return ward ? `${ward.name}, ${province.name}` : "";
}

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
  role: z.enum(["student", "tutor"]),
});
export const tutorSchema = z.object({
  headline: text(120),
  teaching_style: z.string().trim().max(1500).default(""),
  lesson_plan: z.string().trim().max(1500).default(""),
  profile_theme: z.enum(["paper", "sage", "ink"]).default("paper"),
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

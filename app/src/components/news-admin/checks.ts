import { isNewsTopic } from "@/lib/news-topics";

export type NewsFormState = {
  title: string; summary: string; topic: string; cover_url: string; cover_alt: string; cover_credit: string;
  body_html: string; source_name: string; source_url: string; cta_level: string; cta_goal: string; pin: boolean;
};
export const emptyForm: NewsFormState = {
  title: "", summary: "", topic: "study", cover_url: "", cover_alt: "", cover_credit: "",
  body_html: "", source_name: "", source_url: "", cta_level: "", cta_goal: "", pin: false,
};

// Section 6.4. Required items block publishing (server and app); warnings never do.
export function checkNews(form: NewsFormState, words: number, origin: "auto" | "manual") {
  const required = [
    { ok: !!form.title.trim(), good: "Có tiêu đề", bad: "Thiếu tiêu đề" },
    { ok: !!form.summary.trim(), good: "Có tóm tắt", bad: "Thiếu tóm tắt" },
    { ok: words >= 50, good: "Có nội dung", bad: `Nội dung cần ít nhất 50 chữ (hiện ${words})` },
    { ok: isNewsTopic(form.topic), good: "Đã chọn chủ đề", bad: "Chưa chọn chủ đề" },
  ];
  const warnings = [
    !form.cover_url.trim() && "Chưa có ảnh bìa",
    origin === "auto" && !form.source_name.trim() && !form.source_url.trim() && "Chưa ghi nguồn bài gốc",
    words < 150 && "Bài ngắn (dưới 150 chữ)",
    form.title.length > 100 && "Tiêu đề dài hơn 100 ký tự, Google sẽ cắt bớt",
    form.summary.length > 300 && "Tóm tắt dài hơn 300 ký tự",
  ].filter((w): w is string => !!w);
  return { required, warnings, canPublish: required.every((r) => r.ok) };
}

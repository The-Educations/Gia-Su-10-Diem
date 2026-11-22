import { fold, subjectAliases, levelAliases } from "./community-policy.js";
import { subjects } from "./catalog.js";

// Cụm nhận diện bài "tìm gia sư" của học sinh/phụ huynh. Khớp trên bản đã bỏ
// dấu và trọn từ, nên gõ có dấu hay không dấu đều nhận.
export const SEEKING_TUTOR_PHRASES = [
  "tim gia su",
  "can gia su",
  "kiem gia su",
  "can tim thay",
  "tim giao vien",
  "tim nguoi day kem",
  "can nguoi day",
  // "cô" bỏ dấu thành "co" (cũng là "cơ", "có"), nên chỉ nhận các cụm dài.
  "can tim co giao",
  "can tim co day",
];
// "cần tìm cô" khớp trên bản CÒN dấu để không nhầm với "cần tìm cơ hội".
export const SEEKING_TUTOR_ACCENTED_PHRASES = ["cần tìm cô"];
// Cụm nhận diện bài của gia sư đang tìm học sinh (dành cho bước 2, chưa có giao diện).
export const SEEKING_STUDENT_PHRASES = [
  "tim hoc sinh",
  "tim hoc vien",
  "nhan day",
  "nhan kem",
  "nhan hoc sinh",
];
// Cụm môn ngắn hơn ngưỡng này bị bỏ qua ("van" cũng là "vẫn").
const MIN_SUBJECT_PHRASE = 4;

// Chữ thường, NFC, mọi ký tự không phải chữ/số thành khoảng trắng, bao hai đầu
// bằng khoảng trắng để khớp trọn từ bằng includes(" cụm ").
const words = (s) =>
  ` ${s.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `.replace(/ {2,}/g, " ");
const normalize = (text) => {
  const accented = words(String(text ?? "").normalize("NFC").toLowerCase());
  return { accented, folded: words(fold(accented)) };
};
const has = (haystack, phrase) => haystack.includes(` ${phrase} `);
const matchesAny = (haystack, phrases) => phrases.some((p) => has(haystack, p));

// Vị trí sớm nhất của một trong các cụm, hoặc -1.
const earliest = (haystack, phrases) => {
  let best = -1;
  for (const p of phrases) {
    const i = haystack.indexOf(` ${p} `);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
};

const subjectPhrases = subjects.map(([id, name]) => ({
  name,
  phrases: [
    ...new Set([fold(name), ...(subjectAliases[id] || [])].map((p) => fold(p))),
  ].filter((p) => p.length >= MIN_SUBJECT_PHRASE),
}));

export function requestTopic(text) {
  const { folded } = normalize(text);
  let subject = null,
    level = null,
    at = -1;
  for (const s of subjectPhrases) {
    const i = earliest(folded, s.phrases);
    if (i !== -1 && (at === -1 || i < at)) (subject = s.name), (at = i);
  }
  at = -1;
  for (const [name, aliases] of Object.entries(levelAliases)) {
    const i = earliest(folded, aliases);
    if (i !== -1 && (at === -1 || i < at)) (level = name), (at = i);
  }
  return { subject, level };
}

// Quy tắc mở rộng: trong CÙNG MỘT CÂU, từ nói về nhu cầu đứng TRƯỚC từ chỉ gia sư
// và cách nhau không quá MAX_GAP từ ("cần tìm một gia sư", "nhờ giới thiệu gia sư").
// Từ nhu cầu đứng sau, hoặc ở câu khác, không tính ("gia sư của em dạy tốt, em cần cố gắng").
const NEED_WORDS = ["tim", "can", "kiem", "xin", "muon", "gioi thieu", "goi y", "ai biet", "ai day"];
// "nhờ" / "thuê" chỉ nhận khi có dấu: bỏ dấu thì trùng "nhỏ", "nhớ", "thuế".
const NEED_WORDS_ACCENTED = ["nhờ", "thuê"];
const TUTOR_WORDS = ["gia su", "giao vien", "nguoi day kem", "nguoi day", "co giao"];
// "thầy" chỉ nhận khi có dấu: bỏ dấu thì trùng "thay" (thay đổi).
const TUTOR_WORDS_ACCENTED = ["thầy"];
const MAX_GAP = 6;
// Đứng ngay trước từ nhu cầu thì nghĩa là ngược lại: "không cần gia sư", "đã tìm gia sư".
const NEGATING = new Set(["không", "khong", "khỏi", "khoi", "hết", "het", "đã"]);

const sentences = (title, body) =>
  `${title ?? ""}. ${body ?? ""}`.split(/[.!?;:]+|\n\s*\n/);
const tokens = (s) => s.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const phrase = (p) => p.split(" ");
// Vị trí [bắt đầu, kết thúc) của mỗi lần một cụm xuất hiện trong mảng từ.
const spans = (words, phrases) =>
  phrases.flatMap((p) => {
    const ps = phrase(p), found = [];
    for (let i = 0; i + ps.length <= words.length; i++)
      if (ps.every((w, k) => words[i + k] === w)) found.push([i, i + ps.length]);
    return found;
  });

function seeksTutor(sentence) {
  const accented = tokens(sentence), folded = accented.map(fold);
  const allowed = ([start]) => !NEGATING.has(accented[start - 1]);
  const exact = [
    ...spans(folded, SEEKING_TUTOR_PHRASES),
    ...spans(accented, SEEKING_TUTOR_ACCENTED_PHRASES),
  ];
  if (exact.some(allowed)) return true;
  const needs = [...spans(folded, NEED_WORDS), ...spans(accented, NEED_WORDS_ACCENTED)].filter(allowed);
  const tutors = [...spans(folded, TUTOR_WORDS), ...spans(accented, TUTOR_WORDS_ACCENTED)];
  return needs.some(([, end]) => tutors.some(([start]) => start >= end && start - end <= MAX_GAP));
}

// Đoạn tóm ý ngắn của bài cho dải chạy ở thanh trên cùng: phần đầu nội dung, đã
// gộp khoảng trắng, bỏ phần lặp lại tiêu đề, cắt ở ranh giới từ. Không dùng AI.
export const SUMMARY_MAX = 100;
export function summarize(title, body, max = SUMMARY_MAX) {
  let text = String(body ?? "").replace(/\s+/g, " ").trim();
  const head = String(title ?? "").replace(/\s+/g, " ").trim();
  if (head && text.toLowerCase().startsWith(head.toLowerCase()))
    text = text.slice(head.length).replace(/^[\s.,;:!?\-–—]+/, "");
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1),
    space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut.slice(0, max)).replace(/[\s.,;:!?\-–—]+$/, "")}…`;
}

export function classifyRequest({ title, body, authorRole }) {
  const { folded } = normalize(`${title ?? ""}\n${body ?? ""}`);
  if (authorRole === "student")
    return sentences(title, body).some(seeksTutor) ? "seeking_tutor" : null;
  if (authorRole === "tutor")
    return matchesAny(folded, SEEKING_STUDENT_PHRASES)
      ? "seeking_student"
      : null;
  return null;
}

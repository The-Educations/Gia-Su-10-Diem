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

export function classifyRequest({ title, body, authorRole }) {
  const { accented, folded } = normalize(`${title ?? ""}\n${body ?? ""}`);
  if (authorRole === "student")
    return matchesAny(folded, SEEKING_TUTOR_PHRASES) ||
      matchesAny(accented, SEEKING_TUTOR_ACCENTED_PHRASES)
      ? "seeking_tutor"
      : null;
  if (authorRole === "tutor")
    return matchesAny(folded, SEEKING_STUDENT_PHRASES)
      ? "seeking_student"
      : null;
  return null;
}

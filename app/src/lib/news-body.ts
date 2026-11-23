// Bài Tin tức lưu dạng chữ thuần. Ảnh được viết thành một dòng riêng `![mô tả](https://...)`,
// dòng liền sau (nếu có) dạng `Ảnh: <nguồn>` là chú thích. Chỉ dựng <img> từ địa chỉ https.
export type NewsPart =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; alt: string; credit: string };

const IMAGE_LINE = /^!\[([^\]]*)\]\((https:\/\/[^\s()]+)\)\s*$/;
const CREDIT_LINE = /^Ảnh:\s*(.+)$/;

export function parseNewsBody(body: string): NewsPart[] {
  const parts: NewsPart[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").replace(/^\n+|\n+$/g, "");
    if (text) parts.push({ kind: "text", text });
    buffer = [];
  };
  const lines = String(body ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const image = lines[i].match(IMAGE_LINE);
    if (!image) {
      buffer.push(lines[i]);
      continue;
    }
    flush();
    const credit = lines[i + 1]?.match(CREDIT_LINE);
    if (credit) i += 1;
    parts.push({ kind: "image", url: image[2], alt: image[1], credit: credit ? credit[1].trim() : "" });
  }
  flush();
  return parts;
}

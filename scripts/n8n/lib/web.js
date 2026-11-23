// Gói gửi lên web. Mỗi hàm TỰ ĐỨNG MỘT MÌNH (xem ghi chú ở select.js).

export function buildPostBody(d, image, item) {
  // Ảnh bìa và nguồn đi bằng trường riêng; body chỉ còn chữ bài (không dòng ảnh, không dòng "Nguồn:").
  const alt = String(d.title).replace(/[\[\]]/g, "").trim();
  const lines = String(d.body).split("\n");
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end -= 1;
  const found = end > 0 ? lines[end - 1].match(/^Nguồn:\s*(.+?)\s+-\s+(https?:\/\/\S+)\s*$/) : null;
  let source = item && item.link ? { name: String(item.source || ""), url: item.link } : null;
  let body = d.body;
  if (found) {
    if (!source) source = { name: found[1].trim(), url: found[2] };
    body = lines.slice(0, end - 1).join("\n").replace(/\n+$/, "");
  }
  const hasImage = image && image.url;
  return {
    title: d.title,
    summary: d.summary,
    body,
    topic: ["admissions", "policy", "study"].includes(d.topic) ? d.topic : "study",
    origin: "auto",
    cover_url: hasImage ? image.url : "",
    cover_alt: hasImage ? alt : "",
    cover_credit: hasImage ? String(image.credit || "") : "",
    source_name: source ? source.name : "",
    source_url: source ? source.url : "",
    published: false,
  };
}

export function extractSessionCookie(setCookie) {
  const text = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie ?? "");
  const match = text.match(/giasu_session=([^;,\s]+)/);
  return match ? `giasu_session=${match[1]}` : null;
}

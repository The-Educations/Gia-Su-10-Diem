// Gói gửi lên web. Mỗi hàm TỰ ĐỨNG MỘT MÌNH (xem ghi chú ở select.js).

export function buildPostBody(d, image) {
  // Ảnh nằm ở đầu bài dạng markdown một dòng + dòng "Ảnh: <nguồn>"; web dựng thành <figure>.
  const alt = String(d.title).replace(/[\[\]]/g, "").trim();
  const head = image && image.url ? `![${alt}](${image.url})\nẢnh: ${image.credit}\n\n` : "";
  return { title: d.title, summary: d.summary, body: head + d.body, published: false };
}

export function extractSessionCookie(setCookie) {
  const text = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie ?? "");
  const match = text.match(/giasu_session=([^;,\s]+)/);
  return match ? `giasu_session=${match[1]}` : null;
}

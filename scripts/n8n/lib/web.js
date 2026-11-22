// Gói gửi lên web. Mỗi hàm TỰ ĐỨNG MỘT MÌNH (xem ghi chú ở select.js).

export function buildPostBody(d) {
  return { title: d.title, summary: d.summary, body: d.body, published: false };
}

export function extractSessionCookie(setCookie) {
  const text = Array.isArray(setCookie) ? setCookie.join("\n") : String(setCookie ?? "");
  const match = text.match(/giasu_session=([^;,\s]+)/);
  return match ? `giasu_session=${match[1]}` : null;
}

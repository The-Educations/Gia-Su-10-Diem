// Tìm ảnh bìa cho bài. Hàm TỰ ĐỨNG MỘT MÌNH (xem ghi chú ở select.js).
// Chỉ nhận ảnh https từ các host tin cậy: danh sách này PHẢI khớp với img-src trong
// Content-Security-Policy ở worker/index.js, nếu không trình duyệt sẽ không hiện ảnh.

export function findImage(input) {
  const { enclosure, content, meta, link } = input || {};
  const trusted = /(^|\.)(vnu\.edu\.vn|vju\.ac\.vn|hcmus\.edu\.vn|cdneverest\.net|thanhnien\.vn|cdnchinhphu\.vn|vtv\.vn|tuoitre\.vn)$/;
  const origin = (String(link || "").match(/^(https:\/\/[^/?#]+)/) || [])[1] || "";

  const clean = (raw) => {
    let u = String(raw || "").trim().replace(/&amp;|&#0?38;/g, "&");
    if (u.startsWith("//")) u = "https:" + u;
    else if (u.startsWith("/") && origin) u = origin + u;
    if (!/^https:\/\/[^\s()<>"'\\]+$/.test(u) || u.length > 500) return "";
    const host = (u.match(/^https:\/\/([^/:?#]+)/) || [])[1] || "";
    if (!trusted.test(host.toLowerCase())) return "";
    // Ảnh logo/mặc định của site và ảnh vector không phải ảnh của bài.
    if (/logo|favicon|default|placeholder|no-?image/i.test(u) || /\.svg(\?|$)/i.test(u)) return "";
    return u;
  };

  const candidates = [];
  for (const tag of String(meta || "").match(/<meta\b[^>]*>/gi) || []) {
    if (!/(og:image|twitter:image)/i.test(tag)) continue;
    const m = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
    if (m) candidates.push(m[1]);
  }
  if (enclosure && enclosure.url && (!enclosure.type || /^image\//i.test(enclosure.type))) candidates.push(enclosure.url);
  for (const tag of String(content || "").match(/<img\b[^>]*>/gi) || []) {
    const m = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (m) candidates.push(m[1]);
  }

  for (const c of candidates) {
    const ok = clean(c);
    if (ok) return ok;
  }
  return "";
}

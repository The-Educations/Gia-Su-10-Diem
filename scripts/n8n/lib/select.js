// Logic chọn tin mới, hạn mức và trạng thái cho workflow tin tức tự động.
// Mỗi hàm phải TỰ ĐỨNG MỘT MÌNH (không import, không gọi hàm khác, không dùng biến ngoài):
// mã của nó được nhúng thẳng vào ô Code của n8n bằng fn.toString().

export function emptyState() {
  return { seen: [], daily: { date: "", count: 0 } };
}

export function parseState(text) {
  const empty = { seen: [], daily: { date: "", count: 0 } };
  if (!text) return empty;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!raw || typeof raw !== "object") return empty;
  const seen = Array.isArray(raw.seen) ? raw.seen.filter((l) => typeof l === "string") : [];
  const daily = raw.daily && typeof raw.daily === "object" ? raw.daily : {};
  return {
    seen,
    daily: {
      date: typeof daily.date === "string" ? daily.date : "",
      count: Number.isFinite(daily.count) ? daily.count : 0,
    },
  };
}

export function todayVN(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Tên hiển thị và thứ tự ưu tiên của nguồn: trường thuộc ĐHQG (0), Thanh Niên (1),
// báo nhà nước Chính phủ/VTV (2), Tuổi Trẻ (3), còn lại (9). rank thấp được chọn trước.
export function sourceInfo(link) {
  const known = [
    [/(^|\.)uet\.vnu\.edu\.vn$/, "Trường ĐH Công nghệ - ĐHQGHN", 0],
    [/(^|\.)ulis\.vnu\.edu\.vn$/, "Trường ĐH Ngoại ngữ - ĐHQGHN", 0],
    [/(^|\.)law\.vnu\.edu\.vn$/, "Trường ĐH Luật - ĐHQGHN", 0],
    [/(^|\.)vju\.ac\.vn$/, "Trường ĐH Việt Nhật - ĐHQGHN", 0],
    [/(^|\.)vnu\.edu\.vn$/, "Đại học Quốc gia Hà Nội", 0],
    [/(^|\.)hcmus\.edu\.vn$/, "Trường ĐH Khoa học Tự nhiên - ĐHQG-HCM", 0],
    [/(^|\.)vnuhcm\.edu\.vn$/, "Đại học Quốc gia TP.HCM", 0],
    [/(^|\.)thanhnien\.vn$/, "Thanh Niên", 1],
    [/(^|\.)baochinhphu\.vn$/, "Báo điện tử Chính phủ", 2],
    [/(^|\.)vtv\.vn$/, "VTV", 2],
    [/(^|\.)tuoitre\.vn$/, "Tuổi Trẻ", 3],
  ];
  const host = (String(link).match(/^https?:\/\/(?:www\.)?([^/:?#]+)/) || [])[1];
  if (!host) return { name: "Nguồn khác", rank: 9 };
  const hit = known.find(([re]) => re.test(host.toLowerCase()));
  return hit ? { name: hit[1], rank: hit[2] } : { name: host, rank: 9 };
}

export function pickNew(items, state, opts) {
  const seen = new Set(state.seen);
  const byLink = new Map();
  for (const it of items) {
    if (!it || !String(it.title || "").trim() || !String(it.link || "").trim()) continue;
    if (seen.has(it.link) || byLink.has(it.link)) continue;
    byLink.set(it.link, it);
  }
  const time = (it) => (Date.parse(it.isoDate) || 0);
  const rank = (it) => (Number.isFinite(it.rank) ? it.rank : 0);
  const oldest = opts.maxAgeDays && opts.nowMs ? opts.nowMs - opts.maxAgeDays * 86400000 : 0;
  const fresh = [...byLink.values()].filter((it) => !oldest || !time(it) || time(it) >= oldest);
  const unseen = fresh.sort((a, b) => rank(a) - rank(b) || time(b) - time(a));
  const usedToday = state.daily.date === opts.today ? state.daily.count : 0;
  const quota = Math.max(0, Math.min(opts.perRun, opts.perDay - usedToday));
  const firstRun = state.seen.length === 0;
  return {
    pick: unseen.slice(0, quota),
    markSeen: firstRun ? unseen.slice(opts.perRun).map((it) => it.link) : [],
  };
}

export function settle(state, outcomes, today) {
  const done = new Set(state.seen);
  const seen = [...state.seen];
  let posted = 0;
  for (const o of outcomes) {
    if (o.kind === "posted") posted += 1;
    if (o.kind === "error") continue;
    if (!done.has(o.link)) {
      done.add(o.link);
      seen.push(o.link);
    }
  }
  const base = state.daily.date === today ? state.daily.count : 0;
  return { seen: seen.slice(-2000), daily: { date: today, count: base + posted } };
}

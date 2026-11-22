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

export function pickNew(items, state, opts) {
  const seen = new Set(state.seen);
  const byLink = new Map();
  for (const it of items) {
    if (!it || !String(it.title || "").trim() || !String(it.link || "").trim()) continue;
    if (seen.has(it.link) || byLink.has(it.link)) continue;
    byLink.set(it.link, it);
  }
  const time = (it) => (Date.parse(it.isoDate) || 0);
  const unseen = [...byLink.values()].sort((a, b) => time(b) - time(a));
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

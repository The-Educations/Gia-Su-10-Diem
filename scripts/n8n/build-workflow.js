// Sinh workflow n8n "Tin tức tự động" thành scripts/n8n/news-workflow.json.
// Chạy: node scripts/n8n/build-workflow.js
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseState, todayVN, pickNew, settle, sourceInfo } from "./lib/select.js";
import { findImage } from "./lib/image.js";
import { isOnTopic } from "./lib/topic.js";
import { buildPrompt, parseClaudeOutput, normalizeDraft, validateDraft } from "./lib/draft.js";
import { buildPostBody, extractSessionCookie } from "./lib/web.js";

// Thứ tự ưu tiên khi chọn tin nằm ở sourceInfo (lib/select.js): trường thuộc ĐHQG, rồi Thanh Niên,
// rồi báo nhà nước (Chính phủ, VTV), rồi Tuổi Trẻ. Thứ tự dưới đây chỉ là thứ tự đọc.
const FEEDS = [
  "https://uet.vnu.edu.vn/feed",
  "https://ulis.vnu.edu.vn/feed",
  "https://vju.ac.vn/feed",
  "https://law.vnu.edu.vn/feed",
  "https://tuyensinh.hcmus.edu.vn/feed",
  "https://thanhnien.vn/rss/giao-duc/tuyen-sinh.rss",
  "https://thanhnien.vn/rss/giao-duc/du-hoc.rss",
  "https://thanhnien.vn/rss/giao-duc.rss",
  "https://baochinhphu.vn/giao-duc.rss",
  "https://vtv.vn/rss/giao-duc.rss",
  "https://tuoitre.vn/rss/tuyen-sinh.rss",
];
const STATE_FILE = '"$HOME/.n8n/news-state.json"';
const LOCK = '"$HOME/.n8n/news.lock"';
// Lấy khoá bằng mkdir (nguyên tử). Khoá treo quá 2 giờ (lần chạy bị dừng giữa chừng) tự được gỡ.
const READ_STATE_AND_LOCK =
  `if mkdir ${LOCK} 2>/dev/null || { find ${LOCK} -maxdepth 0 -mmin +120 -exec rmdir {} \\; 2>/dev/null; mkdir ${LOCK} 2>/dev/null; }; ` +
  `then cat ${STATE_FILE} 2>/dev/null || true; else echo __LOCKED__; fi`;
const CLAUDE_FLAGS =
  "--tools WebFetch --allowedTools WebFetch --output-format json --no-session-persistence --max-turns 4 " +
  "--strict-mcp-config --mcp-config '{\"mcpServers\":{} }' --disable-slash-commands --setting-sources project";
// Lưu ý: cố ý có khoảng trắng trong {} } vì "}}" bên trong biểu thức n8n sẽ cắt cụt biểu thức ("invalid syntax").

const inline = (...fns) => fns.map((f) => f.toString()).join("\n\n");
const BASE_URL = "={{ $('Cài đặt').first().json.baseUrl }}";
const JSON_HEADER = { name: "Content-Type", value: "application/json" };

// Lệnh ghi trạng thái: nhận JSON đã mã hoá base64 để không bao giờ chèn chữ lạ vào lệnh shell.
const WRITE_STATE = `
const writeCommand = (state, release) =>
  'mkdir -p "$HOME/.n8n" && echo ' + Buffer.from(JSON.stringify(state), "utf8").toString("base64") +
  ' | base64 -d > ${STATE_FILE}' + (release ? '; rmdir ${LOCK} 2>/dev/null || true' : '');
`;

const CODE = {
  "Danh sách nguồn": `
if (String($('Đọc trạng thái').first().json.stdout).trim() === "__LOCKED__") {
  throw new Error("Đang có lần chạy khác, hoặc lần chạy trước bị dừng giữa chừng. Nếu chắc chắn không có, xoá thư mục ~/.n8n/news.lock rồi chạy lại.");
}
const urls = String($('Cài đặt').first().json.feeds).split("\\n").map((s) => s.trim()).filter(Boolean);
return urls.map((url) => ({ json: { url } }));
`,

  "Chọn tin mới": `${inline(parseState, todayVN, pickNew, buildPrompt, isOnTopic, sourceInfo, findImage)}

const cfg = $('Cài đặt').first().json;
const state = parseState($('Đọc trạng thái').first().json.stdout);
const feed = $input.all().map((i) => i.json).filter((j) => j && j.link && j.title)
  .filter((j) => isOnTopic({ title: j.title, summary: j.contentSnippet || j.content }))
  .map((j) => {
    const info = sourceInfo(j.link);
    return {
      title: String(j.title),
      link: String(j.link),
      source: info.name,
      rank: info.rank,
      summary: String(j.contentSnippet || j.content || "").slice(0, 1000),
      isoDate: j.isoDate || j.pubDate || "",
      rssImage: findImage({ enclosure: j.enclosure, content: j.content, link: j.link }),
    };
  });
const today = todayVN(new Date());
const { pick, markSeen } = pickNew(feed, state, { perRun: cfg.perRun, perDay: cfg.perDay, today, maxAgeDays: 30, nowMs: Date.now() });
if (!pick.length) return [{ json: { none: true, markSeen, today } }];
return pick.map((it, idx) => ({
  json: {
    ...it,
    promptB64: Buffer.from(buildPrompt(it), "utf8").toString("base64"),
    linkB64: Buffer.from(it.link, "utf8").toString("base64"),
    markSeen: idx === 0 ? markSeen : [],
    today,
  },
}));
`,

  "Kiểm tra bài": `${inline(parseClaudeOutput, normalizeDraft, validateDraft, buildPostBody, findImage)}

const picks = $('Lấy cookie').all().map((i) => i.json);
const results = $('Claude viết bài').all().map((i) => i.json);
const metas = $input.all().map((i) => i.json);
return picks.map((p, i) => {
  if (p.none) return { json: { kind: "none", markSeen: p.markSeen, today: p.today } };
  const base = { link: p.link, title: p.title, source: p.source, markSeen: p.markSeen, today: p.today, cookie: p.cookie };
  const r = results[i] || {};
  if (r.error || typeof r.stdout !== "string") return { json: { ...base, kind: "error", reason: String(r.error || "không có kết quả") } };
  const parsed = parseClaudeOutput(r.stdout);
  if (!parsed) return { json: { ...base, kind: "error", reason: "không đọc được đầu ra của Claude" } };
  if (parsed.skip) return { json: { ...base, kind: "skipped", reason: parsed.reason } };
  const draft = normalizeDraft(parsed);
  const check = validateDraft(draft, p);
  if (!check.ok) return { json: { ...base, kind: "rejected", reason: check.reasons.join("; ") } };
  const image = findImage({ meta: (metas[i] || {}).stdout, enclosure: { url: p.rssImage }, link: p.link });
  return { json: { ...base, kind: "ready", hasImage: Boolean(image), postBody: buildPostBody(draft, image ? { url: image, credit: p.source } : null, { source: p.source, link: p.link }) } };
});
`,

  "Ghi nhận kiểm tra": `${inline(parseState, settle)}
${WRITE_STATE}
const state0 = parseState($('Đọc trạng thái').first().json.stdout);
const rows = $input.all().map((i) => i.json);
const markSeen = rows.flatMap((r) => r.markSeen || []);
const outcomes = [
  ...markSeen.map((link) => ({ link, kind: "skipped" })),
  ...rows.filter((r) => r.link && r.kind !== "ready").map((r) => ({ link: r.link, kind: r.kind })),
];
const state = settle(state0, outcomes, rows[0].today);
const log = rows.filter((r) => r.reason).map((r) => r.kind + ": " + r.link + " — " + r.reason);
const hasReady = rows.some((r) => r.kind === "ready");
return [{ json: { state, command: writeCommand(state, !hasReady), log } }];
`,

  "Bài sẵn sàng": `
return $('Kiểm tra bài').all().filter((i) => i.json.kind === "ready")
  .map((i) => ({ json: { link: i.json.link, postBody: i.json.postBody, cookie: i.json.cookie, today: i.json.today } }));
`,

  "Lấy cookie": `${inline(extractSessionCookie)}

const login = $input.first().json;
const cookie = extractSessionCookie(login.headers && login.headers["set-cookie"]);
if (!cookie) throw new Error("Đăng nhập web không trả cookie phiên (kiểm tra credential News Bot Login)");
return $('Chọn tin mới').all().map((i) => ({ json: { ...i.json, cookie } }));
`,

  "Tổng kết": `${inline(settle)}
${WRITE_STATE}
const state1 = $('Ghi nhận kiểm tra').first().json.state;
const prepared = $('Bài sẵn sàng').all().map((i) => i.json);
const results = $input.all().map((i) => i.json);
const outcomes = prepared.map((p, i) => ({ link: p.link, kind: results[i] && !results[i].error && results[i].id ? "posted" : "error" }));
const state = settle(state1, outcomes, prepared[0].today);
return [{ json: { state, command: writeCommand(state, true), posted: outcomes.filter((o) => o.kind === "posted").length } }];
`,
};

export function buildWorkflow() {
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const nodes = [];
  const add = (name, type, typeVersion, position, parameters, extra = {}) =>
    nodes.push({ id: id(), name, type, typeVersion, position, parameters, ...extra });
  const code = (name, position) => add(name, "n8n-nodes-base.code", 2, position, { jsCode: CODE[name].trim() });
  const command = (name, position, cmd, extra = {}) =>
    add(name, "n8n-nodes-base.executeCommand", 1, position, { executeOnce: true, command: cmd }, extra);
  const col = (i) => i * 240;
  const [R1, R2, R3] = [0, 300, 600];

  add("Hẹn giờ", "n8n-nodes-base.scheduleTrigger", 1.2, [col(0), R1], { rule: { interval: [{ field: "hours", hoursInterval: 3 }] } });
  add("Chạy tay", "n8n-nodes-base.manualTrigger", 1, [col(0), R1 - 150], {});
  add("Cài đặt", "n8n-nodes-base.set", 3.4, [col(1), R1], {
    assignments: {
      assignments: [
        { id: id(), name: "baseUrl", value: "http://127.0.0.1:4174", type: "string" },
        { id: id(), name: "perRun", value: 5, type: "number" },
        { id: id(), name: "perDay", value: 10, type: "number" },
        { id: id(), name: "feeds", value: FEEDS.join("\n"), type: "string" },
      ],
    },
    options: {},
  });
  command("Đọc trạng thái", [col(2), R1], READ_STATE_AND_LOCK);
  code("Danh sách nguồn", [col(3), R1]);
  add("Đọc RSS", "n8n-nodes-base.rssFeedRead", 1.2, [col(4), R1], { url: "={{ $json.url }}", options: {} }, { onError: "continueRegularOutput" });
  code("Chọn tin mới", [col(5), R1]);

  // Đăng nhập NGAY SAU khi chọn tin và TRƯỚC khi gọi Claude: login hỏng thì không tốn lượt Claude nào.
  add("Đăng nhập web", "n8n-nodes-base.httpRequest", 4.2, [col(0), R2], {
    method: "POST",
    url: `${BASE_URL}/api/auth/login`,
    authentication: "genericCredentialType",
    genericAuthType: "httpCustomAuth",
    sendHeaders: true,
    headerParameters: { parameters: [JSON_HEADER] },
    options: { response: { response: { fullResponse: true } } },
  }, { executeOnce: true, credentials: { httpCustomAuth: { name: "News Bot Login" } } });
  code("Lấy cookie", [col(1), R2]);

  const prefix = 'mkdir -p "$HOME/.n8n/news-work" && cd "$HOME/.n8n/news-work" && perl -e \'alarm 300; exec @ARGV\' claude -p "$(echo ';
  const suffix = ` | base64 -d)" ${CLAUDE_FLAGS}`;
  command("Claude viết bài", [col(2), R2], `={{ $json.none ? "true" : ${JSON.stringify(prefix)} + $json.promptB64 + ${JSON.stringify(suffix)} }}`, {
    onError: "continueRegularOutput",
  });
  nodes.at(-1).parameters.executeOnce = false;
  // Lấy thẻ og:image của trang gốc để có ảnh bìa. Link đi qua base64, không chèn thẳng vào lệnh shell.
  const imgPrefix = "curl -sL --proto '=https' --proto-redir '=https' --max-redirs 3 -m 20 -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' \"$(echo ";
  const imgSuffix = " | base64 -d)\" | head -c 400000 | grep -o -i -E '<meta[^>]+(og:image|twitter:image)[^>]*>' | head -4; true";
  command("Lấy ảnh bìa", [col(3), R2], `={{ $('Lấy cookie').item.json.none ? "true" : ${JSON.stringify(imgPrefix)} + $('Lấy cookie').item.json.linkB64 + ${JSON.stringify(imgSuffix)} }}`, {
    onError: "continueRegularOutput",
  });
  nodes.at(-1).parameters.executeOnce = false;
  code("Kiểm tra bài", [col(4), R2]);
  code("Ghi nhận kiểm tra", [col(5), R2]);
  command("Lưu trạng thái 1", [col(6), R2], "={{ $json.command }}");

  code("Bài sẵn sàng", [col(0), R3]);
  add("Tạo bài nháp", "n8n-nodes-base.httpRequest", 4.2, [col(1), R3], {
    method: "POST",
    url: `${BASE_URL}/api/admin/posts`,
    sendHeaders: true,
    headerParameters: { parameters: [JSON_HEADER, { name: "Cookie", value: "={{ $json.cookie }}" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json.postBody) }}",
    options: {},
  }, { onError: "continueRegularOutput" });
  code("Tổng kết", [col(2), R3]);
  command("Lưu trạng thái 2", [col(3), R3], "={{ $json.command }}");

  const note = (content, position, width, color) =>
    add(`Ghi chú ${content.split("\n")[0]}`, "n8n-nodes-base.stickyNote", 1, position, { content, width, height: 140, color });
  note("1–3. Lấy tin mới\nHẹn giờ, đọc các nguồn (trường ĐHQG, Thanh Niên, báo nhà nước), lọc đúng chủ đề, chọn tối đa 5 tin chưa xử lý. Sửa địa chỉ web và giới hạn ở ô Cài đặt.", [-20, -170], 1480, 7);
  note("4–5. Đăng nhập, Claude viết bài và kiểm tra\nĐăng nhập bằng tài khoản bot trước (hỏng thì dừng, không tốn lượt Claude). Claude viết lại bằng lời mới; ảnh bìa lấy từ trang gốc (không có ảnh vẫn đăng). Bài sai độ dài hoặc thiếu dòng Nguồn bị bỏ.", [-20, 130], 1480, 6);
  note("6–7. Tạo bài nháp trên web\nChỉ tạo bài NHÁP. 8–9: bạn mở Admin → Tin tức duyệt và bấm đăng.", [-20, 430], 960, 4);

  const FLOW = [
    "Hẹn giờ", "Cài đặt", "Đọc trạng thái", "Danh sách nguồn", "Đọc RSS", "Chọn tin mới",
    "Đăng nhập web", "Lấy cookie", "Claude viết bài", "Lấy ảnh bìa", "Kiểm tra bài", "Ghi nhận kiểm tra",
    "Lưu trạng thái 1", "Bài sẵn sàng", "Tạo bài nháp", "Tổng kết", "Lưu trạng thái 2",
  ];
  const connections = {};
  FLOW.slice(0, -1).forEach((from, i) => {
    connections[from] = { main: [[{ node: FLOW[i + 1], type: "main", index: 0 }]] };
  });

  connections["Chạy tay"] = { main: [[{ node: "Cài đặt", type: "main", index: 0 }]] };

  return { name: "Tin tức tự động", nodes, connections, active: false, settings: { executionOrder: "v1" }, pinData: {} };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL("./news-workflow.json", import.meta.url));
  writeFileSync(out, JSON.stringify(buildWorkflow(), null, 2) + "\n");
  console.log("Đã ghi", out);
}

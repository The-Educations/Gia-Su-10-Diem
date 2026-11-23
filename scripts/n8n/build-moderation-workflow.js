// Sinh workflow n8n "Kiểm duyệt Cộng đồng" thành scripts/n8n/moderation-workflow.json.
// Chạy: node scripts/n8n/build-moderation-workflow.js
// Thiết kế: docs/superpowers/specs/2026-11-23-kiem-duyet-cong-dong-ai-design.md
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { todayVN } from "./lib/select.js";
import { extractSessionCookie } from "./lib/web.js";
import {
  parseModState, reviewKey, extractLinks, hasImage, looksLikeInjection, topicLabel, pickPending,
  buildModerationPrompt, parseVerdict, decideModeration, settleModeration, buildClaudeCommand, buildWriteCommand,
} from "./lib/moderation.js";

const RUBRIC = readFileSync(fileURLToPath(new URL("./moderation-rubric.md", import.meta.url)), "utf8");

const STATE_FILE = '"$HOME/.n8n/moderation-state.json"';
const LOCK = '"$HOME/.n8n/moderation.lock"';
// Khoá bằng mkdir (nguyên tử). Khoá treo quá 30 phút (lần chạy bị dừng giữa chừng) tự được gỡ.
// Một lượt dài nhất: tối đa perRun bài, mỗi lần gọi Claude giới hạn 2 phút, hai lần lỗi liên tiếp là dừng.
const READ_STATE_AND_LOCK =
  `mkdir -p "$HOME/.n8n"; ` +
  `if mkdir ${LOCK} 2>/dev/null || { find ${LOCK} -maxdepth 0 -mmin +30 -exec rmdir {} \\; 2>/dev/null; mkdir ${LOCK} 2>/dev/null; }; ` +
  `then cat ${STATE_FILE} 2>/dev/null || true; else echo __LOCKED__; fi`;

const inline = (...fns) => fns.map((f) => f.toString()).join("\n\n");
const BASE_URL = "={{ $('Cài đặt').first().json.baseUrl }}";
const JSON_HEADER = { name: "Content-Type", value: "application/json" };

const CODE = {
  "Kiểm tra khoá": `
if (String($('Đọc trạng thái').first().json.stdout).trim() === "__LOCKED__") {
  throw new Error("Đang có lần chạy khác, hoặc lần chạy trước bị dừng giữa chừng. Nếu chắc chắn không có, xoá thư mục ~/.n8n/moderation.lock rồi chạy lại.");
}
return [{ json: { ok: true } }];
`,

  "Lấy cookie": `${inline(extractSessionCookie)}

const login = $input.first().json;
const cookie = login.error ? null : extractSessionCookie(login.headers && login.headers["set-cookie"]);
if (!cookie) {
  return [{ json: { fatal: "Đăng nhập web không được (HTTP " + (login.statusCode ?? "?") + "). Kiểm tra credential Moderation Bot Login và quyền admin của tài khoản bot." } }];
}
return [{ json: { cookie } }];
`,

  "Chọn bài chấm": `${inline(parseModState, reviewKey, extractLinks, hasImage, looksLikeInjection, topicLabel, pickPending, buildModerationPrompt, buildClaudeCommand)}

const RUBRIC = ${JSON.stringify(RUBRIC)};
const cfg = $('Cài đặt').first().json;
const empty = { candidates: [], escalations: [], command: "true" };
const login = $('Lấy cookie').first().json;
if (login.fatal) return [{ json: { ...empty, fatal: login.fatal } }];
const res = $input.first().json;
if (res.error || res.statusCode !== 200 || !Array.isArray(res.body)) {
  return [{ json: { ...empty, fatal: "Không lấy được hàng đợi (HTTP " + (res.statusCode ?? "?") + "). Tài khoản bot có thể chưa có quyền admin." } }];
}
const state = parseModState($('Đọc trạng thái').first().json.stdout);
const { candidates, escalations } = pickPending(res.body, state, { perRun: cfg.perRun, maxFailures: cfg.maxFailures, mode: cfg.mode });
const prompts = candidates.map((c) => Buffer.from(buildModerationPrompt(c, RUBRIC), "utf8").toString("base64"));
return [{ json: { candidates, escalations, command: buildClaudeCommand(prompts, { model: cfg.model, timeoutSeconds: cfg.timeoutSeconds }) } }];
`,

  "Quyết định": `${inline(todayVN, parseModState, parseVerdict, decideModeration, settleModeration, buildWriteCommand)}

const pre = $('Chọn bài chấm').first().json;
const cfg = $('Cài đặt').first().json;
const state0 = parseModState($('Đọc trạng thái').first().json.stdout);
const nowMs = Date.now();
const today = todayVN(new Date(nowMs));
const claude = $input.first().json;
const caps = { approve: cfg.capApprove, reject: cfg.capReject };

let fatal = pre.fatal || "";
if (!fatal && pre.candidates.length && (claude.error || typeof claude.stdout !== "string")) {
  fatal = "Chạy Claude lỗi: " + String(claude.error || "không có kết quả").slice(0, 300);
}

const outcomes = [];
const actions = [];
const logLines = [];
const logRow = (c, ai, decision, reason, done) =>
  JSON.stringify({ t: new Date(nowMs).toISOString(), id: c.id, version: c.version, kind: c.revision ? "revision" : "new", title: String(c.title).slice(0, 160), ai, decision, reason, done });

if (!fatal) {
  for (const e of pre.escalations) {
    outcomes.push({ key: e.key, kind: "escalated" });
    logLines.push(logRow(e, null, "escalate", e.reason, true));
  }
  const raw = {};
  for (const line of String(claude.stdout || "").split("\\n")) {
    const m = line.match(/^R (\\d+) (\\S*)$/);
    if (m) raw[Number(m[1])] = Buffer.from(m[2], "base64").toString("utf8");
  }
  const daily = state0.daily.date === today ? { ...state0.daily } : { date: today, approved: 0, rejected: 0 };
  pre.candidates.forEach((c, i) => {
    if (!(i in raw)) return;
    const verdict = parseVerdict(raw[i]);
    const ai = verdict ? { verdict: verdict.verdict, category: verdict.category, detail: String(verdict.detail).slice(0, 200) } : null;
    const d = decideModeration(verdict, { mode: cfg.mode, daily, today, caps });
    if (d.action === "error") {
      outcomes.push({ key: c.key, kind: "error" });
      logLines.push(logRow(c, ai, "error", d.reason, false));
    } else if (d.action === "shadow") {
      outcomes.push({ key: c.key, kind: "shadow", wouldDo: d.wouldDo });
      logLines.push(logRow(c, ai, "shadow:" + d.wouldDo, d.reason, false));
    } else if (d.action === "escalate") {
      outcomes.push({ key: c.key, kind: "escalated" });
      logLines.push(logRow(c, ai, "escalate", d.reason, true));
    } else {
      if (d.action === "approve") daily.approved += 1;
      else daily.rejected += 1;
      actions.push({ key: c.key, id: c.id, version: c.version, revision: c.revision, title: String(c.title).slice(0, 160), action: d.action, ai, reason: d.reason, body: { expected_version: c.version, note: d.note || "" } });
    }
  });
}

const state = fatal ? state0 : settleModeration(state0, outcomes, today, nowMs);
return [{ json: { fatal, state, today, nowMs, actions, command: buildWriteCommand(state, logLines, !actions.length) } }];
`,

  "Việc cần làm": `
const q = $('Quyết định').first().json;
if (q.fatal) throw new Error(q.fatal);
const cookie = $('Lấy cookie').first().json.cookie;
return q.actions.map((a) => ({ json: { ...a, cookie } }));
`,

  "Tổng kết": `${inline(settleModeration, buildWriteCommand)}

const q = $('Quyết định').first().json;
const acts = $('Việc cần làm').all().map((i) => i.json);
const results = $input.all().map((i) => i.json);
const outcomes = [];
const logLines = [];
acts.forEach((a, i) => {
  const r = results[i] || {};
  const status = r.error ? undefined : r.statusCode;
  const kind = status === 200 ? (a.action === "approve" ? "approved" : "rejected") : status === 409 ? "conflict" : "error";
  outcomes.push({ key: a.key, kind });
  logLines.push(JSON.stringify({
    t: new Date().toISOString(), id: a.id, version: a.version, kind: a.revision ? "revision" : "new", title: a.title, ai: a.ai,
    decision: a.action, reason: a.reason, done: status === 200, result: status === 409 ? "conflict" : status === 200 ? "ok" : "error HTTP " + (status ?? "?"),
  }));
});
const state = settleModeration(q.state, outcomes, q.today, Date.now());
return [{ json: { state, command: buildWriteCommand(state, logLines, true), approved: outcomes.filter((o) => o.kind === "approved").length, rejected: outcomes.filter((o) => o.kind === "rejected").length } }];
`,
};

export function buildWorkflow() {
  let n = 0;
  const id = () => `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`;
  const nodes = [];
  const add = (name, type, typeVersion, position, parameters, extra = {}) =>
    nodes.push({ id: id(), name, type, typeVersion, position, parameters, ...extra });
  const code = (name, position) => add(name, "n8n-nodes-base.code", 2, position, { jsCode: CODE[name].trim() });
  const command = (name, position, cmd, extra = {}) =>
    add(name, "n8n-nodes-base.executeCommand", 1, position, { executeOnce: true, command: cmd }, extra);
  const col = (i) => i * 240;
  const [R1, R2, R3] = [0, 300, 600];

  add("Hẹn giờ", "n8n-nodes-base.scheduleTrigger", 1.2, [col(0), R1], { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } });
  add("Chạy tay", "n8n-nodes-base.manualTrigger", 1, [col(0), R1 - 150], {});
  add("Cài đặt", "n8n-nodes-base.set", 3.4, [col(1), R1], {
    assignments: {
      assignments: [
        { id: id(), name: "baseUrl", value: "http://127.0.0.1:4174", type: "string" },
        // shadow: chỉ ghi nhật ký. approve_only: tự duyệt. full: tự duyệt và tự từ chối. Giá trị lạ coi là shadow.
        { id: id(), name: "mode", value: "shadow", type: "string" },
        { id: id(), name: "perRun", value: 10, type: "number" },
        { id: id(), name: "maxFailures", value: 3, type: "number" },
        { id: id(), name: "capApprove", value: 40, type: "number" },
        { id: id(), name: "capReject", value: 15, type: "number" },
        { id: id(), name: "model", value: "haiku", type: "string" },
        { id: id(), name: "timeoutSeconds", value: 120, type: "number" },
      ],
    },
    options: {},
  });
  command("Đọc trạng thái", [col(2), R1], READ_STATE_AND_LOCK);
  code("Kiểm tra khoá", [col(3), R1]);
  // Đăng nhập và lấy hàng đợi KHÔNG làm hỏng cả lần chạy khi lỗi (neverError): lỗi được chuyển thành "fatal"
  // đi hết chuỗi để nhả khoá, rồi mới báo đỏ ở ô Việc cần làm.
  add("Đăng nhập web", "n8n-nodes-base.httpRequest", 4.2, [col(4), R1], {
    method: "POST",
    url: `${BASE_URL}/api/auth/login`,
    authentication: "genericCredentialType",
    genericAuthType: "httpCustomAuth",
    sendHeaders: true,
    headerParameters: { parameters: [JSON_HEADER] },
    options: { response: { response: { fullResponse: true, neverError: true } } },
  }, { executeOnce: true, onError: "continueRegularOutput", credentials: { httpCustomAuth: { name: "Moderation Bot Login" } } });
  code("Lấy cookie", [col(5), R1]);

  add("Lấy hàng đợi", "n8n-nodes-base.httpRequest", 4.2, [col(0), R2], {
    method: "GET",
    url: `${BASE_URL}/api/admin/community/queue`,
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Cookie", value: '={{ $json.cookie || "none" }}' }] },
    options: { response: { response: { fullResponse: true, neverError: true } } },
  }, { executeOnce: true, onError: "continueRegularOutput" });
  code("Chọn bài chấm", [col(1), R2]);
  command("Claude chấm", [col(2), R2], "={{ $json.command }}", { onError: "continueRegularOutput" });
  code("Quyết định", [col(3), R2]);
  command("Lưu trạng thái 1", [col(4), R2], "={{ $json.command }}");

  code("Việc cần làm", [col(0), R3]);
  add("Thực hiện", "n8n-nodes-base.httpRequest", 4.2, [col(1), R3], {
    method: "POST",
    url: `${BASE_URL}/api/admin/community/posts/{{ $json.id }}/{{ $json.action }}`,
    sendHeaders: true,
    headerParameters: { parameters: [JSON_HEADER, { name: "Cookie", value: "={{ $json.cookie }}" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json.body) }}",
    options: { response: { response: { fullResponse: true, neverError: true } } },
  }, { onError: "continueRegularOutput" });
  code("Tổng kết", [col(2), R3]);
  command("Lưu trạng thái 2", [col(3), R3], "={{ $json.command }}");

  const note = (content, position, width, color) =>
    add(`Ghi chú ${content.split("\n")[0]}`, "n8n-nodes-base.stickyNote", 1, position, { content, width, height: 140, color });
  note("1–2. Hẹn giờ, khoá, đăng nhập\nMỗi 5 phút, lấy khoá chống chạy chồng rồi đăng nhập bằng tài khoản Bot kiểm duyệt. Máy tắt thì bài nằm trong hàng đợi cho admin duyệt tay như cũ.", [-20, -170], 1480, 7);
  note("3–5. Hàng đợi, Claude chấm, quyết định\nBài có ảnh hoặc nghi cài lệnh không gửi Claude. Haiku chỉ trả approve/reject/escalate; mã quyết định cuối theo chế độ (shadow / approve_only / full) và trần mỗi ngày.", [-20, 130], 1480, 6);
  note("6–7. Thực hiện trên web\nGọi approve/reject kèm expected_version. Web trả 409 (tác giả vừa sửa) thì bỏ qua. Nhật ký: ~/.n8n/moderation-log.jsonl.", [-20, 430], 960, 4);

  const FLOW = [
    "Hẹn giờ", "Cài đặt", "Đọc trạng thái", "Kiểm tra khoá", "Đăng nhập web", "Lấy cookie", "Lấy hàng đợi",
    "Chọn bài chấm", "Claude chấm", "Quyết định", "Lưu trạng thái 1", "Việc cần làm", "Thực hiện", "Tổng kết", "Lưu trạng thái 2",
  ];
  const connections = {};
  FLOW.slice(0, -1).forEach((from, i) => {
    connections[from] = { main: [[{ node: FLOW[i + 1], type: "main", index: 0 }]] };
  });
  connections["Chạy tay"] = { main: [[{ node: "Cài đặt", type: "main", index: 0 }]] };

  return { name: "Kiểm duyệt Cộng đồng", nodes, connections, active: false, settings: { executionOrder: "v1" }, pinData: {} };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL("./moderation-workflow.json", import.meta.url));
  writeFileSync(out, JSON.stringify(buildWorkflow(), null, 2) + "\n");
  console.log("Đã ghi", out);
}

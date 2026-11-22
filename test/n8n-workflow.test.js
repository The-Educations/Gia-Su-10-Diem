import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflow } from "../scripts/n8n/build-workflow.js";

const wf = buildWorkflow();
const node = (name) => wf.nodes.find((n) => n.name === name);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const FLOW = [
  "Hẹn giờ", "Cài đặt", "Đọc trạng thái", "Danh sách nguồn", "Đọc RSS", "Chọn tin mới",
  "Claude viết bài", "Kiểm tra bài", "Ghi nhận kiểm tra", "Lưu trạng thái 1", "Bài sẵn sàng",
  "Đăng nhập web", "Chuẩn bị đăng", "Tạo bài nháp", "Tổng kết", "Lưu trạng thái 2",
];

// Chạy mã của một ô Code với dữ liệu giả của các ô khác.
const run = (name, { nodes = {}, input = [] } = {}) => {
  const ref = (n) => ({ first: () => nodes[n][0], all: () => nodes[n] });
  const $input = { first: () => input[0], all: () => input };
  return new AsyncFunction("$", "$input", "Buffer", node(name).parameters.jsCode)(ref, $input, Buffer);
};
const items = (...rows) => rows.map((json) => ({ json }));
const cfg = items({ baseUrl: "http://x", perRun: 5, perDay: 10, feeds: "a" });
const noState = items({ stdout: "" });
const goodBody = (link) => `${"Đoạn nội dung đã được viết lại bằng lời mới. ".repeat(16).trim()}\n\nNguồn: VnExpress - ${link}`;
const claudeOut = (link, extra = {}) =>
  JSON.stringify({ type: "result", is_error: false, result: JSON.stringify({ skip: false, title: "Tiêu đề", summary: "Tóm tắt", body: goodBody(link), ...extra }) });
const rss = (n) => ({ title: `Tin ${n}`, link: `https://vnexpress.net/tin-${n}.html`, contentSnippet: "tóm tắt", isoDate: `2026-11-22T0${n}:00:00Z` });

test("workflow có đủ các ô và nối thành một chuỗi từ Hẹn giờ đến Lưu trạng thái 2", () => {
  for (const name of FLOW) assert.ok(node(name), `thiếu ô ${name}`);
  for (let i = 0; i < FLOW.length - 1; i++) {
    const targets = (wf.connections[FLOW[i]]?.main?.[0] || []).map((c) => c.node);
    assert.deepEqual(targets, [FLOW[i + 1]], `${FLOW[i]} phải nối tới ${FLOW[i + 1]}`);
  }
});

test("lịch là mỗi 3 giờ", () => {
  assert.deepEqual(node("Hẹn giờ").parameters.rule.interval, [{ field: "hours", hoursInterval: 3 }]);
});

test("chứa đúng bốn địa chỉ RSS", () => {
  const feeds = node("Cài đặt").parameters.assignments.assignments.find((a) => a.name === "feeds").value.split("\n");
  assert.deepEqual(feeds, [
    "https://vnexpress.net/rss/giao-duc.rss",
    "https://tuoitre.vn/rss/giao-duc.rss",
    "https://dantri.com.vn/rss/giao-duc.rss",
    "https://thanhnien.vn/rss/giao-duc.rss",
  ]);
});

test("ô Claude viết bài gọi claude -p với các cờ thu gọn và chỉ cho đọc web", () => {
  const p = node("Claude viết bài").parameters;
  assert.equal(p.executeOnce, false);
  for (const flag of ["claude -p", "--tools WebFetch", "--allowedTools WebFetch", "--output-format json", "--strict-mcp-config", "--disable-slash-commands", "--setting-sources project"]) {
    assert.ok(p.command.includes(flag), `thiếu ${flag}`);
  }
  assert.equal(node("Claude viết bài").onError, "continueRegularOutput");
});

test("không có mật khẩu trong workflow, chỉ tên credential", () => {
  const text = JSON.stringify(wf);
  assert.ok(!/"password"\s*:/i.test(text));
  assert.deepEqual(node("Đăng nhập web").credentials, { httpCustomAuth: { name: "News Bot Login" } });
});

test("baseUrl chỉ nằm ở ô Cài đặt", () => {
  for (const n of wf.nodes.filter((x) => x.name !== "Cài đặt")) {
    const text = JSON.stringify(n.parameters);
    assert.ok(!text.includes("127.0.0.1") && !text.includes("giasudiem10.online"), `${n.name} viết cứng địa chỉ web`);
  }
  for (const name of ["Đăng nhập web", "Tạo bài nháp"]) assert.ok(node(name).parameters.url.includes("$('Cài đặt')"));
});

test("không có published true ở bất kỳ đâu", () => {
  assert.ok(!/published["']?\s*:\s*true/.test(JSON.stringify(wf)));
});

test("mã các ô Code hợp lệ và nhúng đủ hàm", () => {
  const needs = {
    "Chọn tin mới": ["pickNew", "parseState", "todayVN", "buildPrompt"],
    "Kiểm tra bài": ["parseClaudeOutput", "normalizeDraft", "validateDraft", "buildPostBody"],
    "Ghi nhận kiểm tra": ["settle", "parseState"],
    "Chuẩn bị đăng": ["extractSessionCookie"],
    "Tổng kết": ["settle"],
  };
  for (const n of wf.nodes.filter((x) => x.type === "n8n-nodes-base.code")) {
    assert.doesNotThrow(() => new AsyncFunction("$", "$input", "Buffer", n.parameters.jsCode), `cú pháp ${n.name}`);
    for (const fn of needs[n.name] || []) assert.ok(n.parameters.jsCode.includes(`function ${fn}(`), `${n.name} thiếu ${fn}`);
  }
});

test("Chọn tin mới: lần chạy đầu giữ 5 tin, markSeen phần còn lại, prompt mã hoá base64 chứa link", async () => {
  const feed = items(...[1, 2, 3, 4, 5, 6, 7].map(rss), { error: "feed hỏng" });
  const out = await run("Chọn tin mới", { nodes: { "Cài đặt": cfg, "Đọc trạng thái": noState }, input: feed });
  assert.equal(out.length, 5);
  assert.equal(out[0].json.source, "VnExpress");
  assert.equal(out[0].json.markSeen.length, 2);
  assert.ok(out.slice(1).every((o) => o.json.markSeen.length === 0));
  assert.ok(Buffer.from(out[0].json.promptB64, "base64").toString().includes(out[0].json.link));
});

test("Chọn tin mới: không có tin mới thì trả đúng một mục none để chuỗi không đứt", async () => {
  const state = items({ stdout: JSON.stringify({ seen: [rss(1).link], daily: { date: "", count: 0 } }) });
  const out = await run("Chọn tin mới", { nodes: { "Cài đặt": cfg, "Đọc trạng thái": state }, input: items(rss(1)) });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.none, true);
});

test("Kiểm tra bài phân loại ready, skipped, rejected, error", async () => {
  const picks = items(
    { link: "L1", title: "t", source: "VnExpress", markSeen: [], today: "2026-11-22" },
    { link: "L2", title: "t", source: "VnExpress", markSeen: [], today: "2026-11-22" },
    { link: "L3", title: "t", source: "VnExpress", markSeen: [], today: "2026-11-22" },
    { link: "L4", title: "t", source: "VnExpress", markSeen: [], today: "2026-11-22" },
  );
  const results = items(
    { exitCode: 0, stderr: "", stdout: claudeOut("L1") },
    { exitCode: 0, stderr: "", stdout: JSON.stringify({ is_error: false, result: '{"skip":true,"reason":"tin thể thao"}' }) },
    { exitCode: 0, stderr: "", stdout: claudeOut("L3", { body: "quá ngắn" }) },
    { error: "Failed to authenticate" },
  );
  const out = (await run("Kiểm tra bài", { nodes: { "Chọn tin mới": picks }, input: results })).map((o) => o.json);
  assert.deepEqual(out.map((o) => o.kind), ["ready", "skipped", "rejected", "error"]);
  assert.equal(out[0].postBody.published, false);
});

test("Ghi nhận kiểm tra: không ghi tin ready và error, có ghi markSeen lần chạy đầu", async () => {
  const rows = items(
    { link: "L1", kind: "ready", markSeen: ["OLD1", "OLD2"], today: "2026-11-22" },
    { link: "L2", kind: "skipped", markSeen: [], today: "2026-11-22" },
    { link: "L3", kind: "error", markSeen: [], today: "2026-11-22" },
  );
  const out = await run("Ghi nhận kiểm tra", { nodes: { "Đọc trạng thái": noState }, input: rows });
  assert.deepEqual(out[0].json.state.seen.sort(), ["L2", "OLD1", "OLD2"]);
  assert.equal(out[0].json.state.daily.count, 0);
  assert.ok(out[0].json.command.includes("base64 -d"));
});

test("Ghi nhận kiểm tra: không có tin nào (none) vẫn ghi được markSeen", async () => {
  const rows = items({ none: true, kind: "none", markSeen: ["OLD1"], today: "2026-11-22" });
  const out = await run("Ghi nhận kiểm tra", { nodes: { "Đọc trạng thái": noState }, input: rows });
  assert.deepEqual(out[0].json.state.seen, ["OLD1"]);
});

test("Tổng kết: bài tạo lỗi không bị đánh dấu, bài tạo được thì tính vào hạn mức ngày", async () => {
  const state1 = items({ state: { seen: ["X"], daily: { date: "2026-11-22", count: 1 } } });
  const prepared = items({ link: "L1", today: "2026-11-22" }, { link: "L2", today: "2026-11-22" });
  const out = await run("Tổng kết", {
    nodes: { "Ghi nhận kiểm tra": state1, "Chuẩn bị đăng": prepared },
    input: items({ id: 7 }, { error: "HTTP 500" }),
  });
  const written = JSON.parse(Buffer.from(out[0].json.command.match(/echo (\S+) \|/)[1], "base64").toString());
  assert.deepEqual(written.seen, ["X", "L1"]);
  assert.deepEqual(written.daily, { date: "2026-11-22", count: 2 });
});

test("Chuẩn bị đăng: dừng với lỗi rõ ràng khi đăng nhập không trả cookie", async () => {
  await assert.rejects(
    run("Chuẩn bị đăng", { nodes: { "Bài sẵn sàng": items({ link: "L1", postBody: {}, today: "t" }) }, input: items({ headers: {}, statusCode: 200 }) }),
    /cookie/i,
  );
  const ok = await run("Chuẩn bị đăng", {
    nodes: { "Bài sẵn sàng": items({ link: "L1", postBody: { published: false }, today: "t" }) },
    input: items({ headers: { "set-cookie": ["giasu_session=abc; Path=/"] } }),
  });
  assert.equal(ok[0].json.cookie, "giasu_session=abc");
});

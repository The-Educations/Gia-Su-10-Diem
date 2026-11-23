import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflow } from "../scripts/n8n/build-workflow.js";

const wf = buildWorkflow();
const node = (name) => wf.nodes.find((n) => n.name === name);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const FLOW = [
  "Hẹn giờ", "Cài đặt", "Đọc trạng thái", "Danh sách nguồn", "Đọc RSS", "Chọn tin mới",
  "Đăng nhập web", "Lấy cookie", "Claude viết bài", "Lấy ảnh bìa", "Kiểm tra bài", "Ghi nhận kiểm tra",
  "Lưu trạng thái 1", "Bài sẵn sàng", "Tạo bài nháp", "Tổng kết", "Lưu trạng thái 2",
];

// Chạy mã của một ô Code với dữ liệu giả của các ô khác.
const run = (name, { nodes = {}, input = [] } = {}) => {
  const ref = (n) => ({ first: () => nodes[n][0], all: () => nodes[n] });
  const $input = { first: () => input[0], all: () => input };
  // URL bị che (undefined) để mô phỏng sandbox của n8n không có URL toàn cục.
  return new AsyncFunction("$", "$input", "Buffer", "URL", node(name).parameters.jsCode)(ref, $input, Buffer, undefined);
};
const items = (...rows) => rows.map((json) => ({ json }));
const cfg = items({ baseUrl: "http://x", perRun: 5, perDay: 10, feeds: "a" });
const noState = items({ stdout: "" });
const goodBody = (link) => `${"Đoạn nội dung đã được viết lại bằng lời mới. ".repeat(16).trim()}\n\nNguồn: VnExpress - ${link}`;
const claudeOut = (link, extra = {}) =>
  JSON.stringify({ type: "result", is_error: false, result: JSON.stringify({ skip: false, title: "Tiêu đề", summary: "Tóm tắt", body: goodBody(link), ...extra }) });
// Ngày tương đối so với bây giờ để test không hỏng khi bộ lọc "quá 30 ngày" chạy theo đồng hồ thật.
const ago = (hours) => new Date(Date.now() - hours * 3600e3).toISOString();
const rss = (n) => ({ title: `Tuyển sinh đại học 2027: tin ${n}`, link: `https://thanhnien.vn/tin-${n}.htm`, contentSnippet: "tóm tắt", isoDate: ago(10 - n) });

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

test("chứa đúng các địa chỉ RSS, trường ĐHQG đứng đầu, rồi Thanh Niên, rồi báo nhà nước", () => {
  const feeds = node("Cài đặt").parameters.assignments.assignments.find((a) => a.name === "feeds").value.split("\n");
  assert.deepEqual(feeds, [
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
    "Chọn tin mới": ["pickNew", "parseState", "todayVN", "buildPrompt", "isOnTopic", "sourceInfo", "findImage"],
    "Kiểm tra bài": ["parseClaudeOutput", "normalizeDraft", "validateDraft", "buildPostBody", "findImage"],
    "Ghi nhận kiểm tra": ["settle", "parseState"],
    "Lấy cookie": ["extractSessionCookie"],
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
  assert.equal(out[0].json.source, "Thanh Niên");
  assert.equal(out[0].json.markSeen.length, 2);
  assert.ok(out.slice(1).every((o) => o.json.markSeen.length === 0));
  assert.ok(Buffer.from(out[0].json.promptB64, "base64").toString().includes(out[0].json.link));
});

test("Chọn tin mới: bỏ tin lạc đề trước khi chọn, nên hạn mức dành cho tin đúng chủ đề", async () => {
  const offTopic = { title: "Thầy cô 'cười hết cỡ' bốc thăm quà 20/11", link: "https://vnexpress.net/lac-de.html", contentSnippet: "", isoDate: "2026-11-22T09:00:00Z" };
  const one = items({ baseUrl: "http://x", perRun: 1, perDay: 10, feeds: "a" });
  const out = await run("Chọn tin mới", { nodes: { "Cài đặt": one, "Đọc trạng thái": noState }, input: items(offTopic, rss(1)) });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.link, rss(1).link);
});

test("Chọn tin mới: không có tin mới thì trả đúng một mục none để chuỗi không đứt", async () => {
  const state = items({ stdout: JSON.stringify({ seen: [rss(1).link], daily: { date: "", count: 0 } }) });
  const out = await run("Chọn tin mới", { nodes: { "Cài đặt": cfg, "Đọc trạng thái": state }, input: items(rss(1)) });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.none, true);
});

test("Kiểm tra bài phân loại ready, skipped, rejected, error", async () => {
  const pick = (link) => ({ link, title: "t", source: "VnExpress", markSeen: [], today: "2026-11-22", cookie: "giasu_session=c" });
  const picks = items(pick("L1"), pick("L2"), pick("L3"), pick("L4"));
  const results = items(
    { exitCode: 0, stderr: "", stdout: claudeOut("L1") },
    { exitCode: 0, stderr: "", stdout: JSON.stringify({ is_error: false, result: '{"skip":true,"reason":"tin thể thao"}' }) },
    { exitCode: 0, stderr: "", stdout: claudeOut("L3", { body: "quá ngắn" }) },
    { error: "Failed to authenticate" },
  );
  const noMeta = items({ stdout: "" }, { stdout: "" }, { stdout: "" }, { stdout: "" });
  const out = (await run("Kiểm tra bài", { nodes: { "Lấy cookie": picks, "Claude viết bài": results }, input: noMeta })).map((o) => o.json);
  assert.deepEqual(out.map((o) => o.kind), ["ready", "skipped", "rejected", "error"]);
  assert.equal(out[0].postBody.published, false);
  assert.equal(out[0].cookie, "giasu_session=c");
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
    nodes: { "Ghi nhận kiểm tra": state1, "Bài sẵn sàng": prepared },
    input: items({ id: 7 }, { error: "HTTP 500" }),
  });
  const written = JSON.parse(Buffer.from(out[0].json.command.match(/echo (\S+) \|/)[1], "base64").toString());
  assert.deepEqual(written.seen, ["X", "L1"]);
  assert.deepEqual(written.daily, { date: "2026-11-22", count: 2 });
});

test("Lấy cookie: dừng với lỗi rõ ràng khi đăng nhập không trả cookie, và gắn cookie vào từng tin", async () => {
  const picks = items({ link: "L1", title: "t" }, { link: "L2", title: "t" });
  await assert.rejects(run("Lấy cookie", { nodes: { "Chọn tin mới": picks }, input: items({ headers: {}, statusCode: 200 }) }), /cookie/i);
  const out = await run("Lấy cookie", { nodes: { "Chọn tin mới": picks }, input: items({ headers: { "set-cookie": ["giasu_session=abc; Path=/"] } }) });
  assert.deepEqual(out.map((o) => [o.json.link, o.json.cookie]), [["L1", "giasu_session=abc"], ["L2", "giasu_session=abc"]]);
});

test("Bài sẵn sàng chỉ chuyển tiếp tin ready, kèm cookie, và trả rỗng khi không có", async () => {
  const rows = items(
    { kind: "ready", link: "L1", postBody: { published: false }, cookie: "giasu_session=c", today: "t" },
    { kind: "error", link: "L2" },
  );
  const out = await run("Bài sẵn sàng", { nodes: { "Kiểm tra bài": rows } });
  assert.deepEqual(out.map((o) => o.json), [{ link: "L1", postBody: { published: false }, cookie: "giasu_session=c", today: "t" }]);
  assert.deepEqual(await run("Bài sẵn sàng", { nodes: { "Kiểm tra bài": items({ kind: "none" }) } }), []);
});

test("Đăng nhập web đứng trước Claude viết bài: login hỏng thì không tốn lượt Claude", () => {
  assert.ok(FLOW.indexOf("Đăng nhập web") < FLOW.indexOf("Claude viết bài"));
  assert.ok(FLOW.indexOf("Chọn tin mới") < FLOW.indexOf("Đăng nhập web"));
});

test("khoá chống chạy chồng: Đọc trạng thái lấy khoá và báo __LOCKED__ khi không lấy được", () => {
  const cmd = node("Đọc trạng thái").parameters.command;
  assert.ok(cmd.includes('mkdir "$HOME/.n8n/news.lock"'));
  assert.ok(cmd.includes("-mmin +120"), "khoá treo quá 2 giờ phải tự gỡ");
  assert.ok(cmd.includes("__LOCKED__"));
});

test("Danh sách nguồn dừng với lỗi rõ ràng khi đang bị khoá, chạy bình thường khi không", async () => {
  const feeds = items({ baseUrl: "http://x", feeds: "https://a.example/rss\nhttps://b.example/rss" });
  await assert.rejects(run("Danh sách nguồn", { nodes: { "Cài đặt": feeds, "Đọc trạng thái": items({ stdout: "__LOCKED__" }) } }), /news\.lock/);
  const ok = await run("Danh sách nguồn", { nodes: { "Cài đặt": feeds, "Đọc trạng thái": items({ stdout: "" }) } });
  assert.equal(ok.length, 2);
});

test("khoá được nhả: ở Lưu trạng thái 1 khi không có bài để đăng, và luôn ở Lưu trạng thái 2", async () => {
  const noReady = await run("Ghi nhận kiểm tra", { nodes: { "Đọc trạng thái": noState }, input: items({ link: "L1", kind: "skipped", markSeen: [], today: "2026-11-22" }) });
  assert.ok(noReady[0].json.command.includes("rmdir"));
  const withReady = await run("Ghi nhận kiểm tra", { nodes: { "Đọc trạng thái": noState }, input: items({ link: "L1", kind: "ready", markSeen: [], today: "2026-11-22" }) });
  assert.ok(!withReady[0].json.command.includes("rmdir"), "còn bài phải đăng thì chưa được nhả khoá");
  const done = await run("Tổng kết", {
    nodes: { "Ghi nhận kiểm tra": items({ state: { seen: [], daily: { date: "2026-11-22", count: 0 } } }), "Bài sẵn sàng": items({ link: "L1", today: "2026-11-22" }) },
    input: items({ id: 1 }),
  });
  assert.ok(done[0].json.command.includes("rmdir"));
});

test("claude -p có giới hạn thời gian để một lần treo không giữ khoá mãi", () => {
  assert.ok(node("Claude viết bài").parameters.command.includes("alarm 300"));
});

test("Lấy ảnh bìa nằm giữa Claude viết bài và Kiểm tra bài, chạy cho từng tin và không làm hỏng chuỗi khi lỗi", () => {
  const n = node("Lấy ảnh bìa");
  assert.equal(n.parameters.executeOnce, false);
  assert.equal(n.onError, "continueRegularOutput");
  const c = n.parameters.command;
  for (const part of ["curl", "--proto '=https'", "-m 20", "base64 -d", "og:image"]) assert.ok(c.includes(part), `thiếu ${part}`);
  assert.ok(c.includes("$json.none") || c.includes("none"), "phải xử lý trường hợp không có tin (none)");
  assert.ok(!c.includes("$json.link"), "link không được chèn thẳng vào lệnh shell, chỉ qua base64");
});

test("Chọn tin mới: trường ĐHQG được chọn trước báo, gắn tên nguồn, ảnh trong RSS và link base64", async () => {
  const uni = { title: "Trường Đại học Công nghệ mở ngành đào tạo mới về trí tuệ nhân tạo", link: "https://uet.vnu.edu.vn/mo-nganh-ai/", contentSnippet: "", content: '<img src="https://uet.vnu.edu.vn/wp-content/a.jpg">', isoDate: ago(100) };
  const press = { title: "Tuyển sinh đại học 2027: điểm cộng thay đổi", link: "https://thanhnien.vn/tuyen-sinh-2027.htm", contentSnippet: "", enclosure: { url: "https://images2.thanhnien.vn/t.jpg", type: "image/jpeg" }, isoDate: ago(2) };
  const one = items({ baseUrl: "http://x", perRun: 2, perDay: 10, feeds: "a" });
  const out = await run("Chọn tin mới", { nodes: { "Cài đặt": one, "Đọc trạng thái": noState }, input: items(press, uni) });
  assert.deepEqual(out.map((o) => o.json.source), ["Trường ĐH Công nghệ - ĐHQGHN", "Thanh Niên"]);
  assert.equal(out[0].json.rssImage, "https://uet.vnu.edu.vn/wp-content/a.jpg");
  assert.equal(out[1].json.rssImage, "https://images2.thanhnien.vn/t.jpg");
  assert.equal(Buffer.from(out[0].json.linkB64, "base64").toString(), uni.link);
});

test("Chọn tin mới: bỏ tin quá 30 ngày", async () => {
  const old = { title: "Tuyển sinh đại học năm cũ", link: "https://thanhnien.vn/cu.htm", contentSnippet: "", isoDate: "2020-01-01T00:00:00Z" };
  const out = await run("Chọn tin mới", { nodes: { "Cài đặt": cfg, "Đọc trạng thái": items({ stdout: JSON.stringify({ seen: ["x"], daily: { date: "", count: 0 } }) }) }, input: items(old) });
  assert.equal(out[0].json.none, true);
});

test("Kiểm tra bài: bài ready có ảnh từ og:image ở đầu bài, ghi nguồn; không tìm được ảnh thì vẫn ready không ảnh", async () => {
  const mk = (link) => ({ link, title: "t", source: "Thanh Niên", markSeen: [], today: "2026-11-22", cookie: "c", rssImage: "" });
  const picks = items(mk("https://thanhnien.vn/a.htm"), mk("https://thanhnien.vn/b.htm"));
  const claude = items({ stdout: claudeOut("https://thanhnien.vn/a.htm") }, { stdout: claudeOut("https://thanhnien.vn/b.htm") });
  const metas = items({ stdout: '<meta property="og:image" content="https://images2.thanhnien.vn/x.jpg">' }, { stdout: "" });
  const out = (await run("Kiểm tra bài", { nodes: { "Lấy cookie": picks, "Claude viết bài": claude }, input: metas })).map((o) => o.json);
  assert.deepEqual(out.map((o) => o.kind), ["ready", "ready"]);
  assert.equal(out[0].postBody.cover_url, "https://images2.thanhnien.vn/x.jpg");
  assert.equal(out[0].postBody.cover_credit, "Thanh Niên");
  assert.equal(out[1].postBody.cover_url, "");
  assert.ok(!out[0].postBody.body.includes("![") && !out[0].postBody.body.includes("Nguồn:"));
  assert.equal(out[0].postBody.source_name, "Thanh Niên");
  assert.equal(out[0].postBody.source_url, "https://thanhnien.vn/a.htm");
  assert.equal(out[0].postBody.origin, "auto");
  assert.equal(out[0].postBody.published, false);
});

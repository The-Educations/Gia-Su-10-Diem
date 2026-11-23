import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, parseState, todayVN, pickNew, settle, sourceInfo } from "../scripts/n8n/lib/select.js";
import { isOnTopic } from "../scripts/n8n/lib/topic.js";
import { findImage } from "../scripts/n8n/lib/image.js";
import { buildPrompt, parseClaudeOutput, normalizeDraft, validateDraft } from "../scripts/n8n/lib/draft.js";
import { buildPostBody, extractSessionCookie } from "../scripts/n8n/lib/web.js";

const TODAY = "2026-11-22";
const opts = { perRun: 5, perDay: 10, today: TODAY };
const item = (n, extra = {}) => ({
  title: `Tin ${n}`,
  link: `https://baao.example/tin-${n}`,
  source: "Báo thử",
  isoDate: `2026-11-22T${String(10 + (n % 10)).padStart(2, "0")}:00:00Z`,
  ...extra,
});
const items = (count) => Array.from({ length: count }, (_, i) => item(i + 1));
const seenState = (links = ["https://old.example/x"], daily = { date: TODAY, count: 0 }) => ({ seen: links, daily });

test("pickNew bỏ tin thiếu link hoặc title", () => {
  const { pick } = pickNew([{ title: "", link: "a", source: "s" }, { title: "x", link: "", source: "s" }], seenState(), opts);
  assert.deepEqual(pick, []);
});

test("pickNew bỏ link trùng giữa các nguồn", () => {
  const { pick } = pickNew([item(1), item(1, { source: "Báo khác" })], seenState(), opts);
  assert.equal(pick.length, 1);
});

test("pickNew bỏ tin đã seen", () => {
  const { pick } = pickNew(items(3), seenState([item(2).link]), opts);
  assert.deepEqual(pick.map((p) => p.link).sort(), [item(1).link, item(3).link].sort());
});

test("pickNew xếp mới nhất trước theo isoDate", () => {
  const older = item(1, { isoDate: "2026-11-20T00:00:00Z" });
  const newer = item(2, { isoDate: "2026-11-22T09:00:00Z" });
  const { pick } = pickNew([older, newer], seenState(), opts);
  assert.deepEqual(pick.map((p) => p.link), [newer.link, older.link]);
});

test("pickNew chọn tối đa perRun", () => {
  assert.equal(pickNew(items(8), seenState(), opts).pick.length, 5);
});

test("pickNew tôn trọng hạn mức ngày", () => {
  const { pick } = pickNew(items(8), seenState(["x"], { date: TODAY, count: 8 }), opts);
  assert.equal(pick.length, 2);
});

test("pickNew sang ngày mới thì đặt lại số đếm", () => {
  const { pick } = pickNew(items(8), seenState(["x"], { date: "2026-11-21", count: 10 }), opts);
  assert.equal(pick.length, 5);
});

test("pickNew lần chạy đầu giữ 5 tin mới nhất và markSeen phần còn lại", () => {
  const { pick, markSeen } = pickNew(items(12), emptyState(), opts);
  assert.equal(pick.length, 5);
  assert.equal(markSeen.length, 7);
  const picked = new Set(pick.map((p) => p.link));
  assert.ok(markSeen.every((l) => !picked.has(l)));
});

test("pickNew không markSeen khi không phải lần chạy đầu", () => {
  assert.deepEqual(pickNew(items(12), seenState(), opts).markSeen, []);
});

test("pickNew không sửa state đầu vào", () => {
  const state = seenState();
  const copy = JSON.stringify(state);
  pickNew(items(3), state, opts);
  assert.equal(JSON.stringify(state), copy);
});

test("todayVN theo giờ Việt Nam", () => {
  assert.equal(todayVN(new Date("2026-11-22T17:30:00Z")), "2026-11-23");
  assert.equal(todayVN(new Date("2026-11-22T16:59:00Z")), "2026-11-22");
});

test("settle chỉ đánh dấu posted, skipped, rejected; error thì không", () => {
  const out = settle(emptyState(), [
    { link: "a", kind: "posted" },
    { link: "b", kind: "skipped" },
    { link: "c", kind: "rejected" },
    { link: "d", kind: "error" },
  ], TODAY);
  assert.deepEqual(out.seen, ["a", "b", "c"]);
});

test("settle đếm daily chỉ cho posted", () => {
  const out = settle(seenState([], { date: TODAY, count: 1 }), [
    { link: "a", kind: "posted" },
    { link: "b", kind: "posted" },
    { link: "c", kind: "skipped" },
  ], TODAY);
  assert.deepEqual(out.daily, { date: TODAY, count: 3 });
});

test("settle đặt lại count khi sang ngày", () => {
  const out = settle(seenState([], { date: "2026-11-21", count: 9 }), [{ link: "a", kind: "posted" }], TODAY);
  assert.deepEqual(out.daily, { date: TODAY, count: 1 });
});

test("settle giữ tối đa 2000 link seen, giữ link mới nhất", () => {
  const many = Array.from({ length: 1999 }, (_, i) => `old-${i}`);
  const out = settle(seenState(many), ["n1", "n2", "n3"].map((link) => ({ link, kind: "posted" })), TODAY);
  assert.equal(out.seen.length, 2000);
  assert.equal(out.seen.at(-1), "n3");
  assert.ok(!out.seen.includes("old-0"));
});

test("settle không thêm link trùng vào seen", () => {
  const out = settle(seenState(["a"]), [{ link: "a", kind: "posted" }], TODAY);
  assert.deepEqual(out.seen, ["a"]);
});

test("parseState trả emptyState khi JSON hỏng hoặc rỗng", () => {
  assert.deepEqual(parseState("{not json"), emptyState());
  assert.deepEqual(parseState(null), emptyState());
  assert.deepEqual(parseState(""), emptyState());
});

test("parseState đọc lại đúng trạng thái đã lưu", () => {
  const state = seenState(["a", "b"], { date: TODAY, count: 4 });
  assert.deepEqual(parseState(JSON.stringify(state)), state);
});

// ---- Task 3: bài Claude trả về và gói gửi lên web ----
const src = item(1);
const goodBody = () => `${"Đoạn nội dung bài viết đã được viết lại bằng lời mới. ".repeat(14).trim()}\n\nNguồn: ${src.source} - ${src.link}`;
const goodDraft = (extra = {}) => ({ title: "Tiêu đề bài viết", summary: "Tóm tắt ngắn gọn.", body: goodBody(), ...extra });
const draftJson = (d = goodDraft()) => JSON.stringify({ skip: false, ...d });

test("parseClaudeOutput đọc JSON thường", () => {
  assert.deepEqual(parseClaudeOutput(draftJson()), { skip: false, ...goodDraft() });
});

test("parseClaudeOutput gỡ rào json và chữ dẫn", () => {
  const raw = `Đây là bài:\n\`\`\`json\n${draftJson()}\n\`\`\`\nHết.`;
  assert.deepEqual(parseClaudeOutput(raw), { skip: false, ...goodDraft() });
});

test("parseClaudeOutput đọc bao result của claude -p", () => {
  const raw = JSON.stringify({ type: "result", is_error: false, result: draftJson() });
  assert.deepEqual(parseClaudeOutput(raw), { skip: false, ...goodDraft() });
});

test("parseClaudeOutput trả null khi is_error", () => {
  const raw = JSON.stringify({ type: "result", is_error: true, result: "Failed to authenticate: OAuth session expired" });
  assert.equal(parseClaudeOutput(raw), null);
});

test("parseClaudeOutput trả null khi rác hoặc thiếu trường", () => {
  assert.equal(parseClaudeOutput("không có json ở đây"), null);
  assert.equal(parseClaudeOutput(""), null);
  assert.equal(parseClaudeOutput(JSON.stringify({ skip: false, title: "chỉ có tiêu đề" })), null);
});

test("parseClaudeOutput trả skip khi Claude bỏ qua", () => {
  assert.deepEqual(parseClaudeOutput('{"skip":true,"reason":"tin thể thao"}'), { skip: true, reason: "tin thể thao" });
});

test("parseClaudeOutput chịu được dấu ngoặc nhọn trong chuỗi", () => {
  const d = goodDraft({ body: `${goodBody()}\n{ghi chú}` });
  assert.equal(parseClaudeOutput(`Kết quả: ${draftJson(d)}`).body, d.body);
});

test("normalizeDraft gỡ ** và # nhưng giữ chữ", () => {
  const out = normalizeDraft({ title: "**Tiêu đề**", summary: "Tóm tắt", body: "## Mục\n\nĐây là **quan trọng** và `mã`.\n\n\n\n\nHết" });
  assert.equal(out.title, "Tiêu đề");
  assert.equal(out.body, "Mục\n\nĐây là quan trọng và mã.\n\nHết");
});

test("validateDraft chấp nhận bài hợp lệ", () => {
  assert.deepEqual(validateDraft(goodDraft(), src), { ok: true, reasons: [] });
});

test("validateDraft từ chối title, summary, body sai độ dài", () => {
  assert.equal(validateDraft(goodDraft({ title: "t".repeat(161) }), src).ok, false);
  assert.equal(validateDraft(goodDraft({ title: "t".repeat(160) }), src).ok, true);
  assert.equal(validateDraft(goodDraft({ summary: "s".repeat(501) }), src).ok, false);
  assert.equal(validateDraft(goodDraft({ title: "" }), src).ok, false);
  assert.equal(validateDraft(goodDraft({ body: `ngắn\n\nNguồn: ${src.link}` }), src).ok, false);
  const huge = `${"x".repeat(30001 - 10)}\nNguồn: ${src.link}`;
  assert.equal(validateDraft(goodDraft({ body: huge }), src).ok, false);
});

test("validateDraft từ chối thiếu dòng Nguồn hoặc Nguồn không chứa link gốc", () => {
  const noSource = goodBody().replace(/\n\nNguồn:.*$/, "");
  assert.equal(validateDraft(goodDraft({ body: noSource }), src).ok, false);
  const wrongLink = goodBody().replace(src.link, "https://khac.example/bai");
  const res = validateDraft(goodDraft({ body: wrongLink }), src);
  assert.equal(res.ok, false);
  assert.ok(res.reasons.length > 0);
});

test("buildPostBody luôn published false và chỉ có 4 khoá", () => {
  const body = buildPostBody({ ...goodDraft(), published: true, extra: 1 });
  assert.equal(body.published, false);
  assert.deepEqual(Object.keys(body).sort(), ["body", "published", "summary", "title"]);
});

test("extractSessionCookie lấy từ mảng set-cookie hoặc chuỗi", () => {
  assert.equal(extractSessionCookie(["other=1; Path=/", "giasu_session=abc123; Path=/; HttpOnly"]), "giasu_session=abc123");
  assert.equal(extractSessionCookie("giasu_session=abc123; Path=/"), "giasu_session=abc123");
});

test("extractSessionCookie trả null khi không có giasu_session", () => {
  assert.equal(extractSessionCookie(["other=1"]), null);
  assert.equal(extractSessionCookie(undefined), null);
});

test("buildPrompt chứa link, tên nguồn, dòng Nguồn và quy tắc chính", () => {
  const p = buildPrompt(src);
  assert.ok(p.includes(src.link));
  assert.ok(p.includes(src.source));
  assert.ok(p.includes("Nguồn:"));
  assert.ok(p.includes('"skip"'));
});

const topic = (title, summary = "") => isOnTopic({ title, summary });

test("isOnTopic nhận tin tuyển sinh, thi cử, chính sách, học tập, chọn ngành", () => {
  for (const title of [
    "Tuyển sinh đại học 2027: Còn những loại điểm cộng nào, IELTS được tính ra sao?",
    "IELTS không còn được cộng điểm, học sinh có nên đầu tư?",
    "Đề xuất đổi cách thi lớp 10 chuyên: Học sinh, phụ huynh, giáo viên nói gì?",
    "Tốt nghiệp đại học loại khá có thể dự tuyển thẳng tiến sĩ từ 1-1-2027",
    "Chuẩn đại học mới: 70% người tốt nghiệp phải có việc làm, 20-40% giảng viên tiến sĩ",
    "Chọn ngành giữa làn sóng AI: Đừng chỉ chạy theo nghề 'hot'",
    "Bộ GD-ĐT: Thi khối chuyên không đồng nghĩa phải học chuyên sâu nhiều môn",
    "Đề xuất miễn học phí cho học sinh vùng cao",
  ]) assert.equal(topic(title), true, title);
});

test("isOnTopic loại tin lạc đề: chuyện lạ, thời sự, 20/11, nhà giáo, sự cố", () => {
  for (const title of [
    "Nước nào có nhiều hồ nhất thế giới?",
    "Kỷ luật hiệu trưởng vụ 17 cây xanh bị đốn hạ",
    "Thầy cô 'cười hết cỡ' bốc thăm quà 20/11",
    "Cô giáo bật khóc khi học trò xách mực, ghẹ, ốc đến tặng ngày 20/11",
    "Học sinh ôm gà, hoa chuối, rau rừng tặng thầy cô ngày 20/11",
    "Thầy giáo tặng trường trăm tỷ ở Mèo Vạc và nhận nuôi 22 học sinh Làng Nủ",
    "Tôn vinh 335 nhà giáo tiêu biểu năm 2026",
    "Bé 2 tuổi tử vong sau khi được phát hiện bất tỉnh tại nhóm trẻ tư thục",
    "Giá vàng ngày 23/11: Đồng loạt đi ngang",
    "Dòng họ nào ở Hàn Quốc có nguồn gốc từ một hoàng tử Việt Nam?",
    "Bộ trưởng Giáo dục Hàn Quốc từ chức giữa bão gian lận AI",
  ]) assert.equal(topic(title), false, title);
});

test("isOnTopic giải mã thực thể HTML của Thanh Niên trước khi so từ khoá", () => {
  assert.equal(topic("C&oacute; muộn kh&ocirc;ng khi học chương tr&igrave;nh nước ngo&agrave;i từ lớp 10?"), true);
  assert.equal(topic("Học sinh &ocirc;m g&agrave;, hoa chuối tặng thầy c&ocirc; ng&agrave;y 20/11"), false);
});

test("isOnTopic xét thêm phần tóm tắt, nhưng chữ 20/11 trong tóm tắt không làm mất tin tuyển sinh", () => {
  assert.equal(topic("Thông báo mới", "Thí sinh đăng ký xét tuyển đại học trước ngày 20/11"), true);
  assert.equal(topic("Chuyện thường ngày", "Một câu chuyện không liên quan"), false);
});

test("buildPrompt nêu rõ các chủ đề được nhận, các loại phải bỏ và bỏ khi không chắc", () => {
  const p = buildPrompt(src);
  for (const word of ["tuyển sinh", "chính sách", "học phí", "chọn ngành"]) assert.ok(p.toLowerCase().includes(word), `thiếu ${word}`);
  assert.ok(p.includes("20/11") && p.includes("tai nạn"), "thiếu ví dụ loại tin phải bỏ");
  assert.ok(/không chắc/.test(p), "phải dặn bỏ qua khi không chắc");
});

// --- Bài tích cực, nghiên cứu, ngành học; bỏ drama ---
test("isOnTopic nhận tin nghiên cứu, ngành đào tạo, thành tích; bỏ tin gian lận, tố giác, vi phạm", () => {
  for (const title of [
    "Sinh viên UET phát triển mô hình đa robot hướng tới tự động hóa kho hàng thông minh",
    "Nhà khoa học Việt công bố nghiên cứu mới về pin lithium trên tạp chí quốc tế",
    "Trường Đại học Công nghệ mở ngành đào tạo mới về trí tuệ nhân tạo",
    "Nghiên cứu sinh bảo vệ thành công luận án tiến sĩ về vật liệu nano",
    "Học sinh Việt Nam giành huy chương vàng Olympic Toán quốc tế",
  ]) assert.equal(topic(title), true, title);
  for (const title of [
    "TP.HCM yêu cầu rà soát, mở đường dây nóng 24/7 tố giác gian lận thi cử",
    "Thanh tra phát hiện sai phạm trong tuyển sinh của một trường đại học",
    "Thí sinh vi phạm quy chế thi bị đình chỉ",
    "Tranh cãi quanh học phí tăng đột ngột, phụ huynh bức xúc",
  ]) assert.equal(topic(title), false, title);
});

// --- Nguồn và thứ tự ưu tiên ---
test("sourceInfo xếp trường ĐHQG trước, rồi Thanh Niên, rồi báo nhà nước, rồi báo khác", () => {
  const rank = (host) => sourceInfo(`https://${host}/bai-viet`).rank;
  assert.ok(rank("uet.vnu.edu.vn") < rank("thanhnien.vn"));
  assert.ok(rank("tuyensinh.hcmus.edu.vn") < rank("thanhnien.vn"));
  assert.ok(rank("thanhnien.vn") < rank("baochinhphu.vn"));
  assert.equal(rank("baochinhphu.vn"), rank("vtv.vn"));
  assert.ok(rank("vtv.vn") < rank("tuoitre.vn"));
  assert.ok(rank("tuoitre.vn") < rank("trang-la.example"));
  assert.match(sourceInfo("https://uet.vnu.edu.vn/x").name, /Công nghệ.*ĐHQGHN/);
  assert.equal(sourceInfo("https://thanhnien.vn/x").name, "Thanh Niên");
  assert.equal(sourceInfo("https://baochinhphu.vn/x").name, "Báo điện tử Chính phủ");
  assert.equal(sourceInfo("không phải link").name, "Nguồn khác");
});

test("pickNew ưu tiên rank thấp trước, cùng rank thì mới nhất trước", () => {
  const rows = [
    item(1, { rank: 1, isoDate: "2026-11-22T20:00:00Z" }),
    item(2, { rank: 0, isoDate: "2026-11-20T08:00:00Z" }),
    item(3, { rank: 0, isoDate: "2026-11-21T08:00:00Z" }),
  ];
  const { pick } = pickNew(rows, seenState(), opts);
  assert.deepEqual(pick.map((p) => p.link), [item(3).link, item(2).link, item(1).link]);
});

test("pickNew bỏ tin quá cũ khi có maxAgeDays, nhưng giữ tin không có ngày", () => {
  const nowMs = Date.parse("2026-11-23T00:00:00Z");
  const rows = [
    item(1, { isoDate: "2026-09-01T00:00:00Z" }),
    item(2, { isoDate: "2026-11-20T00:00:00Z" }),
    item(3, { isoDate: "" }),
  ];
  const { pick } = pickNew(rows, seenState(), { ...opts, maxAgeDays: 30, nowMs });
  assert.deepEqual(pick.map((p) => p.link).sort(), [item(2).link, item(3).link].sort());
});

// --- Ảnh ---
const OG = (u) => `<meta property="og:image" content="${u}" />`;

test("findImage lấy og:image trước, rồi enclosure, rồi ảnh đầu tiên trong nội dung", () => {
  assert.equal(findImage({ meta: OG("https://images2.thanhnien.vn/a.jpg"), enclosure: { url: "https://images2.thanhnien.vn/b.jpg" }, link: "https://thanhnien.vn/x" }), "https://images2.thanhnien.vn/a.jpg");
  assert.equal(findImage({ enclosure: { url: "https://images2.thanhnien.vn/b.jpg", type: "image/jpeg" }, link: "https://thanhnien.vn/x" }), "https://images2.thanhnien.vn/b.jpg");
  assert.equal(findImage({ content: '<p><img src="https://cdn-images.vtv.vn/c.jpg" /></p>', link: "https://vtv.vn/x" }), "https://cdn-images.vtv.vn/c.jpg");
  assert.equal(findImage({ link: "https://vtv.vn/x" }), "");
});

test("findImage đọc meta khi thuộc tính đảo thứ tự và có twitter:image", () => {
  assert.equal(findImage({ meta: '<meta content="https://uet.vnu.edu.vn/u.jpg" property="og:image">', link: "https://uet.vnu.edu.vn/x" }), "https://uet.vnu.edu.vn/u.jpg");
  assert.equal(findImage({ meta: '<meta name="twitter:image" content="https://vju.ac.vn/t.png"/>', link: "https://vju.ac.vn/x" }), "https://vju.ac.vn/t.png");
});

test("findImage chỉ nhận https và host trong danh sách tin cậy", () => {
  for (const bad of ["http://images2.thanhnien.vn/a.jpg", "https://evil.example/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "https://thanhnien.vn.evil.example/a.jpg"]) {
    assert.equal(findImage({ meta: OG(bad), link: "https://thanhnien.vn/x" }), "", bad);
  }
});

test("findImage giải mã &amp;, nối đường dẫn tương đối, bỏ logo và chuỗi nguy hiểm", () => {
  assert.equal(findImage({ meta: OG("https://law.vnu.edu.vn/a.jpg?x=1&amp;y=2"), link: "https://law.vnu.edu.vn/x" }), "https://law.vnu.edu.vn/a.jpg?x=1&y=2");
  assert.equal(findImage({ meta: OG("//law.vnu.edu.vn/p.jpg"), link: "https://law.vnu.edu.vn/x" }), "https://law.vnu.edu.vn/p.jpg");
  assert.equal(findImage({ meta: OG("/uploads/r.jpg"), link: "https://ulis.vnu.edu.vn/bai/1" }), "https://ulis.vnu.edu.vn/uploads/r.jpg");
  assert.equal(findImage({ meta: OG("https://ulis.vnu.edu.vn/images/logo-default.png"), link: "https://ulis.vnu.edu.vn/x" }), "");
  assert.equal(findImage({ meta: OG("https://ulis.vnu.edu.vn/a b).jpg"), link: "https://ulis.vnu.edu.vn/x" }), "");
  assert.equal(findImage({ meta: OG("https://ulis.vnu.edu.vn/a.svg"), link: "https://ulis.vnu.edu.vn/x" }), "");
});

test("findImage bỏ ứng viên xấu rồi dùng ứng viên tốt kế tiếp", () => {
  assert.equal(findImage({ meta: OG("https://evil.example/a.jpg"), enclosure: { url: "https://vtv.vn/ok.jpg" }, link: "https://vtv.vn/x" }), "https://vtv.vn/ok.jpg");
});

test("buildPostBody chèn ảnh và dòng Ảnh: nguồn lên đầu bài, vẫn published false và 4 khoá", () => {
  const body = buildPostBody(goodDraft(), { url: "https://images2.thanhnien.vn/a.jpg", credit: "Thanh Niên" });
  assert.ok(body.body.startsWith("![" ), "ảnh phải ở đầu bài");
  assert.ok(body.body.includes("](https://images2.thanhnien.vn/a.jpg)\nẢnh: Thanh Niên\n\n"));
  assert.ok(body.body.endsWith(goodDraft().body));
  assert.equal(body.published, false);
  assert.deepEqual(Object.keys(body).sort(), ["body", "published", "summary", "title"]);
});

test("buildPostBody bỏ ngoặc vuông khỏi chữ mô tả ảnh và không chèn gì khi không có ảnh", () => {
  const d = { ...goodDraft(), title: "Tiêu đề [có] ngoặc" };
  assert.ok(buildPostBody(d, { url: "https://vtv.vn/a.jpg", credit: "VTV" }).body.startsWith("![Tiêu đề có ngoặc]("));
  assert.equal(buildPostBody(goodDraft(), null).body, goodDraft().body);
  assert.equal(buildPostBody(goodDraft(), { url: "", credit: "x" }).body, goodDraft().body);
});

test("buildPrompt nhận nghiên cứu, ngành đào tạo, thành tích và dặn bỏ tin tiêu cực", () => {
  const p = buildPrompt(src).toLowerCase();
  for (const word of ["nghiên cứu", "ngành", "thành tích", "gian lận", "tranh cãi"]) assert.ok(p.includes(word), `thiếu ${word}`);
});

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fixture } from "./community-fixture.js";

const words = (n) => Array.from({ length: n }, (_, i) => `chữ${i}`).join(" ");
const draft = (over = {}) => ({
  title: "Lịch thi tốt nghiệp THPT 2027",
  summary: "Bộ GD công bố lịch thi.",
  body_html: `<p>${words(80)}</p>`,
  topic: "admissions",
  published: false,
  ...over,
});
const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#4a7" } }).png().toBuffer();
const publicRoutes = (id) => ["/posts", "/news", `/posts/${id}`];

async function setup(t) {
  const ctx = await fixture(t);
  const admin = (path, method, body) => ctx.call("admin", path, method, body);
  const create = async (over = {}) => {
    const r = await admin("/admin/posts", "POST", draft(over));
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data;
  };
  const publish = async (id) => {
    const r = await admin(`/admin/posts/${id}/publish`, "POST");
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  };
  return { ...ctx, admin, create, publish };
}

test("every admin news route is closed to guests (401) and non-admins (403)", async (t) => {
  const { call, create } = await setup(t);
  const id = (await create()).id;
  const routes = [
    ["GET", "/admin/posts"], ["GET", `/admin/posts/${id}`], ["POST", "/admin/posts"], ["PUT", `/admin/posts/${id}`],
    ["POST", `/admin/posts/${id}/publish`], ["POST", `/admin/posts/${id}/unpublish`], ["POST", `/admin/posts/${id}/pin`],
    ["DELETE", `/admin/posts/${id}`],
  ];
  for (const [method, path] of routes) {
    assert.equal((await call(null, path, method, draft())).status, 401, `${method} ${path}`);
    assert.equal((await call("student", path, method, draft())).status, 403, `${method} ${path}`);
    assert.equal((await call("tutor", path, method, draft())).status, 403, `${method} ${path}`);
  }
});

test("saving validates input and stores only sanitized HTML with a plain-text body", async (t) => {
  const { admin, create, db } = await setup(t);
  for (const bad of [{ title: " " }, { summary: "" }, { topic: "sports" }, { cover_url: "javascript:alert(1)" }, { cover_url: "http://x.test/a.jpg" },
    { source_url: "ftp://x.test" }, { cta_level: "Đại học" }, { body_html: undefined, body: undefined }])
    assert.equal((await admin("/admin/posts", "POST", draft(bad))).status, 400, JSON.stringify(bad));
  const dirty = `<p onclick="x()">Chào <script>alert(1)</script><a href="javascript:alert(1)">bad</a></p><img src="https://evil.test/x.png"><img src="/api/news/images/not-a-real-id">`;
  const row = await create({ body_html: dirty });
  assert.ok(!/script|onclick|javascript:|evil/.test(row.body_html), row.body_html);
  assert.equal(row.body, "Chào bad");
  assert.equal(row.origin, "manual");
  assert.equal(row.published, 0);
  assert.equal(row.slug, "");
  assert.ok(row.search_text === undefined, "search_text is internal");
  assert.match(db.prepare("SELECT search_text FROM posts WHERE id=?").get(row.id).search_text, /^lich thi tot nghiep thpt 2027 bo gd cong bo lich thi\. chao bad/);
  const plain = await create({ body_html: undefined, body: "Chữ thuần.\n\nĐoạn hai." });
  assert.equal(plain.body_html, "");
  assert.equal(plain.body, "Chữ thuần.\n\nĐoạn hai.");
});

test("origin can only be set on create, and n8n-style bodies are split into source and cover at create", async (t) => {
  const { admin } = await setup(t);
  const legacy = `![Ảnh bài](https://cdn.tuoitre.vn/a.jpg)\nẢnh: Tuổi Trẻ\n\n${words(60)}\n\nNguồn: Tuổi Trẻ - https://tuoitre.vn/x.htm`;
  const created = await admin("/admin/posts", "POST", { title: "Bài n8n", summary: "Tóm tắt", body: legacy, topic: "policy", origin: "auto", published: false });
  assert.equal(created.status, 201);
  const row = created.data;
  assert.equal(row.origin, "auto");
  assert.equal(row.source_name, "Tuổi Trẻ");
  assert.equal(row.source_url, "https://tuoitre.vn/x.htm");
  assert.equal(row.cover_url, "https://cdn.tuoitre.vn/a.jpg");
  assert.equal(row.cover_credit, "Tuổi Trẻ");
  assert.equal(row.body, words(60));
  const edited = await admin(`/admin/posts/${row.id}`, "PUT", { ...draft({ title: "Đổi" }), origin: "manual" });
  assert.equal(edited.data.origin, "auto", "PUT ignores origin");
  const manual = await admin("/admin/posts", "POST", { ...draft(), body_html: undefined, body: legacy, origin: "manual" });
  assert.equal(manual.data.source_name, "", "manual posts keep their text as written");
});

test("review, drafts and published tabs carry counts, ordering and warnings", async (t) => {
  const { admin, create, publish, db } = await setup(t);
  assert.equal((await admin("/admin/posts")).data.tab, "published", "empty site opens on published");
  const manual = await create({ title: "Nháp tay" });
  const auto = (await admin("/admin/posts", "POST", { ...draft({ title: "Bài n8n" }), origin: "auto" })).data;
  const live = await create({ title: "Bài đã đăng" });
  await publish(live.id);
  const list = (await admin("/admin/posts")).data;
  assert.equal(list.tab, "review", "pending n8n posts open first");
  assert.deepEqual(list.counts, { review: 1, drafts: 1, published: 1 });
  assert.deepEqual(list.items.map((p) => p.id), [auto.id]);
  assert.deepEqual((await admin("/admin/posts?tab=drafts")).data.items.map((p) => p.id), [manual.id]);
  const published = (await admin("/admin/posts?tab=published")).data;
  assert.deepEqual(published.items.map((p) => p.id), [live.id]);
  for (const key of ["id", "slug", "title", "topic", "origin", "published", "pinned", "cover_url", "source_name", "warnings", "created_at", "published_at"])
    assert.ok(key in published.items[0], key);
  assert.ok(!("body_html" in published.items[0]) && !("search_text" in published.items[0]));
  assert.ok(list.items[0].warnings.includes("Thiếu ảnh bìa") && list.items[0].warnings.includes("Bài tự động chưa ghi nguồn"));
  db.prepare("UPDATE posts SET created_at='2026-01-01 00:00:00' WHERE id=?").run(manual.id);
  const second = await create({ title: "Nháp mới hơn" });
  assert.deepEqual((await admin("/admin/posts?tab=drafts")).data.items.map((p) => p.id), [second.id, manual.id]);
  assert.equal((await admin("/admin/posts?tab=nope")).status, 400);
  assert.equal((await admin(`/admin/posts/${manual.id}`)).data.title, "Nháp tay");
  assert.equal((await admin("/admin/posts/999999")).status, 404);
});

test("publishing needs the hard rules (422), freezes the slug, and unpublishing keeps date and slug", async (t) => {
  const { admin, create, publish, call } = await setup(t);
  const short = await create({ body_html: `<p>${words(10)}</p>`, title: "Bài quá ngắn để đăng" });
  const refused = await admin(`/admin/posts/${short.id}/publish`, "POST");
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.data.problems, ["Nội dung cần ít nhất 50 chữ"]);
  assert.equal((await admin(`/admin/posts/${short.id}`, "PUT", { ...draft({ body_html: `<p>${words(10)}</p>` }), published: true })).status, 422);
  assert.equal((await call(null, `/posts/${short.id}`)).status, 404);
  const row = await create({ title: "Điểm chuẩn Đại học 2027" });
  const live = await publish(row.id);
  assert.equal(live.published, 1);
  assert.equal(live.slug, "diem-chuan-dai-hoc-2027");
  assert.ok(live.published_at);
  const renamed = await admin(`/admin/posts/${row.id}`, "PUT", { ...draft({ title: "Tiêu đề hoàn toàn khác" }), published: true });
  assert.equal(renamed.data.slug, "diem-chuan-dai-hoc-2027", "slug does not follow later title edits");
  assert.equal(renamed.data.published_at, live.published_at);
  const down = (await admin(`/admin/posts/${row.id}/unpublish`, "POST")).data;
  assert.equal(down.published, 0);
  assert.equal(down.slug, live.slug);
  assert.equal(down.published_at, live.published_at);
  assert.equal((await call(null, `/posts/${row.id}`)).status, 404);
  const again = await publish(row.id);
  assert.equal(again.slug, live.slug);
  assert.equal(again.published_at, live.published_at);
  assert.equal((await admin("/admin/posts/999999/publish", "POST")).status, 404);
});

test("revised_at is set only when content of a live post changes", async (t) => {
  const { admin, create, publish } = await setup(t);
  const row = await create();
  assert.equal((await admin(`/admin/posts/${row.id}`, "PUT", draft({ summary: "Đổi lúc còn nháp" }))).data.revised_at, null);
  await publish(row.id);
  const same = await admin(`/admin/posts/${row.id}`, "PUT", { ...draft({ summary: "Đổi lúc còn nháp" }), published: true });
  assert.equal(same.data.revised_at, null, "no content change, no revision");
  const changed = await admin(`/admin/posts/${row.id}`, "PUT", { ...draft({ summary: "Tóm tắt đã sửa" }), published: true });
  assert.ok(changed.data.revised_at);
});

test("at most one post is pinned; only published posts can be pinned; unpublish and delete unpin", async (t) => {
  const { admin, create, publish, db, call } = await setup(t);
  const a = await create({ title: "Bài A" }), b = await create({ title: "Bài B" }), c = await create({ title: "Bài C" });
  assert.equal((await admin(`/admin/posts/${a.id}/pin`, "POST", { pinned: true })).status, 409);
  await publish(a.id); await publish(b.id);
  assert.equal((await admin(`/admin/posts/${a.id}/pin`, "POST", { pinned: true })).data.pinned, 1);
  assert.equal((await admin(`/admin/posts/${b.id}/pin`, "POST", { pinned: true })).data.pinned, 1);
  const pinned = () => db.prepare("SELECT id FROM posts WHERE pinned=1").all().map((r) => r.id);
  assert.deepEqual(pinned(), [b.id]);
  assert.equal((await admin(`/admin/posts/${b.id}/pin`, "POST", { pinned: "yes" })).status, 400);
  await admin(`/admin/posts/${b.id}/unpublish`, "POST");
  assert.deepEqual(pinned(), []);
  await publish(b.id);
  await admin(`/admin/posts/${b.id}/pin`, "POST", { pinned: true });
  await admin(`/admin/posts/${b.id}`, "DELETE");
  assert.deepEqual(pinned(), []);
  await admin(`/admin/posts/${a.id}/pin`, "POST", { pinned: true });
  const viaSave = await admin(`/admin/posts/${c.id}`, "PUT", { ...draft({ title: "Bài C" }), published: true, pinned: true });
  assert.equal(viaSave.data.pinned, 1);
  assert.deepEqual(pinned(), [c.id]);
  assert.equal((await call(null, "/news")).data.pinned.id, c.id);
  const unpinned = await admin(`/admin/posts/${c.id}`, "PUT", { ...draft({ title: "Bài C" }), published: false });
  assert.equal(unpinned.data.pinned, 0, "saving as unpublished unpins");
});

test("public news list paginates 12 at a time, filters by topic and never repeats the pinned post", async (t) => {
  const { admin, create, publish, call, db } = await setup(t);
  const ids = [];
  for (let i = 0; i < 14; i++) {
    const row = await create({ title: `Tin số ${i}`, topic: i % 2 ? "policy" : "admissions" });
    await publish(row.id);
    db.prepare("UPDATE posts SET published_at=? WHERE id=?").run(`2026-11-${String(i + 1).padStart(2, "0")} 08:00:00`, row.id);
    ids.push(row.id);
  }
  const draftRow = await create({ title: "Nháp không được lộ" });
  await admin(`/admin/posts/${ids[3]}/pin`, "POST", { pinned: true });
  const first = (await call(null, "/news")).data;
  assert.equal(first.pinned.id, ids[3]);
  assert.equal(first.items.length, 12);
  assert.equal(first.has_more, true);
  assert.ok(!first.items.some((p) => p.id === ids[3]), "pinned is not repeated");
  assert.equal(first.items[0].id, ids[13], "newest first");
  const second = (await call(null, "/news?page=1")).data;
  assert.equal(second.pinned, null);
  assert.deepEqual(second.items.map((p) => p.id), [ids[0]]);
  assert.equal(second.has_more, false);
  const policy = (await call(null, "/news?topic=policy")).data;
  assert.equal(policy.pinned, null);
  assert.ok(policy.items.length === 7 && policy.items.every((p) => p.topic === "policy"));
  assert.ok(policy.items.some((p) => p.id === ids[3]), "a filtered view lists the pinned post normally");
  assert.equal((await call(null, "/news?topic=sports")).status, 400);
  assert.equal((await call(null, "/news?page=-1")).status, 400);
  const card = first.items[0];
  assert.deepEqual(Object.keys(card).sort(), ["cover_alt", "cover_url", "id", "published_at", "reading_minutes", "revised_at", "slug", "summary", "title", "topic"]);
  for (const route of ["/news", "/news?page=1", "/posts"]) {
    const text = JSON.stringify((await call(null, route)).data);
    assert.ok(!text.includes(`"id":${draftRow.id},`) && !text.includes("Nháp không được lộ"), `${route} leaks a draft`);
  }
});

test("post detail adds cta, related posts and reading time and hides internals and drafts", async (t) => {
  const { admin, create, publish, call, db } = await setup(t);
  const main = await create({ topic: "admissions", cta_level: "THCS", cta_goal: "", source_name: "Tuổi Trẻ", source_url: "https://tuoitre.vn/a" });
  await publish(main.id);
  const same = [];
  for (const title of ["Cùng chủ đề 1", "Cùng chủ đề 2"]) { const r = await create({ title, topic: "admissions" }); await publish(r.id); same.push(r.id); }
  const other = await create({ title: "Khác chủ đề", topic: "study" }); await publish(other.id);
  const hidden = await create({ title: "Nháp cùng chủ đề", topic: "admissions" });
  db.prepare("UPDATE posts SET published_at='2026-12-01 00:00:00' WHERE id=?").run(other.id);
  const detail = (await call(null, `/posts/${main.id}`)).data;
  assert.equal(detail.slug, "lich-thi-tot-nghiep-thpt-2027");
  assert.equal(detail.cta.href, "/tutors?level=THCS");
  assert.equal(detail.reading_minutes, 1);
  assert.equal(detail.source_name, "Tuổi Trẻ");
  assert.ok(detail.body_html.startsWith("<p>"));
  for (const hiddenKey of ["search_text", "author_id", "origin", "pinned", "published"]) assert.ok(!(hiddenKey in detail), hiddenKey);
  assert.deepEqual(detail.related.map((p) => p.id).sort(), [...same, other.id].sort(), "same topic first, then newest of other topics");
  assert.ok(detail.related.length <= 3 && !detail.related.some((p) => p.id === main.id || p.id === hidden.id));
  assert.equal((await call(null, `/posts/${hidden.id}`)).status, 404);
  const list = (await call(null, "/posts")).data;
  assert.ok(Array.isArray(list));
  for (const key of ["id", "slug", "title", "summary", "published_at", "updated_at", "revised_at"]) assert.ok(key in list[0], key);
  assert.ok(!list.some((p) => p.id === hidden.id));
  void admin;
});

test("news images: admin uploads, drafts stay private, published posts serve them publicly, orphans are cleaned", async (t) => {
  const { admin, create, publish, call, imageRequest, db } = await setup(t);
  const bytes = await png();
  assert.equal((await imageRequest(null, "/api/admin/news/images", bytes)).status, 401);
  assert.equal((await imageRequest("student", "/api/admin/news/images", bytes)).status, 403);
  assert.equal((await imageRequest("admin", "/api/admin/news/images", Buffer.from("not an image"))).status, 400);
  assert.equal((await imageRequest("admin", "/api/admin/news/images", bytes, "text/plain")).status, 400);
  const up = await imageRequest("admin", "/api/admin/news/images", bytes);
  assert.equal(up.status, 201);
  const { url } = await up.json();
  assert.match(url, /^\/api\/news\/images\/[a-f0-9-]{36}$/);
  assert.equal((await imageRequest(null, url)).status, 404, "unattached image is admin-only");
  assert.equal((await imageRequest("student", url)).status, 404);
  const mine = await imageRequest("admin", url);
  assert.equal(mine.status, 200);
  assert.equal(mine.headers.get("content-type"), "image/webp");
  assert.equal((await admin("/admin/posts", "POST", draft({ cover_url: "/api/news/images/00000000-0000-4000-8000-000000000000" }))).status, 400, "unknown image");
  const inline = await png();
  const second = await (await imageRequest("admin", "/api/admin/news/images", inline)).json();
  const row = await create({ cover_url: url, body_html: `<p>${words(80)}</p><img src="${second.url}" alt="trong bài">` });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM news_post_images WHERE post_id=?").get(row.id).n, 2);
  assert.equal((await imageRequest(null, url)).status, 404, "draft images are not public");
  await publish(row.id);
  for (const u of [url, second.url]) {
    const pub = await imageRequest(null, u);
    assert.equal(pub.status, 200);
    assert.match(pub.headers.get("cache-control"), /max-age=\d{6,}/);
  }
  await admin(`/admin/posts/${row.id}/unpublish`, "POST");
  assert.equal((await imageRequest(null, url)).status, 404, "unpublishing hides images again");
  await admin(`/admin/posts/${row.id}`, "DELETE");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM news_post_images").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM news_images").get().n, 2, "orphans survive until the daily cleanup");
  db.prepare("UPDATE news_images SET created_at=datetime('now','-2 day')").run();
  await imageRequest("admin", "/api/admin/news/images", bytes);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM news_images").get().n, 1, "old unattached images are removed on the next upload");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM news_image_chunks").get().n, 1);
  void call; void publicRoutes;
});

test("admin audit trail records every news action", async (t) => {
  const { admin, create, publish, db, imageRequest } = await setup(t);
  const row = await create();
  await publish(row.id);
  await admin(`/admin/posts/${row.id}/pin`, "POST", { pinned: true });
  await admin(`/admin/posts/${row.id}/pin`, "POST", { pinned: false });
  await admin(`/admin/posts/${row.id}/unpublish`, "POST");
  await imageRequest("admin", "/api/admin/news/images", await png());
  await admin(`/admin/posts/${row.id}`, "DELETE");
  const actions = db.prepare("SELECT action FROM audit ORDER BY id").all().map((r) => r.action);
  assert.deepEqual(actions, ["save_post_draft", "publish_post", "pin_post", "unpin_post", "unpublish_post", "upload_news_image", "delete_post"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRequest, requestTopic, summarize } from "../server/community-requests.js";
import { fixture } from "./community-fixture.js";
import { run } from "../server/db.js";

const seek = (title, body = "", authorRole = "student") =>
  classifyRequest({ title, body, authorRole });

test("every seeking-tutor phrase is recognised with or without accents", () => {
  for (const s of [
    "Tìm gia sư Toán lớp 9",
    "Cần gia sư cho con",
    "Kiếm gia sư Hóa",
    "Cần tìm thầy dạy Lý",
    "Cần tìm cô giáo dạy Anh",
    "Tìm giáo viên IELTS",
    "Tìm người dạy kèm Văn",
    "Cần người dạy Toán",
    "tim gia su toan",
    "can gia su",
    "kiem gia su",
    "can tim thay day ly",
    "can tim co giao day anh",
    "tim giao vien",
    "tim nguoi day kem",
    "can nguoi day",
    "TÌM GIA SƯ",
  ])
    assert.equal(seek(s), "seeking_tutor", s);
});

test("phrases match whole words next to punctuation and newlines", () => {
  assert.equal(seek("Chào mọi người, mình đang tìm gia sư."), "seeking_tutor");
  assert.equal(seek("Nhờ giúp", "Em cần\ngia sư"), "seeking_tutor");
  assert.equal(seek("Nhờ giúp", "Em đang\ntìm gia sư!"), "seeking_tutor");
  assert.equal(seek("Hỏi", "con cần gia sư, lớp 6"), "seeking_tutor");
  assert.equal(seek("Cần gia sưu tầm tem"), null);
});

test("'cần tìm cô' does not match 'cần tìm cơ hội'", () => {
  assert.equal(seek("Cần tìm cô giáo dạy Toán"), "seeking_tutor");
  assert.equal(seek("Cần tìm cô dạy kèm"), "seeking_tutor");
  assert.equal(seek("Cần tìm cơ hội học tốt hơn"), null);
  assert.equal(seek("can tim co hoi hoc tap"), null);
  assert.equal(seek("Chia sẻ cách học Toán"), null);
});

test("only student posts are seeking_tutor; tutors and admins are not", () => {
  assert.equal(seek("Tìm gia sư", "", "tutor"), null);
  assert.equal(seek("Nhận dạy kèm Toán", "", "tutor"), "seeking_student");
  assert.equal(seek("Tìm học sinh lớp 9", "", "tutor"), "seeking_student");
  for (const p of ["tìm học viên", "nhận kèm", "nhận học sinh"])
    assert.equal(seek(p, "", "tutor"), "seeking_student", p);
  assert.equal(seek("Tìm gia sư", "", "admin"), null);
  assert.equal(seek("Nhận dạy kèm", "", "admin"), null);
  assert.equal(seek("Nhận dạy kèm", "", undefined), null);
  assert.equal(seek("Nhận dạy kèm Toán", "", "student"), null);
});

test("a need word before a tutor word in one sentence is recognised, however it is phrased", () => {
  for (const s of [
    "Mình cần tìm một gia sư Toán lớp 9",
    "Cần tìm 1 gia sư dạy Toán cho con",
    "Em muốn tìm gia sư tiếng Anh",
    "Nhờ mọi người giới thiệu gia sư Lý lớp 11",
    "Có ai biết gia sư Hóa dạy tốt không?",
    "Tìm giúp mình gia sư",
    "Cần thầy dạy Toán lớp 8",
    "Em đang tìm thầy cô dạy kèm môn Văn",
    "Xin gia sư dạy IELTS",
    "Gợi ý giúp em gia sư Văn lớp 12",
    "Mình muốn thuê gia sư dạy Toán",
    "Dạ chào mọi người, em cần tìm một giáo viên dạy Anh",
    "Em xin một thầy dạy Lý",
    "toi can tim mot gia su toan",
    "nho moi nguoi gioi thieu gia su ly",
  ])
    assert.equal(seek(s), "seeking_tutor", s);
  // Title and body are read together, each sentence on its own.
  assert.equal(seek("Nhờ giúp", "Con học lớp 6. Em đang cần một gia sư Toán."), "seeking_tutor");
});

test("talking about a tutor, or no longer needing one, is not seeking", () => {
  for (const s of [
    "Gia sư của em dạy rất tốt, em cần cố gắng thêm",
    "Mình không cần gia sư nữa",
    "Nhà em khỏi cần gia sư rồi",
    "Em đã tìm được gia sư rồi, cảm ơn mọi người",
    "Cần tìm cơ hội việc làm",
    "Nhờ mọi người góp ý cách học",
    "Em nhớ gia sư cũ lắm",
    "Review gia sư: cô giáo A dạy rất tốt. Xin cảm ơn cô.",
    "Cần Gia sưu tầm tem",
    "Tìm trường cho con. Gia sư của bé học rất tốt",
  ])
    assert.equal(seek(s), null, s);
  // A need word that is too far from the tutor word does not count.
  assert.equal(
    seek("Mình cần mua rất nhiều loại sách vở bút và đồ dùng học tập cho gia sư"),
    null,
  );
});

test("the widened rule still never reaches tutors or admins", () => {
  for (const s of ["Mình cần tìm một gia sư Toán", "Nhờ mọi người giới thiệu gia sư"]) {
    assert.equal(seek(s, "", "tutor"), null, s);
    assert.equal(seek(s, "", "admin"), null, s);
  }
});

test("summary: short, plain, cut at a word, never the title again", () => {
  assert.equal(summarize("Cần gia sư Toán", "Con học lớp 9, yếu hình."), "Con học lớp 9, yếu hình.");
  assert.equal(summarize("Cần gia sư Toán", ""), "");
  assert.equal(summarize("Cần gia sư Toán", null), "");
  // Whitespace and line breaks collapse into single spaces.
  assert.equal(summarize("T", "Học   thứ 3\n\nvà thứ 5\t tối"), "Học thứ 3 và thứ 5 tối");
  // The title repeated at the start of the body is dropped.
  assert.equal(
    summarize("Cần gia sư Toán lớp 9", "Cần gia sư Toán lớp 9. Học ở Quận 7, tối thứ 3 và thứ 5."),
    "Học ở Quận 7, tối thứ 3 và thứ 5.",
  );
  // Long text is cut at a word boundary within 100 characters and marked.
  const long = "Con em học lớp 9 đang yếu phần hình học không gian và cần ôn thi vào lớp 10 trường chuyên trong sáu tháng tới nên rất mong tìm được thầy cô tận tâm";
  const out = summarize("Tiêu đề khác", long);
  assert.ok(out.endsWith("…"));
  assert.ok(out.length <= 101, out.length);
  assert.ok(long.startsWith(out.slice(0, -1)));
  assert.ok(!/\s…$/.test(out));
  assert.equal(summarize("T", "x".repeat(300)).length, 101);
});

test("topic: subject and level", () => {
  assert.deepEqual(requestTopic("Cần tìm gia sư Toán lớp 9 ở Quận 7"), {
    subject: "Toán",
    level: "THCS",
  });
  assert.equal(requestTopic("học anh văn").subject, "Tiếng Anh");
  assert.equal(requestTopic("Học Tiếng Anh").subject, "Tiếng Anh");
  assert.equal(requestTopic("em học ngữ văn").subject, "Ngữ văn");
  assert.equal(requestTopic("em vẫn chưa hiểu bài").subject, null);
  assert.equal(requestTopic("em van chua hieu").subject, null);
  assert.equal(requestTopic("lớp 1 cần giúp").level, "Tiểu học");
  assert.equal(requestTopic("lớp 10 cần giúp").level, "THPT");
  assert.equal(requestTopic("con học lớp 12.").level, "THPT");
  assert.equal(requestTopic("Học vật lý").subject, "Vật lí");
  assert.equal(requestTopic("Cần giúp").subject, null);
  assert.equal(requestTopic("Cần giúp").level, null);
});

test("topic: earliest mention wins", () => {
  assert.equal(requestTopic("Tiếng Anh và Toán").subject, "Tiếng Anh");
  assert.equal(requestTopic("Toán và Tiếng Anh").subject, "Toán");
  assert.equal(requestTopic("lớp 10, hoặc lớp 6").level, "THPT");
  assert.equal(requestTopic("cấp 2 rồi lên cấp 3").level, "THCS");
});

test("GET /community/requests: access, filters, order and privacy", async (t) => {
  const { call, db, ids } = await fixture(t);
  const add = (author, title, o = {}) =>
    Number(
      run(
        db,
        "INSERT INTO community_posts(author_id,kind,status,title,body,search_text,solved,published_at) VALUES (?,?,?,?,?,?,?,?)",
        ids[author],
        o.kind ?? "user",
        o.status ?? "approved",
        title,
        o.body ?? "Nội dung bài",
        title.toLowerCase(),
        o.solved ?? 0,
        o.at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
      ).lastInsertRowid,
    );
  const ago = (days, extraSeconds = 0) =>
    new Date(Date.now() - days * 864e5 + extraSeconds * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

  // Access control.
  assert.equal((await call(null, "/community/requests")).status, 401);
  for (const u of ["student", "parent", "admin"])
    assert.equal((await call(u, "/community/requests")).status, 403, u);
  assert.deepEqual((await call("tutor", "/community/requests")).data.items, []);

  const good = add("student", "Cần gia sư Toán lớp 9 ở Quận 7", { at: ago(1) });
  const parent = add("parent", "Tìm gia sư Anh văn cho con", { at: ago(0, -30) });
  const excluded = [
    add("student", "Tìm gia sư nhưng chưa duyệt", { status: "pending" }),
    add("student", "Tìm gia sư nhưng bị ẩn", { status: "hidden" }),
    add("student", "Tìm gia sư đã giải quyết", { solved: 1 }),
    add("student", "Tìm gia sư quá 14 ngày", { at: ago(15) }),
    add("tutor", "Tìm gia sư của gia sư"),
    add("admin", "Tìm gia sư của admin", { kind: "announcement" }),
    add("student", "Chia sẻ cách học Toán", { body: "Chỉ trao đổi", at: ago(0) }),
  ];
  // A banned poster never appears.
  run(db, "UPDATE users SET status='disabled' WHERE id=?", ids.other);
  excluded.push(add("other", "Tìm gia sư của người bị khóa tài khoản"));
  // Pending revision mentioning the phrase must not surface.
  const revised = add("student", "Chia sẻ mẹo học Toán");
  run(db, "UPDATE community_posts SET revision_title=?,revision_body=? WHERE id=?", "Tìm gia sư Toán", "Tìm gia sư", revised);

  const r = await call("tutor", "/community/requests");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(
    r.data.items.map((i) => i.id),
    [parent, good],
  );
  const [first, second] = r.data.items;
  assert.equal(second.subject, "Toán");
  assert.equal(second.level, "THCS");
  assert.equal(first.subject, "Tiếng Anh");
  assert.equal(first.level, null);
  assert.equal(first.author.tier, "parent");
  assert.equal(first.author.name_part, "Public parent");
  assert.equal(second.author.tier, "student");

  // A short summary of the post, but never the whole body, account ids or private details.
  for (const i of r.data.items) {
    assert.equal(typeof i.summary, "string");
    assert.ok(i.summary.length <= 101);
  }
  const raw = JSON.stringify(r.data);
  assert.ok(!raw.includes("Private"));
  assert.ok(!raw.includes("@private"));
  for (const i of r.data.items) {
    assert.equal(i.body, undefined);
    assert.equal(i.author_id, undefined);
    assert.equal(i.author.id, undefined);
  }

  // A tutor locked out of the community can still read the strip.
  run(db, "UPDATE users SET community_locked=1,community_lock_reason='test' WHERE id=?", ids.tutor);
  assert.equal((await call("tutor", "/community/requests")).status, 200);
  // A tutor whose profile is not approved yet can read it too.
  assert.equal((await call("pending", "/community/requests")).status, 200);
});

test("GET /community/requests: newest first, at most 10, ties by id", async (t) => {
  const { call, db, ids } = await fixture(t);
  const at = new Date(Date.now() - 3600e3).toISOString().slice(0, 19).replace("T", " ");
  const made = [];
  for (let i = 0; i < 12; i++)
    made.push(
      Number(
        run(
          db,
          "INSERT INTO community_posts(author_id,kind,status,title,body,search_text,published_at) VALUES (?,?,?,?,?,?,?)",
          ids.student,
          "user",
          "approved",
          `Tìm gia sư số ${i}`,
          "Nội dung",
          `tim gia su so ${i}`,
          at,
        ).lastInsertRowid,
      ),
    );
  const r = await call("tutor", "/community/requests");
  assert.equal(r.data.items.length, 10);
  assert.deepEqual(
    r.data.items.map((i) => i.id),
    made.slice().reverse().slice(0, 10),
  );
});

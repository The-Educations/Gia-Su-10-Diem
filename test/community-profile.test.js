import sharp from "sharp";
import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateDatabase, one, run } from "../server/db.js";
import { fixture } from "./community-fixture.js";

test("member codes are random, unique, stable across migrations and public without private IDs", async (t) => {
  const { db, call, create, approve } = await fixture(t);
  const before = db
    .prepare("SELECT id,profile_code FROM users ORDER BY id")
    .all();
  assert.equal(new Set(before.map((u) => u.profile_code)).size, before.length);
  for (const u of before) assert.match(u.profile_code, /^[a-z2-9]{8}$/);
  migrateDatabase(db);
  assert.deepEqual(
    db.prepare("SELECT id,profile_code FROM users ORDER BY id").all(),
    before,
  );
  const id = await create();
  await approve(id);
  const post = (await call(null, `/community/posts/${id}`)).data;
  assert.equal(post.author.profile_code, before[0].profile_code);
  assert.equal(post.author.has_avatar, false);
  assert.equal(post.author.id, undefined);
});

test("member images are private, independent, bounded and atomically replaced", async (t) => {
  const { db, ids, call, imageRequest } = await fixture(t);
  const code = one(
    db,
    "SELECT profile_code FROM users WHERE id=?",
    ids.tutor,
  ).profile_code;
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#880033" },
  })
    .png()
    .toBuffer();
  const put = (kind, data = png, mime = "image/png", who = "tutor") =>
    imageRequest(who, `/api/community/me/${kind}`, data, mime, "PUT");
  assert.equal((await put("avatar", png, "image/png", null)).status, 401);
  assert.equal((await put("avatar", Buffer.from("bad"))).status, 400);
  assert.equal((await put("avatar", png, "image/svg+xml")).status, 400);
  assert.equal(
    (await put("avatar", Buffer.alloc(5 * 1024 * 1024 + 1))).status,
    413,
  );
  const large = await sharp({
    create: { width: 4001, height: 4000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  assert.equal((await put("avatar", large)).status, 400);
  for (const kind of ["avatar", "cover"]) {
    assert.equal((await put(kind)).status, 200);
    const url = `/api/community/members/${code}/${kind}`;
    assert.equal((await imageRequest(null, url)).status, 401);
    const response = await imageRequest("student", url);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    const meta = await sharp(
      Buffer.from(await response.arrayBuffer()),
    ).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, kind === "avatar" ? 640 : 1280);
    assert.equal(meta.height, kind === "avatar" ? 640 : 320);
  }
  const old = one(
    db,
    "SELECT id FROM user_images WHERE user_id=? AND kind='avatar'",
    ids.tutor,
  ).id;
  assert.equal((await put("avatar")).status, 200);
  assert.equal(
    one(db, "SELECT COUNT(*) n FROM user_image_chunks WHERE image_id=?", old).n,
    0,
  );
  for (let i = 0; i < 3; i++) assert.equal((await put("avatar")).status, 200);
  assert.equal((await put("avatar")).status, 429);
  assert.equal(
    one(db, "SELECT status FROM tutors WHERE user_id=?", ids.tutor).status,
    "approved",
  );
  const author = (await call("student", "/community/me")).data.author;
  assert.equal(author.has_avatar, false);
  run(db, "UPDATE users SET community_locked=1 WHERE id=?", ids.tutor);
  assert.equal((await put("cover")).status, 403);
  assert.equal(
    (await call("tutor", "/community/me/avatar", "DELETE")).status,
    403,
  );
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.tutor);
  assert.equal(
    (await imageRequest("student", `/api/community/members/${code}/avatar`))
      .status,
    404,
  );
  assert.equal(
    (await imageRequest("admin", `/api/community/members/${code}/avatar`))
      .status,
    200,
  );
  run(
    db,
    "UPDATE users SET status='active',community_locked=0 WHERE id=?",
    ids.tutor,
  );
  assert.equal(
    (await call("tutor", "/community/me/avatar", "DELETE")).status,
    200,
  );
  assert.equal(
    one(
      db,
      "SELECT COUNT(*) n FROM user_image_chunks c LEFT JOIN user_images i ON i.id=c.image_id WHERE i.id IS NULL",
    ).n,
    0,
  );
});

test("member profiles preserve privacy, live tiers, edit quotas and onboarding requirements", async (t) => {
  const { db, ids, call, create, approve } = await fixture(t);
  const codes = Object.fromEntries(
    Object.entries(ids).map(([key, id]) => [
      key,
      one(db, "SELECT profile_code FROM users WHERE id=?", id).profile_code,
    ]),
  );
  for (const who of ["student", "parent", "pending", "tutor", "admin"]) {
    const path = `/community/members/${codes[who]}`;
    assert.equal((await call(null, path)).status, 401);
    const r = await call("other", path);
    assert.equal(r.status, 200);
    const p = r.data.profile;
    assert.equal(p.code, codes[who]);
    assert.equal(p.mine, false);
    assert.equal(r.data.admin, undefined);
    const identity = (await call(who, "/community/me")).data.author;
    assert.equal(p.label, identity.label);
    if (["student", "parent", "pending"].includes(who)) {
      assert.equal(p.id, undefined);
      assert.equal(p.email, undefined);
      assert.equal(p.tutor_id, undefined);
      assert.ok(!JSON.stringify(r.data).includes(`Private ${who}`));
    }
    assert.equal(
      (await call("admin", path)).data.admin.email,
      `${who}@private.test`,
    );
  }
  const post = await create("pending");
  await approve(post);
  for (const status of ["approved", "rejected"]) {
    run(db, "UPDATE tutors SET status=? WHERE user_id=?", status, ids.pending);
    const p = (await call("student", `/community/members/${codes.pending}`))
      .data.profile;
    const author = (await call(null, `/community/posts/${post}`)).data.author;
    assert.equal(p.label, author.label);
    assert.equal(p.tier, status === "approved" ? "tutor" : "student");
  }
  for (const bio of [
    "https://example.com",
    "0912 345 678",
    "a@b.vn",
    "x".repeat(301),
    "1\n2\n3\n4\n5\n6",
  ])
    assert.equal(
      (await call("tutor", "/community/me/profile", "PUT", { bio })).status,
      400,
    );
  for (const display_name of ["a", "Quản trị", "ADMIN", "minh.vn"])
    assert.equal(
      (await call("tutor", "/community/me/profile", "PUT", { display_name }))
        .status,
      400,
    );
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await call(
          "tutor",
          i % 2 ? "/community/me/display-name" : "/community/me/profile",
          "PUT",
          { display_name: `Tên mới ${i}` },
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await call("tutor", "/community/me/display-name", "PUT", {
        display_name: "Tên cuối",
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await call("tutor", "/community/me/profile", "PUT", {
        display_name: "Tên mới 2",
      })
    ).status,
    200,
  );
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await call("tutor", "/community/me/profile", "PUT", {
          bio: `Mình thích học toán ${i}`,
        })
      ).status,
      200,
    );
  assert.equal(
    (await call("tutor", "/community/me/profile", "PUT", { bio: "Đổi tiếp" }))
      .status,
    429,
  );
  assert.equal(
    one(db, "SELECT status FROM tutors WHERE user_id=?", ids.tutor).status,
    "approved",
  );
  run(db, "UPDATE users SET community_locked=1 WHERE id=?", ids.parent);
  assert.equal(
    (await call("parent", "/community/me/profile", "PUT", { bio: "Toán" }))
      .status,
    403,
  );
  assert.equal(
    (await call("other", `/community/members/${codes.parent}`)).status,
    200,
  );
  assert.equal(
    (await call("other", `/community/members/${codes.parent}`)).data.profile
      .community_lock_reason,
    undefined,
  );
  for (const who of ["student", "pending"]) {
    run(db, "UPDATE users SET onboarding_step=1 WHERE id=?", ids[who]);
    assert.equal(
      (await call(who, "/account/onboarding", "PUT", { step: 1, name: "Tên" }))
        .status,
      400,
    );
    assert.equal(
      one(db, "SELECT onboarding_step FROM users WHERE id=?", ids[who])
        .onboarding_step,
      1,
    );
  }
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.parent);
  assert.equal(
    (await call("other", `/community/members/${codes.parent}`)).status,
    404,
  );
  assert.equal(
    (await call("other", `/community/members/${codes.parent}/posts`)).status,
    404,
  );
  assert.equal(
    (await call("admin", `/community/members/${codes.parent}`)).status,
    200,
  );
});

test("member posts and statistics include only published activity with stable sorting and pagination", async (t) => {
  const { db, ids, call } = await fixture(t);
  const code = one(
    db,
    "SELECT profile_code FROM users WHERE id=?",
    ids.student,
  ).profile_code;
  const path = `/community/members/${code}`;
  const posts = [];
  for (let i = 0; i < 12; i++)
    posts.push(
      Number(
        run(
          db,
          "INSERT INTO community_posts(author_id,title,body,status,published_at) VALUES (?,'Toán','Nội dung','approved',?)",
          ids.student,
          `2026-10-${String(i + 1).padStart(2, "0")} 00:00:00`,
        ).lastInsertRowid,
      ),
    );
  for (const status of ["pending", "hidden", "deleted", "rejected"])
    run(
      db,
      "INSERT INTO community_posts(author_id,title,body,status) VALUES (?,'Riêng tư','Nội dung',?)",
      ids.student,
      status,
    );
  const comment = Number(
    run(
      db,
      "INSERT INTO community_comments(author_id,post_id,body) VALUES (?,?,'Bình luận')",
      ids.student,
      posts[0],
    ).lastInsertRowid,
  );
  run(db, "INSERT INTO community_helpful VALUES (?,?)", comment, ids.other);
  run(
    db,
    "INSERT INTO community_comments(author_id,post_id,body,status) VALUES (?,?,'Đã gỡ','removed_by_admin')",
    ids.student,
    posts[0],
  );
  run(
    db,
    "INSERT INTO community_comments(author_id,post_id,body) SELECT ?,id,'Ẩn' FROM community_posts WHERE status='hidden'",
    ids.student,
  );
  run(
    db,
    "UPDATE community_posts SET revision_body='Riêng tư' WHERE id=?",
    posts[0],
  );
  const stats = (await call("other", path)).data.profile.stats;
  assert.deepEqual(stats, { posts: 12, comments: 1, helpful: 1 });
  const first = (await call("student", path + "/posts?sort=new")).data;
  assert.equal(first.items.length, 10);
  assert.equal(first.more, true);
  assert.equal(first.items[0].id, posts[11]);
  const second = (await call("other", path + "/posts?page=2")).data;
  assert.equal(second.items.length, 2);
  assert.equal(second.more, false);
  const helpful = (await call("student", path + "/posts?sort=helpful")).data;
  assert.equal(helpful.items[0].id, posts[0]);
  assert.equal(helpful.items[1].id, posts[11]);
  assert.equal(helpful.items[0].revision_body, undefined);
  const adminCode = one(
    db,
    "SELECT profile_code FROM users WHERE id=?",
    ids.admin,
  ).profile_code;
  await call("admin", "/community/posts", "POST", {
    title: "Thông báo",
    body: "Nội dung",
  });
  const adminPosts = (
    await call("other", `/community/members/${adminCode}/posts`)
  ).data.items;
  assert.equal(adminPosts.length, 1);
  assert.equal(adminPosts[0].kind, "announcement");
});

test("profile reports, moderation notifications, quotas and account cleanup", async (t) => {
  const { db, ids, call, imageRequest } = await fixture(t);
  const code = one(
    db,
    "SELECT profile_code FROM users WHERE id=?",
    ids.student,
  ).profile_code;
  const target = {
    target_type: "profile",
    target_id: code,
    part: "bio",
    reason: "Khác",
    detail: "Xem lại nội dung",
  };
  assert.equal(
    (await call("student", "/community/reports", "POST", target)).status,
    403,
  );
  assert.equal(
    (await call("admin", "/community/reports", "POST", target)).status,
    403,
  );
  await call("student", "/community/me/profile", "PUT", {
    bio: "Mình thích toán",
  });
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  for (const kind of ["avatar", "cover"])
    assert.equal(
      (
        await imageRequest(
          "student",
          `/api/community/me/${kind}`,
          png,
          "image/png",
          "PUT",
        )
      ).status,
      200,
    );
  for (const part of ["bio", "avatar", "cover"]) {
    assert.equal(
      (await call("other", "/community/reports", "POST", { ...target, part }))
        .status,
      201,
    );
    assert.equal(
      (await call("other", "/community/reports", "POST", { ...target, part }))
        .status,
      409,
    );
  }
  const reports = (await call("admin", "/admin/community/reports")).data;
  assert.equal(reports.length, 3);
  assert.equal(reports[0].target.profile_code, code);
  assert.equal(reports[0].target.has_avatar, true);
  assert.equal(reports[0].target.body, "Mình thích toán");
  for (const part of ["bio", "avatar", "cover"]) {
    assert.equal(
      (
        await call(
          "other",
          `/admin/community/members/${code}/${part}`,
          "DELETE",
          { note: "Lý do" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "admin",
          `/admin/community/members/${code}/${part}`,
          "DELETE",
          { note: "" },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "admin",
          `/admin/community/members/${code}/${part}`,
          "DELETE",
          { note: "Nội dung chưa phù hợp" },
        )
      ).status,
      200,
    );
  }
  assert.equal(
    one(
      db,
      "SELECT COUNT(*) n FROM audit WHERE action='community.profile.remove'",
    ).n,
    3,
  );
  const notices = (await call("student", "/community/notifications")).data;
  assert.equal(notices.length, 3);
  assert.equal(notices[0].kind, "profile_removed");
  assert.match(notices[0].detail, /Nội dung chưa phù hợp/);
  assert.equal(
    (await call("student", "/community/notifications/unread-count")).data.count,
    3,
  );
  await call("student", "/community/notifications/read", "POST", { all: true });
  assert.equal(
    (await call("student", "/community/notifications/unread-count")).data.count,
    0,
  );
  assert.equal(
    (await call("other", "/community/notifications")).data.length,
    0,
  );
  for (let i = 0; i < 7; i++)
    run(
      db,
      "INSERT INTO community_reports(reporter_id,target_type,target_id,reason) VALUES (?,'post',?,'Khác')",
      ids.other,
      1000 + i,
    );
  const tutorCode = one(
    db,
    "SELECT profile_code FROM users WHERE id=?",
    ids.tutor,
  ).profile_code;
  assert.equal(
    (
      await call("other", "/community/reports", "POST", {
        ...target,
        target_id: tutorCode,
      })
    ).status,
    429,
  );
  await call("student", "/community/me/profile", "PUT", {
    bio: "Giới thiệu mới",
  });
  for (const kind of ["avatar", "cover"])
    await imageRequest(
      "student",
      `/api/community/me/${kind}`,
      png,
      "image/png",
      "PUT",
    );
  assert.equal(
    (
      await call("admin", `/admin/users/${ids.student}`, "DELETE", {
        email: "student@private.test",
      })
    ).status,
    200,
  );
  assert.equal(
    one(db, "SELECT bio FROM users WHERE id=?", ids.student).bio,
    "",
  );
  assert.equal(
    one(db, "SELECT COUNT(*) n FROM user_images WHERE user_id=?", ids.student)
      .n,
    0,
  );
  assert.equal(one(db, "SELECT COUNT(*) n FROM user_image_chunks").n, 0);
  assert.equal((await call("other", `/community/members/${code}`)).status, 404);
  assert.equal((await call("admin", `/community/members/${code}`)).status, 200);
});

test("legacy report migration preserves all decisions and can run twice", async (t) => {
  const { db, ids } = await fixture(t);
  db.exec(`DROP TABLE community_reports;
    CREATE TABLE community_reports (
      id INTEGER PRIMARY KEY,reporter_id INTEGER NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',
      resolved_by INTEGER REFERENCES users(id),resolution TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(reporter_id,target_type,target_id));`);
  run(
    db,
    "INSERT INTO community_reports(id,reporter_id,target_type,target_id,reason,detail,status,resolved_by,resolution) VALUES (42,?,'comment',20,'Khác','Ghi chú','resolved',?,'Đã xử lý')",
    ids.student,
    ids.admin,
  );
  const old = one(db, "SELECT * FROM community_reports WHERE id=42");
  migrateDatabase(db);
  migrateDatabase(db);
  assert.deepEqual(
    { ...one(db, "SELECT * FROM community_reports WHERE id=42") },
    { ...old, part: "" },
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("admin can inspect a suspended profile without counting nonpublic activity", async (t) => {
  const { db, ids, call, create, approve } = await fixture(t);
  const post = await create();
  await approve(post);
  const code = one(
    db,
    "SELECT profile_code FROM users WHERE id=?",
    ids.student,
  ).profile_code;
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.student);
  const response = await call("admin", `/community/members/${code}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.profile.stats, {
    posts: 0,
    comments: 0,
    helpful: 0,
  });
  assert.deepEqual(
    (await call("admin", `/community/members/${code}/posts`)).data,
    { items: [], more: false },
  );
});

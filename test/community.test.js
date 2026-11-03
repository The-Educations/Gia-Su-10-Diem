import sharp from "sharp";
import { processPhoto } from "../server/photo.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/local-db.js";
import { migrateDatabase, one, run, tokenHash } from "../server/db.js";
import { createApi } from "../server/api.js";
import { seedCatalog } from "../server/seed-catalog.js";
import {
  authorLabel,
  findContactInfo,
  displayNameSchema,
} from "../server/community-policy.js";

async function fixture(t) {
  const db = openDatabase(":memory:");
  seedCatalog(db);
  const ids = {};
  for (const [key, role, learner] of [
    ["student", "student", "student"],
    ["parent", "student", "parent"],
    ["tutor", "tutor", "student"],
    ["pending", "tutor", "student"],
    ["admin", "admin", "student"],
    ["other", "student", "student"],
  ]) {
    ids[key] = Number(
      run(
        db,
        "INSERT INTO users(name,email,password,role,learner_type,display_name) VALUES (?,?,?,?,?,?)",
        `Private ${key} Real Name`,
        `${key}@private.test`,
        "unused",
        role,
        learner,
        key === "admin" ? "" : `Public ${key}`,
      ).lastInsertRowid,
    );
    if (role === "tutor")
      run(
        db,
        "INSERT INTO tutors(user_id,status) VALUES (?,?)",
        ids[key],
        key === "tutor" ? "approved" : "pending",
      );
    run(
      db,
      "INSERT INTO sessions VALUES (?,?,?)",
      tokenHash(key),
      ids[key],
      Date.now() + 600000,
    );
  }
  migrateDatabase(db);
  const server = createApi(db, { limit: false, processPhoto }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  const call = async (user, path, method = "GET", body = {}) => {
    const decision = path.match(
      /^\/admin\/community\/posts\/(\d+)\/(approve|reject)$/,
    );
    if (decision && !Object.hasOwn(body, "expected_version")) {
      body = {
        ...body,
        expected_version: one(
          db,
          "SELECT review_version FROM community_posts WHERE id=?",
          decision[1],
        )?.review_version,
      };
    }
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(user ? { Cookie: `giasu_session=${user}` } : {}),
        },
        ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  const create = async (
    user = "student",
    title = "Tìm gia sư Anh văn lớp 8",
  ) => {
    const r = await call(user, "/community/posts", "POST", {
      title,
      body: "Mình muốn tìm cách học hiệu quả hơn.",
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.id;
  };
  const approve = async (id) => {
    const r = await call(
      "admin",
      `/admin/community/posts/${id}/approve`,
      "POST",
    );
    assert.equal(r.status, 200, JSON.stringify(r.data));
  };
  const imageRequest = (user, path, data, mime = "image/png", method = data ? "POST" : "GET") =>
    fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        ...(user ? { Cookie: `giasu_session=${user}` } : {}),
        ...(data ? { "Content-Type": mime } : {}),
      },
      ...(data ? { body: data } : {}),
    });
  return { db, ids, call, create, approve, imageRequest };
}

test("contact filtering, names and live public author labels", () => {
  for (const s of [
    "0912 345 678",
    "0912.345.678",
    "+84 912 345 678",
    "84912345678",
    "a@b.vn",
    "https://example.com",
    "www.example.org",
    "abc.vn",
    "Zalo: minh",
    "telegram minh123",
  ])
    assert.ok(findContactInfo(s), s);
  for (const s of [
    "Lớp 10 có 35 học sinh",
    "Học toán 2 giờ mỗi tuần",
    "Điểm 9.5",
    "Năm 2026",
  ])
    assert.equal(findContactInfo(s), null, s);
  for (const s of [
    "Admin Minh",
    "QUẢN TRỊ",
    "quan tri vien",
    "a",
    "x".repeat(31),
    "abc.com",
  ])
    assert.equal(displayNameSchema.safeParse(s).success, false, s);
  assert.equal(displayNameSchema.safeParse("Minh").success, true);
  const u = {
    id: 77,
    profile_code: "k7x2m9qa",
    name: "Private",
    display_name: "Minh",
    role: "student",
    learner_type: "parent",
  };
  assert.deepEqual(authorLabel(u), {
    profile_code: "k7x2m9qa",
    has_avatar: false,
    image_version: "",
    label: "Minh - Phụ huynh",
    name_part: "Minh",
    tier: "parent",
  });
  assert.equal(
    authorLabel({ ...u, role: "tutor", tutor_status: "pending" }).tier,
    "student",
  );
  assert.equal(
    authorLabel({ ...u, role: "tutor", tutor_status: "approved" }).tutor_id,
    77,
  );
});

test("post lifecycle, revisions, privacy, notifications and ownership", async (t) => {
  const { call, create, approve, db, ids } = await fixture(t);
  assert.equal((await call(null, "/community/posts", "POST")).status, 401);
  const id = await create();
  assert.equal((await call(null, `/community/posts/${id}`)).status, 404);
  assert.equal((await call("other", `/community/posts/${id}`)).status, 404);
  assert.equal(
    (await call("student", `/community/posts/${id}`)).data.status,
    "pending",
  );
  assert.equal((await call("student", "/admin/community/queue")).status, 403);
  assert.equal(
    (
      await call("admin", `/admin/community/posts/${id}/reject`, "POST", {
        note: "",
      })
    ).status,
    400,
  );
  await call("admin", `/admin/community/posts/${id}/reject`, "POST", {
    note: "Hãy bổ sung mục tiêu học",
  });
  assert.equal(
    (await call("student", `/community/posts/${id}`)).data.review_note,
    "Hãy bổ sung mục tiêu học",
  );
  await call("student", `/community/posts/${id}`, "PUT", {
    title: "Anh văn lớp 8",
    body: "Bản cũ",
  });
  await approve(id);
  const published = (await call(null, `/community/posts/${id}`)).data;
  assert.equal(published.author.label, "Public student - Học sinh");
  assert.equal(published.author.id, undefined);
  assert.equal(published.author_id, undefined);
  assert.ok(!JSON.stringify(published).includes("Private"));
  assert.ok(!JSON.stringify(published).includes("@private"));
  await call("student", `/community/posts/${id}`, "PUT", {
    title: "Tiêu đề mới",
    body: "Bản sửa riêng tư",
  });
  assert.equal(
    (await call(null, `/community/posts/${id}`)).data.body,
    "Bản cũ",
  );
  assert.equal(
    (await call(null, `/community/posts/${id}`)).data.revision_body,
    undefined,
  );
  assert.equal(
    (await call("admin", "/admin/community/queue")).data[0].owner.email,
    "student@private.test",
  );
  await call("admin", `/admin/community/posts/${id}/reject`, "POST", {
    note: "Sửa lại",
  });
  assert.equal(
    (await call(null, `/community/posts/${id}`)).data.body,
    "Bản cũ",
  );
  await call("student", `/community/posts/${id}`, "PUT", {
    title: "Tiêu đề mới",
    body: "Bản được duyệt",
  });
  await approve(id);
  const revised = (await call(null, `/community/posts/${id}`)).data;
  assert.equal(revised.body, "Bản được duyệt");
  assert.equal(revised.published_at, published.published_at);
  assert.equal(
    (await call("other", `/community/posts/${id}`, "DELETE")).status,
    403,
  );
  await call("admin", `/admin/community/posts/${id}/hide`, "POST", {
    note: "Vi phạm",
  });
  assert.equal((await call(null, `/community/posts/${id}`)).status, 404);
  assert.equal(
    (await call("student", `/community/posts/${id}`, "DELETE")).status,
    409,
  );
  await call("admin", `/admin/community/posts/${id}/restore`, "POST");
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.student);
  assert.equal((await call(null, `/community/posts/${id}`)).status, 404);
  run(db, "UPDATE users SET status='active' WHERE id=?", ids.student);
  assert.ok(
    (await call("student", "/community/notifications/unread-count")).data
      .count > 0,
  );
  await call("student", "/community/notifications/read", "POST", { all: true });
  assert.equal(
    (await call("student", "/community/notifications/unread-count")).data.count,
    0,
  );
  await call("student", `/community/posts/${id}`, "DELETE");
  assert.equal((await call(null, `/community/posts/${id}`)).status, 404);
});

test("comments, flattened replies, helpful, best answer, removal and suspension", async (t) => {
  const { call, create, approve, db, ids } = await fixture(t);
  const id = await create();
  assert.equal(
    (
      await call("parent", `/community/posts/${id}/comments`, "POST", {
        body: "Học đều nhé",
      })
    ).status,
    404,
  );
  await approve(id);
  const add = async (user, body, parent_id) => {
    const r = await call(user, `/community/posts/${id}/comments`, "POST", {
      body,
      parent_id,
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data;
  };
  const root = await add("parent", "Mình có kinh nghiệm này");
  assert.equal(root.author.label, "Public parent - Phụ huynh");
  const reply = await add("tutor", "Chia sẻ cách học", root.id);
  assert.equal(reply.author.label, "Private tutor Real Name - Gia sư");
  assert.equal(reply.author.tutor_id, ids.tutor);
  const third = await add("pending", "Cảm ơn", reply.id);
  assert.equal(third.parent_id, root.id);
  assert.equal(third.author.label, "Public pending - Học sinh");
  for (const who of ["parent", "admin", "pending"])
    assert.equal(
      (await call(who, `/community/comments/${root.id}/helpful`, "PUT"))
        .status,
      200,
    );
  await call("student", `/community/comments/${root.id}/helpful`, "PUT");
  await call("student", `/community/comments/${root.id}/helpful`, "PUT");
  assert.equal(
    (await call(null, `/community/posts/${id}/comments`)).data.items[0]
      .helpful_count,
    4,
  );
  assert.equal(
    (await call("pending", `/community/comments/${root.id}/helpful`, "DELETE"))
      .status,
    200,
  );
  await call("student", `/community/posts/${id}/solve`, "POST", {
    solved: true,
    best_comment_id: reply.id,
  });
  assert.equal(
    (await call(null, `/community/posts/${id}/comments`)).data.best.id,
    reply.id,
  );
  assert.equal(
    (
      await call("parent", `/community/posts/${id}/solve`, "POST", {
        solved: true,
      })
    ).status,
    403,
  );
  await call("parent", `/community/comments/${root.id}`, "PATCH", {
    body: "Kinh nghiệm đã sửa",
  });
  assert.equal(
    (await call(null, `/community/posts/${id}/comments`)).data.items[0].edited,
    true,
  );
  run(db, "UPDATE tutors SET status='approved' WHERE user_id=?", ids.pending);
  assert.equal(
    (await call(null, `/community/posts/${id}/comments`)).data.items[0]
      .replies[1].author.tier,
    "tutor",
  );
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.tutor);
  assert.equal(
    (await call(null, `/community/posts/${id}/comments`)).data.best,
    null,
  );
  run(db, "UPDATE users SET status='active' WHERE id=?", ids.tutor);
  await call("admin", `/admin/community/comments/${root.id}`, "DELETE", {
    note: "Không phù hợp",
  });
  const removed = (await call(null, `/community/posts/${id}/comments`)).data
    .items[0];
  assert.equal(removed.body, "");
  assert.equal(removed.author, null);
  assert.equal(removed.replies.length, 2);
  await call("tutor", `/community/comments/${reply.id}`, "DELETE");
  assert.equal(
    one(db, "SELECT best_comment_id FROM community_posts WHERE id=?", id)
      .best_comment_id,
    null,
  );
});

test("names, contact validation, quotas, reports, community lock and audit", async (t) => {
  const { call, create, approve, db, ids } = await fixture(t);
  run(db, "UPDATE users SET display_name='' WHERE id=?", ids.student);
  assert.equal(
    (
      await call("student", "/community/posts", "POST", {
        title: "Học toán",
        body: "Tìm gia sư",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("student", "/community/me/display-name", "PUT", {
        display_name: "Quản Trị",
      })
    ).status,
    400,
  );
  await call("student", "/community/me/display-name", "PUT", {
    display_name: "Minh",
  });
  await call("tutor", "/community/me/display-name", "PUT", {
    display_name: "Châu",
  });
  assert.equal(
    one(db, "SELECT status FROM tutors WHERE user_id=?", ids.tutor).status,
    "approved",
  );
  const blockedContact = await call("student", "/community/posts", "POST", {
    title: "Gọi 0912.345.678",
    body: "Tìm gia sư",
  });
  assert.equal(blockedContact.status, 400);
  assert.match(blockedContact.data.error, /Vui lòng không đăng số điện thoại/);
  const id = await create();
  await approve(id);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await call("parent", `/community/posts/${id}/comments`, "POST", {
          body: "Học toán mỗi ngày",
        })
      ).status,
      201,
    );
  assert.equal(
    (
      await call("parent", `/community/posts/${id}/comments`, "POST", {
        body: "Thêm bình luận",
      })
    ).status,
    429,
  );
  await create();
  await create();
  assert.equal(
    (
      await call("student", "/community/posts", "POST", {
        title: "Bài thứ tư",
        body: "Nội dung",
      })
    ).status,
    429,
  );
  const report = { target_type: "post", target_id: id, reason: "Khác" };
  assert.equal(
    (await call("parent", "/community/reports", "POST", report)).status,
    201,
  );
  assert.equal(
    (await call("parent", "/community/reports", "POST", report)).status,
    409,
  );
  const reports = (await call("admin", "/admin/community/reports")).data;
  assert.equal(reports[0].owner.id, ids.student);
  await call(
    "admin",
    `/admin/community/reports/${reports[0].id}/resolve`,
    "POST",
    { resolution: "Đã xem xét" },
  );
  assert.equal(
    (await call("admin", "/admin/community/reports")).data.length,
    0,
  );
  await call("admin", `/admin/community/users/${ids.parent}/lock`, "PATCH", {
    locked: true,
    reason: "Vi phạm lặp lại",
  });
  assert.equal(
    (
      await call("parent", `/community/posts/${id}/comments`, "POST", {
        body: "Học toán",
      })
    ).status,
    403,
  );
  assert.equal((await call("parent", `/community/posts/${id}`)).status, 200);
  assert.equal((await call("parent", "/auth/me")).status, 200);
  assert.ok(one(db, "SELECT id FROM audit WHERE action='community.user.lock'"));
});

test("search, subject and level filters, helpful sorting, paging, rules and repeat migrations", async (t) => {
  const { call, db, ids } = await fixture(t);
  run(
    db,
    "INSERT INTO posts(title,summary,body,author_id) VALUES ('Tin tức','Tóm tắt','Nội dung',?)",
    ids.admin,
  );
  migrateDatabase(db);
  migrateDatabase(db);
  assert.equal(
    one(db, "SELECT COUNT(*) n FROM community_posts WHERE kind='rules'").n,
    1,
  );
  assert.equal(one(db, "SELECT COUNT(*) n FROM posts").n, 1);
  for (let i = 0; i < 22; i++)
    await call("admin", "/admin/community/posts", "POST", {
      title: i === 0 ? "Anh văn lớp 8" : "Toán lớp 10",
      body: "Kinh nghiệm học",
    });
  const filtered = (
    await call(
      null,
      "/community/posts?q=anh%20van&subject=tieng-anh&level=THCS",
    )
  ).data;
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.rules.kind, "rules");
  assert.equal(
    (await call(null, "/community/posts?level=Ti%E1%BB%83u%20h%E1%BB%8Dc")).data
      .items.length,
    0,
  );
  assert.equal(
    (await call(null, "/community/posts?q=%25")).data.items.length,
    0,
  );
  assert.equal(
    (await call(null, "/community/posts?q=no-match")).data.rules.kind,
    "rules",
  );
  const page1 = (await call(null, "/community/posts")).data,
    page2 = (await call(null, "/community/posts?page=2")).data;
  assert.equal(page1.items.length, 20);
  assert.equal(page1.more, true);
  assert.equal(page2.rules, null);
  assert.equal(page2.items.length, 2);
  const id = filtered.items[0].id;
  const c = (
    await call("student", `/community/posts/${id}/comments`, "POST", {
      body: "Rất hay",
    })
  ).data;
  await call("parent", `/community/comments/${c.id}/helpful`, "PUT");
  assert.equal(
    (await call(null, "/community/posts?sort=helpful")).data.items[0].id,
    id,
  );
  assert.equal((await call(null, "/community/sitemap")).data.length, 23);
  const noAdmin = openDatabase(":memory:");
  migrateDatabase(noAdmin);
  noAdmin.close();
});

test("comment paging, pinned replies and all public surfaces preserve privacy", async (t) => {
  const { db, ids, call, create, approve } = await fixture(t);
  const id = await create();
  await approve(id);
  const roots = [];
  for (let i = 0; i < 22; i++)
    roots.push(
      Number(
        run(
          db,
          "INSERT INTO community_comments(post_id,author_id,body) VALUES (?,?,?)",
          id,
          ids.parent,
          `Bình luận ${i}`,
        ).lastInsertRowid,
      ),
    );
  const reply = Number(
    run(
      db,
      "INSERT INTO community_comments(post_id,parent_id,author_id,body) VALUES (?,?,?,?)",
      id,
      roots[21],
      ids.pending,
      "Câu trả lời hay nhất",
    ).lastInsertRowid,
  );
  assert.equal(
    (
      await call("student", `/community/posts/${id}/solve`, "POST", {
        solved: true,
        best_comment_id: reply,
      })
    ).status,
    200,
  );
  const first = (await call(null, `/community/posts/${id}/comments`)).data;
  assert.equal(first.items.length, 20);
  assert.equal(first.more, true);
  assert.equal(first.best.id, reply);
  const next = (
    await call(null, `/community/posts/${id}/comments?after=${first.next}`)
  ).data;
  assert.equal(next.items.length, 2);
  assert.equal(next.more, false);
  assert.equal(next.items[1].replies[0].id, reply);
  for (const path of [
    "/community/posts",
    `/community/posts/${id}`,
    `/community/posts/${id}/comments`,
    "/community/sitemap",
  ]) {
    const value = JSON.stringify((await call(null, path)).data);
    assert.ok(!value.includes("Private student"));
    assert.ok(!value.includes("Private parent"));
    assert.ok(!value.includes("Private pending"));
    assert.ok(!value.includes("@private.test"));
    assert.ok(!value.includes('"author_id"'));
  }
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.parent);
  const suspended = (await call(null, `/community/posts/${id}/comments`)).data;
  assert.equal(suspended.items.length, 1);
  assert.equal(suspended.items[0].removed, true);
  assert.equal(suspended.items[0].author, null);
  assert.equal(suspended.items[0].replies.length, 1);
  run(db, "UPDATE users SET status='active' WHERE id=?", ids.parent);
  assert.equal(
    (await call(null, `/community/posts/${id}/comments`)).data.items.length,
    20,
  );
  run(
    db,
    "UPDATE users SET community_locked=1,community_lock_reason='Vi phạm' WHERE id=?",
    ids.parent,
  );
  for (const [path, method, body] of [
    ["/community/posts", "POST", { title: "Bài", body: "Mới" }],
    [`/community/comments/${reply}/helpful`, "PUT", {}],
    [
      "/community/reports",
      "POST",
      { target_type: "post", target_id: id, reason: "Khác" },
    ],
  ])
    assert.equal((await call("parent", path, method, body)).status, 403);
  assert.equal(
    (await call("parent", `/community/posts/${id}/follow`, "DELETE")).status,
    200,
  );
  assert.equal(
    (await call("parent", `/community/posts/${id}/follow`, "PUT")).status,
    200,
  );
  await call("admin", `/admin/community/posts/${id}/hide`, "POST", {
    note: "Ẩn bài",
  });
  for (const path of ["/community/posts", "/community/sitemap"]) {
    const value = JSON.stringify((await call(null, path)).data);
    assert.ok(!value.includes("Tìm gia sư Anh văn lớp 8"));
  }
});

test("stale moderation cannot publish or reject unseen submissions or revisions", async (t) => {
  const { call, create, approve } = await fixture(t);
  const id = await create();
  const before = (await call("admin", "/admin/community/queue")).data.find(
    (p) => p.id === id,
  );
  await call("student", `/community/posts/${id}`, "PUT", {
    title: "Nội dung đã đổi",
    body: "Bản mới chưa được đọc",
  });
  for (const action of ["approve", "reject"]) {
    const stale = await call(
      "admin",
      `/admin/community/posts/${id}/${action}`,
      "POST",
      { expected_version: before.review_version, note: "Nhận xét bản cũ" },
    );
    assert.equal(stale.status, 409);
    assert.match(stale.data.error, /Bài đã thay đổi/);
  }
  assert.equal((await call(null, `/community/posts/${id}`)).status, 404);
  await approve(id);
  await call("student", `/community/posts/${id}`, "PUT", {
    title: "Bản sửa A",
    body: "Nội dung A",
  });
  const queued = (await call("admin", "/admin/community/queue")).data.find(
    (p) => p.id === id,
  );
  await call("student", `/community/posts/${id}`, "PUT", {
    title: "Bản sửa B",
    body: "Nội dung B",
  });
  assert.equal(
    (
      await call("admin", `/admin/community/posts/${id}/approve`, "POST", {
        expected_version: queued.review_version,
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(null, `/community/posts/${id}`)).data.body,
    "Bản mới chưa được đọc",
  );
  await approve(id);
  assert.equal(
    (await call(null, `/community/posts/${id}`)).data.body,
    "Nội dung B",
  );
});

test("role workspace identity and admin summary stay private and reflect moderation", async (t) => {
  const { db, ids, call, create, approve } = await fixture(t);
  assert.equal((await call(null, "/community/me")).status, 401);
  for (const role of ["student", "parent", "pending", "tutor", "admin"]) {
    run(db, "UPDATE users SET display_name='' WHERE id=?", ids[role]);
    const identity = await call(role, "/community/me");
    assert.equal(identity.status, 200);
    assert.equal(
      identity.data.needs_name,
      ["student", "parent", "pending"].includes(role),
    );
    assert.equal(
      identity.data.author.tier,
      role === "pending" ? "student" : role,
    );
    assert.equal(
      JSON.stringify(identity.data).includes("Private"),
      ["tutor", "admin"].includes(role),
    );
    assert.equal(
      JSON.stringify(identity.data).includes("@private.test"),
      false,
    );
    if (role !== "admin")
      assert.equal((await call(role, "/admin/community/summary")).status, 403);
  }
  assert.equal((await call(null, "/admin/community/summary")).status, 401);
  assert.deepEqual((await call("admin", "/admin/community/summary")).data, {
    pending: 0,
    approved: 0,
    hidden: 0,
    reports: 0,
  });
  run(db, "UPDATE users SET display_name='Minh' WHERE id=?", ids.student);
  const first = await create();
  const unnamed = await call("parent", "/community/posts", "POST", {
    title: "Học Toán",
    body: "Cần cách học hiệu quả.",
  });
  assert.equal(unnamed.status, 409);
  assert.equal(
    (await call("admin", "/admin/community/summary")).data.pending,
    1,
  );
  await approve(first);
  await call("student", `/community/posts/${first}`, "PUT", {
    title: "Bản sửa Toán lớp 8",
    body: "Mình muốn luyện thêm bài tập.",
  });
  await call("other", "/community/reports", "POST", {
    target_type: "post",
    target_id: first,
    reason: "Khác",
    detail: "Cần xem lại nội dung",
  });
  assert.deepEqual((await call("admin", "/admin/community/summary")).data, {
    pending: 1,
    approved: 1,
    hidden: 0,
    reports: 1,
  });
  await call("admin", `/admin/community/posts/${first}/hide`, "POST", {
    note: "Cần kiểm tra",
  });
  assert.deepEqual((await call("admin", "/admin/community/summary")).data, {
    pending: 0,
    approved: 0,
    hidden: 1,
    reports: 1,
  });
});

test("rich posts sanitize HTML and keep uploaded images behind approval and revision boundaries", async (t) => {
  const { db, ids, call, approve, imageRequest } = await fixture(t);
  const bytes = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#852f36" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await imageRequest(null, "/api/community/images", bytes)).status,
    401,
  );
  assert.equal(
    (
      await imageRequest(
        "student",
        "/api/community/images",
        Buffer.from('<svg onload="alert(1)"/>'),
        "image/svg+xml",
      )
    ).status,
    400,
  );
  const upload = async (user = "student") => {
    const r = await imageRequest(user, "/api/community/images", bytes);
    assert.equal(r.status, 201, await r.clone().text());
    return (await r.json()).url;
  };
  const first = await upload(),
    second = await upload();
  assert.equal((await imageRequest(null, first)).status, 404);
  assert.equal((await imageRequest("other", first)).status, 404);
  assert.equal((await imageRequest("admin", first)).status, 404);
  const ownImage = await imageRequest("student", first);
  assert.equal(ownImage.headers.get("content-type"), "image/webp");
  assert.equal(ownImage.headers.get("cache-control"), "no-store");
  const unsafe = `<h2 onclick="alert(1)">Bài học</h2><p><strong>Toán</strong> &amp; Văn <a href="https://example.org/bai-hoc">Tài liệu</a><a href="javascript:alert(1)">x</a></p><script>alert(1)</script><iframe src="https://example.org"></iframe><img src="${first}" onerror="alert(1)" alt="Hình học"><img src="https://tracker.test/x.png">`;
  const submitted = await call("student", "/community/posts", "POST", {
    title: "Tài liệu học tập",
    body_html: unsafe,
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.data));
  const post = submitted.data.id;
  assert.match(submitted.data.body_html, /<strong>Toán<\/strong>/);
  assert.match(submitted.data.body_html, /noopener noreferrer nofollow ugc/);
  assert.doesNotMatch(
    submitted.data.body_html,
    /script|iframe|onclick|onerror|javascript:|tracker/,
  );
  assert.match(submitted.data.body, /Toán & Văn/);
  assert.equal((await call(null, `/community/posts/${post}`)).status, 404);
  const stolen = await call("other", "/community/posts", "POST", {
    title: "Ảnh của người khác",
    body_html: `<p>Bài học</p><img src="${first}">`,
  });
  assert.equal(stolen.status, 400);
  assert.equal(
    one(
      db,
      "SELECT COUNT(*) n FROM community_posts WHERE author_id=?",
      ids.other,
    ).n,
    0,
  );
  await approve(post);
  assert.equal((await imageRequest(null, first)).status, 200);
  assert.match(
    (await call(null, `/community/posts/${post}`)).data.body_html,
    /Hình học/,
  );
  const revision = await call("student", `/community/posts/${post}`, "PUT", {
    title: "Tài liệu học tập",
    body_html: `<p><em>Bản mới</em></p><img src="${second}" alt="Sơ đồ mới">`,
  });
  assert.equal(revision.status, 200);
  assert.equal((await imageRequest(null, second)).status, 404);
  assert.equal((await imageRequest(null, first)).status, 200);
  const publicPost = (await call(null, `/community/posts/${post}`)).data;
  assert.equal(publicPost.revision_body_html, undefined);
  assert.doesNotMatch(publicPost.body_html, /Sơ đồ mới/);
  const queue = (await call("admin", "/admin/community/queue")).data.find(
    (p) => p.id === post,
  );
  assert.match(queue.revision_body_html, /Sơ đồ mới/);
  await approve(post);
  assert.equal((await imageRequest(null, second)).status, 200);
  assert.equal((await imageRequest(null, first)).status, 404);
  await call("admin", `/admin/community/posts/${post}/hide`, "POST", {
    note: "Kiểm tra",
  });
  assert.equal((await imageRequest(null, second)).status, 404);
  await call("admin", `/admin/community/posts/${post}/restore`, "POST");
  assert.equal((await imageRequest(null, second)).status, 200);
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.student);
  assert.equal((await imageRequest(null, second)).status, 404);
  run(
    db,
    "UPDATE users SET status='active',community_locked=1 WHERE id=?",
    ids.student,
  );
  assert.equal(
    (await imageRequest("student", "/api/community/images", bytes)).status,
    403,
  );
  run(db, "UPDATE users SET community_locked=0 WHERE id=?", ids.student);
  await call("student", `/community/posts/${post}`, "DELETE");
  assert.equal((await imageRequest(null, second)).status, 404);
});

test("rich content limits, links, image quota and legacy edits", async (t) => {
  const { db, ids, call, create, approve, imageRequest } = await fixture(t);
  for (const body_html of [
    "<script>alert(1)</script>",
    "<p>" + "a".repeat(5001) + "</p>",
    '<img src="data:image/png;base64,abc">',
    "<p>abc@example.org</p>",
  ])
    assert.equal(
      (
        await call("student", "/community/posts", "POST", {
          title: "Học tập",
          body_html,
        })
      ).status,
      400,
    );
  const linked = await call("student", "/community/posts", "POST", {
    title: "Học tập",
    body: "Đọc https://example.org/hoc",
  });
  assert.equal(linked.status, 201);
  assert.equal(linked.data.body_html, "");
  const post = await create();
  await approve(post);
  const edit = await call("student", `/community/posts/${post}`, "PUT", {
    title: "Học tập",
    body_html: "<p><u>Kiến thức</u></p>",
  });
  assert.equal(edit.status, 200);
  await call("student", `/community/posts/${post}/revision`, "DELETE");
  assert.equal(
    (await call("student", `/community/posts/${post}`)).data.revision_body_html,
    "",
  );
  const paths = [];
  for (let i = 0; i < 20; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    run(
      db,
      "INSERT INTO community_images(id,author_id) VALUES (?,?)",
      id,
      ids.student,
    );
    paths.push(`/api/community/images/${id}`);
  }
  assert.equal(
    (
      await call("student", `/community/posts/${post}`, "PUT", {
        title: "Học tập",
        body_html: paths
          .slice(0, 6)
          .map((src) => `<img src="${src}">`)
          .join(""),
      })
    ).status,
    400,
  );
  const bytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await imageRequest("student", "/api/community/images", bytes)).status,
    429,
  );
});

test("private drafts allow incomplete content, enforce ownership and versions, and publish once", async (t) => {
  const { call, db, ids } = await fixture(t);
  const create = await call("student", "/community/drafts", "POST", {
    body_html:
      "<p><strong>Ý tưởng học tập</strong></p><script>alert(1)</script>",
  });
  assert.equal(create.status, 201);
  const draft = create.data;
  assert.equal(draft.title, "");
  assert.equal(draft.body_html, "<p><strong>Ý tưởng học tập</strong></p>");
  for (const role of [null, "other", "admin"]) {
    assert.equal(
      (await call(role, `/community/drafts/${draft.id}`)).status,
      role ? 404 : 401,
    );
    if (role) {
      assert.equal(
        (
          await call(role, `/community/drafts/${draft.id}`, "PUT", {
            version: 1,
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await call(role, `/community/drafts/${draft.id}`, "DELETE", {
            version: 1,
          })
        ).status,
        404,
      );
      assert.equal(
        (await call(role, "/community/drafts")).data.items.length,
        0,
      );
    }
  }
  assert.equal((await call("student", "/community/mine")).data.items.length, 0);
  assert.equal((await call("admin", "/admin/community/queue")).data.length, 0);
  assert.equal(
    (await call(null, "/community/sitemap")).data.some(
      (p) => p.title === draft.title,
    ),
    false,
  );
  const changed = await call(
    "student",
    `/community/drafts/${draft.id}`,
    "PUT",
    { title: "Học tập mỗi ngày", body_html: draft.body_html, version: 1 },
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.data.version, 2);
  assert.equal(
    (
      await call("student", `/community/drafts/${draft.id}`, "PUT", {
        version: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("student", `/community/drafts/${draft.id}`, "DELETE", {
        version: 1,
      })
    ).status,
    409,
  );
  const publish = {
    title: changed.data.title,
    body_html: changed.data.body_html,
    draft_id: draft.id,
    draft_version: 2,
  };
  assert.equal(
    (
      await call("student", "/community/posts", "POST", {
        ...publish,
        title: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("student", `/community/drafts/${draft.id}`)).status,
    200,
  );
  assert.equal(
    (
      await call("student", "/community/posts", "POST", {
        ...publish,
        draft_version: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (await call("other", "/community/posts", "POST", publish)).status,
    404,
  );
  const posted = await call("student", "/community/posts", "POST", publish);
  assert.equal(posted.status, 201);
  assert.equal(posted.data.status, "pending");
  assert.equal(
    (await call("student", `/community/drafts/${draft.id}`)).status,
    404,
  );
  assert.equal(
    (await call("student", "/community/posts", "POST", publish)).status,
    404,
  );
  assert.equal(
    one(
      db,
      "SELECT COUNT(*) n FROM community_posts WHERE author_id=?",
      ids.student,
    ).n,
    1,
  );
  for (const role of ["parent", "tutor", "pending", "admin"]) {
    const d = await call(role, "/community/drafts", "POST", {
      title: `Chia sẻ ${role}`,
      body_html: "<p>Chia sẻ kiến thức.</p>",
    });
    assert.equal(d.status, 201);
    const p = await call(role, "/community/posts", "POST", {
      ...d.data,
      draft_id: d.data.id,
      draft_version: d.data.version,
    });
    assert.equal(p.status, 201);
    assert.equal(p.data.status, role === "admin" ? "approved" : "pending");
  }
  const removable = await call("student", "/community/drafts", "POST", {});
  run(db, "UPDATE users SET community_locked=1 WHERE id=?", ids.student);
  assert.equal(
    (await call("student", "/community/drafts", "POST", {})).status,
    403,
  );
  assert.equal(
    (
      await call(
        "student",
        `/community/drafts/${removable.data.id}`,
        "DELETE",
        { version: 1 },
      )
    ).status,
    200,
  );
});

test("draft images stay private and survive upload cleanup until publication", async (t) => {
  const { call, db, imageRequest } = await fixture(t);
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const upload = await imageRequest("student", "/api/community/images", png);
  const { url } = await upload.json();
  const imageId = url.split("/").at(-1);
  const html = `<p>Học hình học</p><img src="${url}" alt="Hình học">`;
  const draft = (
    await call("student", "/community/drafts", "POST", {
      title: "Học hình học",
      body_html: html,
    })
  ).data;
  assert.equal(
    (await call("other", "/community/drafts", "POST", { body_html: html }))
      .status,
    400,
  );
  for (const who of [null, "other", "admin"])
    assert.equal((await imageRequest(who, url)).status, 404);
  run(
    db,
    "UPDATE community_images SET created_at=datetime('now','-2 days') WHERE id=?",
    imageId,
  );
  assert.equal(
    (await imageRequest("student", "/api/community/images", png)).status,
    201,
  );
  assert.equal((await imageRequest("student", url)).status, 200);
  const posted = await call("student", "/community/posts", "POST", {
    ...draft,
    draft_id: draft.id,
    draft_version: 1,
  });
  assert.equal(posted.status, 201);
  assert.equal((await imageRequest("admin", url)).status, 200);
  assert.equal((await imageRequest(null, url)).status, 404);
  await call(
    "admin",
    `/admin/community/posts/${posted.data.id}/approve`,
    "POST",
  );
  assert.equal((await imageRequest(null, url)).status, 200);
});


test("member codes are random, unique, stable across migrations and public without private IDs", async (t) => {
  const { db, call, create, approve } = await fixture(t);
  const before = db.prepare("SELECT id,profile_code FROM users ORDER BY id").all();
  assert.equal(new Set(before.map(u => u.profile_code)).size, before.length);
  for (const u of before) assert.match(u.profile_code, /^[a-z2-9]{8}$/);
  migrateDatabase(db);
  assert.deepEqual(db.prepare("SELECT id,profile_code FROM users ORDER BY id").all(), before);
  const id = await create(); await approve(id);
  const post = (await call(null, `/community/posts/${id}`)).data;
  assert.equal(post.author.profile_code, before[0].profile_code);
  assert.equal(post.author.has_avatar, false);
  assert.equal(post.author.id, undefined);
});


test("member images are private, independent, bounded and atomically replaced", async t => {
  const { db, ids, call, imageRequest } = await fixture(t);
  const code = one(db, "SELECT profile_code FROM users WHERE id=?", ids.tutor).profile_code;
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#880033" } }).png().toBuffer();
  const put = (kind, data = png, mime = "image/png", who = "tutor") => imageRequest(who, `/api/community/me/${kind}`, data, mime, "PUT");
  assert.equal((await put("avatar", png, "image/png", null)).status, 401);
  assert.equal((await put("avatar", Buffer.from("bad"))).status, 400);
  assert.equal((await put("avatar", png, "image/svg+xml")).status, 400);
  assert.equal((await put("avatar", Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
  const large = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
  assert.equal((await put("avatar", large)).status, 400);
  for (const kind of ["avatar", "cover"]) {
    assert.equal((await put(kind)).status, 200);
    const url = `/api/community/members/${code}/${kind}`;
    assert.equal((await imageRequest(null, url)).status, 401);
    const response = await imageRequest("student", url);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(meta.format, "webp"); assert.equal(meta.width, kind === "avatar" ? 640 : 1280);
    assert.equal(meta.height, kind === "avatar" ? 640 : 320);
  }
  const old = one(db, "SELECT id FROM user_images WHERE user_id=? AND kind='avatar'", ids.tutor).id;
  assert.equal((await put("avatar")).status, 200);
  assert.equal(one(db, "SELECT COUNT(*) n FROM user_image_chunks WHERE image_id=?", old).n, 0);
  for (let i=0; i<3; i++) assert.equal((await put("avatar")).status, 200);
  assert.equal((await put("avatar")).status, 429);
  assert.equal(one(db, "SELECT status FROM tutors WHERE user_id=?", ids.tutor).status, "approved");
  const author = (await call("student", "/community/me")).data.author;
  assert.equal(author.has_avatar, false);
  run(db, "UPDATE users SET community_locked=1 WHERE id=?", ids.tutor);
  assert.equal((await put("cover")).status, 403);
  assert.equal((await call("tutor", "/community/me/avatar", "DELETE")).status, 403);
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.tutor);
  assert.equal((await imageRequest("student", `/api/community/members/${code}/avatar`)).status, 404);
  assert.equal((await imageRequest("admin", `/api/community/members/${code}/avatar`)).status, 200);
  run(db, "UPDATE users SET status='active',community_locked=0 WHERE id=?", ids.tutor);
  assert.equal((await call("tutor", "/community/me/avatar", "DELETE")).status, 200);
  assert.equal(one(db, "SELECT COUNT(*) n FROM user_image_chunks c LEFT JOIN user_images i ON i.id=c.image_id WHERE i.id IS NULL").n, 0);
});


test("member profiles preserve privacy, live tiers, edit quotas and onboarding requirements", async t => {
  const { db, ids, call, create, approve } = await fixture(t);
  const codes = Object.fromEntries(Object.entries(ids).map(([key,id]) => [key, one(db, "SELECT profile_code FROM users WHERE id=?", id).profile_code]));
  for (const who of ["student", "parent", "pending", "tutor", "admin"]) {
    const path = `/community/members/${codes[who]}`;
    assert.equal((await call(null, path)).status, 401);
    const r = await call("other", path); assert.equal(r.status, 200);
    const p = r.data.profile;
    assert.equal(p.code, codes[who]); assert.equal(p.mine, false); assert.equal(r.data.admin, undefined);
    const identity = (await call(who, "/community/me")).data.author;
    assert.equal(p.label, identity.label);
    if (["student", "parent", "pending"].includes(who)) {
      assert.equal(p.id, undefined); assert.equal(p.email, undefined); assert.equal(p.tutor_id, undefined);
      assert.ok(!JSON.stringify(r.data).includes(`Private ${who}`));
    }
    assert.equal((await call("admin", path)).data.admin.email, `${who}@private.test`);
  }
  const post = await create("pending"); await approve(post);
  for (const status of ["approved", "rejected"]) {
    run(db, "UPDATE tutors SET status=? WHERE user_id=?", status, ids.pending);
    const p = (await call("student", `/community/members/${codes.pending}`)).data.profile;
    const author = (await call(null, `/community/posts/${post}`)).data.author;
    assert.equal(p.label, author.label); assert.equal(p.tier, status === "approved" ? "tutor" : "student");
  }
  for (const bio of ["https://example.com", "0912 345 678", "a@b.vn", "x".repeat(301), "1\n2\n3\n4\n5\n6"])
    assert.equal((await call("tutor", "/community/me/profile", "PUT", { bio })).status, 400);
  for (const display_name of ["a", "Quản trị", "ADMIN", "minh.vn"])
    assert.equal((await call("tutor", "/community/me/profile", "PUT", { display_name })).status, 400);
  for (let i=0;i<3;i++) assert.equal((await call("tutor", i%2 ? "/community/me/display-name" : "/community/me/profile", "PUT", { display_name: `Tên mới ${i}` })).status, 200);
  assert.equal((await call("tutor", "/community/me/display-name", "PUT", { display_name: "Tên cuối" })).status, 429);
  assert.equal((await call("tutor", "/community/me/profile", "PUT", { display_name: "Tên mới 2" })).status, 200);
  for (let i=0;i<10;i++) assert.equal((await call("tutor", "/community/me/profile", "PUT", { bio: `Mình thích học toán ${i}` })).status, 200);
  assert.equal((await call("tutor", "/community/me/profile", "PUT", { bio: "Đổi tiếp" })).status, 429);
  assert.equal(one(db, "SELECT status FROM tutors WHERE user_id=?", ids.tutor).status, "approved");
  run(db, "UPDATE users SET community_locked=1 WHERE id=?", ids.parent);
  assert.equal((await call("parent", "/community/me/profile", "PUT", { bio: "Toán" })).status, 403);
  assert.equal((await call("other", `/community/members/${codes.parent}`)).status, 200);
  assert.equal((await call("other", `/community/members/${codes.parent}`)).data.profile.community_lock_reason, undefined);
  for (const who of ["student", "pending"]) {
    run(db, "UPDATE users SET onboarding_step=1 WHERE id=?", ids[who]);
    assert.equal((await call(who, "/account/onboarding", "PUT", { step:1, name:"Tên" })).status, 400);
    assert.equal(one(db, "SELECT onboarding_step FROM users WHERE id=?", ids[who]).onboarding_step, 1);
  }
  run(db, "UPDATE users SET status='suspended' WHERE id=?", ids.parent);
  assert.equal((await call("other", `/community/members/${codes.parent}`)).status, 404);
  assert.equal((await call("other", `/community/members/${codes.parent}/posts`)).status, 404);
  assert.equal((await call("admin", `/community/members/${codes.parent}`)).status, 200);
});

test("member posts and statistics include only published activity with stable sorting and pagination", async t => {
  const { db, ids, call } = await fixture(t);
  const code = one(db, "SELECT profile_code FROM users WHERE id=?", ids.student).profile_code;
  const path = `/community/members/${code}`;
  const posts = [];
  for (let i=0;i<12;i++) posts.push(Number(run(db, "INSERT INTO community_posts(author_id,title,body,status,published_at) VALUES (?,'Toán','Nội dung','approved',?)", ids.student, `2026-10-${String(i+1).padStart(2,'0')} 00:00:00`).lastInsertRowid));
  for (const status of ["pending","hidden","deleted","rejected"])
    run(db, "INSERT INTO community_posts(author_id,title,body,status) VALUES (?,'Riêng tư','Nội dung',?)", ids.student, status);
  const comment = Number(run(db,"INSERT INTO community_comments(author_id,post_id,body) VALUES (?,?,'Bình luận')", ids.student,posts[0]).lastInsertRowid);
  run(db, "INSERT INTO community_helpful VALUES (?,?)", comment, ids.other);
  run(db,"INSERT INTO community_comments(author_id,post_id,body,status) VALUES (?,?,'Đã gỡ','removed_by_admin')", ids.student, posts[0]);
  run(db,"INSERT INTO community_comments(author_id,post_id,body) SELECT ?,id,'Ẩn' FROM community_posts WHERE status='hidden'", ids.student);
  run(db, "UPDATE community_posts SET revision_body='Riêng tư' WHERE id=?", posts[0]);
  const stats = (await call("other",path)).data.profile.stats;
  assert.deepEqual(stats,{ posts:12, comments:1, helpful:1 });
  const first = (await call("student",path+"/posts?sort=new")).data;
  assert.equal(first.items.length,10); assert.equal(first.more,true); assert.equal(first.items[0].id,posts[11]);
  const second = (await call("other",path+"/posts?page=2")).data;
  assert.equal(second.items.length,2); assert.equal(second.more,false);
  const helpful = (await call("student",path+"/posts?sort=helpful")).data;
  assert.equal(helpful.items[0].id,posts[0]); assert.equal(helpful.items[1].id,posts[11]);
  assert.equal(helpful.items[0].revision_body,undefined);
  const adminCode=one(db,"SELECT profile_code FROM users WHERE id=?",ids.admin).profile_code;
  await call("admin","/community/posts","POST",{title:"Thông báo",body:"Nội dung"});
  const adminPosts=(await call("other",`/community/members/${adminCode}/posts`)).data.items;
  assert.equal(adminPosts.length,1);assert.equal(adminPosts[0].kind,"announcement");
});

import assert from "node:assert/strict";
import { openDatabase } from "../server/local-db.js";
import { migrateDatabase, one, run, tokenHash } from "../server/db.js";
import { createApi } from "../server/api.js";
import { processPhoto } from "../server/photo.js";
import { seedCatalog } from "../server/seed-catalog.js";

export async function fixture(t) {
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
  const imageRequest = (
    user,
    path,
    data,
    mime = "image/png",
    method = data ? "POST" : "GET",
  ) =>
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

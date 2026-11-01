import { processPhoto } from "../server/photo.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";
import {  one, run } from "../server/db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { createApi } from "../server/api.js";

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-api-")),
    file = join(dir, "db.sqlite"),
    db = openDatabase(file);
  seedCatalog(db);
  await seedDemo(db, "TestStudy2026!");
  const server = createApi(db, { processPhoto, limit: false }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  function client() {
    let cookie = "";
    return {
      get cookie() {
        return cookie;
      },
      async request(path, method = "GET", body, headers = {}) {
        const response = await fetch(base + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            ...headers,
          },
          body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
        });
        const c = response.headers.get("set-cookie");
        if (c) cookie = c.split(";")[0];
        return {
          status: response.status,
          data: await response.json(),
          headers: response.headers,
        };
      },
      async login(slug) {
        const r = await this.request("/auth/login", "POST", {
          email: `${slug}@demo.giasu.test`,
          password: "TestStudy2026!",
        });
        assert.equal(r.status, 200);
        return r.data.user;
      },
    };
  }
  return { db, file, client, base };
}
test("registration, sessions, authorization and password revocation", async (t) => {
  const { client, db, base } = await fixture(t),
    guest = client(),
    student = client(),
    other = client();
  assert.equal((await guest.request("/bookings")).status, 401);
  assert.equal(
    (
      await guest.request("/auth/register", "POST", {
        name: "Tự tạo admin",
        email: "bad@test.vn",
        password: "TestStudy2026!",
        role: "admin",
      })
    ).status,
    400,
  );
  const registered = await student.request("/auth/register", "POST", {
    name: "Học sinh kiểm thử",
    email: "new@test.vn",
    password: "TestStudy2026!",
    role: "student",
  });
  assert.equal(registered.status, 201);
  assert.match(registered.headers.get("set-cookie"), /HttpOnly/);
  assert.match(registered.headers.get("set-cookie"), /SameSite=Lax/);
  assert.equal(registered.data.user.password, undefined);
  assert.equal((await student.request("/admin")).status, 403);
  assert.equal((await student.request("/tutor/profile")).status, 403);
  assert.equal(
    (
      await guest.request("/auth/login", "POST", {
        email: "new@test.vn",
        password: "WrongPassword2026!",
      })
    ).status,
    401,
  );
  await other.request("/auth/login", "POST", {
    email: "new@test.vn",
    password: "TestStudy2026!",
  });
  assert.equal(
    (
      await student.request(
        "/account",
        "PATCH",
        { name: "X", goal: "Mục tiêu" },
        { Origin: "https://attacker.test" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await student.request("/account/password", "POST", {
        current: "TestStudy2026!",
        password: "NewPassword2026!",
      })
    ).status,
    200,
  );
  assert.equal((await other.request("/bookings")).status, 401);
  assert.equal(
    (await student.request("/auth/me")).data.user.name,
    "Học sinh kiểm thử",
  );
  const stored = one(
    db,
    "SELECT password FROM users WHERE email=?",
    "new@test.vn",
  ).password;
  assert.notEqual(stored, "NewPassword2026!");
  await student.request("/auth/logout", "POST");
  assert.equal((await student.request("/auth/me")).data.user, null);
  const malformed = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
});
test("catalogue is seeded idempotently; tutor moderation and private fields", async (t) => {
  const { client, db } = await fixture(t),
    admin = client(),
    newTutor = client(),
    guest = client();
  await admin.login("admin");
  assert.equal((await guest.request("/subjects")).data.length, 25);
  assert.equal((await guest.request("/resources")).data.length, 8);
  seedCatalog(db);
  assert.equal(one(db, "SELECT count(*) n FROM resources").n, 8);
  const reg = await newTutor.request("/auth/register", "POST", {
    name: "Gia sư mới",
    email: "tutor@test.vn",
    password: "TestStudy2026!",
    role: "tutor",
  });
  const id = reg.data.user.id;
  assert.equal((await guest.request(`/tutors/${id}`)).status, 404);
  assert.equal(
    (
      await admin.request(`/admin/tutors/${id}`, "PATCH", {
        status: "approved",
        note: "",
      })
    ).status,
    400,
  );
  const profile = {
    headline: "Gia sư Toán",
    bio: "Học từ kiến thức cơ bản",
    location: "Hà Nội",
    mode: "online",
    rate: 190000,
    experience: 2,
    education: "Sư phạm",
    subjects: ["toan"],
    levels: ["THCS"],
    goals: ["Tuyển sinh lớp 10"],
  };
  assert.equal(
    (
      await newTutor.request("/tutor/profile", "PUT", {
        ...profile,
        levels: ["Unknown"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await newTutor.request("/tutor/profile", "PUT", {
        ...profile,
        goals: ["Unknown"],
      })
    ).status,
    400,
  );
  assert.equal(
    (await newTutor.request("/tutor/profile", "PUT", profile)).status,
    200,
  );
  assert.equal(
    (
      await admin.request(`/admin/tutors/${id}`, "PATCH", {
        status: "approved",
        note: "Ghi chú nội bộ",
      })
    ).status,
    200,
  );
  const publicProfile = (await guest.request(`/tutors/${id}`)).data;
  assert.equal(publicProfile.name, "Gia sư mới");
  assert.deepEqual(publicProfile.levels, ["THCS"]);
  assert.deepEqual(publicProfile.goals, ["Tuyển sinh lớp 10"]);
  for (const field of ["email", "password", "moderation_note"])
    assert.equal(publicProfile[field], undefined);
  await newTutor.request("/tutor/profile", "PUT", { ...profile, rate: 200000 });
  assert.equal((await guest.request(`/tutors/${id}`)).status, 404);
  const oldCookie = newTutor.cookie;
  await admin.request(`/admin/users/${id}`, "PATCH", { status: "suspended" });
  assert.equal((await newTutor.request("/tutor/profile")).status, 401);
  await admin.request(`/admin/users/${id}`, "PATCH", { status: "active" });
  assert.equal((await newTutor.request("/tutor/profile")).status, 401);
});
test("booking conflict, ownership, messages, completion and review lifecycle", async (t) => {
  const { client, db, file } = await fixture(t),
    student = client(),
    tutor = client(),
    outsider = client(),
    admin = client();
  const s = await student.login("student"),
    u = await tutor.login("chau");
  await admin.login("admin");
  await outsider.request("/auth/register", "POST", {
    name: "Học sinh khác",
    email: "other@test.vn",
    password: "TestStudy2026!",
    role: "student",
  });
  const profile = (await student.request(`/tutors/${u.id}`)).data,
    slot = profile.slots[0],
    body = {
      slot_id: slot.id,
      subject_id: "toan",
      mode: "online",
      note: "Ôn phương trình",
    };
  assert.equal(
    (
      await student.request("/bookings", "POST", {
        ...body,
        subject_id: "ngu-van",
      })
    ).status,
    400,
  );
  const concurrent = await Promise.all([
    student.request("/bookings", "POST", body),
    outsider.request("/bookings", "POST", body),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  // Use the winning client for the remaining ownership assertions.
  const owner = concurrent[0].status === 201 ? student : outsider,
    stranger = owner === student ? outsider : student,
    id = concurrent.find((r) => r.status === 201).data.id;
  assert.equal(
    (await stranger.request(`/bookings/${id}/messages`)).status,
    403,
  );
  assert.equal(
    (
      await stranger.request(`/bookings/${id}/messages`, "POST", {
        body: "Không được phép",
      })
    ).status,
    403,
  );
  assert.equal(
    (await owner.request(`/bookings/${id}`, "PATCH", { status: "accepted" }))
      .status,
    409,
  );
  assert.equal(
    (
      await owner.request(`/bookings/${id}/review`, "POST", {
        rating: 5,
        body: "Tốt",
      })
    ).status,
    403,
  );
  assert.equal(
    (await tutor.request(`/bookings/${id}`, "PATCH", { status: "accepted" }))
      .status,
    200,
  );
  assert.equal(
    (await tutor.request(`/bookings/${id}`, "PATCH", { status: "completed" }))
      .status,
    409,
  );
  await owner.request(`/bookings/${id}/messages`, "POST", {
    body: "Em muốn ôn Toán.",
  });
  await tutor.request(`/bookings/${id}/messages`, "POST", {
    body: "Mình sẽ bắt đầu từ kiến thức cơ bản.",
  });
  assert.equal(
    (await owner.request(`/bookings/${id}/messages`)).data.length,
    2,
  );
  assert.equal(
    (
      await tutor.request(`/bookings/${id}/lesson`, "PATCH", {
        lesson_note: "Trao đổi mục tiêu",
        meeting_url: "javascript:alert(1)",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await tutor.request(`/bookings/${id}/lesson`, "PATCH", {
        lesson_note: "Trao đổi mục tiêu",
        meeting_url: "https://meet.google.com/example",
      })
    ).status,
    200,
  );
  run(db, "UPDATE tutors SET rate=250000 WHERE user_id=?", u.id);
  assert.equal(
    (await owner.request("/bookings")).data.find((b) => b.id === id).rate,
    180000,
  );
  const reopened = openDatabase(file);
  assert.equal(
    one(reopened, "SELECT count(*) n FROM messages WHERE booking_id=?", id).n,
    2,
  );
  reopened.close();
  // Advance this fixture's lesson into the past to exercise completion without clock waits.
  run(
    db,
    "UPDATE bookings SET starts_at=? WHERE id=?",
    new Date(Date.now() - 7200000).toISOString(),
    id,
  );
  assert.equal(
    (await tutor.request(`/bookings/${id}`, "PATCH", { status: "completed" }))
      .status,
    200,
  );
  assert.equal(
    (
      await owner.request(`/bookings/${id}/review`, "POST", {
        rating: 5,
        body: "Giải thích rõ ràng.",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await owner.request(`/bookings/${id}/review`, "POST", {
        rating: 5,
        body: "Lần hai",
      })
    ).status,
    409,
  );
  assert.equal((await owner.request(`/tutors/${u.id}`)).data.rating, 5);
  const slot2 = profile.slots[1];
  const second = await owner.request("/bookings", "POST", {
    ...body,
    slot_id: slot2.id,
  });
  assert.equal(second.status, 201);
  assert.equal(
    (
      await owner.request(`/bookings/${second.data.id}`, "PATCH", {
        status: "cancelled",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await stranger.request("/bookings", "POST", {
        ...body,
        slot_id: slot2.id,
      })
    ).status,
    201,
  );
});
test("student cross-tutor collisions, slots, favorites and admin catalogue edits", async (t) => {
  const { client, db } = await fixture(t),
    student = client(),
    tutor = client(),
    admin = client();
  await student.login("student");
  const tu = await tutor.login("chau");
  await admin.login("admin");
  const profiles = (await student.request("/tutors")).data,
    first = (await student.request(`/tutors/${tu.id}`)).data,
    second = (
      await student.request(
        `/tutors/${profiles.find((p) => p.user_id !== tu.id && p.subjects.includes("toan")).user_id}`,
      )
    ).data;
  await student.request("/bookings", "POST", {
    slot_id: first.slots[0].id,
    subject_id: "toan",
    mode: "online",
    note: "",
  });
  assert.equal(
    (
      await student.request("/bookings", "POST", {
        slot_id: second.slots[0].id,
        subject_id: "toan",
        mode: "online",
        note: "",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await tutor.request("/tutor/slots", "POST", {
        starts_at: new Date(Date.now() - 3600000).toISOString(),
      })
    ).status,
    400,
  );
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() + 30);
  dt.setUTCHours(10, 0, 0, 0);
  assert.equal(
    (
      await tutor.request("/tutor/slots", "POST", {
        starts_at: dt.toISOString(),
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await tutor.request("/tutor/slots", "POST", {
        starts_at: dt.toISOString(),
      })
    ).status,
    409,
  );
  await student.request(`/favorites/${tu.id}`, "PUT");
  assert.deepEqual((await student.request("/favorites")).data, [tu.id]);
  await student.request(`/favorites/${tu.id}`, "DELETE");
  assert.deepEqual((await student.request("/favorites")).data, []);
  const subject = {
    name: "Môn mới",
    stage: "THPT",
    description: "Danh mục kiểm thử",
  };
  assert.equal(
    (await student.request("/admin/subjects/test", "PUT", subject)).status,
    403,
  );
  assert.equal(
    (await admin.request("/admin/subjects/test", "PUT", subject)).status,
    200,
  );
  const resource = {
    title: "Mục kỳ thi",
    subject_id: "test",
    category: "Kiểm thử",
    level: "THPT",
    year: 2026,
    description: "Thông tin tham khảo",
    source_name: "Đơn vị",
    source_url: "https://example.org/exam",
    published: false,
  };
  const created = await admin.request("/admin/resources", "POST", resource);
  assert.equal(created.status, 201);
  assert.equal(
    (await student.request("/resources")).data.some(
      (r) => r.id === created.data.id,
    ),
    false,
  );
  await admin.request(`/admin/resources/${created.data.id}`, "PUT", {
    ...resource,
    published: true,
  });
  assert.equal(
    (await student.request("/resources")).data.some(
      (r) => r.id === created.data.id,
    ),
    true,
  );
  assert.equal(
    (await student.request("/resources/1/attempts", "POST", { answers: [] }))
      .status,
    404,
  );
});

test("additive tutor migration preserves existing accounts and profile data", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "giasu-migrate-")),
    file = join(dir, "old.sqlite");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const original = openDatabase(file);
  run(
    original,
    "INSERT INTO users(id,name,email,password,role) VALUES (1,'Gia sư cũ','old@test.vn','existing-hash','tutor')",
  );
  run(
    original,
    "INSERT INTO tutors(user_id,headline,subjects) VALUES (1,'Hồ sơ giữ nguyên','[\"toan\"]')",
  );
  original.exec(
    "ALTER TABLE users DROP COLUMN onboarding_step; ALTER TABLE tutors DROP COLUMN levels; ALTER TABLE tutors DROP COLUMN goals; ALTER TABLE tutors DROP COLUMN teaching_style; ALTER TABLE tutors DROP COLUMN lesson_plan; ALTER TABLE tutors DROP COLUMN profile_theme; PRAGMA user_version = 0",
  );
  original.close();
  const migrated = openDatabase(file);
  assert.equal(one(migrated, "PRAGMA user_version").user_version, 6);
  assert.equal(one(migrated, "SELECT onboarding_step FROM users WHERE id=1").onboarding_step, 3);
  assert.equal(
    one(migrated, "SELECT headline FROM tutors WHERE user_id=1").headline,
    "Hồ sơ giữ nguyên",
  );
  assert.equal(
    one(migrated, "SELECT email FROM users WHERE id=1").email,
    "old@test.vn",
  );
  assert.equal(
    one(migrated, "SELECT levels FROM tutors WHERE user_id=1").levels,
    "[]",
  );
  assert.deepEqual(
    {
      ...one(
        migrated,
        "SELECT teaching_style,lesson_plan,profile_theme FROM tutors WHERE user_id=1",
      ),
    },
    { teaching_style: "", lesson_plan: "", profile_theme: "paper" },
  );
  run(
    migrated,
    "UPDATE tutors SET levels='[\"THCS\"]',goals='[\"Tuyển sinh lớp 10\"]' WHERE user_id=1",
  );
  migrated.close();
  const reopened = openDatabase(file);
  assert.equal(
    one(reopened, "SELECT levels FROM tutors WHERE user_id=1").levels,
    '["THCS"]',
  );
  assert.equal(
    one(reopened, "SELECT goals FROM tutors WHERE user_id=1").goals,
    '["Tuyển sinh lớp 10"]',
  );
  reopened.close();
});

test("CV and portrait uploads validate content, retain approval boundaries and replace files", async (t) => {
  const { client, base, db } = await fixture(t),
    tutor = client(),
    student = client(),
    admin = client();
  const u = await tutor.login("chau");
  await student.login("student");
  await admin.login("admin");
  const { sampleCV } = await import("../server/demo-content.js");
  const { default: sharp } = await import("sharp");
  const pdf = await sampleCV(),
    photo = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#852f36" },
    })
      .png()
      .toBuffer();
  const upload = (c, kind, body, type, name = "CV.pdf", origin) =>
    fetch(base + `/tutor/uploads/${kind}`, {
      method: "PUT",
      headers: {
        Cookie: c.cookie,
        "Content-Type": type,
        "X-File-Name": encodeURIComponent(name),
        ...(origin ? { Origin: origin } : {}),
      },
      body,
    });
  assert.equal(
    (await upload(student, "cv", pdf, "application/pdf")).status,
    403,
  );
  assert.equal(
    (
      await upload(
        tutor,
        "cv",
        pdf,
        "application/pdf",
        "CV.pdf",
        "https://evil.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (await upload(tutor, "cv", Buffer.from("%PDF- fake"), "application/pdf"))
      .status,
    400,
  );
  assert.equal(
    (await upload(tutor, "photo", Buffer.from("<svg/>"), "image/png")).status,
    400,
  );
  assert.equal(
    (
      await upload(
        tutor,
        "cv",
        Buffer.alloc(5 * 1024 * 1024 + 1),
        "application/pdf",
      )
    ).status,
    413,
  );
  const cvResponse = await upload(
    tutor,
    "cv",
    pdf,
    "application/pdf",
    "CV mẫu.pdf",
  );
  assert.equal(cvResponse.status, 200);
  const cv = (await cvResponse.json()).cv;
  assert.equal((await fetch(base.replace("/api", "") + cv.url)).status, 404);
  assert.equal(
    (
      await fetch(base.replace("/api", "") + cv.url, {
        headers: { Cookie: student.cookie },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(base.replace("/api", "") + cv.url, {
        headers: { Cookie: admin.cookie },
      })
    ).status,
    200,
  );
  assert.equal((await tutor.request("/tutor/profile")).data.status, "pending");
  assert.equal((await upload(tutor, "photo", photo, "image/png")).status, 200);
  await admin.request(`/admin/tutors/${u.id}`, "PATCH", {
    status: "approved",
    note: "",
  });
  const profile = (await student.request(`/tutors/${u.id}`)).data;
  assert.equal(profile.cv.name, "CV mẫu.pdf");
  const download = await fetch(base.replace("/api", "") + profile.cv.url);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /^attachment/);
  assert.match(download.headers.get("content-security-policy"), /sandbox/);
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  const image = await fetch(base.replace("/api", "") + profile.photo_url);
  assert.equal(image.headers.get("content-type"), "image/webp");
  const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  assert.equal(meta.width, 640);
  assert.equal(meta.exif, undefined);
  await upload(tutor, "cv", pdf, "application/pdf", "Replacement.pdf");
  assert.equal(
    (
      await fetch(base.replace("/api", "") + cv.url, {
        headers: { Cookie: tutor.cookie },
      })
    ).status,
    404,
  );
  assert.equal(
    one(
      db,
      "SELECT count(*) AS n FROM tutor_uploads WHERE tutor_id=? AND kind='cv'",
      u.id,
    ).n,
    1,
  );
  assert.equal(
    (await tutor.request("/tutor/uploads/cv", "DELETE")).status,
    200,
  );
  assert.equal((await tutor.request("/tutor/profile")).data.cv, null);
});

test("student can contact a tutor before booking; inquiry is private and survives reload", async (t) => {
  const { client, db, file } = await fixture(t),
    student = client(),
    tutor = client(),
    outsider = client(),
    admin = client();
  await student.login("student");
  const u = await tutor.login("chau");
  await outsider.login("nam");
  await admin.login("admin");
  assert.equal(
    (
      await tutor.request("/inquiries", "POST", {
        tutor_id: u.id,
        body: "Hello",
      })
    ).status,
    403,
  );
  const created = await student.request("/inquiries", "POST", {
    tutor_id: u.id,
    body: "Em muốn hỏi về lịch học.",
  });
  assert.equal(created.status, 201);
  const { id } = created.data;
  assert.equal(one(db, "SELECT count(*) AS n FROM bookings").n, 0);
  assert.equal(
    (await outsider.request(`/inquiries/${id}/messages`)).status,
    404,
  );
  assert.equal((await admin.request(`/inquiries/${id}/messages`)).status, 403);
  assert.equal(
    (
      await outsider.request(`/inquiries/${id}/messages`, "POST", {
        body: "Intrusion",
      })
    ).status,
    404,
  );
  await tutor.request(`/inquiries/${id}/messages`, "POST", {
    body: "Mình còn lịch buổi tối nhé.",
  });
  await student.request("/inquiries", "POST", {
    tutor_id: u.id,
    body: "Em cảm ơn cô.",
  });
  assert.equal((await student.request("/inquiries")).data.length, 1);
  assert.equal(
    (await tutor.request(`/inquiries/${id}/messages`)).data.length,
    3,
  );
  const reopened = openDatabase(file);
  assert.equal(
    one(
      reopened,
      "SELECT count(*) AS n FROM inquiry_messages WHERE inquiry_id=?",
      id,
    ).n,
    3,
  );
  reopened.close();
  await admin.request(`/admin/users/${u.id}`, "PATCH", { status: "suspended" });
  assert.equal(
    (
      await student.request(`/inquiries/${id}/messages`, "POST", {
        body: "Hello",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await student.request("/inquiries", "POST", {
        tutor_id: u.id,
        body: "Hello",
      })
    ).status,
    404,
  );
});

test("rich demo seeding is repeatable and preserves profile edits", async (t) => {
  const { db } = await fixture(t);
  await seedDemo(db, "TestStudy2026!", { activity: true });
  const counts = () =>
    [
      "bookings",
      "messages",
      "reviews",
      "inquiries",
      "inquiry_messages",
      "tutor_uploads",
    ].map((table) => one(db, `SELECT count(*) AS n FROM ${table}`).n);
  const before = counts();
  assert.equal(before[0], 3);
  assert.equal(before[2], 1);
  assert.equal(before[5], 12);
  run(db, "UPDATE tutors SET bio='Tutor edited this profile' WHERE user_id=3");
  await seedDemo(db, "TestStudy2026!", { activity: true });
  assert.deepEqual(counts(), before);
  assert.equal(
    one(db, "SELECT bio FROM tutors WHERE user_id=3").bio,
    "Tutor edited this profile",
  );
});

test("custom tutor presentation validates, persists and requires moderation; public rename is reviewed", async (t) => {
  const { client, file } = await fixture(t);
  const tutor = client(),
    admin = client(),
    guest = client(),
    student = client();
  const user = await tutor.login("chau");
  await admin.login("admin");
  await student.login("student");
  const profile = (await tutor.request("/tutor/profile")).data;
  const custom = {
    ...profile,
    teaching_style: "Học qua ví dụ thực tế.",
    lesson_plan: "Trao đổi mục tiêu\nCùng luyện tập\nTổng kết",
    profile_theme: "sage",
  };
  assert.equal(
    (await student.request("/tutor/profile", "PUT", custom)).status,
    403,
  );
  assert.equal(
    (
      await tutor.request("/tutor/profile", "PUT", {
        ...custom,
        profile_theme: "javascript:red",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await tutor.request("/tutor/profile", "PUT", {
        ...custom,
        lesson_plan: "x".repeat(1501),
      })
    ).status,
    400,
  );
  assert.equal(
    (await tutor.request("/tutor/profile", "PUT", custom)).status,
    200,
  );
  assert.equal((await guest.request(`/tutors/${user.id}`)).status, 404);
  const reopened = openDatabase(file);
  assert.equal(
    one(reopened, "SELECT teaching_style FROM tutors WHERE user_id=?", user.id)
      .teaching_style,
    custom.teaching_style,
  );
  reopened.close();
  assert.equal(
    (
      await admin.request(`/admin/tutors/${user.id}`, "PATCH", {
        status: "approved",
        note: "",
      })
    ).status,
    200,
  );
  const published = (await guest.request(`/tutors/${user.id}`)).data;
  assert.equal(published.lesson_plan, custom.lesson_plan);
  assert.equal(published.profile_theme, "sage");
  assert.equal(
    (
      await tutor.request("/account", "PATCH", {
        name: user.name,
        goal: "Keep identity",
      })
    ).status,
    200,
  );
  assert.equal((await guest.request(`/tutors/${user.id}`)).status, 200);
  assert.equal(
    (
      await tutor.request("/account", "PATCH", {
        name: "Tên công khai mới",
        goal: "",
      })
    ).status,
    200,
  );
  assert.equal((await guest.request(`/tutors/${user.id}`)).status, 404);
  assert.equal((await tutor.request("/tutor/profile")).data.status, "pending");
});

test("tutor galleries preserve image proportions, enforce ownership, quotas and moderation", async (t) => {
  const { client, base, db, file } = await fixture(t);
  const tutor = client(), other = client(), student = client(), admin = client(), guest = client();
  const owner = await tutor.login("chau");
  await other.login("nam"); await student.login("student"); await admin.login("admin");
  const { default: sharp } = await import("sharp");
  const picture = await sharp({create:{width:120,height:80,channels:3,background:'#852f36'}}).png().toBuffer();
  const upload = (actor, body = picture, caption = "Góc học tập", headers = {}) => fetch(base + "/tutor/gallery", {
    method:"POST", headers:{ Cookie:actor.cookie, "Content-Type":"image/png", "X-Caption":encodeURIComponent(caption), ...headers }, body,
  });
  assert.equal((await upload(guest)).status,401);
  assert.equal((await upload(student)).status,403);
  assert.equal((await upload(tutor,picture,"",{Origin:"https://evil.test"})).status,403);
  assert.equal((await upload(tutor,Buffer.from("<svg>fake</svg>"))).status,400);
  assert.equal((await upload(tutor,picture,"a".repeat(501))).status,400);
  assert.equal((await upload(tutor,Buffer.alloc(5*1024*1024+1))).status,413);
  const response = await upload(tutor);
  assert.equal(response.status,201);
  const [photo] = await response.json();
  const getImage = (actor) => fetch(new URL(photo.url,base),{headers:{Cookie:actor.cookie}});
  assert.equal((await getImage(guest)).status,404);
  assert.equal((await getImage(other)).status,404);
  assert.equal((await getImage(admin)).status,200);
  const decoded = await getImage(tutor);
  assert.equal(decoded.headers.get("content-type"),"image/webp");
  assert.equal(decoded.headers.get("cache-control"),"no-store");
  const metadata = await sharp(Buffer.from(await decoded.arrayBuffer())).metadata();
  assert.equal(metadata.width/metadata.height,1.5);
  assert.equal((await other.request(`/tutor/gallery/${photo.id}`,"PATCH",{caption:"hijack"})).status,404);
  assert.equal((await other.request(`/tutor/gallery/${photo.id}`,"DELETE")).status,404);
  assert.equal((await tutor.request(`/tutor/gallery/${photo.id}`,"PATCH",{caption:"b".repeat(501)})).status,400);
  const approve = () => admin.request(`/admin/tutors/${owner.id}`,"PATCH",{status:"approved",note:""});
  assert.equal((await approve()).status,200);
  assert.equal((await getImage(guest)).status,200);
  assert.equal((await guest.request(`/tutors/${owner.id}`)).data.gallery[0].caption,"Góc học tập");
  assert.equal((await tutor.request(`/tutor/gallery/${photo.id}`,"PATCH",{caption:"Cùng học Toán"})).status,200);
  assert.equal((await getImage(guest)).status,404);
  const reopened = openDatabase(file);
  assert.equal(one(reopened,"SELECT caption FROM tutor_gallery WHERE id=?",photo.id).caption,"Cùng học Toán");
  reopened.close();
  for(let i=1;i<12;i++) assert.equal((await upload(tutor)).status,201);
  assert.equal((await upload(tutor)).status,409);
  assert.equal((await tutor.request('/tutor/profile')).data.gallery.length,12);
  assert.equal((await tutor.request(`/tutor/gallery/${photo.id}`,"DELETE")).status,200);
  assert.equal(one(db,"SELECT COUNT(*) AS count FROM gallery_chunks WHERE image_id=?",photo.id).count,0);
  assert.equal((await getImage(tutor)).status,404);
  assert.equal((await upload(tutor)).status,201);
  await approve();
  const another = (await guest.request(`/tutors/${owner.id}`)).data.gallery[0];
  await admin.request(`/admin/users/${owner.id}`,"PATCH",{status:"suspended"});
  assert.equal((await fetch(new URL(another.url,base))).status,404);
});

test("gallery likes and paginated comments enforce student ownership and moderation", async (t) => {
  const { client, db } = await fixture(t);
  const tutor=client(), student=client(), other=client(), admin=client(), guest=client();
  const owner=await tutor.login('chau'); const learner=await student.login('student'); await admin.login('admin');
  await other.request('/auth/register','POST',{name:'Another student',email:'other-gallery@test.vn',password:'TestStudy2026!',role:'student'});
  run(db,"INSERT INTO tutor_gallery(id,tutor_id,caption) VALUES ('social-test',?,'Học cùng tôi')",owner.id);
  const social='/gallery/social-test';
  assert.equal((await guest.request(social+'/social')).status,200);
  assert.equal((await guest.request(social+'/like','PUT')).status,401);
  assert.equal((await tutor.request(social+'/like','PUT')).status,403);
  await student.request(social+'/like','PUT'); await student.request(social+'/like','PUT');
  assert.equal((await student.request(social+'/social')).data.likes,1);
  assert.equal((await student.request(social+'/social')).data.liked,true);
  assert.equal((await other.request(social+'/social')).data.liked,false);
  await student.request(social+'/like','DELETE');
  assert.equal((await guest.request(social+'/social')).data.likes,0);
  assert.equal((await student.request(social+'/comments','POST',{body:' '})).status,400);
  assert.equal((await student.request(social+'/comments','POST',{body:'x'.repeat(1001)})).status,400);
  assert.equal((await student.request(social+'/comments','POST',{body:'Em muốn tìm hiểu phương pháp này.'})).status,201);
  let comment=(await student.request(social+'/social')).data.comments[0];
  assert.equal((await other.request(social+'/comments/'+comment.id,'DELETE')).status,404);
  assert.equal((await student.request(social+'/comments/'+comment.id,'DELETE')).status,200);
  await student.request(social+'/comments','POST',{body:'<script>alert(1)</script>'});
  comment=(await guest.request(social+'/social')).data.comments[0];
  assert.equal(comment.body,'<script>alert(1)</script>');
  assert.equal((await tutor.request(social+'/comments/'+comment.id,'DELETE')).status,200);
  for(let i=0;i<21;i++) run(db,"INSERT INTO gallery_comments(image_id,student_id,body,created_at) VALUES ('social-test',?,?,'2020-01-01 00:00:00')",learner.id,`Comment ${i}`);
  const first=(await guest.request(social+'/social')).data;
  assert.equal(first.comments.length,20); assert.equal(first.comment_count,21); assert.ok(first.next);
  const second=(await guest.request(social+'/social?before='+first.next)).data;
  assert.equal(second.comments.length,1); assert.equal(second.next,null);
  assert.equal((await guest.request(social+'/social?before=invalid')).status,400);
  for(let i=0;i<5;i++) assert.equal((await student.request(social+'/comments','POST',{body:'Thảo luận '+i})).status,201);
  assert.equal((await student.request(social+'/comments','POST',{body:'Quá nhanh'})).status,429);
  const latest=(await admin.request(social+'/social')).data.comments[0];
  assert.equal((await admin.request(social+'/comments/'+latest.id,'DELETE')).status,200);
  await student.request(social+'/like','PUT');
  run(db,"UPDATE tutors SET status='pending' WHERE user_id=?",owner.id);
  assert.equal((await guest.request(social+'/social')).status,404);
  assert.equal((await student.request(social+'/like','PUT')).status,404);
  assert.equal((await student.request(social+'/comments','POST',{body:'Hidden'})).status,404);
  assert.equal((await tutor.request(social+'/social')).status,200);
  assert.equal((await admin.request(social+'/social')).status,200);
  await tutor.request('/tutor/gallery/social-test','DELETE');
  assert.equal(one(db,"SELECT COUNT(*) AS count FROM gallery_comments WHERE image_id='social-test'").count,0);
  assert.equal(one(db,"SELECT COUNT(*) AS count FROM gallery_likes WHERE image_id='social-test'").count,0);
});

test("new accounts complete resumable role-specific setup without escalating roles or skipping validation", async (t) => {
  const { client, db } = await fixture(t);
  const guest = client();
  assert.equal((await guest.request("/account/onboarding", "PUT", { step: 0, role: "student" })).status, 401);
  for (const role of ["student", "tutor"]) {
    const account = client();
    const signup = await account.request("/auth/register", "POST", { name: "Người mới", email: `${role}-setup@example.com`, password: "NewAccount2026!", role: "student" });
    assert.equal(signup.data.user.onboarding_step, 0);
    assert.equal((await account.request("/account/onboarding", "PUT", { step: 2 })).status, 409);
    assert.equal((await account.request("/account/onboarding", "PUT", { step: 0, role: "admin" })).status, 400);
    const choice = await account.request("/account/onboarding", "PUT", { step: 0, role });
    assert.equal(choice.data.user.role, role);
    assert.equal(choice.data.user.onboarding_step, 1);
    assert.equal((await account.request("/account/onboarding", "PUT", { step: 0, role: "student" })).status, 409);
    assert.equal((await account.request("/account/onboarding", "PUT", { step: 1, name: "Incomplete" })).status, 400);
    const profile = role === "student" ? { name: "Học sinh mới", goal: "Ôn Toán lớp 9" } : { name: "Gia sư mới", headline: "Toán THCS", bio: "Dạy theo năng lực từng học sinh", education: "Đại học Sư phạm", subjects: ["toan"], rate: 180000, experience: 2, location: "Hà Nội", mode: "both" };
    if (role === "tutor") {
      assert.equal((await account.request("/account/onboarding", "PUT", { ...profile, step: 1, subjects: ["unknown"] })).status, 400);
      assert.equal((await account.request("/account/onboarding", "PUT", { ...profile, step: 1, rate: 0 })).status, 400);
    }
    const saved = await account.request("/account/onboarding", "PUT", { ...profile, step: 1 });
    assert.equal(saved.data.user.onboarding_step, 2);
    await account.request("/auth/logout", "POST");
    const resumed = await account.request("/auth/login", "POST", { email: `${role}-setup@example.com`, password: "NewAccount2026!" });
    assert.equal(resumed.data.user.onboarding_step, 2);
    assert.equal(resumed.data.user.name, profile.name);
    const complete = await account.request("/account/onboarding", "PUT", { step: 2 });
    assert.equal(complete.data.user.onboarding_step, 3);
    assert.equal((await account.request("/account/onboarding", "PUT", { step: 0, role: "admin" })).status, 409);
    assert.equal((await account.request("/auth/me")).data.user.onboarding_step, 3);
    if (role === "tutor") {
      const tutor = one(db, "SELECT * FROM tutors WHERE user_id=?", signup.data.user.id);
      assert.equal(tutor.status, "pending");
      assert.equal(tutor.rate, 180000);
      assert.deepEqual(JSON.parse(tutor.subjects), ["toan"]);
      assert.equal((await guest.request(`/tutors/${signup.data.user.id}`)).status, 404);
    }
  }
  const existing = client();
  assert.equal((await existing.login("student")).onboarding_step, 3);
});

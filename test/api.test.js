import { reconcileAvailability, overlaps } from "../server/availability.js";
import { processPhoto } from "../server/photo.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";
import { all, one, run, migrateDatabase } from "../server/db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { createApi } from "../server/api.js";

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-api-")),
    file = join(dir, "db.sqlite"),
    db = openDatabase(file);
  seedCatalog(db);
  await seedDemo(db, "TestStudy2026!");
  const emails = [];
  const server = createApi(db, { processPhoto, limit: false, sendEmail: async message => { emails.push(message); }, ...options }).listen(0, "127.0.0.1");
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
        const cookies = response.headers.getSetCookie();
        if (cookies.length) cookie = cookies.map(c => c.split(";")[0]).join("; ");
        let data = await response.json();
        // Existing business-flow tests use verified accounts; verification-specific tests use raw fetch.
        if (path === "/auth/register" && response.status === 202) {
          const verified = await this.request("/auth/signup/verify", "POST", { code: emails.at(-1).code });
          if (body.role === "tutor") {
            const choice = await this.request("/account/onboarding", "PUT", { step: 0, role: "tutor" });
            verified.data.user = choice.data.user;
          }
          return verified;
        }
        return {
          status: response.status,
          data,
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
  return { db, file, client, base, emails };
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
  const repriced = await guest.request(`/tutors/${id}`);
  assert.equal(repriced.status, 200); assert.equal(repriced.data.rate, 200000);
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
  // A second review of the same tutor edits the first instead of adding another.
  const edited = await owner.request(`/bookings/${id}/review`, "POST", { rating: 4, body: "Lần hai" });
  assert.equal(edited.status, 200); assert.equal(edited.data.updated, true);
  const rated = (await owner.request(`/tutors/${u.id}`)).data;
  assert.equal(rated.rating, 4); assert.equal(rated.review_count, 1); assert.equal(rated.reviews.length, 1);
  assert.equal(rated.reviews[0].body, "Lần hai"); assert.equal(rated.reviews[0].lessons, 1);
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
  seedCatalog(original);
  run(original, "INSERT INTO users(id,name,email,password,role) VALUES (2,'Học sinh cũ','legacy-student@test.vn','existing-hash','student')");
  run(original, "INSERT INTO slots(id,tutor_id,starts_at) VALUES (1,1,'2030-01-07T11:00:00.000Z')");
  run(original, "INSERT INTO bookings(id,student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode) VALUES (1,2,1,1,'toan','2030-01-07T11:00:00.000Z',180000,'online')");
  original.exec("ALTER TABLE slots DROP COLUMN duration_minutes; ALTER TABLE slots DROP COLUMN source; ALTER TABLE slots DROP COLUMN available; ALTER TABLE bookings DROP COLUMN duration_minutes; DROP TABLE weekly_availability");
  original.exec(
    "ALTER TABLE users DROP COLUMN school; ALTER TABLE users DROP COLUMN province_code; ALTER TABLE users DROP COLUMN ward_code; ALTER TABLE tutors DROP COLUMN province_code; ALTER TABLE tutors DROP COLUMN ward_code; ALTER TABLE users DROP COLUMN onboarding_step; ALTER TABLE tutors DROP COLUMN levels; ALTER TABLE tutors DROP COLUMN goals; ALTER TABLE tutors DROP COLUMN teaching_style; ALTER TABLE tutors DROP COLUMN lesson_plan; ALTER TABLE tutors DROP COLUMN profile_theme; ALTER TABLE users DROP COLUMN timezone; ALTER TABLE tutors DROP COLUMN education_history; ALTER TABLE tutors DROP COLUMN profile_sections; ALTER TABLE users DROP COLUMN email_verified_at; ALTER TABLE users DROP COLUMN email_verification_required; PRAGMA user_version = 0",
  );
  original.close();
  const migrated = openDatabase(file);
  assert.equal(one(migrated, "SELECT duration_minutes FROM slots WHERE id=1").duration_minutes, 60);
  assert.equal(one(migrated, "SELECT duration_minutes FROM bookings WHERE id=1").duration_minutes, 60);
  assert.equal(one(migrated, "SELECT rate FROM bookings WHERE id=1").rate, 180000);
  assert.equal(one(migrated, "SELECT source FROM slots WHERE id=1").source, "manual");
  assert.equal(one(migrated, "PRAGMA user_version").user_version, 6);
  assert.equal(one(migrated, "SELECT timezone FROM users WHERE id=1").timezone, "Asia/Ho_Chi_Minh");
  assert.equal(one(migrated, "SELECT education_history FROM tutors WHERE user_id=1").education_history, "[]");
  assert.equal(one(migrated, "SELECT email_verification_required FROM users WHERE id=1").email_verification_required, 0);
  assert.equal(one(migrated, "SELECT email_verified_at FROM users WHERE id=1").email_verified_at, null);
  assert.equal(one(migrated, "SELECT onboarding_step FROM users WHERE id=1").onboarding_step, 3);
  assert.deepEqual({ ...one(migrated, "SELECT school,province_code,ward_code FROM users WHERE id=1") }, { school: "", province_code: "", ward_code: "" });
  assert.equal(one(migrated, "SELECT ward_code FROM tutors WHERE user_id=1").ward_code, "");
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

test("tutor images validate, moderate and replace; legacy CVs are never exposed", async t => {
  const { client, base, db } = await fixture(t), tutor = client(), student = client(), admin = client(), other = client();
  const u = await tutor.login("chau"); await other.login("nam"); await student.login("student"); await admin.login("admin");
  const { default: sharp } = await import("sharp");
  const { saveUpload } = await import("../server/uploads.js");
  const oldCv = saveUpload(db, u.id, "cv", Buffer.from("legacy document"), "application/pdf", "old.pdf");
  for (const c of [tutor, student, admin]) assert.equal((await fetch(base+`/uploads/${oldCv}`, { headers: { Cookie: c.cookie } })).status, 404);
  assert.equal((await tutor.request("/tutor/profile")).data.cv, undefined);
  const photo = await sharp({ create: { width: 160, height: 80, channels: 3, background: "#852f36" } }).png().toBuffer();
  const upload = (c, kind, body, type = "image/png", origin) => fetch(base+`/tutor/uploads/${kind}`, { method:"PUT",headers:{ Cookie:c.cookie,"Content-Type":type,...(origin ? {Origin:origin} : {}) },body });
  assert.equal((await upload(tutor,"cv",Buffer.from("pdf"),"application/pdf")).status,404);
  assert.equal((await upload(student,"banner",photo)).status,403);
  assert.equal((await upload(tutor,"banner",photo,"image/png","https://evil.test")).status,403);
  assert.equal((await upload(tutor,"banner",Buffer.from("<svg/>"))).status,400);
  assert.equal((await upload(tutor,"banner",Buffer.alloc(5*1024*1024+1))).status,413);
  for (const kind of ["photo","banner"]) {
    const response = await upload(tutor,kind,photo); assert.equal(response.status,200);
    const url = (await response.json())[`${kind}_url`];
    const fetchImage = c => fetch(base.replace("/api", "")+url,{headers:{Cookie:c?.cookie || ""}});
    assert.equal((await fetchImage()).status,404); assert.equal((await fetchImage(other)).status,404);
    assert.equal((await fetchImage(tutor)).status,200); assert.equal((await fetchImage(admin)).status,200);
    assert.equal((await tutor.request("/tutor/profile")).data.status,"pending");
    await admin.request(`/admin/tutors/${u.id}`,"PATCH",{status:"approved",note:""});
    const image=await fetchImage(); assert.equal(image.status,200); assert.equal(image.headers.get("content-type"),"image/webp");
    const meta=await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(meta.width,kind==="banner"?1280:640); assert.equal(meta.height,kind==="banner"?320:640); assert.equal(meta.exif,undefined);
    await upload(tutor,kind,photo); assert.equal((await fetchImage(tutor)).status,404);
    const table=kind==="banner"?"tutor_banners":"tutor_uploads";
    assert.equal(one(db,`SELECT count(*) AS n FROM ${table} WHERE tutor_id=? AND kind=?`,u.id,kind).n,1);
    assert.equal((await tutor.request(`/tutor/uploads/${kind}`,"DELETE")).status,200);
    assert.equal((await tutor.request("/tutor/profile")).data[`${kind}_url`],null);
  }
  assert.ok(one(db,"SELECT id FROM tutor_uploads WHERE id=?",oldCv),"Legacy document remains stored, but inaccessible");
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

test("tutor reviews show the reviewer's display name and label, never the real name or ids", async (t) => {
  const { db, client } = await fixture(t);
  await seedDemo(db, "TestStudy2026!", { activity: true });
  const guest = client();
  const reviewer = one(db, "SELECT u.* FROM reviews r JOIN bookings b ON b.id=r.booking_id JOIN users u ON u.id=b.student_id");
  const tutorId = one(db, "SELECT b.tutor_id FROM reviews r JOIN bookings b ON b.id=r.booking_id").tutor_id;
  const reviews = async () => (await guest.request(`/tutors/${tutorId}`)).data.reviews;
  run(db, "UPDATE users SET display_name='', learner_type='student' WHERE id=?", reviewer.id);
  let [review] = await reviews();
  assert.equal(review.author, "Thành viên - Học sinh");
  assert.deepEqual(Object.keys(review).sort(), ["author", "body", "created_at", "lessons", "rating"]);
  assert.ok(!JSON.stringify(await reviews()).includes(reviewer.name));
  run(db, "UPDATE users SET display_name='Minh An' WHERE id=?", reviewer.id);
  assert.equal((await reviews())[0].author, "Minh An - Học sinh");
  run(db, "UPDATE users SET learner_type='parent' WHERE id=?", reviewer.id);
  assert.equal((await reviews())[0].author, "Minh An - Phụ huynh");
});

test("students can complete finished lessons themselves and review each tutor once across lessons", async (t) => {
  const { db, client } = await fixture(t);
  const tutor = client(), student = client(), other = client(), guest = client();
  const teacher = await tutor.login("chau"), learner = await student.login("student"); await other.login("linh");
  const lesson = (offsetHours) => {
    const starts_at = new Date(Date.now() + offsetHours * 3600000).toISOString();
    const slot = Number(run(db, "INSERT INTO slots(tutor_id,starts_at) VALUES (?,?)", teacher.id, starts_at).lastInsertRowid);
    return Number(run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,status,duration_minutes) VALUES (?,?,?,?,?,?,?,?,?)", learner.id, teacher.id, slot, "toan", starts_at, 180000, "online", "accepted", 60).lastInsertRowid);
  };
  const future = lesson(24), first = lesson(-30), second = lesson(-20), third = lesson(-10);
  const complete = (who, id) => who.request(`/bookings/${id}`, "PATCH", { status: "completed" });
  // Only the two people of the lesson, and only once it has ended.
  assert.equal((await complete(student, future)).status, 409);
  assert.equal((await complete(other, first)).status, 403);
  assert.equal((await complete(guest, first)).status, 401);
  assert.equal((await student.request(`/bookings/${first}/review`, "POST", { rating: 5, body: "Sớm quá" })).status, 403);
  assert.equal((await complete(student, first)).status, 200);
  assert.equal((await complete(tutor, second)).status, 200);
  assert.equal((await complete(student, first)).status, 409);
  assert.ok(one(db, "SELECT id FROM audit WHERE action='booking.completed' AND actor_id=? AND target=?", learner.id, String(first)));

  // The first review is created; a review through a later lesson edits it.
  const created = await student.request(`/bookings/${first}/review`, "POST", { rating: 5, body: "Buổi đầu rất tốt." });
  assert.equal(created.status, 201);
  const lessons = (await student.request("/bookings")).data;
  assert.ok(lessons.filter(b => b.status === "completed").every(b => b.reviewed === 5 && b.review_body === "Buổi đầu rất tốt."));
  const changed = await student.request(`/bookings/${second}/review`, "POST", { rating: 3, body: "Học thêm thì thấy bình thường." });
  assert.equal(changed.status, 200);
  assert.equal(one(db, "SELECT COUNT(*) n FROM reviews").n, 1);
  assert.equal((await student.request("/bookings")).data.find(b => b.id === third).reviewed, 3);
  assert.equal((await student.request(`/bookings/${third}/review`, "POST", { rating: 4, body: "Chưa hoàn thành." })).status, 403);

  // Public rating counts the student once and shows how many lessons they took.
  let page = (await guest.request(`/tutors/${teacher.id}`)).data;
  assert.equal(page.review_count, 1); assert.equal(page.rating, 3);
  assert.deepEqual(page.reviews.map(r => [r.rating, r.body, r.lessons]), [[3, "Học thêm thì thấy bình thường.", 2]]);

  // Older data may hold several reviews for one pair: only the latest counts.
  run(db, "UPDATE reviews SET created_at='2026-01-01 00:00:00'");
  run(db, "INSERT INTO reviews(booking_id,rating,body,created_at) VALUES (?,?,?,?)", second, 1, "Cũ hơn", "2025-12-01 00:00:00");
  page = (await guest.request(`/tutors/${teacher.id}`)).data;
  assert.equal(page.review_count, 1); assert.equal(page.rating, 3); assert.equal(page.reviews.length, 1);
  assert.equal((await guest.request("/tutors")).data.find(x => x.user_id === teacher.id).review_count, 1);
});

test("tutors start, finish or mark lessons missed from the overview with time limits", async (t) => {
  const { db, client } = await fixture(t);
  const tutor = client(), student = client(), other = client(), guest = client();
  const teacher = await tutor.login("chau"), learner = await student.login("student"); await other.login("linh");
  const minute = 60000;
  const lesson = (offsetMinutes) => {
    const starts_at = new Date(Date.now() + offsetMinutes * minute).toISOString();
    const slot = Number(run(db, "INSERT INTO slots(tutor_id,starts_at) VALUES (?,?)", teacher.id, starts_at).lastInsertRowid);
    return Number(run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,status,duration_minutes) VALUES (?,?,?,?,?,?,?,?,?)", learner.id, teacher.id, slot, "toan", starts_at, 180000, "online", "accepted", 60).lastInsertRowid);
  };
  const start = (who, id) => who.request(`/bookings/${id}/start`, "POST");
  const patch = (who, id, status) => who.request(`/bookings/${id}`, "PATCH", { status });
  const stored = (id) => one(db, "SELECT status,started_at FROM bookings WHERE id=?", id);

  // Start opens 15 minutes before the lesson and only for the tutor of that lesson.
  const later = lesson(120), soon = lesson(10), running = lesson(-20), over = lesson(-90), noshow = lesson(-5);
  assert.equal((await start(tutor, later)).status, 409);
  assert.equal((await start(student, soon)).status, 403);
  assert.equal((await start(guest, soon)).status, 401);
  assert.equal((await start(tutor, over)).status, 409);
  assert.equal((await start(tutor, soon)).status, 200);
  assert.ok(stored(soon).started_at);
  assert.equal((await start(tutor, soon)).status, 409);
  assert.ok(one(db, "SELECT id FROM audit WHERE action='booking.started' AND actor_id=? AND target=?", teacher.id, String(soon)));

  // A started lesson can be ended before its scheduled end; an unstarted one only after it.
  assert.equal((await patch(tutor, soon, "completed")).status, 200);
  assert.equal(stored(soon).status, "completed");
  assert.equal((await patch(tutor, later, "completed")).status, 409);
  assert.equal((await start(tutor, running)).status, 200);
  assert.equal((await patch(student, running, "completed")).status, 409);
  assert.equal((await patch(tutor, running, "completed")).status, 200);
  assert.equal((await patch(tutor, over, "completed")).status, 200);

  // Missed: only the tutor, once the lesson time has come, and not after starting.
  assert.equal((await patch(tutor, later, "missed")).status, 409);
  assert.equal((await patch(student, noshow, "missed")).status, 409);
  assert.equal((await patch(tutor, noshow, "missed")).status, 200);
  assert.equal(stored(noshow).status, "missed");
  assert.equal((await patch(tutor, noshow, "completed")).status, 409);
  const startedThenAbsent = lesson(-1);
  assert.equal((await start(tutor, startedThenAbsent)).status, 200);
  assert.equal((await patch(tutor, startedThenAbsent, "missed")).status, 409);

  // A missed lesson cannot be reviewed and does not count as taught.
  assert.equal((await student.request(`/bookings/${noshow}/review`, "POST", { rating: 5, body: "Không học." })).status, 403);
  const tutorView = (await tutor.request("/bookings")).data.find(b => b.id === noshow);
  assert.equal(tutorView.status, "missed");
  assert.equal((await student.request(`/bookings/${over}/review`, "POST", { rating: 5, body: "Buổi học tốt." })).status, 201);
  assert.equal((await guest.request(`/tutors/${teacher.id}`)).data.reviews[0].lessons, 3);
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
  assert.equal(before[5], 6);
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
  assert.equal((await tutor.request("/tutor/profile", "PUT", custom)).status, 403);
  assert.equal((await admin.request(`/admin/tutors/${user.id}/themes/sage`, "PUT")).status, 200);
  assert.equal(
    (await tutor.request("/tutor/profile", "PUT", custom)).status,
    200,
  );
  // Students keep seeing the approved version while the new text awaits review.
  const beforeReview = await guest.request(`/tutors/${user.id}`);
  assert.equal(beforeReview.status, 200);
  assert.notEqual(beforeReview.data.teaching_style, custom.teaching_style);
  assert.equal((await tutor.request("/tutor/profile")).data.teaching_style, custom.teaching_style);
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
  // Comments are public: no real name or account id, only the author's public label and whether it is the viewer's.
  assert.match(comment.author,/ - Học sinh$/); assert.ok(!comment.author.includes(learner.name));
  assert.equal(comment.name,undefined); assert.equal(comment.student_id,undefined);
  assert.equal(comment.mine,true); assert.equal((await other.request(social+'/social')).data.comments[0].mine,false); assert.equal((await guest.request(social+'/social')).data.comments[0].mine,false);
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
    assert.equal((await account.request("/account/onboarding", "PUT", { step: 1, name: "" })).status, 400);
    const profile = role === "student" ? { name: "Học sinh mới", goal: "Ôn Toán lớp 9", school: "THCS Ba Đình", province_code: "1", ward_code: "4" } : { name: "Gia sư mới", headline: "Toán THCS", bio: "Dạy theo năng lực từng học sinh", education: "Đại học Sư phạm", subjects: ["toan"], rate: 180000, experience: 2, location: "Hà Nội", mode: "both" };
    const saved = await account.request("/account/onboarding", "PUT", { ...profile, display_name: "Thành viên mới", step: 1 });
    assert.equal(saved.data.user.onboarding_step, 3);
    await account.request("/auth/logout", "POST");
    const resumed = await account.request("/auth/login", "POST", { email: `${role}-setup@example.com`, password: "NewAccount2026!" });
    assert.equal(resumed.data.user.onboarding_step, 3);
    assert.equal(resumed.data.user.name, profile.name);
    const complete = await account.request("/account/onboarding", "PUT", { step: 2 });
    assert.equal(complete.status, 409);
    assert.equal((await account.request("/account/onboarding", "PUT", { step: 0, role: "admin" })).status, 409);
    assert.equal((await account.request("/auth/me")).data.user.onboarding_step, 3);
    if (role === "tutor") {
      const tutor = one(db, "SELECT * FROM tutors WHERE user_id=?", signup.data.user.id);
      assert.equal(tutor.status, "pending");
      assert.equal(tutor.rate, 150000);
      assert.deepEqual(JSON.parse(tutor.subjects), []);
      assert.equal((await guest.request(`/tutors/${signup.data.user.id}`)).status, 404);
    }
  }
  const existing = client();
  assert.equal((await existing.login("student")).onboarding_step, 3);
});

test("only administrators can promote active accounts, with session revocation and an audit trail", async (t) => {
  const { client, db } = await fixture(t);
  const admin = client(), student = client(), guest = client();
  const actor = await admin.login("admin");
  const target = await student.login("student");
  const path = `/admin/users/${target.id}/role`;
  assert.equal((await guest.request(path, "PATCH", { role: "admin" })).status, 401);
  assert.equal((await student.request(path, "PATCH", { role: "admin" })).status, 403);
  assert.equal((await admin.request(path, "PATCH", { role: "tutor" })).status, 400);
  assert.equal((await admin.request(path, "PATCH", { role: "admin", status: "active" })).status, 400);
  assert.equal((await admin.request(path, "PATCH", { role: "admin" }, { Origin: "https://attacker.test" })).status, 403);
  assert.equal((await admin.request("/admin/users/999999/role", "PATCH", { role: "admin" })).status, 404);
  run(db, "UPDATE users SET status='suspended' WHERE id=?", target.id);
  assert.equal((await admin.request(path, "PATCH", { role: "admin" })).status, 409);
  run(db, "UPDATE users SET status='active',onboarding_step=1 WHERE id=?", target.id);
  assert.equal((await admin.request(path, "PATCH", { role: "admin" })).status, 200);
  assert.equal(one(db, "SELECT role FROM users WHERE id=?", target.id).role, "admin");
  assert.equal(one(db, "SELECT onboarding_step FROM users WHERE id=?", target.id).onboarding_step, 3);
  assert.equal((await student.request("/admin")).status, 401);
  assert.equal((await student.login("student")).role, "admin");
  assert.equal((await student.request("/admin")).status, 200);
  assert.equal((await admin.request(path, "PATCH", { role: "admin" })).status, 200);
  assert.equal((await student.request("/admin")).status, 200);
  const entry = one(db, "SELECT * FROM audit WHERE action='user.promoted_to_admin' AND target=?", String(target.id));
  assert.equal(entry.actor_id, actor.id);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM audit WHERE action='user.promoted_to_admin'").n, 1);
  assert.equal((await student.request(`/admin/users/${actor.id}`, "PATCH", { status: "suspended" })).status, 403);

  const tutor = client();
  const tutorUser = await tutor.login("chau");
  assert.equal((await student.request(`/admin/users/${tutorUser.id}/role`, "PATCH", { role: "admin" })).status, 200);
  assert.ok(one(db, "SELECT * FROM tutors WHERE user_id=?", tutorUser.id));
  assert.equal((await guest.request(`/tutors/${tutorUser.id}`)).status, 404);
  assert.ok(!(await guest.request("/tutors")).data.some((u) => u.user_id === tutorUser.id));
  const learner = client();
  await learner.request("/auth/register", "POST", { name: "Learner", email: "learner-promotion@test.vn", password: "TestStudy2026!", role: "student" });
  const slot = one(db, "SELECT id FROM slots WHERE tutor_id=? AND starts_at>?", tutorUser.id, new Date(Date.now() + 3600000).toISOString());
  assert.ok(slot);
  assert.equal((await learner.request("/bookings", "POST", { slot_id: slot.id, subject_id: "toan", mode: "online", note: "" })).status, 400);
  assert.equal((await learner.request("/inquiries", "POST", { tutor_id: tutorUser.id, body: "Xin hỏi lịch học" })).status, 404);
});

test("parent setup is distinct, resumable and shares student permissions", async (t) => {
  const { client } = await fixture(t), parent = client();
  let r = await parent.request("/auth/register", "POST", { name: "Phụ huynh", email: "parent@test.vn", password: "TestStudy2026!" });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.onboarding_step, 0);
  assert.equal((await parent.request("/account/onboarding", "PUT", { step: 0, role: "admin" })).status, 400);
  r = await parent.request("/account/onboarding", "PUT", { step: 0, role: "parent" });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, "student");
  assert.equal(r.data.user.learner_type, "parent");
  assert.equal((await parent.request("/auth/me")).data.user.learner_type, "parent");
  assert.equal((await parent.request("/account/onboarding", "PUT", { step: 1, name: "Phụ huynh", display_name: "Minh", goal: "Con ôn Toán lớp 9", school: "THCS Ba Đình", province_code: "1", ward_code: "4" })).status, 200);
  assert.equal((await parent.request("/account/onboarding", "PUT", { step: 2 })).status, 409);
  assert.equal((await parent.request("/favorites")).status, 200);
  assert.equal((await parent.request("/bookings")).status, 200);
  assert.equal((await parent.request("/admin")).status, 403);
  assert.equal((await parent.request("/account/onboarding", "PUT", { step: 0, role: "tutor" })).status, 409);
});

test("news authoring is admin-only and drafts never leak publicly", async (t) => {
  const { client } = await fixture(t), admin = client(), student = client(), guest = client();
  await admin.login("admin"); await student.login("student");
  const post = { title: "Học Toán", summary: "Kinh nghiệm học", body: '<script>alert("test")</script>\nNội dung', published: false };
  assert.equal((await guest.request("/admin/posts", "POST", post)).status, 401);
  assert.equal((await student.request("/admin/posts", "POST", post)).status, 403);
  assert.equal((await guest.request("/admin/posts")).status, 401);
  assert.equal((await student.request("/admin/posts")).status, 403);
  assert.equal((await admin.request("/admin/posts", "POST", { ...post, title: " " })).status, 400);
  const created = await admin.request("/admin/posts", "POST", post);
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await guest.request(`/posts/${id}`)).status, 404);
  assert.equal((await guest.request("/posts")).data.length, 0);
  assert.equal((await student.request(`/admin/posts/${id}`, "PUT", { ...post, published: true })).status, 403);
  assert.equal((await admin.request(`/admin/posts/${id}`, "PUT", { ...post, published: true })).status, 200);
  assert.equal((await guest.request(`/posts/${id}`)).data.body, post.body);
  assert.equal((await guest.request("/posts")).data.length, 1);
  assert.equal((await admin.request(`/admin/posts/${id}`, "PUT", post)).status, 200);
  assert.equal((await guest.request(`/posts/${id}`)).status, 404);
  assert.equal((await guest.request("/posts")).data.length, 0);
});

test("tutor education timeline and timezone validate, persist and remain subject to moderation", async t => {
  const { client, file } = await fixture(t);
  const tutor = client(), admin = client(), guest = client();
  const user = await tutor.login("chau"); await admin.login("admin");
  const old = (await tutor.request("/tutor/profile")).data;
  const education_history = [
    { level: "high_school", institution: "THPT Nguyễn Trãi", field: "", start_year: 2015, end_year: 2018 },
    { level: "university", institution: "Đại học Sư phạm", field: "Toán", start_year: 2018, end_year: null },
  ];
  const custom = { ...old, timezone: "America/New_York", profile_sections: [{ title: "Chứng chỉ", body: "Chứng chỉ phương pháp giảng dạy, 2023" }], education_history };
  for (const patch of [
    { timezone: "Invalid/Timezone" }, { profile_sections: [{ title: "", body: "invalid" }] },
    { education_history: [{ ...education_history[0], institution: "" }] },
    { education_history: [{ ...education_history[0], end_year: 2014 }] },
    { education_history: [{ ...education_history[0], start_year: 1900 }] },
    { education_history: Array(9).fill(education_history[0]) },
    { profile_sections: Array(11).fill({ title: "Title", body: "Body" }) },
    { profile_sections: [{ title: "Title", body: "x".repeat(2001) }] },
  ]) assert.equal((await tutor.request("/tutor/profile", "PUT", { ...custom, ...patch })).status, 400);
  assert.equal((await tutor.request("/tutor/profile", "PUT", custom)).status, 200);
  const unreviewed = await guest.request(`/tutors/${user.id}`);
  assert.equal(unreviewed.status, 200);
  assert.deepEqual(unreviewed.data.education_history, old.education_history);
  assert.equal(unreviewed.data.timezone, custom.timezone);
  const reopened = openDatabase(file);
  assert.deepEqual(JSON.parse(one(reopened, "SELECT education_history FROM tutors WHERE user_id=?", user.id).education_history), education_history);
  reopened.close();
  const legacy = { ...old }; delete legacy.timezone; delete legacy.education_history; delete legacy.profile_sections;
  assert.equal((await tutor.request("/tutor/profile", "PUT", legacy)).status, 200);
  const saved = (await tutor.request("/tutor/profile")).data;
  assert.equal(saved.timezone, custom.timezone); assert.deepEqual(saved.education_history, education_history); assert.deepEqual(saved.profile_sections, custom.profile_sections);
  const moderation = (await admin.request("/admin")).data.tutors.find(t => t.user_id === user.id);
  assert.deepEqual(moderation.education_history, education_history);
  assert.equal((await admin.request(`/admin/tutors/${user.id}`, "PATCH", { status: "approved", note: "" })).status, 200);
  const published = (await guest.request(`/tutors/${user.id}`)).data;
  assert.equal(published.timezone, custom.timezone); assert.deepEqual(published.education_history, education_history);
});

test("students customize their own profile and timezone without altering other accounts", async t => {
  const { client } = await fixture(t); const student = client(), other = client();
  await student.login("student"); await other.login("chau");
  assert.equal((await student.request("/account","PATCH",{name:"New name",goal:"Study Math",timezone:"Invalid/Zone"})).status,400);
  const response=await student.request("/account","PATCH",{name:"Phúc",goal:"Học Toán lớp 10",timezone:"Asia/Tokyo",role:"admin"});
  assert.equal(response.status,200); assert.equal(response.data.user.role,"student"); assert.equal(response.data.user.timezone,"Asia/Tokyo");
  assert.equal((await student.request("/auth/me")).data.user.name,"Phúc");
  assert.equal((await other.request("/auth/me")).data.user.timezone,"Asia/Ho_Chi_Minh");
});

test("weekly availability validates ownership, revisions and preserves cancelled booking history", async (t) => {
  const { client, db } = await fixture(t);
  const tutor = client(), student = client(), guest = client();
  const u = await tutor.login("chau"); await student.login("student");
  const path = "/tutor/availability";
  const blocks = [{ weekday: 0, hour: 0 }, { weekday: 0, hour: 2 }];
  const save = (revision, value = blocks) => tutor.request(path, "PUT", { revision, blocks: value });
  assert.equal((await guest.request(path, "PUT", { revision: 0, blocks })).status, 401);
  assert.equal((await student.request(path, "PUT", { revision: 0, blocks })).status, 403);
  for (const bad of [[{ weekday: 7, hour: 0 }], [{ weekday: 0, hour: 1.5 }], [{ weekday: 0, hour: 24 }], [...blocks, blocks[0]]])
    assert.equal((await save(0, bad)).status, 400);
  const oldSlots = all(db, "SELECT * FROM slots WHERE tutor_id=?", u.id);
  assert.ok(oldSlots.every(s => s.duration_minutes === 60 && s.source === "manual"));
  assert.equal((await save(0)).status, 200);
  assert.equal((await save(0, [])).status, 409);
  const profile = (await tutor.request("/tutor/profile")).data;
  assert.deepEqual(profile.weekly_schedule, { blocks, revision: 1 });
  const weekly = profile.slots.filter(s => s.source === "weekly");
  assert.ok(weekly.length >= 14 && weekly.length <= 16);
  assert.ok(weekly.every(s => s.duration_minutes === 60));
  const first = weekly[0];
  const local = new Date(Date.parse(first.starts_at) + 7 * 3600000);
  assert.equal(local.getUTCDay(), 1); assert.ok([0, 2].includes(local.getUTCHours()));
  await tutor.request("/tutor/profile");
  assert.equal(one(db, "SELECT count(*) n FROM slots WHERE tutor_id=? AND source='weekly'", u.id).n, weekly.length);
  const body = { slot_id: first.id, subject_id: "toan", mode: "online", note: "" };
  const booking = await student.request("/bookings", "POST", body);
  assert.equal(booking.status, 201);
  const snapshot = one(db, "SELECT * FROM bookings WHERE id=?", booking.data.id);
  assert.equal(snapshot.duration_minutes, 60);
  assert.equal(snapshot.rate, profile.rate);
  assert.equal((await tutor.request(`/tutor/slots/${first.id}`, "DELETE")).status, 409);
  assert.equal((await save(1, [])).status, 200);
  assert.equal(one(db, "SELECT available FROM slots WHERE id=?", first.id).available, 0);
  assert.equal((await tutor.request("/tutor/profile")).data.slots.find(s => s.id === first.id).reserved, 1);
  assert.equal((await tutor.request(`/bookings/${booking.data.id}`, "PATCH", { status: "accepted" })).status, 200);
  assert.equal((await student.request(`/bookings/${booking.data.id}`, "PATCH", { status: "cancelled" })).status, 200);
  assert.equal((await student.request("/bookings", "POST", body)).status, 400);
  assert.ok(!(await student.request(`/tutors/${u.id}`)).data.slots.some(s => s.id === first.id));
  assert.deepEqual(all(db, "SELECT * FROM slots WHERE tutor_id=? AND source='manual'", u.id), oldSlots);
  assert.equal((await save(2)).status, 200);
  assert.equal((await student.request("/bookings", "POST", body)).status, 201);
  assert.equal(one(db, "SELECT status FROM bookings WHERE id=?", booking.data.id).status, "cancelled");
});

test("two-hour intervals block overlaps, allow adjacent lessons and delay completion until the end", async (t) => {
  const { client, db } = await fixture(t);
  const tutor = client(), student = client();
  const u = await tutor.login("chau"); await student.login("student");
  const start = new Date(Date.now() + 40 * 86400000); start.setUTCMinutes(0, 0, 0);
  const make = (offset, duration) => Number(run(db, "INSERT INTO slots(tutor_id,starts_at,duration_minutes) VALUES (?,?,?)", u.id, new Date(+start + offset * 3600000).toISOString(), duration).lastInsertRowid);
  const first = make(0, 120), overlapBefore = make(-1, 120), overlapAfter = make(1, 60), adjacent = make(2, 120);
  const book = slot_id => student.request("/bookings", "POST", { slot_id, subject_id: "toan", mode: "online", note: "" });
  const result = await book(first); assert.equal(result.status, 201);
  assert.equal((await book(overlapBefore)).status, 409);
  assert.equal((await book(overlapAfter)).status, 409);
  assert.equal((await book(adjacent)).status, 201);
  assert.equal((await tutor.request(`/bookings/${result.data.id}`, "PATCH", { status: "accepted" })).status, 200);
  run(db, "UPDATE bookings SET starts_at=? WHERE id=?", new Date(Date.now() - 90 * 60000).toISOString(), result.data.id);
  assert.equal((await tutor.request(`/bookings/${result.data.id}`, "PATCH", { status: "completed" })).status, 409);
  run(db, "UPDATE bookings SET starts_at=? WHERE id=?", new Date(Date.now() - 121 * 60000).toISOString(), result.data.id);
  assert.equal((await tutor.request(`/bookings/${result.data.id}`, "PATCH", { status: "completed" })).status, 200);
  assert.equal(overlaps({ starts_at: start.toISOString(), duration_minutes: 120 }, { starts_at: new Date(+start + 7200000).toISOString(), duration_minutes: 60 }), false);
});

test("weekly horizon rolls forward and skips legacy slots without changing their duration", async (t) => {
  const { client, db } = await fixture(t);
  const tutor = client(); const u = await tutor.login("chau");
  const now = Date.parse("2030-01-06T00:00:00Z");
  run(db, "INSERT INTO weekly_availability(tutor_id,blocks,revision) VALUES (?,?,1)", u.id, JSON.stringify([{ weekday: 0, hour: 18 }]));
  const legacy = Number(run(db, "INSERT INTO slots(tutor_id,starts_at) VALUES (?,?)", u.id, "2030-01-07T11:00:00.000Z").lastInsertRowid);
  reconcileAvailability(db, u.id, now);
  let slots = all(db, "SELECT * FROM slots WHERE tutor_id=? AND source='weekly' AND available=1", u.id);
  assert.equal(slots.length, 7);
  assert.ok(!slots.some(s => s.starts_at === "2030-01-07T11:00:00.000Z"));
  assert.equal(one(db, "SELECT duration_minutes FROM slots WHERE id=?", legacy).duration_minutes, 60);
  reconcileAvailability(db, u.id, now + 7 * 86400000);
  slots = all(db, "SELECT * FROM slots WHERE tutor_id=? AND source='weekly' AND available=1", u.id);
  assert.equal(slots.length, 8);
  assert.ok(slots.some(s => s.starts_at === "2030-03-04T11:00:00.000Z"));
});


test("learner schedules are private, revision guarded and available to parents", async t => {
  const { client, db, file } = await fixture(t);
  const student = client(), parent = client(), tutor = client(), guest = client();
  const user = await student.login("student"); await tutor.login("chau");
  const path = "/account/availability", blocks = [{ weekday: 0, hour: 19 }, { weekday: 6, hour: 23 }];
  for (const method of ["GET", "PUT"]) {
    assert.equal((await guest.request(path, method, { revision: 0, blocks })).status, 401);
    assert.equal((await tutor.request(path, method, { revision: 0, blocks })).status, 403);
  }
  for (const bad of [[blocks[0], blocks[0]], [{ weekday: -1, hour: 0 }], [{ weekday: 0, hour: 1.5 }], [{ weekday: 6, hour: 24 }]])
    assert.equal((await student.request(path, "PUT", { revision: 0, blocks: bad })).status, 400);
  assert.equal((await student.request(path, "PUT", { revision: 0, blocks })).status, 200);
  assert.equal((await student.request(path, "PUT", { revision: 0, blocks: [] })).status, 409);
  assert.deepEqual((await student.request(path)).data, { revision: 1, blocks });
  const registered = await parent.request("/auth/register", "POST", { name: "Parent schedule", email: "parent-schedule@test.vn", password: "TestStudy2026!", role: "student" });
  run(db, "UPDATE users SET learner_type='parent',onboarding_step=3 WHERE id=?", registered.data.user.id);
  assert.deepEqual((await parent.request(path)).data, { revision: 0, blocks: [] });
  assert.equal((await parent.request(path, "PUT", { revision: 0, blocks: [blocks[1]], user_id: user.id })).status, 200);
  assert.deepEqual((await student.request(path)).data.blocks, blocks);
  const reopened = openDatabase(file);
  assert.deepEqual(JSON.parse(one(reopened, "SELECT blocks FROM learner_availability WHERE user_id=?", user.id).blocks), blocks);
  reopened.close();
  assert.equal((await student.request(path, "PUT", { revision: 1, blocks: [] })).status, 200);
});

test("admin grants inventory; only owned themes can be equipped without reopening review", async t => {
  const { client, db } = await fixture(t);
  const admin = client(), tutor = client(), student = client(), other = client(), guest = client();
  await admin.login("admin"); const user = await tutor.login("chau"); await student.login("student"); await other.login("linh");
  const grant = `/admin/tutors/${user.id}/themes/sage`;
  assert.equal((await guest.request(grant, "PUT")).status, 401);
  assert.equal((await tutor.request(grant, "PUT")).status, 403);
  assert.equal((await student.request("/tutor/theme", "PUT", { theme: "sage" })).status, 403);
  assert.equal((await tutor.request("/tutor/theme", "PUT", { theme: "sage" })).status, 403);
  const profile = (await tutor.request("/tutor/profile")).data;
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...profile, profile_theme: "sage" })).status, 403);
  assert.equal((await admin.request(grant, "PUT")).status, 200);
  assert.equal((await admin.request(grant, "PUT")).status, 200);
  assert.equal(one(db, "SELECT count(*) n FROM tutor_theme_inventory WHERE tutor_id=?", user.id).n, 1);
  assert.equal((await other.request("/tutor/theme", "PUT", { theme: "sage" })).status, 403);
  assert.equal((await tutor.request("/tutor/theme", "PUT", { theme: "sage" })).status, 200);
  const equipped = (await tutor.request("/tutor/profile")).data;
  assert.equal(equipped.status, "approved"); assert.equal(equipped.review_revision, profile.review_revision);
  assert.deepEqual(equipped.theme_inventory.map(t => t.id), ["paper", "sage"]);
  assert.equal((await guest.request(`/tutors/${user.id}`)).data.profile_theme, "sage");
  assert.equal((await tutor.request("/tutor/theme", "PUT", { theme: "custom" })).status, 400);
  assert.equal((await tutor.request("/tutor/theme", "PUT", { theme: "paper" })).status, 200);
});

test("review sends a template, rejects stale versions and requires explicit resubmission", async t => {
  const { client, db, emails } = await fixture(t);
  const admin = client(), tutor = client(); await admin.login("admin"); const user = await tutor.login("chau");
  const path = `/admin/tutors/${user.id}`, profile = (await tutor.request("/tutor/profile")).data;
  assert.equal((await tutor.request(path, "PATCH", { status: "approved" })).status, 403);
  assert.equal((await admin.request(path, "PATCH", { status: "rejected", revision: 999 })).status, 409);
  assert.equal(emails.length, 0);
  assert.equal((await admin.request(path, "PATCH", { status: "rejected", revision: profile.review_revision, note: "Do not store" })).status, 200);
  assert.equal(emails.length, 1); assert.equal(emails[0].kind, "profile_update");
  assert.equal(emails[0].to, user.email); assert.match(emails[0].link, /app\/studio\?tab=profile$/);
  assert.equal(one(db, "SELECT moderation_note FROM tutors WHERE user_id=?", user.id).moderation_note, "");
  assert.equal((await admin.request(path, "PATCH", { status: "rejected" })).status, 409);
  assert.equal(emails.length, 1);
  assert.equal((await tutor.request("/account", "PATCH", { name: "Updated Tutor", goal: "" })).status, 200);
  assert.equal((await tutor.request("/tutor/profile")).data.status, "rejected");
  assert.equal((await tutor.request("/tutor/profile", "PUT", profile)).status, 200);
  const revised = (await tutor.request("/tutor/profile")).data;
  assert.equal(revised.status, "pending");
  assert.equal((await admin.request(path, "PATCH", { status: "approved", revision: profile.review_revision })).status, 409);
  assert.equal((await admin.request(path, "PATCH", { status: "approved", revision: revised.review_revision })).status, 200);
});

test("operational settings apply at once and content edits keep the approved version public until reviewed", async t => {
  const { client, db } = await fixture(t);
  const tutor = client(), admin = client(), guest = client(), student = client(), other = client();
  const user = await tutor.login("chau"); await admin.login("admin"); await student.login("student"); await other.login("linh");
  const path = `/admin/tutors/${user.id}`, publicPath = `/tutors/${user.id}`;
  const original = (await tutor.request("/tutor/profile")).data;
  const stored = () => one(db, "SELECT status,published,review_revision,moderation_note FROM tutors WHERE user_id=?", user.id);

  // Saving without changes, or changing only operational settings, never leaves search.
  const baseRevision = stored().review_revision;
  let saved = await tutor.request("/tutor/profile", "PUT", original);
  assert.equal(saved.status, 200); assert.deepEqual(saved.data.review.changed, []);
  assert.equal(stored().status, "approved"); assert.equal(stored().review_revision, baseRevision);
  saved = await tutor.request("/tutor/profile", "PUT", { ...original, rate: original.rate + 20000, mode: "both", accepts_trial: true, timezone: "Asia/Bangkok" });
  assert.equal(saved.status, 200); assert.deepEqual(saved.data.review.changed, []);
  assert.equal(stored().status, "approved"); assert.equal(stored().published, null);
  const live = (await guest.request(publicPath)).data;
  assert.equal(live.rate, original.rate + 20000); assert.equal(live.mode, "both"); assert.equal(live.timezone, "Asia/Bangkok");
  assert.equal((await tutor.request("/account", "PATCH", { name: user.name, goal: "", timezone: "Asia/Ho_Chi_Minh" })).status, 200);
  assert.equal(stored().status, "approved");

  // A content edit hides nothing: students keep the approved text, the tutor sees the draft.
  const edit = { ...original, rate: original.rate + 20000, mode: "both", headline: "Tiêu đề mới chờ duyệt" };
  saved = await tutor.request("/tutor/profile", "PUT", edit);
  assert.deepEqual(saved.data.review.changed, ["headline"]); assert.equal(saved.data.review.status, "pending");
  assert.equal(stored().status, "pending");
  const duringReview = (await guest.request(publicPath)).data;
  assert.equal(duringReview.headline, original.headline);
  assert.equal(duringReview.published, undefined);
  assert.equal((await guest.request("/tutors")).data.find(x => x.user_id === user.id).headline, original.headline);
  const draft = (await tutor.request("/tutor/profile")).data;
  assert.equal(draft.headline, edit.headline); assert.equal(draft.published.headline, original.headline);
  assert.equal((await admin.request("/admin")).data.tutors.find(x => x.user_id === user.id).published.headline, original.headline);
  assert.equal((await admin.request(`${path}/preview`)).data.headline, edit.headline);

  // Further edits and operational changes keep the original snapshot.
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...edit, headline: "Tiêu đề sửa lần hai", rate: original.rate + 30000 })).status, 200);
  assert.equal((await guest.request(publicPath)).data.headline, original.headline);
  assert.equal((await guest.request(publicPath)).data.rate, original.rate + 30000);

  // Students can still send and the tutor can still accept while the edit waits.
  const blocks = [{ weekday: 0, hour: 19 }];
  await tutor.request("/tutor/availability", "PUT", { revision: (await tutor.request("/tutor/profile")).data.weekly_schedule.revision, blocks });
  const offer = { tutor_id: user.id, subject_id: "toan", mode: "online", blocks, note: "", ...offerPeriod() };
  const sent = await student.request("/offers", "POST", offer);
  assert.equal(sent.status, 201);
  assert.equal((await tutor.request(`/offers/${sent.data.id}`, "PATCH", { status: "accepted" })).status, 200);

  // Rejecting the revision asks for changes but leaves the approved version public; resubmitting queues it again.
  assert.equal((await admin.request(path, "PATCH", { status: "rejected" })).status, 200);
  assert.equal(stored().status, "rejected"); assert.notEqual(stored().published, null);
  assert.equal((await guest.request(publicPath)).data.headline, original.headline);
  assert.equal((await tutor.request("/tutor/profile", "PUT", (await tutor.request("/tutor/profile")).data)).status, 200);
  assert.equal(stored().status, "pending");

  // Approving publishes the draft and discards the snapshot.
  const queued = (await tutor.request("/tutor/profile")).data;
  assert.equal((await admin.request(path, "PATCH", { status: "approved", revision: queued.review_revision })).status, 200);
  assert.equal(stored().published, null);
  assert.equal((await guest.request(publicPath)).data.headline, "Tiêu đề sửa lần hai");

  // Editing the display name, or the photo, still hides the profile until review.
  assert.equal((await tutor.request("/account", "PATCH", { name: "Tên mới cần duyệt", goal: "" })).status, 200);
  assert.equal((await guest.request(publicPath)).status, 404);
  assert.equal((await admin.request(path, "PATCH", { status: "approved" })).status, 200);
  assert.equal((await guest.request(publicPath)).status, 200);

  // A takedown removes the old version too, even if the tutor edits afterwards.
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...(await tutor.request("/tutor/profile")).data, bio: "Giới thiệu mới sau khi đã duyệt" })).status, 200);
  assert.equal((await admin.request(path, "PATCH", { status: "withdrawn" })).status, 200);
  assert.equal(stored().published, null);
  assert.equal((await guest.request(publicPath)).status, 404);
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...(await tutor.request("/tutor/profile")).data, bio: "Gia sư tự sửa sau khi bị gỡ" })).status, 200);
  assert.equal((await guest.request(publicPath)).status, 404);
});

test("a tutor without a published version cannot confirm new lessons", async t => {
  const { client, db } = await fixture(t);
  const tutor = client(), student = client(), other = client();
  const user = await tutor.login("chau"); await student.login("student"); await other.login("linh");
  const start = new Date(Math.ceil((Date.now() + 3 * 3600000) / 3600000) * 3600000).toISOString();
  assert.equal((await tutor.request("/tutor/slots", "POST", { starts_at: start })).status, 201);
  const slot = (await student.request(`/tutors/${user.id}`)).data.slots.find(s => s.starts_at === start);
  const booking = await student.request("/bookings", "POST", { slot_id: slot.id, subject_id: "toan", mode: "online", note: "" });
  assert.equal(booking.status, 201);
  run(db, "UPDATE tutors SET status='pending', published=NULL WHERE user_id=?", user.id);
  assert.equal((await tutor.request(`/bookings/${booking.data.id}`, "PATCH", { status: "accepted" })).status, 409);
  assert.equal((await tutor.request(`/bookings/${booking.data.id}`, "PATCH", { status: "declined" })).status, 200);
});

test("review email failure and edits during delivery never overwrite a profile", async t => {
  let send = async () => { throw new Error("mail unavailable"); };
  const { client } = await fixture(t, { sendEmail: message => send(message) });
  const admin = client(), tutor = client(); await admin.login("admin"); const user = await tutor.login("chau");
  const path = `/admin/tutors/${user.id}`;
  const initial = (await tutor.request("/tutor/profile")).data;
  assert.equal((await admin.request(path, "PATCH", { status: "rejected" })).status, 503);
  assert.equal((await tutor.request("/tutor/profile")).data.status, "approved");
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  send = async () => { entered(); await new Promise(resolve => { release = resolve; }); };
  const pending = admin.request(path, "PATCH", { status: "rejected", revision: initial.review_revision });
  await started;
  assert.equal((await admin.request(path, "PATCH", { status: "approved" })).status, 409);
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...initial, headline: "Updated during email delivery" })).status, 200);
  release();
  assert.equal((await pending).status, 409);
  const current = (await tutor.request("/tutor/profile")).data;
  assert.equal(current.status, "pending"); assert.equal(current.headline, "Updated during email delivery");
});

test("two-hour migration expands rules once and preserves reserved booking snapshots", async t => {
  const { client, db } = await fixture(t);
  const tutor = client(), student = client(); const user = await tutor.login("chau"), learner = await student.login("student");
  db.exec("ALTER TABLE weekly_availability DROP COLUMN interval_minutes");
  run(db, "INSERT INTO weekly_availability(tutor_id,blocks,revision) VALUES (?,?,3)", user.id, JSON.stringify([{ weekday: 0, hour: 18 }]));
  const start = "2030-01-07T11:00:00.000Z", now = Date.parse("2030-01-06T00:00:00Z");
  const slot = Number(run(db, "INSERT INTO slots(tutor_id,starts_at,duration_minutes,source) VALUES (?,?,120,'weekly')", user.id, start).lastInsertRowid);
  const booking = Number(run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,duration_minutes) VALUES (?,?,?,'toan',?,200000,'online',120)", learner.id, user.id, slot, start).lastInsertRowid);
  migrateDatabase(db); migrateDatabase(db);
  const rule = one(db, "SELECT * FROM weekly_availability WHERE tutor_id=?", user.id);
  assert.deepEqual(JSON.parse(rule.blocks), [{ weekday: 0, hour: 18 }, { weekday: 0, hour: 19 }]);
  assert.equal(rule.revision, 4);
  reconcileAvailability(db, user.id, now);
  assert.equal(one(db, "SELECT duration_minutes FROM slots WHERE id=?", slot).duration_minutes, 120);
  assert.equal(one(db, "SELECT count(*) n FROM slots WHERE tutor_id=? AND starts_at='2030-01-07T12:00:00.000Z'", user.id).n, 0);
  run(db, "UPDATE bookings SET status='cancelled' WHERE id=?", booking);
  reconcileAvailability(db, user.id, now);
  assert.equal(one(db, "SELECT duration_minutes FROM slots WHERE id=?", slot).duration_minutes, 60);
  assert.equal(one(db, "SELECT count(*) n FROM slots WHERE tutor_id=? AND starts_at='2030-01-07T12:00:00.000Z' AND duration_minutes=60 AND available=1", user.id).n, 1);
  assert.equal(one(db, "SELECT duration_minutes FROM bookings WHERE id=?", booking).duration_minutes, 120);
});

test("weekly requests validate availability, keep participants private, prevent conflicts and start chat", async t => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(), outsider = client(), admin = client(), guest = client();
  await student.login("student"); const teacher = await tutor.login("chau"); await admin.login("admin");
  await outsider.request("/auth/register", "POST", { name: "Another learner", email: "weekly-other@test.vn", password: "TestStudy2026!" });
  const blocks = [{ weekday: 0, hour: 19 }, { weekday: 2, hour: 20 }];
  await tutor.request("/tutor/availability", "PUT", { revision: 0, blocks });
  const data = { tutor_id: teacher.id, subject_id: "toan", mode: "online", blocks, note: "Ôn Toán" };
  assert.equal((await guest.request("/weekly-requests", "POST", data)).status, 401);
  assert.equal((await student.request("/weekly-requests", "POST", { ...data, blocks: [] })).status, 400);
  assert.equal((await student.request("/weekly-requests", "POST", { ...data, blocks: [blocks[0], blocks[0]] })).status, 400);
  assert.equal((await student.request("/weekly-requests", "POST", { ...data, blocks: [{ weekday: 1, hour: 3 }] })).status, 409);
  const created = await student.request("/weekly-requests", "POST", data);
  assert.equal(created.status, 201);
  assert.equal((await student.request("/weekly-requests", "POST", data)).status, 409);
  assert.equal((await tutor.request("/weekly-requests")).data.length, 1);
  assert.equal((await outsider.request("/weekly-requests")).data.length, 0);
  assert.equal((await outsider.request(`/weekly-requests/${created.data.id}`, "PATCH", { status: "accepted" })).status, 404);
  assert.equal((await student.request(`/weekly-requests/${created.data.id}`, "PATCH", { status: "accepted" })).status, 403);
  assert.equal((await student.request(`/inquiries/${created.data.inquiry_id}/messages`)).data[0].body.includes("Thứ 2 19:00"), true);
  const other = await outsider.request("/weekly-requests", "POST", data);
  assert.equal((await tutor.request(`/weekly-requests/${created.data.id}`, "PATCH", { status: "accepted" })).status, 200);
  assert.equal((await tutor.request(`/weekly-requests/${other.data.id}`, "PATCH", { status: "accepted" })).status, 409);
  assert.equal((await guest.request(`/tutors/${teacher.id}`)).data.weekly_blocks.length, 0);
  assert.equal((await student.request(`/weekly-requests/${created.data.id}`, "PATCH", { status: "cancelled" })).status, 200);
  assert.equal((await tutor.request(`/weekly-requests/${other.data.id}`, "PATCH", { status: "accepted" })).status, 200);
  assert.equal((await guest.request(`/admin/tutors/${teacher.id}/preview`)).status, 401);
  assert.equal((await student.request(`/admin/tutors/${teacher.id}/preview`)).status, 403);
  run(db, "UPDATE tutors SET status='pending' WHERE user_id=?", teacher.id);
  assert.equal((await guest.request(`/tutors/${teacher.id}`)).status, 404);
  const preview = await admin.request(`/admin/tutors/${teacher.id}/preview`);
  assert.equal(preview.status, 200); assert.ok(Array.isArray(preview.data.reviews)); assert.ok(Array.isArray(preview.data.weekly_blocks));
  assert.equal(preview.data.email, undefined);
});

test("support is pinned per user, private between owners, and shared with administrators", async t => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(), admin = client(), guest = client();
  await student.login("student"); await tutor.login("chau"); await admin.login("admin");
  assert.equal((await guest.request("/support")).status, 401);
  const a = (await student.request("/support")).data[0];
  assert.equal((await student.request("/support")).data[0].id, a.id);
  const b = (await tutor.request("/support")).data[0];
  assert.notEqual(a.id, b.id);
  assert.equal((await tutor.request(`/support/${a.id}/messages`)).status, 404);
  assert.equal((await tutor.request(`/support/${a.id}/messages`, "POST", { body: "Unauthorized" })).status, 404);
  assert.equal((await student.request(`/support/${a.id}/messages`, "POST", { body: "Cần hỗ trợ lịch học" })).status, 201);
  assert.equal((await admin.request("/support")).data.length, 1);
  assert.equal((await admin.request(`/support/${a.id}/messages`, "POST", { body: "Admin đã nhận yêu cầu" })).status, 201);
  assert.equal((await student.request(`/support/${a.id}/messages`)).data.at(-1).body, "Admin đã nhận yêu cầu");
  run(db, "UPDATE users SET status='suspended' WHERE id=?", a.user_id);
  assert.equal((await admin.request(`/support/${a.id}/messages`, "POST", { body: "Không gửi" })).status, 409);
});

test("contact includes validated free hours without reserving weekly or dated lessons", async t => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(); await student.login("student"); const teacher = await tutor.login("chau");
  const blocks = [{ weekday: 0, hour: 19 }];
  await tutor.request("/tutor/availability", "PUT", { revision: 0, blocks });
  const before = one(db, "SELECT COUNT(*) AS n FROM bookings").n;
  const data = { tutor_id: teacher.id, body: "Em muốn trao đổi", subject_id: "toan", mode: "online", blocks };
  assert.equal((await student.request("/inquiries", "POST", { ...data, blocks: [{weekday:1,hour:3}] })).status, 409);
  assert.equal((await student.request("/inquiries", "POST", { ...data, subject_id: "not-offered" })).status, 400);
  const r = await student.request("/inquiries", "POST", data);
  assert.equal(r.status, 201);
  const message = (await tutor.request(`/inquiries/${r.data.id}/messages`)).data.at(-1).body;
  assert.match(message, /Môn học: Toán/); assert.match(message, /Thứ 2 19:00–20:00/);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM weekly_requests").n, 0);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM bookings").n, before);
  assert.equal((await student.request("/inquiries", "POST", { tutor_id:teacher.id,body:"Trao đổi khi chưa chọn giờ" })).status, 201);
});

test("admin deletion erases profile data, revokes access and preserves anonymous message history", async t => {
  const { client, db } = await fixture(t);
  const admin = client(), student = client(), tutor = client();
  const administrator = await admin.login("admin"), learner = await student.login("student"), teacher = await tutor.login("chau");
  const thread = (await student.request("/inquiries", "POST", { tutor_id: teacher.id, body: "Trao đổi được giữ lại" })).data;
  const support = (await tutor.request("/support")).data[0];
  const slot = one(db,"SELECT * FROM slots WHERE tutor_id=? ORDER BY id LIMIT 1",teacher.id);
  const booking = Number(run(db,"INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode) VALUES (?,?,?,'toan',?,150000,'online')",learner.id,teacher.id,slot.id,slot.starts_at).lastInsertRowid);
  await tutor.request(`/support/${support.id}/messages`, "POST", { body: "Lịch sử hỗ trợ" });
  const { saveUpload } = await import("../server/uploads.js");
  const upload = saveUpload(db, teacher.id, "photo", Buffer.from("test-image"), "image/webp", "personal.webp");
  run(db, "INSERT INTO oauth_identities VALUES ('google','deleted-subject',?)", teacher.id);
  await tutor.request("/tutor/availability", "PUT", { revision:0,blocks:[{weekday:0,hour:19}] });
  const weekly = await student.request("/weekly-requests", "POST", { tutor_id:teacher.id,subject_id:"toan",mode:"online",blocks:[{weekday:0,hour:19}] });
  assert.equal(weekly.status,201);
  await tutor.request(`/weekly-requests/${weekly.data.id}`, "PATCH", { status:"accepted" });
  assert.equal((await student.request(`/admin/users/${teacher.id}`, "DELETE", { email:teacher.email })).status,403);
  assert.equal((await admin.request(`/admin/users/${administrator.id}`, "DELETE", { email:administrator.email })).status,403);
  assert.equal((await admin.request(`/admin/users/${teacher.id}`, "DELETE", { email:learner.email })).status,400);
  assert.equal((await admin.request(`/admin/users/${teacher.id}`, "DELETE", { email:teacher.email }, { Origin:"https://evil.test" })).status,403);
  assert.equal((await admin.request(`/admin/users/${teacher.id}`, "DELETE", { email:teacher.email })).status,200);
  const deleted = one(db,"SELECT * FROM users WHERE id=?",teacher.id);
  assert.equal(deleted.status,"deleted"); assert.equal(deleted.name,"Tài khoản đã xóa"); assert.notEqual(deleted.email,teacher.email); assert.equal(deleted.password,"");
  assert.equal((await tutor.request("/auth/me")).data.user,null);
  assert.equal(one(db,"SELECT * FROM oauth_identities WHERE user_id=?",teacher.id),undefined);
  assert.equal(one(db,"SELECT * FROM tutor_uploads WHERE id=?",upload),undefined);
  assert.equal(one(db,"SELECT * FROM upload_chunks WHERE upload_id=?",upload),undefined);
  assert.equal(one(db,"SELECT status FROM weekly_requests WHERE id=?",weekly.data.id).status,"cancelled");
  assert.equal(one(db,"SELECT status FROM bookings WHERE id=?",booking).status,"cancelled");
  assert.equal((await student.request(`/tutors/${teacher.id}`)).status,404);
  assert.equal((await student.request(`/inquiries/${thread.id}/messages`)).data[0].body,"Trao đổi được giữ lại");
  assert.equal((await admin.request(`/support/${support.id}/messages`)).data[0].name,"Tài khoản đã xóa");
  assert.equal((await admin.request(`/admin/users/${teacher.id}`, "PATCH", {status:"active"})).status,404);
  assert.equal((await admin.request(`/admin/users/${teacher.id}`, "DELETE", {email:teacher.email})).status,404);
  assert.equal((await admin.request("/admin")).data.users.some(u=>u.id===teacher.id),false);
  assert.ok(one(db,"SELECT id FROM audit WHERE action='user.deleted' AND target=?",String(teacher.id)));
});

function offerPeriod(offset = 21) {
  const start = new Date(Date.now() + offset * 86400000);
  start.setUTCDate(start.getUTCDate() + (8 - start.getUTCDay()) % 7);
  const start_date = start.toISOString().slice(0, 10);
  return { start_date, weeks: 2 };
}

test("dated offers preview, accept into real lessons, share notes and preserve history on cancellation", async t => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(), outsider = client();
  await student.login("student"); const teacher = await tutor.login("chau"); await outsider.login("linh");
  const blocks = [{weekday:0,hour:19},{weekday:2,hour:19}];
  await tutor.request("/tutor/availability", "PUT", {revision:0,blocks});
  const data = { tutor_id:teacher.id,subject_id:"toan",mode:"online",blocks,note:"Ôn thi",...offerPeriod() };
  const preview = await student.request("/offers/preview", "POST", data);
  assert.equal(preview.status,200); assert.equal(preview.data.sessions.length,4); assert.equal(preview.data.conflict_count,0);
  assert.equal(preview.data.sessions[0].starts_at,`${data.start_date}T12:00:00.000Z`);
  const before = one(db,"SELECT COUNT(*) n FROM bookings").n;
  const created = await student.request("/offers", "POST", data);
  assert.equal(created.status,201); assert.equal(one(db,"SELECT COUNT(*) n FROM bookings").n,before);
  const path = `/offers/${created.data.id}`;
  assert.equal((await student.request("/offers")).data[0].status,"pending");
  assert.equal((await tutor.request(path)).data.sessions.length,4);
  assert.equal((await outsider.request(path)).status,404);
  assert.equal((await outsider.request(path,"PATCH",{status:"accepted"})).status,404);
  assert.equal((await student.request(path,"PATCH",{status:"accepted"})).status,403);
  assert.equal((await tutor.request(path,"PATCH",{status:"accepted"})).status,200);
  assert.equal((await tutor.request(path,"PATCH",{status:"accepted"})).status,409);
  const lessons = (await student.request("/bookings")).data.filter(b=>b.offer_id===created.data.id);
  assert.equal(lessons.length,4); assert.ok(lessons.every(b=>b.status==="accepted" && b.duration_minutes===60 && b.inquiry_id===created.data.inquiry_id));
  const lesson = lessons[0];
  assert.equal((await student.request(`/bookings/${lesson.id}/lesson`,"PATCH",{lesson_note:"bad",meeting_url:""})).status,403);
  assert.equal((await tutor.request(`/bookings/${lesson.id}/lesson`,"PATCH",{lesson_note:"Ôn phương trình, bài tập 1–5",meeting_url:"https://meet.google.com/lesson"})).status,200);
  assert.equal((await student.request("/bookings")).data.find(b=>b.id===lesson.id).lesson_note,"Ôn phương trình, bài tập 1–5");
  run(db,"UPDATE bookings SET status='completed' WHERE id=?",lesson.id);
  assert.equal((await student.request(path,"PATCH",{status:"cancelled"})).status,200);
  const retained = all(db,"SELECT status,lesson_note FROM bookings WHERE offer_id=?",created.data.id);
  assert.equal(retained.filter(b=>b.status==="cancelled").length,3);
  assert.equal(retained.find(b=>b.status==="completed").lesson_note,"Ôn phương trình, bài tập 1–5");
});

test("offers reject invalid dates and availability, recheck conflicts atomically and allow later date ranges", async t => {
  const { client, db } = await fixture(t);
  const student=client(), other=client(), tutor=client(); await student.login("student"); const teacher=await tutor.login("chau");
  await other.request("/auth/register","POST",{name:"Second Learner",email:"second-offer@example.com",password:"TestStudy2026!",role:"student"});
  const blocks=[{weekday:0,hour:19}];
  await tutor.request("/tutor/availability","PUT",{revision:0,blocks});
  const data={tutor_id:teacher.id,subject_id:"toan",mode:"online",blocks,...offerPeriod()};
  for (const invalid of [{start_date:"2030-02-30"},{weeks:0},{weeks:53},{weeks:1.5},{weeks:"4"},{end_date:"2099-01-01"},{blocks:[]},{blocks:[{weekday:2,hour:19}]}]) assert.ok((await student.request("/offers","POST",{...data,...invalid})).status>=400);
  const a=await student.request("/offers","POST",data),b=await other.request("/offers","POST",data);
  assert.equal(a.status,201); assert.equal(b.status,201);
  const accepted=await Promise.all([a,b].map(r=>tutor.request(`/offers/${r.data.id}`,"PATCH",{status:"accepted"})));
  assert.deepEqual(accepted.map(r=>r.status).sort(),[200,409]);
  const winner=accepted[0].status===200?a:b,loser=accepted[0].status===200?b:a;
  assert.equal(all(db,"SELECT id FROM bookings WHERE offer_id=?",winner.data.id).length,2);
  assert.equal(all(db,"SELECT id FROM bookings WHERE offer_id=?",loser.data.id).length,0);
  const check=(await tutor.request(`/offers/${loser.data.id}`)).data;
  assert.equal(check.conflict_count,2); assert.match(check.sessions[0].conflict,/Gia sư/);
  assert.equal((await tutor.request(`/offers/${loser.data.id}`,"PATCH",{status:"declined"})).status,200);
  const later=await student.request("/offers","POST",{...data,...offerPeriod(70)});
  assert.equal(later.status,201);
  assert.equal((await tutor.request(`/offers/${later.data.id}`,"PATCH",{status:"accepted"})).status,200);
  const changed=await other.request("/offers","POST",{...data,...offerPeriod(100)});
  assert.equal(changed.status,201);
  await tutor.request("/tutor/availability","PUT",{revision:1,blocks:[]});
  assert.equal((await tutor.request(`/offers/${changed.data.id}`,"PATCH",{status:"accepted"})).status,409);
});

test("profile steps save address and calendar atomically and reject invalid or stale schedules", async t => {
  const { client, db } = await fixture(t);
  const tutor = client(); const user = await tutor.login("chau");
  const original = (await tutor.request("/tutor/profile")).data;
  const payload = { ...original, headline: "Hồ sơ theo bước", province_code: "1", ward_code: "4", availability: { revision: 0, blocks: [{ weekday: 0, hour: 18 }] } };
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...payload, ward_code: "99999" })).status, 400);
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...payload, availability: { ...payload.availability, blocks: [{ weekday: 0, hour: 25 }] } })).status, 400);
  assert.equal(one(db, "SELECT headline FROM tutors WHERE user_id=?", user.id).headline, original.headline);
  assert.equal((await tutor.request("/tutor/profile", "PUT", payload)).status, 200);
  const saved = (await tutor.request("/tutor/profile")).data;
  assert.equal(saved.location, "Phường Ba Đình, Thành phố Hà Nội");
  assert.equal(saved.ward_code, "4"); assert.equal(saved.status, "pending");
  assert.deepEqual(saved.weekly_schedule, { revision: 1, blocks: [{ weekday: 0, hour: 18 }] });
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...payload, headline: "Stale tab must not overwrite" })).status, 409);
  assert.equal(one(db, "SELECT headline FROM tutors WHERE user_id=?", user.id).headline, payload.headline);
});

test("admin can take down and restore a tutor without deleting accounts or history", async t => {
  const { client, db } = await fixture(t);
  const admin = client(), tutor = client(), student = client(), guest = client();
  await admin.login("admin"); const teacher = await tutor.login("chau"); await student.login("student");
  const path = `/admin/tutors/${teacher.id}`, original = (await tutor.request("/tutor/profile")).data;
  const bookings = all(db, "SELECT * FROM bookings WHERE tutor_id=?", teacher.id);
  assert.equal((await tutor.request(path, "PATCH", { status: "withdrawn" })).status, 403);
  assert.equal((await guest.request(path, "PATCH", { status: "withdrawn" })).status, 401);
  assert.equal((await admin.request(path, "PATCH", { status: "withdrawn", revision: 999 })).status, 409);
  assert.equal((await admin.request(path, "PATCH", { status: "withdrawn", revision: original.review_revision })).status, 200);
  assert.equal((await guest.request(`/tutors/${teacher.id}`)).status, 404);
  assert.equal((await guest.request("/tutors")).data.some(t => t.user_id === teacher.id), false);
  assert.equal((await tutor.request("/auth/me")).data.user.id, teacher.id);
  assert.deepEqual(all(db, "SELECT * FROM bookings WHERE tutor_id=?", teacher.id), bookings);
  assert.equal((await student.request("/inquiries", "POST", { tutor_id: teacher.id, body: "Tư vấn" })).status, 404);
  assert.equal((await admin.request(path, "PATCH", { status: "approved", revision: original.review_revision + 1 })).status, 200);
  assert.equal((await guest.request(`/tutors/${teacher.id}`)).status, 200);
  assert.ok(one(db, "SELECT * FROM audit WHERE action='tutor.withdrawn' AND target=?", String(teacher.id)));
});

test("student school and ward are private, validated and persist across sessions", async t => {
  const { client } = await fixture(t);
  const student = client(); const user = await student.login("student");
  const fields = { name: user.name, goal: "", school: "THCS Ba Đình", province_code: "1", ward_code: "4" };
  assert.equal((await student.request("/account", "PATCH", { ...fields, province_code: "79" })).status, 400);
  assert.equal((await student.request("/account", "PATCH", fields)).status, 200);
  await student.request("/auth/logout", "POST");
  const saved = await student.login("student");
  assert.equal(saved.school, fields.school); assert.equal(saved.province_code, "1"); assert.equal(saved.ward_code, "4");
  // Unrelated legacy account edits preserve the new fields.
  assert.equal((await student.request("/account", "PATCH", { name: user.name, goal: "Toán" })).status, 200);
  assert.equal((await student.request("/auth/me")).data.user.school, fields.school);
});

test("message context persists for both participants and rejects content from another conversation", async t => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(), other = client(), outsider = client();
  await student.login("student"); const teacher = await tutor.login("chau"); await outsider.login("linh");
  await other.request("/auth/register", "POST", { name: "Other learner", email: "context-other@example.com", password: "TestStudy2026!", role: "student" });
  const blocks = [{ weekday: 0, hour: 19 }];
  await tutor.request("/tutor/availability", "PUT", { revision: 0, blocks });
  const input = { tutor_id: teacher.id, subject_id: "toan", mode: "online", blocks, ...offerPeriod() };
  const offer = (await student.request("/offers", "POST", input)).data;
  const otherOffer = (await other.request("/offers", "POST", input)).data;
  const path = `/inquiries/${offer.inquiry_id}`;
  const context = { kind: "offer", id: offer.id };
  assert.equal((await student.request(`${path}/context/offer/${offer.id}`)).data.subject_name, "Toán");
  assert.equal((await outsider.request(`${path}/context/offer/${offer.id}`)).status, 404);
  assert.equal((await other.request(`${path}/messages`)).status, 404);
  assert.equal((await student.request(`${path}/messages`, "POST", { body: "Em muốn trao đổi lịch này", context })).status, 201);
  const received = (await tutor.request(`${path}/messages`)).data.at(-1);
  assert.equal(received.context.id, offer.id);
  assert.equal(received.context.kind, "offer");
  assert.equal(received.context.start_date, input.start_date);
  for (const sender of [student, tutor]) {
    assert.equal((await sender.request(`${path}/messages`, "POST", { body: "Wrong conversation", context: { kind: "offer", id: otherOffer.id } })).status, 404);
    assert.equal((await sender.request(`${path}/context/offer/${otherOffer.id}`)).status, 404);
  }
  for (const context of [{ kind: "offer", id: 999999 }, { kind: "lesson", id: 999999 }]) {
    assert.equal((await student.request(`${path}/messages`, "POST", { body: "Missing", context })).status, 404);
  }
  for (const context of [{ kind: "offer", id: 0 }, { kind: "support", id: 1 }, { kind: "offer", id: offer.id, href: "https://evil.invalid" }]) {
    assert.equal((await student.request(`${path}/messages`, "POST", { body: "Invalid", context })).status, 400);
  }
  assert.equal((await tutor.request(`${path}/messages`)).data.length, 1);
  assert.equal((await tutor.request(`/offers/${offer.id}`, "PATCH", { status: "accepted" })).status, 200);
  const lesson = (await student.request("/bookings")).data.find(b => b.offer_id === offer.id);
  assert.equal((await tutor.request(`${path}/messages`, "POST", { body: "Bài tập của buổi này", context: { kind: "lesson", id: lesson.id } })).status, 201);
  const lessonMessage = (await student.request(`${path}/messages`)).data.at(-1);
  assert.equal(lessonMessage.context.starts_at, lesson.starts_at);
  assert.equal(lessonMessage.context.duration_minutes, 60);
  assert.equal((await tutor.request(`${path}/messages`, "POST", { body: "Trao đổi chung" })).status, 201);
  assert.equal((await student.request(`${path}/messages`)).data.at(-1).context, null);
  await student.request(`/offers/${offer.id}`, "PATCH", { status: "cancelled" });
  assert.equal((await student.request(`${path}/messages`)).data[0].context.status, "cancelled");
  const weekly = (await student.request("/weekly-requests", "POST", { tutor_id: teacher.id, subject_id: "toan", mode: "online", blocks })).data;
  const weeklyMessage = (await tutor.request(`${path}/messages`)).data.at(-1);
  assert.equal(weeklyMessage.context.kind, "weekly-request");
  assert.equal(weeklyMessage.context.id, weekly.id);
  assert.deepEqual(weeklyMessage.context.blocks, blocks);
  // Old per-lesson conversations have an implicit, immutable lesson context.
  await student.request(`/bookings/${lesson.id}/messages`, "POST", { body: "Old lesson thread" });
  assert.equal((await tutor.request(`/bookings/${lesson.id}/messages`)).data[0].context.id, lesson.id);
  run(db, "UPDATE inquiry_messages SET context_id=999999 WHERE id=?", received.id);
  const unavailable = (await student.request(`${path}/messages`)).data[0];
  assert.equal(unavailable.context, null);
  assert.equal(unavailable.context_kind, "offer");
});

test("message context migration preserves existing plain messages and can run twice", async t => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client();
  await student.login("student"); const teacher = await tutor.login("chau");
  const thread = (await student.request("/inquiries", "POST", { tutor_id: teacher.id, body: "Existing message" })).data;
  db.exec("ALTER TABLE inquiry_messages DROP COLUMN context_kind");
  db.exec("ALTER TABLE inquiry_messages DROP COLUMN context_id");
  migrateDatabase(db); migrateDatabase(db);
  const messages = (await tutor.request(`/inquiries/${thread.id}/messages`)).data;
  assert.equal(messages[0].body, "Existing message");
  assert.equal(messages[0].context, null);
});

test("catalog removal keeps lesson history and survives reseeding", async t => {
  const { db, client } = await fixture(t), admin = client(), student = client();
  await admin.login("admin"); await student.login("student");
  const old = all(db, "SELECT id FROM bookings WHERE subject_id='toan'");
  const resource = one(db, "SELECT id FROM resources WHERE subject_id='toan'");
  assert.equal((await student.request("/admin/subjects/toan", "DELETE")).status, 403);
  assert.equal((await admin.request(`/admin/resources/${resource.id}`, "DELETE")).status, 200);
  assert.equal((await admin.request("/admin/subjects/toan", "DELETE")).status, 200);
  seedCatalog(db); migrateDatabase(db);
  assert.ok(!(await student.request("/subjects")).data.some(s => s.id === "toan"));
  assert.ok(!(await student.request("/resources")).data.some(r => r.subject_id === "toan"));
  assert.ok(!(await admin.request("/admin")).data.resources.some(r => r.subject_id === "toan"));
  assert.ok(all(db, "SELECT subjects FROM tutors").every(t => !JSON.parse(t.subjects).includes("toan")));
  assert.equal(all(db, "SELECT id FROM bookings WHERE subject_id='toan'").length, old.length);
  assert.equal((await admin.request("/admin/subjects/toan", "PUT", { name: "Toán", stage: "THPT", description: "Môn học" })).status, 409);
});

test("chat attachments remain private and bind only to the sender's thread", async t => {
  const { db, base, client } = await fixture(t), student = client(), tutor = client(), other = client(), admin = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  await other.login("nam"); await admin.login("admin");
  const inquiry = (await student.request("/inquiries", "POST", { tutor_id: teacher.id, body: "Chào thầy" })).data;
  const otherInquiry = (await student.request("/inquiries", "POST", { tutor_id: one(db,"SELECT id FROM users WHERE email='nam@demo.giasu.test'").id, body: "Chào thầy" })).data;
  const path = `/chat/inquiry/${inquiry.id}/attachments`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/aB9sAAAAASUVORK5CYII=", "base64");
  // Generate a valid image through the same decoder used by profile uploads.
  const sharp = (await import("sharp")).default;
  const image = await sharp({create:{width:10,height:10,channels:3,background:"red"}}).png().toBuffer();
  const upload = (who, url, data, type) => fetch(base+url, {method:"POST",headers:{Cookie:who.cookie,"Content-Type":type},body:data});
  assert.equal((await upload(other,path,image,"image/png")).status,404);
  assert.equal((await upload(student,path,png,"image/svg+xml")).status,400);
  assert.equal((await upload(student,path,Buffer.from("fake"),"audio/mpeg")).status,400);
  assert.equal((await upload(student,path,Buffer.alloc(8*1024*1024+1),"audio/wav")).status,413);
  const response = await upload(student,path,image,"image/png"); assert.equal(response.status,201);
  const attachment = await response.json();
  const read = (who, headers={}) => fetch(new URL(attachment.url, base),{headers:{Cookie:who?.cookie || "",...headers}});
  assert.equal((await read()).status,401);
  assert.equal((await read(tutor)).status,404); // draft is sender-only
  assert.equal((await student.request(`/inquiries/${otherInquiry.id}/messages`,"POST",{attachment_id:attachment.id})).status,400);
  assert.equal((await tutor.request(`/inquiries/${inquiry.id}/messages`,"POST",{attachment_id:attachment.id})).status,400);
  assert.equal((await student.request(`/inquiries/${inquiry.id}/messages`,"POST",{attachment_id:attachment.id})).status,201);
  assert.equal((await read(tutor)).status,200);
  assert.equal((await read(other)).status,404);
  assert.equal((await read(admin)).status,404);
  const ranged = await read(tutor,{Range:"bytes=0-9"}); assert.equal(ranged.status,206); assert.equal((await ranged.arrayBuffer()).byteLength,10);
  assert.equal((await read(tutor,{Range:"bytes=999999-"})).status,416);
  const messages = (await tutor.request(`/inquiries/${inquiry.id}/messages`)).data;
  assert.equal(messages.at(-1).attachment.id,attachment.id);
  assert.equal((await student.request(`/inquiries/${inquiry.id}/messages`,"POST",{attachment_id:attachment.id})).status,400);
  const support = (await student.request("/support")).data[0];
  assert.equal((await admin.request("/support")).data.length,0);
  const wav = Buffer.alloc(48); wav.write("RIFF"); wav.write("WAVE",8);
  const voice = await (await upload(student,`/chat/support/${support.id}/attachments`,wav,"audio/wav")).json();
  assert.equal((await student.request(`/support/${support.id}/messages`,"POST",{attachment_id:voice.id})).status,201);
  assert.equal((await admin.request("/support")).data.length,1);
  assert.equal((await admin.request(`/support/${support.id}/messages`)).data.at(-1).attachment.kind,"audio");
  const slot = one(db, "SELECT * FROM slots WHERE tutor_id=? LIMIT 1", teacher.id);
  const booking = { id: Number(run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode) VALUES (?,?,?,'toan',?,180000,'online')", learner.id, teacher.id, slot.id, slot.starts_at).lastInsertRowid) };
  const lessonVoice = await (await upload(tutor,`/chat/lesson/${booking.id}/attachments`,wav,"audio/wav")).json();
  assert.equal((await tutor.request(`/bookings/${booking.id}/messages`,"POST",{attachment_id:lessonVoice.id})).status,201);
  assert.equal((await student.request(`/bookings/${booking.id}/messages`)).data.at(-1).attachment.id,lessonVoice.id);
  migrateDatabase(db);
});

test("chat accepts common documents, checks their content and serves them as downloads", async t => {
  const { base, client } = await fixture(t), student = client(), tutor = client(), other = client();
  await student.login("student"); const teacher = await tutor.login("chau"); await other.login("nam");
  const inquiry = (await student.request("/inquiries", "POST", { tutor_id: teacher.id, body: "Chào thầy" })).data;
  const path = `/chat/inquiry/${inquiry.id}/attachments`;
  const upload = (data, type, name) => fetch(base + path, { method: "POST", headers: { Cookie: student.cookie, "Content-Type": type, ...(name && { "X-File-Name": encodeURIComponent(name) }) }, body: data });
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from("[Content_Types].xml word/document.xml")]);
  const ole = Buffer.concat([Buffer.from("d0cf11e0a1b11ae1", "hex"), Buffer.alloc(64)]);
  // Unsupported types and files whose content does not match the claim are refused.
  assert.equal((await upload(Buffer.from("MZ\x90\x00"), "application/x-msdownload", "setup.exe")).status, 400);
  assert.equal((await upload(Buffer.from("MZ\x90\x00"), "application/octet-stream", "setup.exe")).status, 400);
  assert.equal((await upload(Buffer.from("not a pdf"), "application/pdf", "a.pdf")).status, 400);
  assert.equal((await upload(Buffer.from([0x50, 0x4b, 3, 4, 1, 2]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx")).status, 400);
  assert.equal((await upload(Buffer.from([65, 0, 66]), "text/plain", "a.txt")).status, 400);
  // Documents are accepted by type, or by extension when the browser sends no useful type.
  const sent = await upload(pdf, "application/pdf", "Bài tập tuần 1.pdf");
  assert.equal(sent.status, 201);
  const attachment = await sent.json();
  assert.equal(attachment.kind, "file"); assert.equal(attachment.name, "Bài tập tuần 1.pdf");
  for (const [data, type, name] of [[docx, "application/octet-stream", "Đề cương.docx"], [docx, "", "slides.docx"], [ole, "application/msword", "cu.doc"], [ole, "application/vnd.ms-excel", "bang.xls"], [Buffer.from("a,b\n1,2"), "text/csv", "diem.csv"], [Buffer.from("ghi chú"), "text/plain", "note.txt"]])
    assert.equal((await upload(data, type, name)).status, 201, name);
  assert.equal((await student.request(`/inquiries/${inquiry.id}/messages`, "POST", { attachment_id: attachment.id })).status, 201);
  // Only the two participants can download, always as an attachment under its own name.
  const read = who => fetch(new URL(attachment.url, base), { headers: { Cookie: who.cookie } });
  assert.equal((await read(other)).status, 404);
  const download = await read(tutor);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.match(download.headers.get("content-disposition"), /^attachment; filename="B_i t_p tu_n 1\.pdf"; filename\*=UTF-8''B%C3%A0i%20t%E1%BA%ADp/);
  assert.match(download.headers.get("content-security-policy"), /sandbox/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
  const shown = (await tutor.request(`/inquiries/${inquiry.id}/messages`)).data.at(-1).attachment;
  assert.deepEqual([shown.kind, shown.name, shown.size], ["file", "Bài tập tuần 1.pdf", pdf.length]);
});

test("weeks compute inclusive dates across leap years and preserve legacy offer acceptance", async t => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(); await student.login("student"); const teacher = await tutor.login("chau");
  const blocks = [{ weekday: 0, hour: 19 }, { weekday: 2, hour: 19 }];
  await tutor.request("/tutor/availability", "PUT", { revision: 0, blocks });
  const data = { tutor_id: teacher.id, subject_id: "toan", mode: "online", blocks, start_date: "2032-02-16", weeks: 4 };
  for (const weeks of [1, 4, 52]) {
    const r = await student.request("/offers/preview", "POST", { ...data, weeks });
    assert.equal(r.status, 200); assert.equal(r.data.sessions.length, weeks * 2);
  }
  const created = await student.request("/offers", "POST", data);
  assert.equal(created.status, 201);
  const saved = one(db, "SELECT * FROM offers WHERE id=?", created.data.id);
  assert.equal(saved.start_date, "2032-02-16"); assert.equal(saved.end_date, "2032-03-14"); assert.equal(saved.weeks, 4);
  // A pre-migration record has dates but no duration or acceptance marker.
  run(db, "UPDATE offers SET weeks=NULL,accepted_at=NULL WHERE id=?", saved.id);
  assert.equal((await tutor.request(`/offers/${saved.id}`)).data.sessions.length, 8);
  assert.equal((await tutor.request(`/offers/${saved.id}`, "PATCH", { status: "accepted" })).status, 200);
  assert.equal(all(db, "SELECT id FROM bookings WHERE offer_id=?", saved.id).length, 8);
  assert.equal((await student.request(`/offers/${saved.id}`, "PATCH", { status: "cancelled" })).status, 200);
  assert.ok(all(db, "SELECT status FROM bookings WHERE offer_id=?", saved.id).every(b => b.status === "cancelled"));
});

test("free trials require tutor opt-in, one slot, and one lifetime acceptance per pair", async t => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(), admin = client(); await student.login("student"); const teacher = await tutor.login("chau"); await admin.login("admin");
  const blocks = [{ weekday: 0, hour: 19 }, { weekday: 2, hour: 19 }];
  await tutor.request("/tutor/availability", "PUT", { revision: 0, blocks });
  const input = { tutor_id: teacher.id, subject_id: "toan", mode: "online", blocks: [blocks[1]], start_date: offerPeriod().start_date, kind: "trial", rate: 999999 };
  assert.equal((await student.request("/offers", "POST", input)).status, 409);
  const profile = (await tutor.request("/tutor/profile")).data;
  assert.equal((await tutor.request("/tutor/profile", "PUT", { ...profile, accepts_trial: true })).status, 200);
  assert.equal(one(db, "SELECT accepts_trial FROM tutors WHERE user_id=?", teacher.id).accepts_trial, 1);
  run(db, "UPDATE tutors SET status='approved' WHERE user_id=?", teacher.id);
  assert.equal((await student.request(`/tutors/${teacher.id}`)).data.accepts_trial, 1);
  for (const extra of [{ blocks }, { weeks: 1 }, { blocks: [{ weekday: 3, hour: 19 }] }]) assert.ok((await student.request("/offers", "POST", { ...input, ...extra })).status >= 400);
  const forecast = await student.request("/offers/preview", "POST", input);
  assert.equal(forecast.status, 200); assert.equal(forecast.data.sessions.length, 1);
  assert.equal(forecast.data.sessions[0].starts_at, new Date(Date.parse(input.start_date + "T12:00:00Z") + 2 * 86400000).toISOString());
  for (const status of ["declined", "cancelled"]) {
    const created = await student.request("/offers", "POST", input); assert.equal(created.status, 201);
    assert.equal((await student.request("/offers", "POST", input)).status, 409);
    assert.equal((await (status === "declined" ? tutor : student).request(`/offers/${created.data.id}`, "PATCH", { status })).status, 200);
  }
  const created = await student.request("/offers", "POST", input); assert.equal(created.status, 201);
  run(db, "UPDATE tutors SET accepts_trial=0 WHERE user_id=?", teacher.id);
  assert.equal((await tutor.request(`/offers/${created.data.id}`, "PATCH", { status: "accepted" })).status, 409);
  run(db, "UPDATE tutors SET accepts_trial=1 WHERE user_id=?", teacher.id);
  const responses = await Promise.all([1, 2].map(() => tutor.request(`/offers/${created.data.id}`, "PATCH", { status: "accepted" })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const lessons = all(db, "SELECT * FROM bookings WHERE offer_id=?", created.data.id);
  assert.equal(lessons.length, 1); assert.equal(lessons[0].rate, 0); assert.equal(lessons[0].duration_minutes, 60);
  assert.equal((await student.request(`/offers/${created.data.id}`, "PATCH", { status: "cancelled" })).status, 200);
  assert.equal((await student.request("/offers", "POST", { ...input, start_date: offerPeriod(60).start_date })).status, 409);
  assert.equal((await student.request("/offers/preview", "POST", input)).status, 409);
  assert.equal((await student.request("/offers", "POST", { ...input, ...offerPeriod(60), kind: "course" })).status, 201);
  migrateDatabase(db); migrateDatabase(db);
  assert.ok(one(db, "SELECT accepted_at FROM offers WHERE id=?", created.data.id).accepted_at);
});

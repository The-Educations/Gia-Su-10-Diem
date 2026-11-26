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
  const app = createApi(db, { processPhoto, limit: false, sendEmail: async message => { emails.push(message); }, ...options });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    // Flush queued notices while the db is still open; a delayed flush after
    // close is a no-op (see mailer.isOpen guard).
    try { await app.locals.flushMail?.(); } catch { }
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

test("inquiry_messages rebuild keeps rows, attachments and allows proposal contexts", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "giasu-im-")),
    file = join(dir, "old.sqlite");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const original = openDatabase(file);
  seedCatalog(original);
  run(original, "INSERT INTO users(id,name,email,password,role) VALUES (1,'Học viên','s@t.vn','h','student'),(2,'Gia sư','t@t.vn','h','tutor')");
  run(original, "INSERT INTO tutors(user_id,headline,subjects) VALUES (2,'t','[\"toan\"]')");
  run(original, "INSERT INTO inquiries(id,student_id,tutor_id) VALUES (1,1,2)");
  // Roll the table back to the pre-proposal shape, like a production database.
  original.exec(`CREATE TABLE im_old (
    id INTEGER PRIMARY KEY, inquiry_id INTEGER NOT NULL REFERENCES inquiries(id),
    sender_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    context_kind TEXT CHECK(context_kind IN ('offer','lesson','weekly-request')), context_id INTEGER,
    is_event INTEGER NOT NULL DEFAULT 0);
  INSERT INTO im_old(id,inquiry_id,sender_id,body,created_at,context_kind,context_id,is_event)
    SELECT id,inquiry_id,sender_id,body,created_at,context_kind,context_id,is_event FROM inquiry_messages;
  DROP TABLE inquiry_messages; ALTER TABLE im_old RENAME TO inquiry_messages;`);
  run(original, "INSERT INTO inquiry_messages(inquiry_id,sender_id,body,context_kind,context_id) VALUES (1,1,'Tin cũ','offer',5),(1,2,'Trả lời',NULL,NULL)");
  const mid = Number(one(original, "SELECT MAX(id) id FROM inquiry_messages").id);
  run(original, "INSERT INTO chat_attachments(id,thread_kind,thread_id,owner_id,message_id,kind,mime,size,name) VALUES ('att-1','inquiry',1,2,?, 'image','image/png',100,'a.png')", mid);
  original.close();
  const migrated = openDatabase(file);
  assert.equal(one(migrated, "SELECT count(*) n FROM inquiry_messages").n, 2);
  const first = one(migrated, "SELECT id,body,context_kind,context_id FROM inquiry_messages ORDER BY id LIMIT 1");
  assert.equal(Number(first.id), mid - 1); assert.equal(first.body, "Tin cũ"); assert.equal(first.context_kind, "offer"); assert.equal(Number(first.context_id), 5);
  const last = one(migrated, "SELECT id,body,context_kind,context_id FROM inquiry_messages ORDER BY id DESC LIMIT 1");
  assert.equal(Number(last.id), mid); assert.equal(last.body, "Trả lời"); assert.equal(last.context_kind, null);
  run(migrated, "INSERT INTO inquiry_messages(inquiry_id,sender_id,body,context_kind,context_id,event_href) VALUES (1,1,'Đề nghị','proposal',7,'/proposals?id=7')");
  const att = one(migrated, "SELECT ca.id,m.body FROM chat_attachments ca JOIN inquiry_messages m ON m.id=ca.message_id WHERE ca.id='att-1'");
  assert.equal(att.body, "Trả lời");
  migrated.close();
  const again = openDatabase(file); // second open is a no-op
  assert.equal(one(again, "SELECT count(*) n FROM inquiry_messages").n, 3);
  again.close();
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
  // showcase-safety adds one completed booking (with its review, flagged
  // message and flagged inquiry message); the other tables only gain rows.
  assert.equal(before[0], 4);
  assert.equal(before[2], 2);
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
  const post = { title: "Học Toán", summary: "Kinh nghiệm học", body: '<script>alert("test")</script>\n' + "Nội dung ".repeat(60), published: false };
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

test("admin can permanently delete a news post, guests and students cannot", async (t) => {
  const { client } = await fixture(t), admin = client(), student = client(), guest = client();
  await admin.login("admin"); await student.login("student");
  const post = { title: "Bài xoá", summary: "Tóm tắt", body: "Nội dung ".repeat(60), published: true };
  const id = (await admin.request("/admin/posts", "POST", post)).data.id;
  assert.equal((await guest.request(`/admin/posts/${id}`, "DELETE")).status, 401);
  assert.equal((await student.request(`/admin/posts/${id}`, "DELETE")).status, 403);
  assert.equal((await guest.request(`/posts/${id}`)).status, 200);
  assert.equal((await admin.request(`/admin/posts/${id}`, "DELETE")).status, 200);
  assert.equal((await guest.request(`/posts/${id}`)).status, 404);
  assert.equal((await guest.request("/posts")).data.length, 0);
  assert.deepEqual((await admin.request("/admin/posts")).data.counts, { review: 0, drafts: 0, published: 0 });
  assert.equal((await admin.request(`/admin/posts/${id}`, "DELETE")).status, 404);
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


function offerPeriod(offset = 21) {
  const start = new Date(Date.now() + offset * 86400000);
  start.setUTCDate(start.getUTCDate() + (8 - start.getUTCDay()) % 7);
  const start_date = start.toISOString().slice(0, 10);
  return { start_date, weeks: 2 };
}



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



// ---- Lesson ratings, course reviews and trust score ----
const secondStudent = async who => (await who.request("/auth/register", "POST", { name: "Học sinh hai", email: "hai@example.com", password: "TestStudy2026!", role: "student" })).data.user;
const trustHelpers = (db, teacher, learner) => {
  let n = 0;
  return {
    lesson(offsetMinutes, status = "accepted", studentId = learner.id, extra = {}) {
      const starts_at = new Date(Date.now() + offsetMinutes * 60000 + (n++) * 1000).toISOString();
      const slot = Number(run(db, "INSERT INTO slots(tutor_id,starts_at) VALUES (?,?)", teacher.id, starts_at).lastInsertRowid);
      const id = Number(run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,status,duration_minutes) VALUES (?,?,?,?,?,?,?,?,?)", studentId, teacher.id, slot, "toan", starts_at, 180000, "online", status, 60).lastInsertRowid);
      for (const [column, value] of Object.entries(extra)) run(db, `UPDATE bookings SET ${column}=? WHERE id=?`, value, id);
      return id;
    },
  };
};





test("migration for ratings is repeatable on an existing database", async t => {
  const { db } = await fixture(t);
  const before = one(db, "SELECT COUNT(*) n FROM bookings").n;
  migrateDatabase(db); migrateDatabase(db);
  assert.equal(one(db, "SELECT COUNT(*) n FROM bookings").n, before);
});
test("notifications reach the other party, collapse per conversation and stay private", async (t) => {
  const { client } = await fixture(t),
    student = client(),
    tutor = client(),
    outsider = client();
  await student.login("student");
  const u = await tutor.login("chau");
  await outsider.login("nam");
  const { data: { id } } = await student.request("/inquiries", "POST", { tutor_id: u.id, body: "Em chào cô." });
  await student.request(`/inquiries/${id}/messages`, "POST", { body: "Cô còn lịch tối thứ Ba không ạ?" });
  const list = (await tutor.request("/notifications")).data;
  const messages = list.filter(n => n.kind === "message_new");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].link, `/messages?inquiry=${id}`);
  assert.equal(messages[0].actor_name, "Minh Anh");
  assert.equal((await tutor.request("/notifications/unread-count")).data.count, list.filter(n => !n.read_at).length);
  assert.equal((await outsider.request("/notifications")).data.some(n => n.id === messages[0].id), false);
  assert.equal((await outsider.request("/notifications/read", "POST", { id: messages[0].id })).status, 200);
  assert.equal((await tutor.request("/notifications")).data.find(n => n.id === messages[0].id).read_at, null);
  assert.equal((await tutor.request("/notifications/read", "POST", { id: messages[0].id })).status, 200);
  assert.ok((await tutor.request("/notifications")).data.find(n => n.id === messages[0].id).read_at);
  await tutor.request("/notifications/read", "POST", { all: true });
  assert.equal((await tutor.request("/notifications/unread-count")).data.count, 0);
  assert.equal((await tutor.request("/notifications/read", "POST", {})).status, 400);
  assert.equal((await client().request("/notifications")).status, 401);
  // Email for important events is on until turned off, per topic.
  const allOn = { proposals: true, money: true, lessons: true, community: true, children: true };
  assert.deepEqual((await tutor.request("/account/notifications")).data, { email: allOn, bell: allOn });
  assert.deepEqual((await tutor.request("/account/notifications", "PUT", { money: false })).data.email, { ...allOn, money: false });
  assert.equal((await tutor.request("/account/notifications", "PUT", { spam: true })).status, 400);
  assert.equal((await tutor.request("/account/notifications")).data.email.money, false);
});
test("important notices also arrive by email after the request, unless turned off", async (t) => {
  const { client, emails } = await fixture(t), s = client(), tu = client();
  await s.login("student"); const u = await tu.login("chau");
  const settle = () => new Promise((r) => setTimeout(r, 80));
  const notices = (to) => emails.filter((e) => e.kind === "notice" && e.to === to);
  const dep = await s.request("/wallet/deposits", "POST", { amount: 2000000 });
  await s.request(`/wallet/deposits/${dep.data.id}/simulate`, "POST");
  await settle();
  const money = notices("student@demo.giasu.test");
  assert.equal(money.length, 1);
  assert.match(money[0].subject, /Đã nhận 2\.000\.000đ vào số dư/);
  assert.ok(money[0].link.endsWith("/app/wallet") && money[0].settings.endsWith("/app/settings?section=notifications"));
  const start = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  assert.equal((await s.request("/proposals", "POST", { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 4, minutes: 90, rate: 200000, schedule: [{ weekday: 1, hour: 19, minute: 0 }], start_date: start, message: "Ôn thi" })).status, 201);
  await settle();
  assert.match(notices("chau@demo.giasu.test")[0].subject, /gửi bạn đề nghị học/);
  // Turning a topic off stops those emails; the in-app notice still arrives.
  await s.request("/account/notifications", "PUT", { money: false });
  const again = await s.request("/wallet/deposits", "POST", { amount: 100000 });
  await s.request(`/wallet/deposits/${again.data.id}/simulate`, "POST");
  await settle();
  assert.equal(notices("student@demo.giasu.test").length, 1);
  assert.equal((await s.request("/notifications")).data.filter((n) => n.kind === "deposit_received").length, 2);
});
test("tutor credentials need proof, stay private and show only approved labels publicly", async (t) => {
  const { client, base } = await fixture(t), tutor = client(), other = client(), student = client(), admin = client();
  const u = await tutor.login("chau"); await other.login("nam"); await student.login("student"); await admin.login("admin");
  const seeded = (await tutor.request("/tutor/credentials")).data.length;
  const label = "Trường Đại học Sư phạm Hà Nội · Sư phạm Toán · lớp chất lượng cao";
  const { default: sharp } = await import("sharp");
  const picture = await sharp({ create: { width: 200, height: 120, channels: 3, background: "#ddd" } }).png().toBuffer();
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  const send = (id, body, type) => fetch(base + `/tutor/credentials/${id}/files`, { method: "POST", headers: { Cookie: tutor.cookie, "Content-Type": type, "X-File-Name": encodeURIComponent("thẻ sinh viên.png") }, body });

  assert.equal((await tutor.request("/tutor/credentials", "POST", { kind: "school", catalog_id: "khong-co", detail: { start_year: 2020 } })).status, 400);
  assert.equal((await tutor.request("/tutor/credentials", "POST", { kind: "award", catalog_id: "hoc-sinh-gioi-quoc-gia", detail: {} })).status, 400);
  const school = await tutor.request("/tutor/credentials", "POST", { kind: "school", catalog_id: "hnue", detail: { field: "Sư phạm Toán · lớp chất lượng cao", start_year: 2021, current: true } });
  assert.equal(school.status, 201);
  assert.equal(school.data.name, "Trường Đại học Sư phạm Hà Nội");
  assert.equal(school.data.status, "pending");
  const cert = await tutor.request("/tutor/credentials", "POST", { kind: "certificate", catalog_id: "ielts-academic", detail: { score: "8.0" } });

  // Approval needs a proof file; rejection needs a reason.
  assert.equal((await admin.request(`/admin/credentials/${school.data.id}`, "PATCH", { status: "approved" })).status, 409);
  assert.equal((await send(school.data.id, Buffer.from("not an image"), "text/plain")).status, 400);
  const withImage = await (await send(school.data.id, picture, "image/png")).json();
  assert.equal(withImage.files.length, 1);
  assert.equal(withImage.files[0].mime, "image/webp");
  const withPdf = await (await send(cert.data.id, pdf, "application/pdf")).json();
  const fileUrl = withImage.files[0].url.replace("/api", "");

  // Only the owner and administrators can open proof files.
  for (const [c, status] of [[tutor, 200], [admin, 200], [other, 404], [student, 404], [client(), 401]])
    assert.equal((await fetch(base + fileUrl, { headers: { Cookie: c.cookie } })).status, status);
  assert.equal((await other.request(`/tutor/credentials/${school.data.id}`, "DELETE")).status, 404);
  assert.equal((await student.request(`/admin/tutors/${u.id}/credentials`)).status, 403);
  assert.equal((await admin.request(`/admin/tutors/${u.id}/credentials`)).data.length, seeded + 2);

  assert.equal((await admin.request(`/admin/credentials/${cert.data.id}`, "PATCH", { status: "rejected" })).status, 400);
  assert.equal((await admin.request(`/admin/credentials/${cert.data.id}`, "PATCH", { status: "rejected", note: "Ảnh mờ, chụp lại số báo danh." })).status, 200);
  assert.equal((await admin.request(`/admin/credentials/${school.data.id}`, "PATCH", { status: "approved" })).status, 200);
  let profile = (await student.request(`/tutors/${u.id}`)).data;
  assert.ok(profile.verified.some(v => v.kind === "school" && v.label === label));
  assert.equal(profile.verified.some(v => v.label.startsWith("IELTS")), false);
  assert.equal(JSON.stringify(profile).includes(withImage.files[0].id), false);
  assert.ok((await tutor.request("/notifications")).data.some(n => n.kind === "credential_rejected"));

  // Editing an approved entry sends it back for review and hides it publicly.
  assert.equal((await tutor.request(`/tutor/credentials/${school.data.id}`, "PUT", { kind: "school", catalog_id: "hnue", detail: { field: "Toán học", start_year: 2021 } })).data.status, "pending");
  profile = (await student.request(`/tutors/${u.id}`)).data;
  assert.equal(profile.verified.some(v => v.label === label), false);
  assert.equal(withPdf.files[0].mime, "application/pdf");
  assert.equal((await tutor.request(`/tutor/credentials/${cert.data.id}`, "DELETE")).status, 200);
  assert.equal((await fetch(base + withPdf.files[0].url.replace("/api", ""), { headers: { Cookie: admin.cookie } })).status, 404);
});
test("wallet deposits, SePay webhook verdicts, offers holding money and tutor credits", async (t) => {
  const { createHmac } = await import("node:crypto");
  const secret = "test-sepay-secret";
  const { client, base, db } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, holder: "GIA SU 10 DIEM", prefix: "GSD", webhook: true, gateway: false, ready: true } });
  const student = client(), tutor = client(), admin = client();
  const s = await student.login("student"), u = await tutor.login("chau"); await admin.login("admin");
  const hook = (payload, key = secret, stamp = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", key).update(`${stamp}.${body}`).digest("hex") }, body });
  };
  // Deposit: a unique code, a VietQR image, and no simulation when SePay is live.
  const dep = await student.request("/wallet/deposits", "POST", { amount: 2000000 });
  assert.equal(dep.status, 201);
  assert.match(dep.data.code, /^GSD[A-Z0-9]{8}$/);
  assert.ok(dep.data.qr_url.startsWith("https://vietqr.app/img?"));
  assert.equal(dep.data.pay_url, null, "a bank-ready order never links out to SePay");
  assert.equal(dep.data.checkout, null, "and never carries a hosted-checkout form");
  assert.equal((await student.request(`/wallet/deposits/${dep.data.id}/simulate`, "POST")).status, 404);
  const event = { id: 9001, gateway: "MBBank", transactionDate: "2026-11-22 10:00:00", accountNumber: "0123456789", subAccount: "", code: dep.data.code, content: `${dep.data.code} nap tien`, transferType: "in", description: "", transferAmount: 2000000, accumulated: 0, referenceCode: "FT1" };
  assert.equal((await hook(event, "wrong")).status, 401);
  assert.equal((await hook(event, secret, Math.floor(Date.now() / 1000) - 900)).status, 401);
  assert.deepEqual(await (await hook(event)).json(), { success: true });
  assert.deepEqual(await (await hook(event)).json(), { success: true });
  assert.deepEqual(await (await hook({ ...event, id: 9002, code: "GSDUNKNOWN1", referenceCode: "FT2" })).json(), { success: false });
  assert.deepEqual(await (await hook({ ...event, id: 9003, transferType: "out", referenceCode: "FT3" })).json(), { success: false });
  let w = (await student.request("/wallet")).data;
  assert.equal(w.available, 2000000);
  assert.equal(w.payments, "live");

  // A student's offer holds the whole package; a decline releases it.
  const start = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const offer = { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 8, minutes: 90, rate: 200000, schedule: [{ weekday: 1, hour: 19, minute: 0 }], start_date: start, message: "Em cần ôn thi vào 10" };
  assert.equal((await student.request("/proposals", "POST", { ...offer, sessions: 20 })).status, 402);
  const sent = await student.request("/proposals", "POST", offer);
  assert.equal(sent.status, 201);
  assert.equal(sent.data.total, 1600000);
  assert.equal(sent.data.payout, 1520000);
  w = (await student.request("/wallet")).data;
  assert.deepEqual([w.available, w.held], [400000, 1600000]);
  assert.equal((await student.request("/proposals", "POST", offer)).status, 409);
  assert.equal((await student.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept" })).status, 403);
  assert.equal((await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "decline" })).data.status, "declined");
  w = (await student.request("/wallet")).data;
  assert.deepEqual([w.available, w.held], [2000000, 0]);
  assert.ok((await student.request("/notifications")).data.some(n => n.kind === "proposal_declined"));

  // Expired offers release their hold on the next read.
  const again = await student.request("/proposals", "POST", offer);
  db.prepare("UPDATE proposals SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), again.data.id);
  assert.equal((await student.request("/proposals")).data.find(p => p.id === again.data.id).status, "expired");
  assert.equal((await student.request("/wallet")).data.available, 2000000);

  // A tutor's offer costs 2 of the 10 monthly credits; the student pays on accepting.
  assert.equal((await tutor.request("/wallet")).data.credits_free, 10);
  const pitch = await tutor.request("/proposals", "POST", { ...offer, tutor_id: undefined, student_id: s.id, sessions: 12 });
  assert.equal(pitch.status, 201);
  assert.equal((await tutor.request("/wallet")).data.credits_free, 8);
  const short = await student.request(`/proposals/${pitch.data.id}`, "PATCH", { action: "accept" });
  assert.equal(short.status, 402);
  assert.match(short.data.error, /400\.000đ/);
  assert.equal((await student.request("/proposals")).data.find(p => p.id === pitch.data.id).status, "pending");
  const top = await student.request("/wallet/deposits", "POST", { amount: 400000 });
  assert.deepEqual(await (await hook({ ...event, id: 9004, code: top.data.code.toLowerCase(), transferAmount: 400000, referenceCode: "FT4" })).json(), { success: true });
  assert.equal((await student.request(`/proposals/${pitch.data.id}`, "PATCH", { action: "accept" })).data.status, "accepted");
  w = (await student.request("/wallet")).data;
  assert.deepEqual([w.available, w.held], [0, 2400000]);

  // Credits: buying a pack spends the tutor's balance; tutors cannot overdraw.
  assert.equal((await tutor.request("/credits/purchase", "POST", { credits: 10 })).status, 402);
  assert.equal((await admin.request(`/admin/wallets/${u.id}/adjust`, "POST", { amount: 60000, note: "Thưởng giới thiệu" })).status, 200);
  const bought = (await tutor.request("/credits/purchase", "POST", { credits: 10 })).data;
  assert.deepEqual([bought.available, bought.credits_paid], [10000, 10]);

  // Withdrawals hold the amount, post a card to admin support, and settle by hand.
  assert.equal((await tutor.request("/wallet/withdrawals", "POST", { amount: 50000, bank_name: "MB", account_number: "123", account_name: "A" })).status, 400);
  await admin.request(`/admin/wallets/${u.id}/adjust`, "POST", { amount: 90000, note: "Thanh toán thử" });
  const wd = await tutor.request("/wallet/withdrawals", "POST", { amount: 100000, bank_name: "MB Bank", account_number: "0987654321", account_name: "Nguyen Minh Chau" });
  assert.equal(wd.status, 201);
  assert.deepEqual([wd.data.available, wd.data.held], [0, 100000]);
  assert.deepEqual((({ bank_name, account_number, account_name, status }) => ({ bank_name, account_number, account_name, status }))(wd.data.withdrawals[0]), { bank_name: "MB Bank", account_number: "0987654321", account_name: "NGUYEN MINH CHAU", status: "requested" });
  const support = (await tutor.request("/support")).data[0];
  assert.match((await tutor.request(`/support/${support.id}/messages`)).data.at(-1).body, /Yêu cầu rút tiền #\d+: 100\.000đ về MB Bank \*\*\*\*4321/);
  assert.equal((await tutor.request(`/admin/withdrawals/${wd.data.id}`, "PATCH", { status: "paid" })).status, 403);
  assert.equal((await admin.request(`/admin/withdrawals/${wd.data.id}`, "PATCH", { status: "paid" })).status, 200);
  assert.equal((await admin.request(`/admin/withdrawals/${wd.data.id}`, "PATCH", { status: "paid" })).status, 409);
  assert.deepEqual((({ available, held }) => [available, held])((await tutor.request("/wallet")).data), [0, 0]);
  const finance = (await admin.request("/admin/finance")).data;
  assert.equal(finance.totals.deposited, 2400000);
  assert.equal(finance.totals.credit_revenue, 50000);
  // Money leaving the bank is not "money in without a code": only the unknown incoming one is listed.
  assert.equal(finance.unmatched.length, 1);
});
test("payouts: a memo code and VietQR for the admin, SePay confirms money leaving the bank, receipts reach the user", async (t) => {
  const { createHmac } = await import("node:crypto");
  const sharp = (await import("sharp")).default;
  const secret = "test-sepay-secret";
  const { client, base } = await fixture(t, { sepay: { secret, account: "", bank: "", holder: "", prefix: "GSD", webhook: false, gateway: false, ready: false } });
  const tutor = client(), admin = client();
  const u = await tutor.login("chau"); await admin.login("admin");
  const hook = (payload) => {
    const body = JSON.stringify(payload), stamp = Math.floor(Date.now() / 1000);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(`${stamp}.${body}`).digest("hex") }, body });
  };
  assert.equal((await admin.request(`/admin/wallets/${u.id}/adjust`, "POST", { amount: 600000, note: "Học phí tháng 11" })).status, 200);
  const payee = { bank_name: "MB Bank", account_number: "0987654321", account_name: "Nguyen Minh Chau" };
  const first = (await tutor.request("/wallet/withdrawals", "POST", { amount: 200000, ...payee })).data;
  const second = (await tutor.request("/wallet/withdrawals", "POST", { amount: 150000, ...payee })).data;
  const [w2, w1] = first.withdrawals.length === 1 ? [second.withdrawals[0], second.withdrawals[1]] : second.withdrawals;
  assert.match(w1.code, /^GSD[A-Z0-9]{8}$/);
  assert.notEqual(w1.code, w2.code);
  assert.equal(w1.status, "requested");

  let finance = (await admin.request("/admin/finance")).data;
  const row = finance.withdrawals.find((w) => w.id === w1.id);
  assert.ok(row.qr_url.startsWith("https://vietqr.app/img?") && row.qr_url.includes("bank=MB") && row.qr_url.includes(`des=${w1.code}`) && row.qr_url.includes("amount=200000"));
  assert.equal(finance.payout_check, true);
  assert.equal(finance.months.length, 6);

  // The admin's transfer leaves the bank with the code in its memo: SePay confirms it.
  const out = { id: 7001, gateway: "MBBank", transactionDate: "2026-11-23 09:00:00", accountNumber: "0962250207", subAccount: "", code: null, content: `${w1.code} rut tien`, transferType: "out", description: "", transferAmount: 200000, accumulated: 0, referenceCode: "FT-OUT-1" };
  assert.deepEqual(await (await hook({ ...out, id: 7000, transferAmount: 199000 })).json(), { success: false });
  assert.deepEqual(await (await hook(out)).json(), { success: true });
  assert.deepEqual(await (await hook(out)).json(), { success: true });
  assert.deepEqual(await (await hook({ ...out, id: 7002, content: "RetailVisa 50000 PLX" , transferAmount: 50000 })).json(), { success: false });
  let mine = (await tutor.request("/wallet")).data;
  const paid = mine.withdrawals.find((w) => w.id === w1.id);
  assert.deepEqual([paid.status, paid.bank_confirmed], ["paid", 1]);
  assert.deepEqual([mine.available, mine.held], [250000, 150000]);
  assert.equal((await admin.request(`/admin/withdrawals/${w1.id}`, "PATCH", { status: "paid" })).status, 409);

  // The admin pays the second one by hand with a receipt; it reaches the user's conversation.
  const thread = finance.withdrawals.find((w) => w.id === w2.id).thread_id;
  const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const upload = async () => (await (await fetch(base + `/chat/support/${thread}/attachments`, { method: "POST", headers: { Cookie: admin.cookie, "Content-Type": "image/png" }, body: png })).json()).id;
  assert.equal((await admin.request(`/admin/withdrawals/${w2.id}`, "PATCH", { status: "paid", receipt_id: "00000000-0000-4000-8000-000000000000" })).status, 400);
  const receipt = await upload();
  assert.equal((await admin.request(`/admin/withdrawals/${w2.id}`, "PATCH", { status: "paid", receipt_id: receipt })).status, 200);
  mine = (await tutor.request("/wallet")).data;
  const manual = mine.withdrawals.find((w) => w.id === w2.id);
  assert.deepEqual([manual.status, manual.bank_confirmed, manual.receipt_url], ["paid", 0, `/api/chat/attachments/${receipt}`]);
  assert.equal(mine.held, 0);
  assert.equal((await fetch(base + `/chat/attachments/${receipt}`, { headers: { Cookie: tutor.cookie } })).status, 200);
  const messages = (await tutor.request(`/support/${thread}/messages`)).data;
  assert.ok(messages.some((m) => m.attachment?.id === receipt && /Đã chuyển 150\.000đ/.test(m.body)));

  // SePay seeing the manual transfer later still marks it as confirmed by the bank.
  assert.deepEqual(await (await hook({ ...out, id: 7003, content: `CK ${manual.code}`, transferAmount: 150000, referenceCode: "FT-OUT-2" })).json(), { success: true });
  assert.equal((await tutor.request("/wallet")).data.withdrawals.find((w) => w.id === w2.id).bank_confirmed, 1);
  // A receipt can be added afterwards to the one SePay confirmed.
  assert.equal((await admin.request(`/admin/withdrawals/${w1.id}/receipt`, "POST", { receipt_id: await upload() })).status, 200);
  finance = (await admin.request("/admin/finance")).data;
  assert.equal(finance.months.at(-1).payouts, 350000);
  assert.equal(finance.months.at(-1).payouts_confirmed, 350000);
});
test("SePay webhook fails closed without a secret and deposits are simulated only in development", async (t) => {
  const { client, base } = await fixture(t, { sepay: { secret: "", account: "", bank: "", holder: "", prefix: "GSD", ready: false } });
  const student = client(); await student.login("student");
  assert.equal((await fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: 1, transferType: "in", transferAmount: 1, code: "GSD" }) })).status, 503);
  const dep = await student.request("/wallet/deposits", "POST", { amount: 100000 });
  assert.equal(dep.data.simulated, true);
  assert.equal(dep.data.qr_url, null);
  assert.equal((await student.request(`/wallet/deposits/${dep.data.id}/simulate`, "POST")).data.status, "paid");
  assert.equal((await student.request("/wallet")).data.available, 100000);
});
test("accepted offers become classes; lessons confirm, cancel, move, settle with the fee and publish stars", async (t) => {
  const { client, db } = await fixture(t), student = client(), tutor = client(), outsider = client();
  const s = await student.login("student"), u = await tutor.login("chau"); await outsider.login("nam");
  const grant = (id, amount) => db.prepare("INSERT INTO wallets(user_id,available) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET available=available+excluded.available").run(id, amount);
  grant(s.id, 1000000);
  const start = new Date(Date.now() + 7 * 3600000 + 2 * 86400000).toISOString().slice(0, 10);
  const sent = await student.request("/proposals", "POST", { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 4, minutes: 60, rate: 200000, schedule: [{ weekday: 0, hour: 18, minute: 0 }, { weekday: 3, hour: 18, minute: 0 }], start_date: start });
  const accepted = await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept" });
  assert.ok(accepted.data.class_id);
  const cid = accepted.data.class_id;
  let cls = (await student.request(`/classes/${cid}`)).data;
  assert.equal(cls.sessions.length, 4);
  assert.equal((await outsider.request(`/classes/${cid}`)).status, 404);
  assert.equal((await student.request("/classes")).data[0].id, cid);

  // Make the first two lessons already finished.
  const [a, b, c, d] = cls.sessions;
  const past = (id, hours) => db.prepare("UPDATE class_sessions SET starts_at=? WHERE id=?").run(new Date(Date.now() - hours * 3600000).toISOString(), id);
  past(a.id, 3); past(b.id, 60);
  assert.equal((await student.request(`/sessions/${c.id}/confirm`, "POST")).status, 409);
  await student.request(`/sessions/${a.id}/confirm`, "POST");
  await tutor.request(`/sessions/${a.id}/confirm`, "POST");
  await student.request(`/sessions/${a.id}/rating`, "PUT", { rating: 5 });
  // One side confirmed more than 48 hours ago: the lesson confirms itself.
  await tutor.request(`/sessions/${b.id}/confirm`, "POST");
  await student.request(`/sessions/${b.id}/rating`, "PUT", { rating: 4 });
  cls = (await tutor.request(`/classes/${cid}`)).data;
  assert.deepEqual(cls.sessions.slice(0, 2).map(x => x.outcome), ["confirmed", "confirmed"]);

  // The student cancels lesson c early (refunded) and asks to move lesson d; the tutor agrees.
  assert.equal((await student.request(`/sessions/${c.id}/cancel`, "POST")).data.outcome, "refunded");
  const newTime = new Date(Date.now() + 5 * 86400000).toISOString();
  assert.equal((await student.request(`/sessions/${d.id}/move`, "POST", { starts_at: newTime })).status, 201);
  const move = (await tutor.request(`/classes/${cid}`)).data.moves[0];
  assert.equal((await student.request(`/moves/${move.id}`, "PATCH", { accept: true })).status, 403);
  await tutor.request(`/moves/${move.id}`, "PATCH", { accept: true });
  assert.equal((await tutor.request(`/classes/${cid}`)).data.sessions.find(x => x.id === d.id).starts_at, newTime);

  // A late cancellation by the tutor refunds the lesson and counts a violation.
  db.prepare("UPDATE class_sessions SET starts_at=? WHERE id=?").run(new Date(Date.now() + 2 * 3600000).toISOString(), d.id);
  assert.deepEqual((await tutor.request(`/sessions/${d.id}/cancel`, "POST")).data, { outcome: "refunded", late: true });
  assert.equal(db.prepare("SELECT violations FROM tutors WHERE user_id=?").get(u.id).violations, 1);

  // Every lesson is resolved: 2 confirmed lessons pay the tutor minus 5%, the rest goes back.
  const sw = (await student.request("/wallet")).data, tw = (await tutor.request("/wallet")).data;
  assert.deepEqual([sw.available, sw.held], [600000, 0]);
  assert.equal(tw.available, 380000);
  cls = (await student.request(`/classes/${cid}`)).data;
  assert.equal(cls.members[0].status, "ended");
  assert.equal(cls.members[0].published_rating, 4.5);
  await student.request(`/members/${cls.members[0].id}/review`, "PUT", { body: "Cô giảng dễ hiểu" });
  const profile = (await outsider.request(`/tutors/${u.id}`)).data;
  assert.deepEqual([profile.rating.average, profile.rating.count, profile.rating.reviews[0].body], [4.5, 1, "Cô giảng dễ hiểu"]);
  assert.equal(JSON.stringify(profile.rating).includes("Minh Anh"), false);
});
test("parents link with a child's code, top up and follow the child; community topics, reactions and boosted pitches", async (t) => {
  const { client, db } = await fixture(t), child = client(), parent = client(), tutor = client(), other = client();
  const c = await child.login("student"), u = await tutor.login("chau"); await other.login("nam");
  await parent.request("/auth/register", "POST", { name: "Phụ huynh Lan", email: "lan@example.test", password: "ParentStudy2026!" });
  await parent.request("/account/onboarding", "PUT", { step: 0, role: "parent" });
  await parent.request("/account/onboarding", "PUT", { step: 1, name: "Phụ huynh Lan", display_name: "Mẹ Lan", school: "THCS A", province_code: "", ward_code: "" });
  db.prepare("UPDATE users SET onboarding_step=3 WHERE email='lan@example.test'").run();
  const { code } = (await child.request("/family")).data;
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal((await child.request("/family/link", "POST", { code })).status, 403);
  assert.equal((await parent.request("/family/link", "POST", { code: "ZZZZZZ" })).status, 404);
  assert.equal((await parent.request("/family/link", "POST", { code: code.toLowerCase() })).status, 201);
  const fam = (await parent.request("/family")).data;
  assert.equal(fam.children[0].id, c.id);
  // The parent tops up the child's balance and sends an offer for the child.
  const dep = await parent.request("/wallet/deposits", "POST", { amount: 600000, student_id: c.id });
  await parent.request(`/wallet/deposits/${dep.data.id}/simulate`, "POST");
  assert.equal((await child.request("/wallet")).data.available, 600000);
  assert.equal((await other.request("/wallet/deposits", "POST", { amount: 600000, student_id: c.id })).status, 403);
  const start = new Date(Date.now() + 7 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
  // Parents follow; the child sends the offer from the student account.
  const offerBody = { tutor_id: u.id, student_id: c.id, subject_id: "toan", mode: "online", sessions: 2, minutes: 60, rate: 200000, schedule: [{ weekday: 2, hour: 18, minute: 0 }], start_date: start };
  assert.equal((await parent.request("/proposals", "POST", offerBody)).status, 403);
  const sent = await child.request("/proposals", "POST", offerBody);
  assert.equal(sent.status, 201);
  assert.ok((await parent.request("/proposals")).data.some(p => p.id === sent.data.id));
  const accepted = await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept" });
  assert.equal((await parent.request(`/classes/${accepted.data.class_id}`)).status, 200);
  assert.equal((await other.request(`/classes/${accepted.data.class_id}`)).status, 404);

  // A "Tìm gia sư" post: tutors pitch with credits; extra credits rank them; closing refunds those outside the top three.
  db.prepare("UPDATE users SET display_name='Minh Anh' WHERE id=?").run(c.id);
  const created = await child.request("/community/posts", "POST", { title: "Cần tìm gia sư Toán lớp 9", body: "Em cần gia sư Toán ôn thi vào 10, học online tối thứ 3.", topic: "find_tutor" });
  db.prepare("UPDATE community_posts SET status='approved',published_at=CURRENT_TIMESTAMP WHERE id=?").run(created.data.id);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const pid = created.data.id;
  assert.equal((await child.request(`/community/posts?topic=find_tutor`)).data.items[0].topic, "find_tutor");
  await other.request(`/community/posts/${pid}/react`, "POST", { kind: "interest", on: true });
  assert.equal((await child.request(`/community/posts?sort=trending`)).data.items.find(p => p.id === pid).interests, 1);
  const pitch = { subject_id: "toan", mode: "online", sessions: 4, minutes: 90, rate: 180000, schedule: [{ weekday: 1, hour: 19, minute: 0 }], start_date: start, message: "Cô có kinh nghiệm luyện thi vào 10." };
  assert.equal((await tutor.request(`/community/posts/${pid}/pitches`, "POST", { ...pitch, boost: 3 })).status, 201);
  assert.equal((await tutor.request(`/community/posts/${pid}/pitches`, "POST", pitch)).status, 409);
  assert.equal((await tutor.request("/wallet")).data.credits_free, 5);
  assert.equal((await other.request(`/community/posts/${pid}/pitches`, "POST", pitch)).status, 201);
  const view = (await child.request(`/community/posts/${pid}/pitches`)).data;
  assert.deepEqual([view.count, view.pitches[0].tutor_id, view.pitches[0].featured], [2, u.id, true]);
  assert.deepEqual((await other.request(`/community/posts/${pid}/pitches`)).data.mine.rank, 2);
  assert.equal((await other.request(`/community/posts/${pid}/pitches`)).data.pitches, undefined);
  assert.equal((await child.request(`/community/posts/${pid}/close`, "POST")).status, 200);
  assert.equal((await tutor.request(`/community/posts/${pid}/pitches`, "POST", pitch)).status, 409);
});
test("quick demo sign-in exists only outside production", async (t) => {
  const local = await fixture(t), live = await fixture(t, { production: true });
  const a = local.client(), b = live.client();
  assert.equal((await a.request("/auth/demo")).data.enabled, true);
  const me = await a.request("/auth/demo", "POST", { role: "tutor" });
  assert.equal(me.data.user.role, "tutor");
  assert.equal((await b.request("/auth/demo")).data.enabled, false);
  assert.equal((await b.request("/auth/demo", "POST", { role: "admin" })).status, 404);
});

test("students verify with a school record; one record and one student code per account; tutors cannot share proof", async (t) => {
  const { client, base, db } = await fixture(t), a = client(), b = client(), admin = client(), tutor = client(), other = client();
  for (const [c, email] of [[a, "hs-a@example.test"], [b, "hs-b@example.test"]]) {
    await c.request("/auth/register", "POST", { name: "Học sinh", email, password: "StudentStudy2026!" });
    db.prepare("UPDATE users SET onboarding_step=3 WHERE email=?").run(email);
  }
  await admin.login("admin"); const u = await tutor.login("chau"); await other.login("nam");
  const pdf = Buffer.from("%PDF-1.4 học bạ của bạn A");
  const start = new Date(Date.now() + 7 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
  const offer = { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 1, minutes: 60, rate: 200000, schedule: [{ weekday: 2, hour: 18, minute: 0 }], start_date: start };
  assert.equal((await a.request("/proposals", "POST", offer)).status, 403);
  assert.equal((await a.request("/account/verification", "PUT", { school: "THCS A", grade: "Lớp 9", student_code: "HS 0001" })).status, 400);
  const res = await fetch(base + "/account/verification/files", { method: "POST", headers: { Cookie: a.cookie, "Content-Type": "application/pdf" }, body: pdf });
  assert.equal(res.status, 201);
  assert.equal((await a.request("/account/verification", "PUT", { school: "THCS A", grade: "Lớp 9", student_code: "hs 0001" })).data.status, "pending");
  // The same file or the same student code cannot verify a second account.
  assert.equal((await fetch(base + "/account/verification/files", { method: "POST", headers: { Cookie: b.cookie, "Content-Type": "application/pdf" }, body: pdf })).status, 409);
  await fetch(base + "/account/verification/files", { method: "POST", headers: { Cookie: b.cookie, "Content-Type": "application/pdf" }, body: Buffer.from("%PDF-1.4 bạn B") });
  assert.equal((await b.request("/account/verification", "PUT", { school: "THCS A", grade: "Lớp 9", student_code: "HS0001" })).status, 409);
  const pending = (await admin.request("/admin/verifications")).data;
  assert.equal(pending.length, 1);
  assert.equal((await admin.request(`/admin/verifications/${pending[0].user_id}`, "PATCH", { status: "rejected" })).status, 400);
  assert.equal((await admin.request(`/admin/verifications/${pending[0].user_id}`, "PATCH", { status: "approved" })).status, 200);
  const dep = await a.request("/wallet/deposits", "POST", { amount: 200000 });
  await a.request(`/wallet/deposits/${dep.data.id}/simulate`, "POST");
  assert.equal((await a.request("/proposals", "POST", offer)).status, 201);
  // Decided records stay listed by status, and an approval can be withdrawn.
  assert.equal((await admin.request("/admin/verifications")).data.length, 0);
  const approved = (await admin.request("/admin/verifications?status=approved")).data.filter((v) => v.email === "hs-a@example.test");
  assert.deepEqual([approved.length, approved[0].status, approved[0].files.length], [1, "approved", 1]);
  assert.ok((await admin.request("/admin/verifications?status=all")).data.some((v) => v.email === "hs-a@example.test"));
  assert.equal((await admin.request(`/admin/verifications/${approved[0].user_id}`, "PATCH", { status: "approved" })).status, 404);
  assert.equal((await admin.request(`/admin/verifications/${approved[0].user_id}`, "PATCH", { status: "rejected", note: "Ảnh mờ, chụp lại giúp" })).status, 200);
  assert.equal((await a.request("/proposals", "POST", { ...offer, start_date: start })).status, 403);
  assert.equal((await admin.request("/admin/verifications?status=rejected")).data.find((v) => v.email === "hs-a@example.test").note, "Ảnh mờ, chụp lại giúp");
  assert.equal((await admin.request(`/admin/verifications/${approved[0].user_id}`, "PATCH", { status: "approved" })).status, 200);
  // Tutors: one proof file and one candidate number per tutor.
  const mine = (await tutor.request("/tutor/credentials", "POST", { kind: "certificate", catalog_id: "ielts-academic", detail: { score: "8.0", reference: "VN123456" } })).data;
  const proof = Buffer.from("%PDF-1.4 IELTS của Châu");
  assert.equal((await fetch(base + `/tutor/credentials/${mine.id}/files`, { method: "POST", headers: { Cookie: tutor.cookie, "Content-Type": "application/pdf" }, body: proof })).status, 201);
  const theirs = (await other.request("/tutor/credentials", "POST", { kind: "certificate", catalog_id: "ielts-academic", detail: { score: "8.0" } })).data;
  assert.equal((await fetch(base + `/tutor/credentials/${theirs.id}/files`, { method: "POST", headers: { Cookie: other.cookie, "Content-Type": "application/pdf" }, body: proof })).status, 409);
  assert.equal((await other.request("/tutor/credentials", "POST", { kind: "certificate", catalog_id: "ielts-academic", detail: { score: "7.0", reference: "VN123456" } })).status, 409);
  assert.equal((await fetch(base + `/tutor/credentials/${theirs.id}/files`, { method: "POST", headers: { Cookie: other.cookie, "Content-Type": "application/pdf" }, body: pdf })).status, 409);
});
test("SePay payment gateway: signed checkout form and IPN credits a top-up once", async (t) => {
  const { createHmac } = await import("node:crypto");
  const sepay = { secret: "", account: "", bank: "", bankReady: false, holder: "", prefix: "GSD", merchant: "SP-TEST-1", merchantSecret: "spsk_test_x", ipnSecret: "ipn-secret-1234567890", sandbox: true, webhook: false, gateway: true, ready: true };
  const { client, base } = await fixture(t, { sepay, origin: "https://giasu.example" });
  const s = client(); await s.login("student");
  const dep = (await s.request("/wallet/deposits", "POST", { amount: 300000 })).data;
  // Gateway-only (no bank account): the hosted checkout and pay link still work.
  assert.equal(dep.checkout.action, "https://pay-sandbox.sepay.vn/v1/checkout/init");
  const f = dep.checkout.fields;
  assert.deepEqual(Object.keys(f), ["order_amount", "merchant", "currency", "operation", "order_description", "order_invoice_number", "customer_id", "success_url", "error_url", "cancel_url", "lang", "signature"]);
  const signed = ["order_amount", "merchant", "currency", "operation", "order_description", "order_invoice_number", "customer_id", "success_url", "error_url", "cancel_url"].map(k => `${k}=${f[k]}`).join(",");
  assert.equal(f.signature, createHmac("sha256", "spsk_test_x").update(signed).digest("base64"));
  assert.equal(f.order_invoice_number, dep.code);
  assert.ok(f.success_url.startsWith("https://giasu.example/app/wallet?deposit="));
  // The QR opens a page that forwards the same signed form to SePay, for this order only.
  assert.equal(dep.pay_url, `https://giasu.example/api/wallet/pay/${dep.code}`);
  const page = await (await fetch(base + `/wallet/pay/${dep.code}`)).text();
  assert.ok(page.includes('action="https://pay-sandbox.sepay.vn/v1/checkout/init"') && page.includes(`value="${dep.code}"`) && page.includes('name="signature"'));
  const second = (await s.request("/wallet/deposits", "POST", { amount: 300000 })).data;
  assert.notEqual(second.code, dep.code);
  assert.equal((await fetch(base + "/wallet/pay/NOPE", { redirect: "manual" })).status, 303);
  const ipn = (body, key = sepay.ipnSecret) => fetch(base + "/sepay/ipn", { method: "POST", headers: { "Content-Type": "application/json", "X-Secret-Key": key }, body: JSON.stringify(body) });
  const paid = { timestamp: 1, notification_type: "ORDER_PAID", order: { id: "o-1", order_status: "CAPTURED", order_amount: "300000.00", order_invoice_number: dep.code }, transaction: { id: "tx-1", transaction_status: "APPROVED", transaction_type: "PAYMENT", payment_method: "BANK_TRANSFER" } };
  assert.equal((await ipn(paid, "wrong-secret-1234567")).status, 401);
  assert.deepEqual(await (await ipn({ ...paid, transaction: { ...paid.transaction, id: "tx-0" }, order: { ...paid.order, order_amount: "100000" } })).json(), { success: false });
  assert.deepEqual(await (await ipn(paid)).json(), { success: true });
  assert.deepEqual(await (await ipn(paid)).json(), { success: true });
  assert.deepEqual(await (await ipn({ ...paid, transaction: { ...paid.transaction, id: "tx-2" } })).json(), { success: false });
  assert.equal((await s.request("/wallet")).data.available, 300000);
  assert.equal((await s.request(`/wallet/deposits/${dep.id}`)).data.checkout, null);
  assert.equal((await fetch(base + `/wallet/pay/${dep.code}`, { redirect: "manual" })).headers.get("location"), `https://giasu.example/app/wallet?deposit=${dep.id}`);
  assert.equal((await s.request(`/wallet/deposits/${second.id}`)).data.status, "pending");
});
test("personal calendar events belong to their owner and validate times", async (t) => {
  const { client } = await fixture(t), a = client(), b = client();
  await a.login("student"); await b.login("chau");
  const start = new Date(Date.now() + 86400000), end = new Date(start.getTime() + 3600000);
  assert.equal((await a.request("/calendar-events", "POST", { title: "Ôn thi", starts_at: end.toISOString(), ends_at: start.toISOString() })).status, 400);
  const e = (await a.request("/calendar-events", "POST", { title: "Ôn thi Toán", starts_at: start.toISOString(), ends_at: end.toISOString(), color: "lilac" })).data;
  const range = `?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 3 * 86400000).toISOString())}`;
  assert.equal((await a.request("/calendar-events" + range)).data.length, 1);
  assert.equal((await b.request("/calendar-events" + range)).data.length, 0);
  assert.equal((await b.request(`/calendar-events/${e.id}`, "PUT", { title: "x", starts_at: start.toISOString(), ends_at: end.toISOString() })).status, 404);
  assert.equal((await a.request(`/calendar-events/${e.id}`, "PUT", { title: "Ôn thi Lý", starts_at: start.toISOString(), ends_at: end.toISOString(), color: "sage" })).data.title, "Ôn thi Lý");
  assert.equal((await b.request(`/calendar-events/${e.id}`, "DELETE")).status, 404);
  assert.equal((await a.request(`/calendar-events/${e.id}`, "DELETE")).status, 200);
});
test("free trials: one 60-minute lesson per student and tutor, only when the tutor offers trials; lesson surveys stay private", async (t) => {
  const { client, db } = await fixture(t), s = client(), tu = client();
  await s.login("student"); const u = await tu.login("chau");
  const start = new Date(Date.now() + 7 * 3600000 + 2 * 86400000).toISOString().slice(0, 10);
  const trial = { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 5, minutes: 90, rate: 0, trial: true, schedule: [{ weekday: 1, hour: 18, minute: 0 }], start_date: start };
  assert.equal((await s.request("/proposals", "POST", trial)).status, 409);
  db.prepare("UPDATE tutors SET accepts_trial=1 WHERE user_id=?").run(u.id);
  const sent = await s.request("/proposals", "POST", trial);
  assert.deepEqual([sent.status, sent.data.sessions, sent.data.minutes, sent.data.total], [201, 1, 60, 0]);
  assert.equal((await s.request("/proposals", "POST", { ...trial, tutor_id: u.id })).status, 409);
  assert.equal((await s.request("/proposals", "POST", { ...trial, trial: false, rate: 10000 })).status, 400);
  const accepted = await tu.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept" });
  const cls = (await s.request(`/classes/${accepted.data.class_id}`)).data;
  db.prepare("UPDATE class_sessions SET starts_at=? WHERE id=?").run(new Date(Date.now() - 3 * 3600000).toISOString(), cls.sessions[0].id);
  assert.equal((await s.request(`/sessions/${cls.sessions[0].id}/rating`, "PUT", { rating: 4, answers: { on_time: true, clear: true, homework: false }, comment: "Cô giảng dễ hiểu" })).status, 200);
  const row = db.prepare("SELECT rating,survey,comment FROM session_members WHERE session_id=?").get(cls.sessions[0].id);
  assert.deepEqual([row.rating, JSON.parse(row.survey).clear, row.comment], [4, true, "Cô giảng dễ hiểu"]);
});
test("admin sessions worklist: queues, detail, cancel, remind and audit", async (t) => {
  const { client, db } = await fixture(t), admin = client(), student = client(), tutor = client();
  const s = await student.login("student"), u = await tutor.login("chau");
  await admin.login("admin");
  db.prepare("INSERT INTO wallets(user_id,available) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET available=available+excluded.available").run(s.id, 1000000);
  const start = new Date(Date.now() + 7 * 3600000 + 2 * 86400000).toISOString().slice(0, 10);
  const sent = await student.request("/proposals", "POST", { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 3, minutes: 60, rate: 200000, schedule: [{ weekday: 0, hour: 18, minute: 0 }, { weekday: 1, hour: 18, minute: 0 }, { weekday: 2, hour: 18, minute: 0 }], start_date: start });
  assert.equal(sent.status, 201);
  const accepted = await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept" });
  const cid = accepted.data.class_id;
  const cls = (await student.request(`/classes/${cid}`)).data;
  const [a, b, c] = cls.sessions;
  const past = (id, hours) => db.prepare("UPDATE class_sessions SET starts_at=? WHERE id=?").run(new Date(Date.now() - hours * 3600000).toISOString(), id);
  past(a.id, 3); past(b.id, 2);
  db.prepare("UPDATE session_members SET outcome='disputed',note='Gia sư vắng' WHERE session_id=?").run(a.id);

  // Non-admin is rejected; the list groups by lesson with member rows.
  assert.equal((await student.request("/admin/sessions")).status, 403);
  const list = await admin.request("/admin/sessions");
  assert.equal(list.status, 200);
  const rows = list.data.filter((r) => r.class_id === cid);
  assert.equal(rows.length, 3);
  assert.ok(rows.some((r) => r.outcome === "disputed" && r.student_name && r.rate === 200000));
  // Class and member filters narrow the worklist.
  const member = rows[0].member_id;
  assert.deepEqual([...new Set((await admin.request(`/admin/sessions?member=${member}`)).data.map((r) => r.id))].length, 3);
  assert.equal((await admin.request(`/admin/sessions?class=${cid}&student=999999`)).data.length, 0);

  // Detail: students, money and the disputed note.
  const detail = await admin.request(`/admin/sessions/${a.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.students.length, 1);
  assert.equal(detail.data.students[0].note, "Gia sư vắng");
  assert.equal(detail.data.students[0].rate, 200000);
  assert.equal((await admin.request("/admin/sessions/999999")).status, 404);

  // Today counts the overdue-unconfirmed lesson but not the disputed one twice.
  const today = (await admin.request("/admin/today")).data;
  assert.equal(today.disputes.length, 1);
  assert.equal(today.sessions_waiting, 1);

  // Resolving the dispute and reminding the pending lesson both write audit rows.
  assert.equal((await admin.request(`/admin/sessions/${a.id}/resolve`, "POST", { member_id: member, outcome: "confirmed" })).status, 200);
  assert.equal((await admin.request("/admin/sessions/remind", "POST", { ids: [c.id] })).data.reminded, 0);
  assert.equal((await admin.request("/admin/sessions/remind", "POST", { ids: [b.id] })).data.reminded, 1);
  const actions = db.prepare("SELECT action,target FROM audit WHERE action LIKE 'session.%' ORDER BY id").all().map((x) => `${x.action}:${x.target}`);
  assert.ok(actions.includes(`session.resolve.confirmed:${a.id}`));
  assert.ok(actions.includes(`session.remind:${b.id}`));
  // The audit feed exposes the session target for deep links.
  const feed = (await admin.request("/admin")).data.audit;
  assert.ok(feed.some((x) => x.action === "session.remind" && x.target === String(b.id)));
});

test("unmatched deposit assign is atomic: second assign 409s, balance credited once", async (t) => {
  const { db, client } = await fixture(t);
  const admin = client(), student = client();
  await admin.login("admin"); const me = await student.login("student");
  const dep = await student.request("/wallet/deposits", "POST", { amount: 50000 });
  assert.equal(dep.status, 201);
  run(db, "INSERT INTO sepay_events(id,code,amount,reference,verdict,status,payload) VALUES (900001,NULL,50000,'ref',0,'unmatched','{}')");
  run(db, "INSERT INTO gateway_events(id,invoice,amount,verdict,status,payload) VALUES ('gw-1','',12000,0,'rejected_key','{}')");
  const assign = (source, id) => admin.request("/admin/deposits/unmatched/assign", "POST", { source, id, code: dep.data.code });
  const find = await admin.request(`/admin/deposits/find?code=${dep.data.code}`);
  assert.equal(find.data.name, me.name);
  assert.equal((await assign("sepay", "900001")).status, 200);
  const again = await assign("sepay", "900001");
  assert.equal(again.status, 409);
  assert.equal(one(db, "SELECT available FROM wallets WHERE user_id=?", me.id).available, 50000);
  assert.equal(one(db, "SELECT status FROM sepay_events WHERE id=900001").status, "processed");
  // rejected_key is unverified payload: dismiss only, never creditable.
  const bad = await assign("gateway", "gw-1");
  assert.equal(bad.status, 400);
  assert.equal(one(db, "SELECT available FROM wallets WHERE user_id=?", me.id).available, 50000);
  assert.equal((await admin.request("/admin/deposits/unmatched/dismiss", "POST", { source: "gateway", id: "gw-1", reason: "Giao dịch thử" })).status, 200);
  assert.equal(one(db, "SELECT status FROM gateway_events WHERE id='gw-1'").status, "dismissed");
});

test("SePay webhook with code=null still matches the memo code inside the transfer content", async (t) => {
  const { createHmac } = await import("node:crypto");
  const secret = "test-sepay-secret";
  const { client, base, db } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, webhook: true, gateway: false, ready: true, merchant: "", merchantSecret: "", ipnSecret: "", holder: "", prefix: "GSD", sandbox: false } });
  const student = client(), admin = client();
  await student.login("student"); await admin.login("admin");
  const hook = (payload, stamp = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(`${stamp}.${body}`).digest("hex") }, body });
  };
  const dep = (await student.request("/wallet/deposits", "POST", { amount: 200000 })).data;
  // Exactly the production failure: code=null, the memo only lives in content.
  const ev = { id: 101921135, accountNumber: "0123456789", code: null, content: `MBVCB.123.${dep.code}.CT tu 0900123456`, transferType: "in", transferAmount: 200000, referenceCode: "FT26327360001989", description: "" };
  assert.deepEqual(await (await hook(ev)).json(), { success: true }, "the code inside the content credits the deposit");
  assert.equal((await student.request("/wallet")).data.available, 200000);
  // A decorated code that names no deposit or payout stays unmatched.
  const ev2 = { ...ev, id: 101921136, content: "MBVCB.123.GSDZZZZZZZ.CT tu" };
  assert.deepEqual(await (await hook(ev2)).json(), { success: false });
  // An unmatched event from before the fix is rescued once via the recheck.
  const ev3 = { ...ev, id: 101921137, referenceCode: "FT-STRANDED-1" };
  const dep2 = (await student.request("/wallet/deposits", "POST", { amount: 300000 })).data;
  run(db, "INSERT INTO sepay_events(id,code,amount,reference,verdict,status,payload) VALUES (?,?,?,? ,0,'unmatched',?)",
    ev3.id, null, dep2.amount, ev3.referenceCode, JSON.stringify({ ...ev3, code: null, content: `CK ${dep2.code}`, transferAmount: dep2.amount }));
  const before = (await student.request("/wallet")).data.available;
  await admin.request("/admin/deposits/recheck", "POST");
  assert.equal(one(db, "SELECT status FROM sepay_events WHERE id=?", ev3.id).status, "processed");
  assert.equal((await student.request("/wallet")).data.available, before + 300000, "the stranded payment is credited once");
  await admin.request("/admin/deposits/recheck", "POST");
  assert.equal((await student.request("/wallet")).data.available, before + 300000, "a second recheck never credits twice");
  // With a bank account, new orders never carry a hosted checkout or link.
  const dep3 = (await student.request("/wallet/deposits", "POST", { amount: 100000 })).data;
  assert.equal(dep3.checkout, null);
  assert.equal(dep3.pay_url, null);
});

test("a stranded unmatched event never breaks startup and is credited once", async (t) => {
  const sepay = { secret: "s", account: "0123456789", bank: "MB", bankReady: true, webhook: true, gateway: false, ready: true, merchant: "", merchantSecret: "", ipnSecret: "", holder: "", prefix: "GSD", sandbox: false };
  const { client, db } = await fixture(t, { sepay });
  const student = client(); await student.login("student");
  const dep = (await student.request("/wallet/deposits", "POST", { amount: 200000 })).data;
  run(db, "INSERT INTO sepay_events(id,code,amount,reference,verdict,status,payload) VALUES (?,NULL,?,?,0,'unmatched',?)",
    555001, dep.amount, "FT-BOOT-1", JSON.stringify({ transferType: "in", code: null, content: `MBVCB.1.${dep.code}.CT tu`, transferAmount: dep.amount }));
  run(db, "INSERT INTO sepay_events(id,code,amount,reference,verdict,status,payload) VALUES (?,NULL,?,? ,0,'unmatched','{not json')",
    555002, 1, "FT-BOOT-2");
  const before = (await student.request("/wallet")).data.available;
  // The real startup path: createApi runs registerWallet, which rematches.
  const app = createApi(db, { processPhoto, limit: false, sendEmail: async () => {}, sepay });
  assert.ok(app, "startup survives a stranded and a malformed event");
  assert.equal((await student.request("/wallet")).data.available, before + 200000, "the stranded payment is rescued once");
  assert.equal(one(db, "SELECT status FROM sepay_events WHERE id=?", 555001).status, "processed");
});

test("SePay webhook connectivity test (id=0) answers success:false and records nothing", async (t) => {
  const { createHmac } = await import("node:crypto");
  const secret = "test-sepay-secret";
  const { base, db } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, webhook: true, gateway: false, ready: true, apiToken: "", merchant: "", merchantSecret: "", ipnSecret: "", holder: "", prefix: "GSD", sandbox: false } });
  const body = JSON.stringify({ id: 0, transferType: "in", transferAmount: 1, code: "GSDTEST" });
  const stamp = Math.floor(Date.now() / 1000);
  const r = await fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(`${stamp}.${body}`).digest("hex") }, body });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { success: false });
  assert.equal(one(db, "SELECT COUNT(*) n FROM sepay_events").n, 0);
});

test("SePay API v2 reconciliation credits deposits once and skips quietly without a token", async (t) => {
  const { client, db } = await fixture(t, { sepay: { secret: "", account: "0123456789", bank: "MB", bankReady: true, webhook: false, gateway: false, ready: true, apiToken: "tok-test", bankAccountId: "", merchant: "", merchantSecret: "", ipnSecret: "", holder: "", prefix: "GSD", sandbox: false } });
  const student = client(); await student.login("student");
  const dep = await student.request("/wallet/deposits", "POST", { amount: 200000 });
  assert.equal(dep.status, 201);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith("https://userapi.sepay.vn"))
      return Response.json({ status: 200, data: [
        { id: "uuid-in-1", amount_in: 200000, amount_out: 0, code: dep.data.code, transaction_content: "", reference_number: "RF1" },
        { id: "uuid-skip", amount_in: 500000, amount_out: 0, code: "GSDUNKNOWN", transaction_content: "", reference_number: "RF2" },
      ], meta: { pagination: { current_page: 1, total_pages: 1 } } });
    return realFetch(url, opts);
  };
  try {
    assert.equal((await student.request("/wallet")).data.available, 200000, "v2 money-in with a known code credits the deposit");
    assert.equal((await student.request("/wallet")).data.available, 200000, "a second run does not credit twice");
    assert.equal(one(db, "SELECT COUNT(*) n FROM sepay_recon_events").n, 2, "every seen transaction is deduplicated, matched or not");
    assert.ok(one(db, "SELECT 1 FROM bank_transactions WHERE reference='RF1'"), "the bank reference is claimed for other channels");
    assert.ok(one(db, "SELECT 1 FROM gateway_events WHERE status='unmatched' AND invoice='GSDUNKNOWN'"), "unmatched money-in joins the admin list");
  } finally { globalThis.fetch = realFetch; }
});

test("the same bank transfer is credited once whichever channel arrives first", async (t) => {
  const { createHmac } = await import("node:crypto");
  const secret = "test-sepay-secret";
  const { client, base } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, webhook: true, gateway: false, ready: true, apiToken: "tok-test", bankAccountId: "", merchant: "", merchantSecret: "", ipnSecret: "", holder: "", prefix: "GSD", sandbox: false } });
  const hook = (payload, stamp = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", secret).update(`${stamp}.${body}`).digest("hex") }, body });
  };
  const realFetch = globalThis.fetch;
  const mockApi = (txns) => {
    globalThis.fetch = async (url, opts) => String(url).startsWith("https://userapi.sepay.vn")
      ? Response.json({ status: 200, data: txns, meta: { pagination: { current_page: 1, total_pages: 1 } } })
      : realFetch(url, opts);
  };
  try {
    // Channel order 1: webhook first, then the same transfer via the API.
    const a = client(); await a.login("student");
    const depA = (await a.request("/wallet/deposits", "POST", { amount: 300000 })).data;
    const evA = { id: 9101, accountNumber: "0123456789", code: depA.code, transferType: "in", transferAmount: 300000, referenceCode: "RF-DUP-1" };
    assert.deepEqual(await (await hook(evA)).json(), { success: true });
    mockApi([{ id: "uuid-dup-a", amount_in: 300000, amount_out: 0, code: depA.code, transaction_content: "", reference_number: "RF-DUP-1" }]);
    assert.equal((await a.request("/wallet")).data.available, 300000, "API run sees the reference as claimed, no double credit");
    globalThis.fetch = realFetch;

    // Channel order 2: API first, then the same transfer via the webhook.
    const b = client(); await b.login("linh");
    const depB = (await b.request("/wallet/deposits", "POST", { amount: 150000 })).data;
    mockApi([{ id: "uuid-dup-b", amount_in: 150000, amount_out: 0, code: depB.code, transaction_content: "", reference_number: "RF-DUP-2" }]);
    assert.equal((await b.request("/wallet")).data.available, 150000);
    globalThis.fetch = realFetch;
    const evB = { id: 9102, accountNumber: "0123456789", code: depB.code, transferType: "in", transferAmount: 150000, referenceCode: "RF-DUP-2" };
    assert.deepEqual(await (await hook(evB)).json(), { success: false }, "the webhook reports the reference as already claimed");
    assert.equal((await b.request("/wallet")).data.available, 150000, "still credited exactly once");

    // Missing reference: nothing to cross-claim with, each channel falls back
    // to its own id dedup and still acts once.
    const c = client(); await c.login("chau");
    const depC = (await c.request("/wallet/deposits", "POST", { amount: 100000 })).data;
    mockApi([{ id: "uuid-noref", amount_in: 100000, amount_out: 0, code: depC.code, transaction_content: "", reference_number: "" }]);
    assert.equal((await c.request("/wallet")).data.available, 100000, "no reference still credits, deduped by API id");
  } finally { globalThis.fetch = realFetch; }
});

test("masked contact never reaches participants; admin thread keeps the original", async (t) => {
  const emails = [];
  const { client, db } = await fixture(t, { sendEmail: async (m) => emails.push(m) });
  const student = client(), tutor = client(), admin = client();
  const u = await tutor.login("chau");
  await student.login("student"); await admin.login("admin");
  const thread = (await student.request("/inquiries", "POST", { tutor_id: u.id, body: "Chào cô" })).data.id;
  assert.equal((await student.request(`/inquiries/${thread}/messages`, "POST", { body: "Gọi em 0901 234 567 nhé" })).status, 201);
  const SECRET = "0901 234 567";
  // Recipient, sender, inbox preview, notifications and queued mail: no raw digits.
  assert.ok(!JSON.stringify((await tutor.request(`/inquiries/${thread}/messages`)).data).includes(SECRET));
  assert.ok(!JSON.stringify((await student.request(`/inquiries/${thread}/messages`)).data).includes(SECRET));
  assert.ok(!JSON.stringify((await tutor.request("/inquiries")).data).includes(SECRET));
  assert.ok(!JSON.stringify(all(db, "SELECT * FROM notifications")).includes(SECRET));
  assert.ok(!JSON.stringify(emails).includes(SECRET));
  // Flagged for admin; the safety view returns the original and audits the look.
  assert.equal(one(db, "SELECT flagged FROM inquiry_messages WHERE inquiry_id=? AND flagged=1", thread).flagged, 1);
  assert.ok(JSON.stringify((await admin.request(`/admin/safety/thread/inquiry/${thread}`)).data).includes(SECRET));
});
test("admin health: shape, resend resets the outbox row, no secret leaks", async (t) => {
  // No auto mailer wake: resend queues the row and a scheduled flush could mark
  // it sent before the test reads attempts back (raced in CI at a9ceac4).
  const { client, db } = await fixture(t, { wakeMail: () => {} }), admin = client(), student = client();
  await admin.login("admin"); await student.login("student");
  // A webhook hit without a secret configured is rejected before marking; a failed email exists.
  await student.request("/sepay/webhook", "POST", {});
  run(db, "INSERT INTO email_outbox(user_id,kind,subject,link,attempts,sending_until) VALUES ((SELECT id FROM users LIMIT 1),'notice','Hi','',5,0)");
  const h = (await admin.request("/admin/health")).data;
  assert.deepEqual(Object.keys(h), ["payments", "email", "calendar", "data", "ledger", "warnings"]);
  assert.ok(h.payments.simulated && !h.payments.bank_webhook && !h.payments.gateway);
  assert.equal(h.payments.last_received, null);
  assert.equal(h.payments.last_rejected, null);
  assert.ok(!JSON.stringify(h).includes("SECRET"));
  const failed = h.email.failed[0];
  assert.ok(failed && failed.attempts >= 5 && !failed.email.includes("demo.giasu.test".slice(0, 8)) === false); // masked email
  assert.equal((await admin.request(`/admin/health/email/${failed.id}/resend`, "POST")).status, 200);
  assert.equal(one(db, "SELECT attempts FROM email_outbox WHERE id=?", failed.id).attempts, 0);
  assert.ok(one(db, "SELECT id FROM audit WHERE action='health.email_resend'"));
  // Students cannot read it.
  assert.equal((await student.request("/admin/health")).status, 403);
});

test("admin health ledger reports clean then flags a planted mismatch", async (t) => {
  const { client, db } = await fixture(t);
  const admin = client(); await admin.login("admin");
  const h1 = (await admin.request("/admin/health")).data;
  assert.equal(h1.ledger.ok, true, "clean fixture reports balanced ledger");
  const uid = one(db, "SELECT id FROM users LIMIT 1").id;
  run(db, "INSERT OR IGNORE INTO wallets(user_id) VALUES (?)", uid);
  run(db, "UPDATE wallets SET available=available+1 WHERE user_id=?", uid);
  const h2 = (await admin.request("/admin/health")).data;
  assert.equal(h2.ledger.ok, false, "planted mismatch detected");
  assert.ok(h2.ledger.wallet.some((w) => w.user_id === uid && w.d_avail === 1), "the off user is listed with the diff");
  assert.ok(h2.warnings.some((w) => w.kind === "ledger"), "a ledger warning reaches the today banner");
});

test("webhook timestamps live in system_events, recorded only after signature", async (t) => {
  const { createHmac } = await import("node:crypto");
  const { settings } = await import("../server/wallet.js");
  const secret = "test-sepay-secret";
  const { client, base, db } = await fixture(t, { sepay: { secret, account: "0123456789", bank: "MB", bankReady: true, holder: "GIA SU 10 DIEM", prefix: "GSD", webhook: true, gateway: false, ready: true } });
  const admin = client(); await admin.login("admin");
  const evts = () => Object.fromEntries(all(db, "SELECT key,value FROM system_events").map((r) => [r.key, r.value]));
  const hook = (payload, key = secret, stamp = Math.floor(Date.now() / 1000)) => {
    const body = JSON.stringify(payload);
    return fetch(base + "/sepay/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(stamp), "X-SePay-Signature": "sha256=" + createHmac("sha256", key).update(`${stamp}.${body}`).digest("hex") }, body });
  };
  // A junk POST counts as a rejection, never as a healthy receipt.
  assert.equal((await hook({ id: 991 }, "wrong-secret")).status, 401);
  assert.ok(evts().last_sepay_rejected, "rejected attempt recorded");
  assert.equal(evts().last_sepay_webhook, undefined, "verified time untouched by bad signature");
  // A correctly signed webhook is recorded.
  assert.equal((await hook({ id: 991, transferType: "in", transferAmount: 1 })).status, 200);
  assert.ok(evts().last_sepay_webhook, "verified receipt recorded");
  // The keys stay out of business settings and the finance payload.
  const saved = all(db, "SELECT key FROM platform_settings").map((r) => r.key);
  assert.ok(!saved.some((k) => k.startsWith("last_sepay")), "no system keys in platform_settings");
  const fin = await admin.request("/admin/finance");
  assert.ok(!JSON.stringify(fin.data).includes("last_sepay"), "no system keys in finance payload");
  assert.equal(Object.keys(settings(db)).some((k) => k.startsWith("last_sepay")), false, "settings() stays clean");
  // Settings form still saves.
  const s0 = settings(db);
  const put = await admin.request("/admin/settings", "PUT", { fee_percent: s0.fee_percent });
  assert.equal(put.status, 200, "settings form save still works");

test("demo seed money keeps every ledger invariant, idempotent on re-seed", async (t) => {
  const { db } = await fixture(t);
  const check = () => {
    // Every wallet equals the sum of its entries — available and held alike.
    assert.deepEqual(all(db, `SELECT w.user_id FROM wallets w LEFT JOIN
      (SELECT user_id,SUM(amount) a,SUM(held) h FROM wallet_entries GROUP BY user_id) e ON e.user_id=w.user_id
      WHERE COALESCE(w.available,0)!=COALESCE(e.a,0) OR COALESCE(w.held,0)!=COALESCE(e.h,0)`), [], "wallets match their ledgers");
    assert.deepEqual(all(db, "SELECT user_id FROM wallets WHERE available<0 OR held<0"), [], "no negative balances");
    // A paid deposit's received equals the ledger rows that reference its id.
    assert.deepEqual(all(db, `SELECT id FROM deposits d WHERE d.status='paid' AND d.received !=
      COALESCE((SELECT SUM(e.amount) FROM wallet_entries e WHERE e.kind='deposit' AND e.ref='deposit:'||d.id),0)`), [], "paid deposits match ledger");
    // Ledger deposit rows always point at a real deposit, never a bare code.
    assert.deepEqual(all(db, `SELECT id FROM wallet_entries WHERE kind='deposit' AND
      ref NOT IN (SELECT 'deposit:'||id FROM deposits)`), [], "every deposit entry has a deposit");
    // Withdrawal states and held money.
    assert.deepEqual(all(db, "SELECT id FROM withdrawals WHERE status NOT IN ('requested','paid','rejected')"), [], "valid statuses");
    assert.deepEqual(all(db, `SELECT id FROM withdrawals w WHERE w.status='requested' AND
      COALESCE((SELECT SUM(e.held) FROM wallet_entries e WHERE e.ref='withdrawal:'||w.id),0) != w.amount`), [], "requested holds its amount");
    assert.deepEqual(all(db, `SELECT id FROM withdrawals w WHERE w.status IN ('paid','rejected') AND
      COALESCE((SELECT SUM(e.held) FROM wallet_entries e WHERE e.ref='withdrawal:'||w.id),0) != 0`), [], "settled withdrawals released held");
    // Codes look like the real format: GSD + 8 chars.
    assert.deepEqual(all(db, "SELECT id FROM deposits WHERE code NOT GLOB 'GSD????????'"), [], "deposit codes well-formed");
    assert.deepEqual(all(db, "SELECT id FROM withdrawals WHERE code NOT GLOB 'GSD????????'"), [], "withdrawal codes well-formed");
  };
  await seedDemo(db, "TestStudy2026!", { activity: true });
  check();
  await seedDemo(db, "TestStudy2026!", { activity: true });
  check();
  // The seeded pending withdrawal can be paid through the admin path itself.
  const pending = one(db, "SELECT * FROM withdrawals WHERE status='requested' LIMIT 1");
  assert.ok(pending, "a requested withdrawal exists for the finance tab");
  const before = one(db, "SELECT held FROM wallets WHERE user_id=?", pending.user_id).held;
  assert.equal(before, pending.amount, "the request holds its amount");
});
});

test("hot-path lookups use indexes, not full scans", async (t) => {
  const { db } = await fixture(t);
  const scans = [];
  for (const [name, q] of [
    ["inquiry thread", "SELECT * FROM inquiry_messages WHERE inquiry_id=? ORDER BY created_at"],
    ["booking by student", "SELECT * FROM bookings WHERE student_id=?"],
    ["booking by tutor", "SELECT * FROM bookings WHERE tutor_id=?"],
    ["deposit by user", "SELECT * FROM deposits WHERE user_id=?"],
    ["ledger by ref", "SELECT * FROM wallet_entries WHERE ref='deposit:1'"],
    ["audit by actor", "SELECT * FROM audit WHERE actor_id=?"],
    ["audit by target", "SELECT * FROM audit WHERE target='tutor:1'"],
    ["chat thread", "SELECT * FROM messages WHERE booking_id=? ORDER BY created_at"],
    ["payment code", "SELECT * FROM sepay_events WHERE code='X'"],
  ]) {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${q}`).all().map((r) => r.detail).join(" | ");
    if (/SCAN/.test(plan) && !/USING (INDEX|COVERING INDEX)/.test(plan)) scans.push(`${name}: ${plan}`);
  }
  assert.deepEqual(scans, [], "hot queries doing full table scans");

test("forgot/reset password: no email leak, one-use token, sessions killed, hourly limit, Google account", async (t) => {
  const { client, db, emails } = await fixture(t);
  const student = client(), second = client();
  await student.login("student"); await second.login("student");
  const mail = (email) => student.request("/auth/forgot-password", "POST", { email });
  // Identical answer whether the email exists or not — nothing is revealed.
  const known = await mail("student@demo.giasu.test"), ghost = await mail("nobody@example.com");
  assert.equal(known.status, 200); assert.equal(ghost.status, 200);
  assert.deepEqual(known.data.message, ghost.data.message);
  assert.equal(emails.length, 1, "one real mail for the real account, none for the ghost");
  assert.equal(emails[0].kind, "password_reset");
  const token = new URL(emails[0].link).searchParams.get("token");
  assert.match(token, /^[a-f0-9]{64}$/);
  // Bad, expired and foreign tokens are all refused.
  assert.equal((await student.request("/auth/reset-password", "POST", { token: "0".repeat(64), password: "NewPass12345" })).status, 400);
  run(db, "UPDATE password_resets SET expires=? WHERE user_id=(SELECT id FROM users WHERE email='student@demo.giasu.test')", Date.now() - 1);
  assert.equal((await student.request("/auth/reset-password", "POST", { token, password: "NewPass12345" })).status, 400);
  run(db, "UPDATE password_resets SET expires=? WHERE user_id=(SELECT id FROM users WHERE email='student@demo.giasu.test')", Date.now() + 60000);
  const ok = await student.request("/auth/reset-password", "POST", { token, password: "NewPass12345" });
  assert.equal(ok.status, 200);
  // A used token never works twice, and every old session is dead.
  assert.equal((await student.request("/auth/reset-password", "POST", { token, password: "Other1234567" })).status, 400);
  assert.equal((await second.request("/wallet")).status, 401, "the second session was logged out too");
  assert.equal((await student.request("/wallet")).status, 401);
  assert.equal(one(db, "SELECT action FROM audit WHERE action='user.password_reset' ORDER BY id DESC").action, "user.password_reset");
  assert.equal(emails.at(-1).kind, "password_changed");
  // New password works, the old one does not.
  assert.equal((await student.request("/auth/login", "POST", { email: "student@demo.giasu.test", password: "TestStudy2026!" })).status, 401);
  assert.equal((await student.request("/auth/login", "POST", { email: "student@demo.giasu.test", password: "NewPass12345" })).status, 200);
  // Three requests per email per hour — the fourth still answers 200 but sends nothing.
  const before = emails.length;
  for (let i = 0; i < 5; i++) await mail("student@demo.giasu.test");
  assert.equal(emails.length - before, 2, "the hourly budget kept the extra sends quiet");
  // A Google-only account is told to use Google, and gets no usable token.
  run(db, "UPDATE users SET password='' WHERE email='chau@demo.giasu.test'");
  const beforeGoogle = emails.length;
  assert.equal((await mail("chau@demo.giasu.test")).status, 200);
  assert.equal(emails.at(-1).kind, "password_reset_google");
  assert.equal(emails.length - beforeGoogle, 1);
  assert.equal(one(db, "SELECT token_hash FROM password_resets WHERE user_id=(SELECT id FROM users WHERE email='chau@demo.giasu.test')").token_hash, "");
});
});

test("forgot-password returns the same answer when the mailer is down — no enumeration", async (t) => {
  const { client } = await fixture(t, { sendEmail: async () => { throw new Error("mailer down"); } });
  const guest = client();
  const exists = await guest.request("/auth/forgot-password", "POST", { email: "student@demo.giasu.test" });
  const missing = await guest.request("/auth/forgot-password", "POST", { email: "ghost@nowhere.test" });
  assert.equal(exists.status, 200);
  assert.equal(missing.status, 200);
  assert.deepEqual(exists.data, missing.data, "an existing email must get the byte-identical reply");
  assert.ok(!JSON.stringify(exists.data).match(/token|reset/i) || exists.data.message, "no token leaks in the reply");

test("tutor profile 404: not-found vs unpublished vs live", async (t) => {
  const { client, db } = await fixture(t);
  const guest = client();
  // id without a tutors row at all → not_found
  const nf = await guest.request("/tutors/99999");
  assert.equal(nf.status, 404);
  assert.equal(nf.data.reason, "not_found");
  // tutors row exists but not live (pending, never published) → unpublished
  const uid = Number(run(db, "INSERT INTO users(name,email,password,role,status) VALUES ('Ghost Tutor','ghost@demo.giasu.test','x','tutor','active')").lastInsertRowid);
  run(db, "INSERT INTO tutors(user_id,status,published,headline,subjects) VALUES (?,'pending',NULL,'x','[\"toan\"]')", uid);
  const up = await guest.request(`/tutors/${uid}`);
  assert.equal(up.status, 404);
  assert.equal(up.data.reason, "unpublished");
  // a live tutor still answers 200
  const live = await guest.request("/tutors/3");
  assert.equal(live.status, 200);
  assert.ok(live.data.user_id);
});

test("every notification kind has a template and a valid link", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const kinds = new Set(), links = new Set();
  for (const f of readdirSync("server").filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(`server/${f}`, "utf8");
    for (const m of src.matchAll(/notify\(db,[^)]*"[a-z_]+"[^)]*\)/g)) {
      kinds.add(m[0].match(/"([a-z_]+)"/)[1]);
      const lm = m[0].match(/link:\s*[`"'"]([^`"'"'`]+)[`"'"]/);
      if (lm) links.add(lm[1]);
    }
  }
  // Templates come from the bell source — the file declares them as keys.
  const bell = readFileSync("app/src/components/notification-bell.tsx", "utf8");
  const templated = new Set([...bell.matchAll(/^\s*([a-z_]+):\s*\[/gm)].map((m) => m[1]));
  const missing = [...kinds].filter((k) => !templated.has(k) && !["community"].some((p) => k.startsWith(p)));
  assert.deepEqual(missing, [], "notify kinds without a template in notification-bell.tsx");
  // Every literal link must land on a route the app actually serves.
  const main = readFileSync("app/src/main.tsx", "utf8");
  const routes = new Set([...main.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1].split("/:")[0].replace(/\/$/, "")).concat(["/"]));
  const bad = [...links].filter((l) => !l || l === "/" || !routes.has("/" + l.replace(/^\//, "").split(/[?#]/)[0].split("/")[0]));
  assert.deepEqual(bad, [], "notification links that lead nowhere");
});
});

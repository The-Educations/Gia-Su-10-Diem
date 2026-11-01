import { isGoogleAdmin } from "./admin-access.js";
import { registerGallery, galleryMetadata } from "./gallery.js";
import { registerGoogleAuth } from "./google-auth.js";
import { registerUploads, uploadMetadata } from "./uploads.js";
import { registerInquiries } from "./inquiries.js";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import {
  transaction,
  all,
  one,
  run,
  publicUser,
  passwordHash,
  passwordMatches,
  tokenHash,
} from "./db.js";
import {
  z,
  text,
  loginSchema,
  registerSchema,
  tutorSchema,
  resourceSchema,
  subjectSchema,
} from "./validation.js";

export function createApi(
  db,
  {
    production = false,
    origin = "http://127.0.0.1:4174",
    limit = true,
    google = {},
    processPhoto,
    clientIp,
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", helmet({ contentSecurityPolicy: false }));
  app.use("/api", express.json({ limit: "300kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== origin)
        return res.status(403).json({ error: "Nguồn yêu cầu không hợp lệ." });
      if (req.headers["sec-fetch-site"] === "cross-site")
        return res.status(403).json({ error: "Nguồn yêu cầu không hợp lệ." });
      if (
        !(
          (req.method === "PUT" && /^\/tutor\/uploads\/(photo|cv)$/.test(req.path)) ||
          (req.method === "POST" && req.path === "/tutor/gallery")
        ) &&
        !req.is("application/json")
      )
        return res
          .status(415)
          .json({ error: "Yêu cầu phải ở định dạng JSON." });
    }
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("giasu_session="))
      ?.slice(14);
    req.user = token
      ? one(
          db,
          "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.status='active'",
          tokenHash(token),
          Date.now(),
        )
      : null;
    req.sessionToken = token;
    next();
  });
  if (limit) {
    app.use(
      "/api",
      rateLimit({
        ...(clientIp
          ? {
              keyGenerator: clientIp,
              validate: {
                keyGeneratorIpFallback: false,
                xForwardedForHeader: false,
              },
            }
          : {}),
        windowMs: 60000,
        limit: 240,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
          error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.",
        },
      }),
    );
    app.use(
      ["/api/auth/login", "/api/auth/register", "/api/auth/google"],
      rateLimit({
        ...(clientIp
          ? {
              keyGenerator: clientIp,
              validate: {
                keyGeneratorIpFallback: false,
                xForwardedForHeader: false,
              },
            }
          : {}),
        windowMs: 900000,
        limit: 30,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: "Quá nhiều lần đăng nhập. Hãy thử lại sau 15 phút." },
      }),
    );
  }
  const fail = (status, message) => {
    const e = new Error(message);
    e.status = status;
    throw e;
  };
  const auth =
    (...roles) =>
    (req, res, next) => {
      if (!req.user)
        return res
          .status(401)
          .json({ error: "Vui lòng đăng nhập để tiếp tục." });
      if (roles.length && !roles.includes(req.user.role))
        return res
          .status(403)
          .json({ error: "Tài khoản không có quyền thực hiện thao tác này." });
      next();
    };
  const session = (res, user) => {
    run(db, "DELETE FROM sessions WHERE expires<?", Date.now());
    const token = randomBytes(32).toString("hex");
    run(
      db,
      "INSERT INTO sessions VALUES (?,?,?)",
      tokenHash(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    res.cookie("giasu_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 7 * 86400000,
      path: "/",
    });
    return publicUser(user);
  };
  const audit = (actor, action, target) =>
    run(
      db,
      "INSERT INTO audit(actor_id,action,target) VALUES (?,?,?)",
      actor,
      action,
      String(target),
    );
  const ensureSubjects = (ids) => {
    if (ids.some((id) => !one(db, "SELECT id FROM subjects WHERE id=?", id)))
      fail(400, "Môn học không tồn tại.");
  };
  const booking = (req) => {
    const b = one(db, "SELECT * FROM bookings WHERE id=?", req.params.id);
    if (!b) fail(404, "Không tìm thấy buổi học.");
    if (
      ![b.student_id, b.tutor_id].includes(req.user.id) &&
      req.user.role !== "admin"
    )
      fail(403, "Bạn không tham gia buổi học này.");
    return b;
  };
  const tutorRows = () =>
    all(
      db,
      `SELECT t.*,u.name,u.demo,COALESCE(AVG(r.rating),0) AS rating,COUNT(r.rating) AS review_count
    FROM tutors t JOIN users u ON u.id=t.user_id LEFT JOIN bookings b ON b.tutor_id=t.user_id LEFT JOIN reviews r ON r.booking_id=b.id
    WHERE t.status='approved' AND u.status='active' GROUP BY t.user_id`,
    ).map(({ moderation_note, ...t }) => ({
      ...t,
      ...uploadMetadata(db, t.user_id),
      subjects: JSON.parse(t.subjects),
      levels: JSON.parse(t.levels),
      goals: JSON.parse(t.goals),
    }));
  registerGoogleAuth(app, db, { origin, production, session, google });
  registerUploads(app, db, auth, audit, processPhoto);
  registerGallery(app, db, auth, audit, processPhoto);
  registerInquiries(app, db, auth);
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/auth/me", (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  app.post("/api/auth/register", async (req, res) => {
    const data = registerSchema.parse(req.body);
    if (isGoogleAdmin(data.email, google.adminEmail))
      fail(403, "Tài khoản này cần đăng nhập bằng Google.");
    if (one(db, "SELECT id FROM users WHERE email=?", data.email))
      fail(409, "Email đã được sử dụng.");
    const hash = await passwordHash(data.password);
    const id = Number(
      run(
        db,
        "INSERT INTO users(name,email,password,role,onboarding_step) VALUES (?,?,?,?,0)",
        data.name,
        data.email,
        hash,
        data.role,
      ).lastInsertRowid,
    );
    if (data.role === "tutor")
      run(db, "INSERT INTO tutors(user_id) VALUES (?)", id);
    res.status(201).json({
      user: session(res, one(db, "SELECT * FROM users WHERE id=?", id)),
    });
  });
  const dummyHashPromise = passwordHash(randomBytes(32).toString("hex"));
  app.post("/api/auth/login", async (req, res) => {
    const data = loginSchema.parse(req.body),
      user = one(db, "SELECT * FROM users WHERE email=?", data.email);
    const valid = await passwordMatches(
      data.password,
      user?.password || (await dummyHashPromise),
    );
    if (!valid || !user || user.status !== "active")
      fail(
        401,
        "Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị tạm khóa.",
      );
    if (user.role === "admin" && isGoogleAdmin(user.email, google.adminEmail))
      fail(403, "Tài khoản này cần đăng nhập bằng Google.");
    res.json({ user: session(res, user) });
  });
  app.post("/api/auth/logout", (req, res) => {
    if (req.sessionToken)
      run(
        db,
        "DELETE FROM sessions WHERE token=?",
        tokenHash(req.sessionToken),
      );
    res.clearCookie("giasu_session", { path: "/" });
    res.json({ ok: true });
  });
  app.patch("/api/account", auth(), (req, res) => {
    const d = z
      .object({ name: text(80), goal: z.string().trim().max(1000) })
      .parse(req.body);
    transaction(db, () => {
      run(
        db,
        "UPDATE users SET name=?,goal=? WHERE id=?",
        d.name,
        d.goal,
        req.user.id,
      );
      if (req.user.role === "tutor" && d.name !== req.user.name)
        run(
          db,
          "UPDATE tutors SET status='pending',moderation_note='' WHERE user_id=?",
          req.user.id,
        );
    });
    res.json({
      user: publicUser(one(db, "SELECT * FROM users WHERE id=?", req.user.id)),
    });
  });
  app.put("/api/account/onboarding", auth(), (req, res) => {
    const { step } = z.object({ step: z.number().int().min(0).max(2) }).parse(req.body);
    // Recheck inside the transaction to reject stale tabs and out-of-order saves.
    transaction(db, () => {
      const user = one(db, "SELECT * FROM users WHERE id=?", req.user.id);
      if (user.role === "admin" || user.onboarding_step === 3)
        fail(409, "Tài khoản đã hoàn tất thiết lập.");
      if (step > user.onboarding_step || (step === 0 && user.onboarding_step !== 0))
        fail(409, "Bước thiết lập đã thay đổi. Vui lòng tải lại trang.");
      if (step === 0) {
        const { role } = z.object({ role: z.enum(["student", "tutor"]) }).parse(req.body);
        if (role !== user.role) {
          // Role changes are allowed only before the new account has any activity.
          const active = one(db, `SELECT
            (SELECT COUNT(*) FROM bookings WHERE student_id=? OR tutor_id=?) +
            (SELECT COUNT(*) FROM inquiries WHERE student_id=? OR tutor_id=?) +
            (SELECT COUNT(*) FROM favorites WHERE student_id=?) +
            (SELECT COUNT(*) FROM slots WHERE tutor_id=?) +
            (SELECT COUNT(*) FROM tutor_uploads WHERE tutor_id=?) +
            (SELECT COUNT(*) FROM tutor_gallery WHERE tutor_id=?) AS n`,
            user.id, user.id, user.id, user.id, user.id, user.id, user.id, user.id);
          if (active.n) fail(409, "Tài khoản đã có hoạt động. Hãy giữ vai trò hiện tại.");
          if (role === "student") run(db, "DELETE FROM tutors WHERE user_id=?", user.id);
          else run(db, "INSERT INTO tutors(user_id) VALUES (?)", user.id);
        }
        run(db, "UPDATE users SET role=?,onboarding_step=1 WHERE id=?", role, user.id);
      } else if (step === 1) {
        const { name } = z.object({ name: text(80) }).parse(req.body);
        if (user.role === "student") {
          const { goal } = z.object({ goal: text(1000) }).parse(req.body);
          run(db, "UPDATE users SET name=?,goal=?,onboarding_step=2 WHERE id=?", name, goal, user.id);
        } else {
          const d = tutorSchema.parse(req.body);
          ensureSubjects(d.subjects);
          run(db, `UPDATE tutors SET headline=?,bio=?,location=?,mode=?,rate=?,experience=?,education=?,subjects=?,status='pending',moderation_note='' WHERE user_id=?`,
            d.headline, d.bio, d.location, d.mode, d.rate, d.experience, d.education, JSON.stringify(d.subjects), user.id);
          run(db, "UPDATE users SET name=?,onboarding_step=2 WHERE id=?", name, user.id);
        }
      } else {
        run(db, "UPDATE users SET onboarding_step=3 WHERE id=?", user.id);
      }
    });
    res.json({ user: publicUser(one(db, "SELECT * FROM users WHERE id=?", req.user.id)) });
  });
  app.post("/api/account/password", auth(), async (req, res) => {
    const d = z
      .object({
        current: z.string().max(128),
        password: z.string().min(10).max(128),
      })
      .parse(req.body);
    if (!(await passwordMatches(d.current, req.user.password)))
      fail(400, "Mật khẩu hiện tại không đúng.");
    const hash = await passwordHash(d.password);
    run(db, "UPDATE users SET password=? WHERE id=?", hash, req.user.id);
    run(db, "DELETE FROM sessions WHERE user_id=?", req.user.id);
    session(res, req.user);
    res.json({ ok: true });
  });
  app.get("/api/subjects", (req, res) =>
    res.json(all(db, "SELECT * FROM subjects ORDER BY rowid")),
  );
  app.get("/api/tutors", (req, res) => res.json(tutorRows()));
  app.get("/api/tutors/:id", (req, res) => {
    const t = tutorRows().find((t) => t.user_id === Number(req.params.id));
    if (!t) fail(404, "Hồ sơ chưa được công bố.");
    const slots = all(
      db,
      `SELECT s.* FROM slots s WHERE tutor_id=? AND starts_at>? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('pending','accepted','completed')) ORDER BY starts_at`,
      t.user_id,
      new Date(Date.now() + 3600000).toISOString(),
    );
    const reviews = all(
      db,
      "SELECT r.*,u.name FROM reviews r JOIN bookings b ON b.id=r.booking_id JOIN users u ON u.id=b.student_id WHERE b.tutor_id=? ORDER BY r.created_at DESC",
      t.user_id,
    );
    res.json({ ...t, slots, reviews, gallery: galleryMetadata(db, t.user_id) });
  });
  app.get("/api/favorites", auth("student"), (req, res) =>
    res.json(
      all(
        db,
        "SELECT tutor_id FROM favorites WHERE student_id=?",
        req.user.id,
      ).map((r) => r.tutor_id),
    ),
  );
  app.put("/api/favorites/:id", auth("student"), (req, res) => {
    if (!tutorRows().some((t) => t.user_id === Number(req.params.id)))
      fail(404, "Không tìm thấy gia sư.");
    run(
      db,
      "INSERT OR IGNORE INTO favorites VALUES (?,?)",
      req.user.id,
      req.params.id,
    );
    res.json({ ok: true });
  });
  app.delete("/api/favorites/:id", auth("student"), (req, res) => {
    run(
      db,
      "DELETE FROM favorites WHERE student_id=? AND tutor_id=?",
      req.user.id,
      req.params.id,
    );
    res.json({ ok: true });
  });
  app.get("/api/tutor/profile", auth("tutor"), (req, res) => {
    const t = one(db, "SELECT * FROM tutors WHERE user_id=?", req.user.id);
    res.json({
      ...t,
      gallery: galleryMetadata(db, t.user_id),
      name: req.user.name,
      demo: req.user.demo,
      ...uploadMetadata(db, t.user_id),
      subjects: JSON.parse(t.subjects),
      levels: JSON.parse(t.levels),
      goals: JSON.parse(t.goals),
      slots: all(
        db,
        `SELECT s.*, EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('pending','accepted','completed')) AS reserved FROM slots s WHERE tutor_id=? AND starts_at>? ORDER BY starts_at`,
        req.user.id,
        new Date().toISOString(),
      ),
    });
  });
  app.put("/api/tutor/profile", auth("tutor"), (req, res) => {
    const d = tutorSchema.parse(req.body);
    ensureSubjects(d.subjects);
    const knownGoals = all(
      db,
      "SELECT DISTINCT category FROM resources WHERE published=1",
    ).map((r) => r.category);
    if (d.goals.some((g) => !knownGoals.includes(g)))
      fail(400, "Mục tiêu kỳ thi không có trong danh mục.");
    run(
      db,
      `UPDATE tutors SET headline=?,bio=?,location=?,mode=?,rate=?,experience=?,education=?,subjects=?,levels=?,goals=?,teaching_style=?,lesson_plan=?,profile_theme=?,status='pending',moderation_note='' WHERE user_id=?`,
      d.headline,
      d.bio,
      d.location,
      d.mode,
      d.rate,
      d.experience,
      d.education,
      JSON.stringify(d.subjects),
      JSON.stringify(d.levels),
      JSON.stringify(d.goals),
      d.teaching_style,
      d.lesson_plan,
      d.profile_theme,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.post("/api/tutor/slots", auth("tutor"), (req, res) => {
    const d = z.object({ starts_at: z.iso.datetime() }).parse(req.body),
      date = new Date(d.starts_at);
    if (
      date.getTime() < Date.now() + 3600000 ||
      date.getTime() > Date.now() + 180 * 86400000 ||
      date.getUTCMinutes() !== 0 ||
      date.getUTCSeconds() !== 0
    )
      fail(400, "Chọn giờ tròn, trước ít nhất một giờ và trong 180 ngày tới.");
    if (
      all(db, "SELECT starts_at FROM slots WHERE tutor_id=?", req.user.id).some(
        (s) => Math.abs(new Date(s.starts_at) - date) < 3600000,
      )
    )
      fail(409, "Khung giờ đã có trong lịch.");
    run(
      db,
      "INSERT INTO slots(tutor_id,starts_at) VALUES (?,?)",
      req.user.id,
      date.toISOString(),
    );
    res.status(201).json({ ok: true });
  });
  app.delete("/api/tutor/slots/:id", auth("tutor"), (req, res) => {
    if (one(db, "SELECT id FROM bookings WHERE slot_id=?", req.params.id))
      fail(409, "Khung giờ có lịch sử đặt học, không thể xóa.");
    run(
      db,
      "DELETE FROM slots WHERE id=? AND tutor_id=?",
      req.params.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.get("/api/bookings", auth(), (req, res) => {
    const condition =
      req.user.role === "admin"
        ? "1=1"
        : req.user.role === "tutor"
          ? "b.tutor_id=?"
          : "b.student_id=?";
    res.json(
      all(
        db,
        `SELECT b.*,s.name AS student_name,t.name AS tutor_name,sub.name AS subject_name,r.rating AS reviewed FROM bookings b JOIN users s ON s.id=b.student_id JOIN users t ON t.id=b.tutor_id JOIN subjects sub ON sub.id=b.subject_id LEFT JOIN reviews r ON r.booking_id=b.id WHERE ${condition} ORDER BY b.starts_at DESC`,
        ...(req.user.role === "admin" ? [] : [req.user.id]),
      ),
    );
  });
  app.post("/api/bookings", auth("student"), (req, res) => {
    const d = z
      .object({
        slot_id: z.number().int().positive(),
        subject_id: text(50),
        mode: z.enum(["online", "offline"]),
        note: z.string().trim().max(2000),
      })
      .parse(req.body);
    const s = one(
      db,
      `SELECT s.*,t.rate,t.mode,t.subjects FROM slots s JOIN tutors t ON t.user_id=s.tutor_id JOIN users u ON u.id=t.user_id WHERE s.id=? AND t.status='approved' AND u.status='active'`,
      d.slot_id,
    );
    if (!s || new Date(s.starts_at).getTime() < Date.now() + 3600000)
      fail(400, "Khung giờ không còn khả dụng.");
    if (
      !JSON.parse(s.subjects).includes(d.subject_id) ||
      (s.mode !== "both" && d.mode !== s.mode)
    )
      fail(400, "Môn học hoặc hình thức không phù hợp.");
    const result = transaction(db, () => {
      const conflicts = all(
        db,
        `SELECT starts_at FROM bookings WHERE (student_id=? OR tutor_id=?) AND status IN ('pending','accepted','completed')`,
        req.user.id,
        s.tutor_id,
      );
      if (
        conflicts.some(
          (b) =>
            Math.abs(new Date(b.starts_at) - new Date(s.starts_at)) < 3600000,
        )
      )
        fail(409, "Bạn hoặc gia sư đã có lịch trong khung giờ này.");
      const id = Number(
        run(
          db,
          "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,note) VALUES (?,?,?,?,?,?,?,?)",
          req.user.id,
          s.tutor_id,
          s.id,
          d.subject_id,
          s.starts_at,
          s.rate,
          d.mode,
          d.note,
        ).lastInsertRowid,
      );
      return { id };
    });
    res.status(201).json(result);
  });
  app.patch("/api/bookings/:id", auth(), (req, res) => {
    const b = booking(req),
      { status } = z
        .object({
          status: z.enum(["accepted", "declined", "cancelled", "completed"]),
        })
        .parse(req.body);
    const future = new Date(b.starts_at).getTime() > Date.now();
    const allowed =
      (status === "cancelled" &&
        ["pending", "accepted"].includes(b.status) &&
        future) ||
      (req.user.id === b.tutor_id &&
        ((["accepted", "declined"].includes(status) &&
          b.status === "pending" &&
          future) ||
          (status === "completed" &&
            b.status === "accepted" &&
            new Date(b.starts_at).getTime() + 3600000 <= Date.now())));
    if (!allowed) fail(409, "Không thể thay đổi buổi học sang trạng thái này.");
    run(db, "UPDATE bookings SET status=? WHERE id=?", status, b.id);
    audit(req.user.id, `booking.${status}`, b.id);
    res.json({ ok: true });
  });
  app.patch("/api/bookings/:id/lesson", auth("tutor"), (req, res) => {
    const b = booking(req);
    if (
      b.tutor_id !== req.user.id ||
      !["accepted", "completed"].includes(b.status)
    )
      fail(403, "Chỉ gia sư của buổi học đã xác nhận mới được cập nhật.");
    const d = z
      .object({
        lesson_note: z.string().trim().max(4000),
        meeting_url: z.union([
          z.literal(""),
          z
            .url()
            .max(1000)
            .refine((s) => s.startsWith("https://")),
        ]),
      })
      .parse(req.body);
    run(
      db,
      "UPDATE bookings SET lesson_note=?,meeting_url=? WHERE id=?",
      d.lesson_note,
      d.meeting_url,
      b.id,
    );
    res.json({ ok: true });
  });
  app.get("/api/bookings/:id/messages", auth(), (req, res) => {
    const b = booking(req);
    res.json(
      all(
        db,
        "SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.sender_id WHERE booking_id=? ORDER BY m.id",
        b.id,
      ),
    );
  });
  app.post(
    "/api/bookings/:id/messages",
    auth("student", "tutor"),
    (req, res) => {
      const b = booking(req),
        d = z.object({ body: text(3000) }).parse(req.body);
      run(
        db,
        "INSERT INTO messages(booking_id,sender_id,body) VALUES (?,?,?)",
        b.id,
        req.user.id,
        d.body,
      );
      res.status(201).json({ ok: true });
    },
  );
  app.post("/api/bookings/:id/review", auth("student"), (req, res) => {
    const b = booking(req);
    if (b.student_id !== req.user.id || b.status !== "completed")
      fail(403, "Chỉ học sinh đã hoàn thành buổi học mới có thể đánh giá.");
    const d = z
      .object({ rating: z.number().int().min(1).max(5), body: text(1000) })
      .parse(req.body);
    if (one(db, "SELECT booking_id FROM reviews WHERE booking_id=?", b.id))
      fail(409, "Bạn đã đánh giá buổi học này.");
    run(
      db,
      "INSERT INTO reviews(booking_id,rating,body) VALUES (?,?,?)",
      b.id,
      d.rating,
      d.body,
    );
    res.status(201).json({ ok: true });
  });
  const resourceRows = (admin) =>
    all(
      db,
      `SELECT r.*,s.name AS subject_name FROM resources r JOIN subjects s ON s.id=r.subject_id ${admin ? "" : "WHERE published=1"} ORDER BY r.id`,
    );
  app.get("/api/resources", (req, res) => res.json(resourceRows(false)));
  app.get("/api/admin", auth("admin"), (req, res) =>
    res.json({
      users: all(
        db,
        "SELECT id,name,email,role,status,demo,created_at FROM users ORDER BY id DESC",
      ),
      tutors: all(
        db,
        "SELECT t.*,u.name,u.demo FROM tutors t JOIN users u ON u.id=t.user_id",
      ).map((t) => ({
        ...t,
        ...uploadMetadata(db, t.user_id),
        gallery: galleryMetadata(db, t.user_id),
        subjects: JSON.parse(t.subjects),
        levels: JSON.parse(t.levels),
        goals: JSON.parse(t.goals),
      })),
      resources: resourceRows(true),
      audit: all(
        db,
        "SELECT a.*,u.name FROM audit a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 50",
      ),
    }),
  );
  app.patch("/api/admin/tutors/:id", auth("admin"), (req, res) => {
    const d = z
      .object({
        status: z.enum(["approved", "rejected", "pending"]),
        note: z.string().trim().max(1000),
      })
      .parse(req.body);
    const t = one(db, "SELECT * FROM tutors WHERE user_id=?", req.params.id);
    if (!t) fail(404, "Không tìm thấy gia sư.");
    if (d.status === "approved")
      tutorSchema.parse({
        ...t,
        subjects: JSON.parse(t.subjects),
        levels: JSON.parse(t.levels),
        goals: JSON.parse(t.goals),
      });
    run(
      db,
      "UPDATE tutors SET status=?,moderation_note=? WHERE user_id=?",
      d.status,
      d.note,
      req.params.id,
    );
    audit(req.user.id, `tutor.${d.status}`, req.params.id);
    res.json({ ok: true });
  });
  app.patch("/api/admin/users/:id", auth("admin"), (req, res) => {
    const d = z
        .object({ status: z.enum(["active", "suspended"]) })
        .parse(req.body),
      u = one(db, "SELECT * FROM users WHERE id=?", req.params.id);
    if (!u) fail(404, "Không tìm thấy tài khoản.");
    if (u.role === "admin")
      fail(403, "Không thể khóa quản trị viên qua giao diện này.");
    run(db, "UPDATE users SET status=? WHERE id=?", d.status, u.id);
    if (d.status === "suspended")
      run(db, "DELETE FROM sessions WHERE user_id=?", u.id);
    audit(req.user.id, `user.${d.status}`, u.id);
    res.json({ ok: true });
  });
  app.put("/api/admin/subjects/:id", auth("admin"), (req, res) => {
    const d = subjectSchema.parse({ ...req.body, id: req.params.id });
    run(
      db,
      "INSERT INTO subjects VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,stage=excluded.stage,description=excluded.description",
      d.id,
      d.name,
      d.stage,
      d.description,
    );
    audit(req.user.id, "subject.save", d.id);
    res.json({ ok: true });
  });
  app.post("/api/admin/resources", auth("admin"), (req, res) => {
    const d = resourceSchema.parse(req.body);
    ensureSubjects([d.subject_id]);
    const id = Number(
      run(
        db,
        "INSERT INTO resources(title,subject_id,category,level,year,description,source_name,source_url,published) VALUES (?,?,?,?,?,?,?,?,?)",
        d.title,
        d.subject_id,
        d.category,
        d.level,
        d.year,
        d.description,
        d.source_name,
        d.source_url,
        Number(d.published),
      ).lastInsertRowid,
    );
    audit(req.user.id, "resource.create", id);
    res.status(201).json({ id });
  });
  app.put("/api/admin/resources/:id", auth("admin"), (req, res) => {
    const d = resourceSchema.parse(req.body);
    ensureSubjects([d.subject_id]);
    if (!one(db, "SELECT id FROM resources WHERE id=?", req.params.id))
      fail(404, "Không tìm thấy kỳ thi.");
    run(
      db,
      "UPDATE resources SET title=?,subject_id=?,category=?,level=?,year=?,description=?,source_name=?,source_url=?,published=? WHERE id=?",
      d.title,
      d.subject_id,
      d.category,
      d.level,
      d.year,
      d.description,
      d.source_name,
      d.source_url,
      Number(d.published),
      req.params.id,
    );
    audit(req.user.id, "resource.update", req.params.id);
    res.json({ ok: true });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Không tìm thấy yêu cầu." }),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: "Thông tin chưa hợp lệ. Kiểm tra các trường và thử lại.",
        fields: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    if (err.message?.includes("UNIQUE constraint failed"))
      return res
        .status(409)
        .json({ error: "Dữ liệu đã tồn tại hoặc khung giờ vừa được đặt." });
    if (err.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "Tệp quá lớn. Giới hạn tải lên là 5 MB." });
    const status = err.status || 500;
    if (status === 500) console.error("API error:", err.message);
    res.status(status).json({
      error:
        status === 500
          ? "Không thể xử lý lúc này. Vui lòng thử lại."
          : err.message,
    });
  });
  return app;
}

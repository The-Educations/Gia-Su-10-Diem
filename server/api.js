import { setMemberProfile } from "./community-profile.js";
import { displayNameSchema, authorLabel } from "./community-policy.js";
import { registerChatMedia, withChatMedia, insertChatMessage, insertChatEvent, chatPage } from "./chat-media.js";
import { registerCatalogRemoval } from "./catalog-removal.js";
import { registerGoogleCalendar } from "./google-calendar.js";
import { retireLegacyFlow, gone } from "./legacy-retire.js";
import { registerOffers } from "./offers.js";
import { registerNotifications, notify } from "./notifications.js";
import { createNoticeMailer } from "./notice-mail.js";
import { registerCredentials, verifiedCredentials } from "./credentials.js";
import { registerWallet, sepayConfig } from "./wallet.js";
import { registerProposals } from "./proposals.js";
import { registerClasses, classRatings } from "./classes.js";
import { registerCommunityTopics } from "./community-topics.js";
import { registerFamily } from "./family.js";
import { registerStudentVerification } from "./student-verification.js";
import { registerCalendarEvents } from "./calendar-events.js";
import { registerWeeklyRequests } from "./weekly-requests.js";
import { registerSupport } from "./support.js";
import { registerAccountDeletion } from "./account-deletion.js";
import { registerSignupVerification } from "./signup-verification.js";
import { registerCommunityImages } from "./community-images.js";
import { registerCommunity } from "./community.js";
import { registerTutorReview } from "./tutor-review.js";
import { pairReview } from "./reviews.js";
import { registerTrust, trustReader, publicReviews, lessonRatingFields } from "./trust.js";
import { TUTOR_NO_SHOW_WAIT_MINUTES, TUTOR_NO_SHOW_WINDOW_HOURS } from "./trust-policy.js";
import { liveTutorSql, isLiveTutor, publicView, publishedView, contentSnapshot, changedContent } from "./tutor-visibility.js";
import { registerTutorThemes, themeCatalog, themeInventory, ownsTheme } from "./tutor-themes.js";
import { overlaps, weeklySchedule, reconcileAvailability, refreshAvailability } from "./availability.js";
import { registerEmailVerification, needsEmailVerification } from "./email-verification.js";
import { registerPasswordReset } from "./password-reset.js";
import { registerPosts } from "./posts.js";
import { registerNewsImages } from "./news-images.js";
import { isGoogleAdmin } from "./admin-access.js";
import { registerGallery, galleryMetadata } from "./gallery.js";
import { registerGoogleAuth } from "./google-auth.js";
import { registerUploads, uploadMetadata } from "./uploads.js";
import { registerInquiries } from "./inquiries.js";
import { lessonMessageContext } from "./message-context.js";
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
  timezoneSchema,
  addressSchema,
  addressLabel,
  resourceSchema,
  availabilitySchema,
  subjectSchema,
} from "./validation.js";

export function createApi(
  db,
  {
    production = false,
    origin = "http://127.0.0.1:4174",
    limit = true,
    google = {},
    wakeCalendar,
    wakeMail,
    processPhoto,
    clientIp,
    sendEmail,
    sendAdminEmail,
    sepay = sepayConfig(),
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => { res.set("X-Robots-Tag", "noindex, nofollow"); next(); });
  // Emails queued by a request go out once its response has been sent.
  const mailer = createNoticeMailer(db, { sendEmail, origin });
  app.locals.flushMail = mailer.flush;
  app.use("/api", (req, res, next) => {
    if (req.method !== "GET") res.on("finish", () => { if (mailer.pending()) (wakeMail ? wakeMail() : setTimeout(() => void mailer.flush(), 0)); });
    next();
  });
  app.use("/api", helmet({ contentSecurityPolicy: false }));
  app.use("/api", express.json({
    limit: "300kb",
    // SePay signs the exact bytes it sent, so the webhook needs the raw body.
    verify: (req, res, buf) => { if (req.originalUrl === "/api/sepay/webhook") req.rawBody = buf.toString("utf8"); },
  }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== origin)
        return res.status(403).json({ error: "Nguồn yêu cầu không hợp lệ." });
      if (req.headers["sec-fetch-site"] === "cross-site")
        return res.status(403).json({ error: "Nguồn yêu cầu không hợp lệ." });
      if (
        !(
          (req.method === "PUT" && /^\/community\/me\/(avatar|cover)$/.test(req.path)) ||
          (req.method === "PUT" && /^\/tutor\/uploads\/(photo|banner|cv)$/.test(req.path)) ||
          (req.method === "POST" && (["/tutor/gallery", "/community/images", "/admin/news/images"].includes(req.path) || /^\/chat\/(inquiry|lesson|support)\/\d+\/attachments$/.test(req.path) || /^\/tutor\/credentials\/\d+\/files$/.test(req.path) || req.path === "/account/verification/files"))
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
      ["/api/auth/login", "/api/auth/register", "/api/auth/google", "/api/auth/verify-email", "/api/auth/resend-verification", "/api/auth/signup", "/api/auth/forgot-password", "/api/auth/reset-password"],
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
      if (needsEmailVerification(req.user))
        return res.status(403).json({ error: "Vui lòng xác nhận email để tiếp tục.", code: "EMAIL_UNVERIFIED" });
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
  const audit = (actor, action, target, detail) =>
    run(
      db,
      "INSERT INTO audit(actor_id,action,target,detail) VALUES (?,?,?,?)",
      actor,
      action,
      String(target),
      detail ? JSON.stringify(detail) : null,
    );
  const ensureSubjects = (ids) => {
    if (ids.some((id) => !one(db, "SELECT id FROM subjects WHERE id=? AND archived=0", id)))
      fail(400, "Môn học không tồn tại.");
  };
  retireLegacyFlow(db);
  // Retired flows: writes to the old booking/offer/weekly-request endpoints
  // answer 410 Gone; GETs stay so history keeps loading.
  for (const p of ["/api/bookings", "/api/bookings/:id", "/api/bookings/:id/start", "/api/bookings/:id/lesson", "/api/bookings/:id/messages", "/api/bookings/:id/review", "/api/bookings/:id/report", "/api/bookings/:id/rating", "/api/offers", "/api/offers/:id", "/api/offers/preview", "/api/weekly-requests", "/api/weekly-requests/:id"])
    app.all(p, (req, res, next) => (req.method === "GET" ? next() : gone(res)));
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
  const tutorRows = (preview = false) => {
    const trust = trustReader(db), verified = verifiedCredentials(db), ratings = classRatings(db);
    return all(
      db,
      `SELECT t.*,u.name,u.demo,u.timezone,COALESCE(w.blocks,'[]') AS weekly_blocks,(SELECT json_group_array(json(blocks)) FROM weekly_requests WHERE tutor_id=t.user_id AND status='accepted') AS reserved_weekly_blocks
    FROM tutors t JOIN users u ON u.id=t.user_id LEFT JOIN weekly_availability w ON w.tutor_id=t.user_id
    WHERE ${preview ? '1=1' : `${liveTutorSql("t")} AND u.status='active' AND u.role='tutor'`}`,
    ).map(({ moderation_note, reserved_weekly_blocks, published, ...draft }) => {
      // Students see the last approved content while an edit awaits review.
      const { published: _snapshot, ...visible } = publicView({ ...draft, published });
      const t = preview ? draft : visible;
      const score = trust.public(t.user_id);
      return {
      ...t,
      trust: score,
      review_count: score.review_count,
      verified: verified.get(t.user_id) || [],
      rating: ratings(t.user_id),
      ...(preview && { published: publishedView(published) }),
      ...uploadMetadata(db, t.user_id),
      weekly_blocks: JSON.parse(t.weekly_blocks).filter(b => !JSON.parse(reserved_weekly_blocks || "[]").flat().some(r => r.weekday === b.weekday && r.hour === b.hour)),
      subjects: JSON.parse(t.subjects),
      levels: JSON.parse(t.levels),
      goals: JSON.parse(t.goals),
      education_history: JSON.parse(t.education_history),
      profile_sections: JSON.parse(t.profile_sections),
      };
    });
  };
  registerEmailVerification(app, db, { origin, sendEmail });
  registerPasswordReset(app, db, { origin, sendEmail, audit });
  const signup = registerSignupVerification(app, db, { sendEmail, production, session });
  app.locals.calendarSync = registerGoogleCalendar(app, db, auth, { origin, production, google, wakeCalendar });
  registerGoogleAuth(app, db, { origin, production, session, google, signup });
  registerTutorThemes(app, db, auth, audit);
  registerUploads(app, db, auth, audit, processPhoto);
  registerCredentials(app, db, auth, audit, processPhoto);
  registerStudentVerification(app, db, auth, audit, processPhoto);
  registerCalendarEvents(app, db, auth);
  registerChatMedia(app, db, auth, processPhoto);
  registerGallery(app, db, auth, audit, processPhoto);
  registerPosts(app, db, auth, audit);
  registerNewsImages(app, db, auth, audit, processPhoto);
  registerCommunity(app, db, auth, audit, processPhoto);
  registerCommunityImages(app, db, auth, processPhoto);
  registerInquiries(app, db, auth);
  registerSupport(app, db, auth);
  registerAccountDeletion(app, db, auth, audit);
  registerWeeklyRequests(app, db, auth);
  registerOffers(app, db, auth);
  registerNotifications(app, db, auth);
  const walletApi = registerWallet(app, db, auth, audit, { production, sepay, origin });
  registerProposals(app, db, auth, audit, walletApi);
  registerClasses(app, db, auth, audit);
  registerCommunityTopics(app, db, auth);
  registerFamily(app, db, auth);
  registerTrust(app, db, auth, audit);
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
    await signup.start(res, { name: data.name, email: data.email, password: await passwordHash(data.password), role: "student" });
    res.status(202).json({ pending: true });
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
  // Local development only: one tap into a demo account of each role.
  const DEMO = { student: "student", parent: "parent", tutor: "chau", admin: "admin" };
  app.get("/api/auth/demo", (req, res) => res.json({ enabled: !production }));
  app.post("/api/auth/demo", (req, res) => {
    if (production) fail(404, "Không có chức năng này.");
    const { role } = z.object({ role: z.enum(["student", "parent", "tutor", "admin"]) }).parse(req.body);
    const user = one(db, "SELECT * FROM users WHERE email=? AND demo=1 AND status='active'", `${DEMO[role]}@demo.giasu.test`);
    if (!user) fail(404, "Chưa có dữ liệu mẫu. Chạy npm run seed:demo.");
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
      .object({ name: text(80), goal: z.string().trim().max(1000), timezone: timezoneSchema, school: z.string().trim().max(160).optional(), province_code: z.string().max(5).optional(), ward_code: z.string().max(5).optional() })
      .parse(req.body);
    transaction(db, () => {
      run(
        db,
        "UPDATE users SET name=?,goal=?,timezone=COALESCE(?,timezone) WHERE id=?",
        d.name,
        d.goal,
        d.timezone ?? null,
        req.user.id,
      );
      if (req.user.role === "student") {
        const address = addressSchema.parse({ province_code: d.province_code ?? req.user.province_code, ward_code: d.ward_code ?? req.user.ward_code });
        run(db, "UPDATE users SET school=COALESCE(?,school),province_code=?,ward_code=? WHERE id=?", d.school ?? null, address.province_code, address.ward_code, req.user.id);
      }
      // The display name is public and also appears outside the profile page, so
      // renaming hides the profile until it is reviewed. The time zone is only
      // informational and never needs a review.
      if (req.user.role === "tutor" && d.name !== req.user.name)
        run(
          db,
          "UPDATE tutors SET status=CASE WHEN status='rejected' THEN 'rejected' ELSE 'pending' END,published=NULL,moderation_note='',review_revision=review_revision+1 WHERE user_id=?",
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
        const { role: choice } = z.object({ role: z.enum(["student", "parent", "tutor"]) }).parse(req.body);
        const role = choice === "parent" ? "student" : choice;
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
        run(db, "UPDATE users SET role=?,learner_type=?,onboarding_step=1 WHERE id=?", role, choice === "parent" ? "parent" : "student", user.id);
      } else if (step === 1) {
        const { name, display_name } = z.object({ name: text(80), display_name: displayNameSchema }).parse(req.body);
        setMemberProfile(db, user.id, { display_name });
        const d = z.object({ goal: z.string().trim().max(1000).default(""), timezone: timezoneSchema }).parse(req.body);
        if (user.role === "student") {
          const { school } = z.object({ school: text(160) }).parse(req.body);
          const address = addressSchema.parse(req.body);
          if (!address.ward_code) fail(400, "Chọn nơi sinh sống.");
          run(db, "UPDATE users SET school=?,province_code=?,ward_code=? WHERE id=?", school, address.province_code, address.ward_code, user.id);
        }
        run(db, "UPDATE users SET name=?,goal=?,timezone=COALESCE(?,timezone),onboarding_step=3 WHERE id=?", name, d.goal, d.timezone ?? null, user.id);
      } else {
        setMemberProfile(db, user.id, { display_name: displayNameSchema.parse(req.body.display_name || user.display_name) });
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
    res.json(all(db, "SELECT * FROM subjects WHERE archived=0 ORDER BY rowid")),
  );
  app.get("/api/tutors", (req, res) => res.json(tutorRows()));
  const tutorDetail = (preview = false) => (req, res) => {
    const t = tutorRows(preview).find((t) => t.user_id === Number(req.params.id));
    if (!t) {
      const exists = one(db, "SELECT 1 FROM tutors WHERE user_id=?", Number(req.params.id));
      return res.status(404).json(exists
        ? { error: "Hồ sơ chưa được công bố.", reason: "unpublished" }
        : { error: "Không tìm thấy gia sư này.", reason: "not_found" });
    }
    refreshAvailability(db, t.user_id);
    const slots = all(
      db,
      `SELECT s.* FROM slots s WHERE tutor_id=? AND available=1 AND starts_at>? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('pending','accepted','completed')) ORDER BY starts_at`,
      t.user_id,
      new Date(Date.now() + 3600000).toISOString(),
    );
    // Reviewers are shown by their public display name only, never by their
    // real name, and without internal booking or account ids.
    const reviews = publicReviews(db, t.user_id);
    res.json({ ...t, slots, reviews, gallery: galleryMetadata(db, t.user_id) });
  };
  app.get("/api/tutors/:id", tutorDetail());
  app.get("/api/admin/tutors/:id/preview", auth("admin"), tutorDetail(true));
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
    refreshAvailability(db, req.user.id);
    res.json({
      weekly_schedule: weeklySchedule(db, req.user.id),
      theme_inventory: themeInventory(db, req.user.id),
      ...t,
      published: publishedView(t.published),
      gallery: galleryMetadata(db, t.user_id),
      name: req.user.name,
      timezone: req.user.timezone,
      demo: req.user.demo,
      ...uploadMetadata(db, t.user_id),
      subjects: JSON.parse(t.subjects),
      levels: JSON.parse(t.levels),
      goals: JSON.parse(t.goals),
      education_history: JSON.parse(t.education_history),
      profile_sections: JSON.parse(t.profile_sections),
      slots: all(
        db,
        `SELECT s.*, EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('pending','accepted','completed')) AS reserved FROM slots s WHERE tutor_id=? AND starts_at>? AND (available=1 OR EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('pending','accepted','completed'))) ORDER BY starts_at`,
        req.user.id,
        new Date().toISOString(),
      ),
    });
  });
  app.put("/api/tutor/profile", auth("tutor"), (req, res) => {
    const d = tutorSchema.parse(req.body);
    const address = d.province_code !== undefined || d.ward_code !== undefined ? addressSchema.parse(d) : null;
    if (address?.ward_code) d.location = addressLabel(address);
    const schedule = d.availability;
    if (d.profile_theme && !ownsTheme(db, req.user.id, d.profile_theme)) fail(403, "Giao diện này chưa được quản trị viên cấp.");
    ensureSubjects(d.subjects);
    const knownGoals = all(
      db,
      "SELECT DISTINCT category FROM resources WHERE published=1 AND archived=0",
    ).map((r) => r.category);
    if (d.goals.some((g) => !knownGoals.includes(g)))
      fail(400, "Mục tiêu kỳ thi không có trong danh mục.");
    let review;
    transaction(db, () => {
      const current = one(db, "SELECT * FROM tutors WHERE user_id=?", req.user.id);
      // Only content students read needs a review. Operational settings apply
      // at once and never take an approved profile out of search.
      const changed = changedContent(current, d);
      if (!address?.ward_code && d.location !== current.location) changed.push("location");
      const contentChanged = changed.length > 0;
      let status = current.status, published = current.published;
      if (current.status === "approved") {
        if (contentChanged) {
          status = "pending";
          published = contentSnapshot(current);
        }
      } else if (current.status !== "pending") status = "pending";
      const touched = contentChanged || status !== current.status;
      review = { status, changed, published: published != null };
      if (schedule) {
        if (weeklySchedule(db, req.user.id).revision !== schedule.revision) fail(409, "Lịch đã thay đổi ở cửa sổ khác. Tải lại trang trước khi lưu.");
        run(db, `INSERT INTO weekly_availability(tutor_id,blocks,revision) VALUES (?,?,1)
          ON CONFLICT(tutor_id) DO UPDATE SET blocks=excluded.blocks,revision=revision+1`, req.user.id, JSON.stringify(schedule.blocks));
        reconcileAvailability(db, req.user.id);
      }
      if (d.accepts_trial !== undefined) run(db, "UPDATE tutors SET accepts_trial=? WHERE user_id=?", Number(d.accepts_trial), req.user.id);
      if (d.tutor_kind) run(db, "UPDATE tutors SET tutor_kind=? WHERE user_id=?", d.tutor_kind, req.user.id);
      if (address) run(db, "UPDATE tutors SET province_code=?,ward_code=? WHERE user_id=?", address.province_code, address.ward_code, req.user.id);
      if (d.timezone) run(db, "UPDATE users SET timezone=? WHERE id=?", d.timezone, req.user.id);
      run(
        db,
        `UPDATE tutors SET headline=?,bio=?,location=?,mode=?,rate=?,experience=?,education=?,subjects=?,levels=?,goals=?,teaching_style=?,lesson_plan=?,intro_video=?,sample_video=?,profile_theme=COALESCE(?,profile_theme),education_history=COALESCE(?,education_history),profile_sections=COALESCE(?,profile_sections),status=?,published=?,moderation_note=CASE WHEN ? THEN '' ELSE moderation_note END,review_revision=review_revision+? WHERE user_id=?`,
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
        d.intro_video,
        d.sample_video,
        d.profile_theme ?? null,
        d.education_history ? JSON.stringify(d.education_history) : null,
        d.profile_sections ? JSON.stringify(d.profile_sections) : null,
        status,
        published,
        Number(touched),
        Number(touched),
        req.user.id,
      );
    });
    res.json({ ok: true, review, user: publicUser(one(db, "SELECT * FROM users WHERE id=?", req.user.id)) });
  });
  app.put("/api/tutor/availability", auth("tutor"), (req, res) => {
    const d = availabilitySchema.parse(req.body);
    transaction(db, () => {
      if (weeklySchedule(db, req.user.id).revision !== d.revision)
        fail(409, "Lịch đã thay đổi ở cửa sổ khác. Tải lại trang trước khi lưu.");
      run(db, `INSERT INTO weekly_availability(tutor_id,blocks,revision) VALUES (?,?,1)
        ON CONFLICT(tutor_id) DO UPDATE SET blocks=excluded.blocks,revision=revision+1`, req.user.id, JSON.stringify(d.blocks));
      reconcileAvailability(db, req.user.id);
    });
    res.json(weeklySchedule(db, req.user.id));
  });
  app.get("/api/account/availability", auth("student"), (req, res) => {
    const row = one(db, "SELECT * FROM learner_availability WHERE user_id=?", req.user.id);
    res.json({ blocks: row ? JSON.parse(row.blocks) : [], revision: row?.revision ?? 0 });
  });
  app.put("/api/account/availability", auth("student"), (req, res) => {
    const d = availabilitySchema.parse(req.body);
    transaction(db, () => {
      const current = one(db, "SELECT revision FROM learner_availability WHERE user_id=?", req.user.id);
      if ((current?.revision ?? 0) !== d.revision) fail(409, "Lịch đã thay đổi. Tải lại trang trước khi lưu.");
      run(db, `INSERT INTO learner_availability(user_id,blocks,revision) VALUES (?,?,1)
        ON CONFLICT(user_id) DO UPDATE SET blocks=excluded.blocks,revision=revision+1`, req.user.id, JSON.stringify(d.blocks));
    });
    res.json({ blocks: d.blocks, revision: d.revision + 1 });
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
      all(db, "SELECT starts_at,duration_minutes FROM slots s WHERE tutor_id=? AND (available=1 OR EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('pending','accepted','completed')))", req.user.id).some(
        (s) => overlaps(s, { starts_at: date.toISOString(), duration_minutes: 60 }),
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
    if (one(db, "SELECT id FROM slots WHERE id=? AND tutor_id=? AND source='weekly'", req.params.id, req.user.id))
      fail(409, "Chỉnh sửa khung giờ này trong lịch lặp hằng tuần.");
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
    const rows = (
      all(
        db,
        `SELECT b.*,(SELECT inquiry_id FROM offers WHERE id=b.offer_id) AS inquiry_id,s.name AS student_name,t.name AS tutor_name,sub.name AS subject_name,${pairReview("rating")} AS reviewed,${pairReview("body")} AS review_body,${pairReview("hidden")} AS review_hidden,${pairReview("reply")} AS review_reply,
        (SELECT body FROM messages WHERE booking_id=b.id ORDER BY id DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages WHERE booking_id=b.id ORDER BY id DESC LIMIT 1) AS last_message_at,
        (SELECT u.name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.booking_id=b.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
        (SELECT is_event FROM messages WHERE booking_id=b.id ORDER BY id DESC LIMIT 1) AS last_is_event,
        (SELECT COUNT(*) FROM messages m WHERE m.booking_id=b.id AND m.sender_id<>${req.user.id} AND m.id>COALESCE((SELECT last_read_id FROM chat_reads WHERE thread_kind='lesson' AND thread_id=b.id AND user_id=${req.user.id}),0)) AS unread_count
        FROM bookings b JOIN users s ON s.id=b.student_id JOIN users t ON t.id=b.tutor_id JOIN subjects sub ON sub.id=b.subject_id WHERE ${condition} ORDER BY b.starts_at DESC`,
        ...(req.user.role === "admin" ? [] : [req.user.id]),
      )
    );
    // Lesson ratings are private to the student who gave them.
    res.json(req.user.role === "student" ? lessonRatingFields(db, rows, req.user.id) : rows);
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
      `SELECT s.*,t.rate,t.mode,t.subjects,t.status AS tutor_status,t.published FROM slots s JOIN tutors t ON t.user_id=s.tutor_id JOIN users u ON u.id=t.user_id WHERE s.id=? AND s.available=1 AND ${liveTutorSql("t")} AND u.status='active' AND u.role='tutor'`,
      d.slot_id,
    );
    if (!s || new Date(s.starts_at).getTime() < Date.now() + 3600000)
      fail(400, "Khung giờ không còn khả dụng.");
    if (
      !JSON.parse(publicView({ status: s.tutor_status, published: s.published, subjects: s.subjects }).subjects).includes(d.subject_id) ||
      (s.mode !== "both" && d.mode !== s.mode)
    )
      fail(400, "Môn học hoặc hình thức không phù hợp.");
    const result = transaction(db, () => {
      const conflicts = all(
        db,
        `SELECT starts_at,duration_minutes FROM bookings WHERE (student_id=? OR tutor_id=?) AND status IN ('pending','accepted','completed')`,
        req.user.id,
        s.tutor_id,
      );
      if (
        conflicts.some(
          (b) =>
            overlaps(b, s),
        )
      )
        fail(409, "Bạn hoặc gia sư đã có lịch trong khung giờ này.");
      const id = Number(
        run(
          db,
          "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,note,duration_minutes) VALUES (?,?,?,?,?,?,?,?,?)",
          req.user.id,
          s.tutor_id,
          s.id,
          d.subject_id,
          s.starts_at,
          s.rate,
          d.mode,
          d.note,
          s.duration_minutes,
        ).lastInsertRowid,
      );
      insertChatEvent(db, "lesson", id, req.user, "đã đặt buổi học");
      return { id };
    });
    res.status(201).json(result);
  });
  app.patch("/api/bookings/:id", auth(), (req, res) => {
    const b = booking(req),
      { status } = z
        .object({
          status: z.enum(["accepted", "declined", "cancelled", "completed", "missed", "tutor_missed"]),
        })
        .parse(req.body);
    const now = Date.now();
    const future = new Date(b.starts_at).getTime() > now;
    const ended = new Date(b.starts_at).getTime() + b.duration_minutes * 60000 <= now;
    // The student can report a no-show from 15 minutes after the start until 48 hours after the end.
    const noShowOpen = new Date(b.starts_at).getTime() + TUTOR_NO_SHOW_WAIT_MINUTES * 60000 <= now
      && now < new Date(b.starts_at).getTime() + b.duration_minutes * 60000 + TUTOR_NO_SHOW_WINDOW_HOURS * 3600000;
    // Like lesson offers, a new lesson can only be confirmed by a tutor whose
    // profile students can still see.
    if (status === "accepted" && req.user.id === b.tutor_id && !isLiveTutor(one(db, "SELECT status,published FROM tutors WHERE user_id=?", b.tutor_id)))
      fail(409, "Tài khoản hiện không thể xác nhận lịch học.");
    const allowed =
      (status === "cancelled" &&
        ["pending", "accepted"].includes(b.status) &&
        future) ||
      (req.user.id === b.tutor_id &&
        ["accepted", "declined"].includes(status) &&
        b.status === "pending" &&
        future) ||
      // Either side can mark a finished lesson as done, so a tutor who forgets
      // does not stop the student from reviewing. Nobody can close a lesson
      // before it is over.
      (status === "completed" &&
        b.status === "accepted" &&
        [b.tutor_id, b.student_id].includes(req.user.id) &&
        ended) ||
      // The tutor reports the student did not show up once the lesson time has come.
      (status === "missed" &&
        b.status === "accepted" &&
        req.user.id === b.tutor_id &&
        !b.started_at &&
        !future) ||
      // The student reports the tutor never came. Whoever reports first stands; the other side can no longer act.
      (status === "tutor_missed" &&
        b.status === "accepted" &&
        req.user.id === b.student_id &&
        !b.started_at &&
        noShowOpen);
    if (!allowed) fail(409, "Không thể thay đổi buổi học sang trạng thái này.");
    const at = new Date(now).toISOString();
    if (status === "cancelled") run(db, "UPDATE bookings SET status=?,cancelled_by=?,cancelled_at=? WHERE id=?", status, req.user.id, at, b.id);
    else if (status === "tutor_missed") run(db, "UPDATE bookings SET status=?,tutor_missed_at=? WHERE id=?", status, at, b.id);
    else run(db, "UPDATE bookings SET status=? WHERE id=?", status, b.id);
    if (["accepted", "declined", "cancelled"].includes(status)) {
      const other = req.user.id === b.tutor_id ? b.student_id : b.tutor_id;
      notify(db, other, `lesson_${status}`, { actor: req.user.name, subject: one(db, "SELECT name FROM subjects WHERE id=?", b.subject_id)?.name || "", link: `/bookings?lesson=${b.id}` });
    }
    const eventText = { accepted: "đã xác nhận buổi học", declined: "đã từ chối buổi học", cancelled: "đã hủy buổi học", completed: "đã hoàn thành buổi học", missed: "đã báo học sinh vắng", tutor_missed: "đã báo gia sư vắng" }[status];
    if (eventText) insertChatEvent(db, "lesson", b.id, req.user, eventText);
    audit(req.user.id, `booking.${status}`, b.id);
    res.json({ ok: true });
  });
  // The tutor opens the lesson from 15 minutes before it begins until it ends.
  app.post("/api/bookings/:id/start", auth("tutor"), (req, res) => {
    const b = booking(req);
    if (b.tutor_id !== req.user.id || b.status !== "accepted" || b.started_at)
      fail(409, "Không thể bắt đầu buổi học này.");
    const start = new Date(b.starts_at).getTime(), now = Date.now();
    if (now < start - 15 * 60000) fail(409, "Chưa đến giờ. Nút Bắt đầu mở trước giờ học 15 phút.");
    if (now >= start + b.duration_minutes * 60000) fail(409, "Buổi học đã kết thúc. Hãy chọn Hoàn thành hoặc Học sinh vắng.");
    const started_at = new Date(now).toISOString();
    run(db, "UPDATE bookings SET started_at=? WHERE id=?", started_at, b.id);
    audit(req.user.id, "booking.started", b.id);
    res.json({ ok: true, started_at });
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
    const page = chatPage(db, "lesson", b.id, req);
    const context = lessonMessageContext(db, b.id);
    const messages = withChatMedia(db, "lesson", b.id, page.messages).map((message) => ({ ...message, context }));
    res.json(req.query.limit ? { messages, hasMore: page.hasMore } : messages);
  });
  app.post(
    "/api/bookings/:id/messages",
    auth("student", "tutor"),
    (req, res) => {
      const b = booking(req);
      insertChatMessage(db, "lesson", b.id, req.user, req.body);
      res.status(201).json({ ok: true });
    },
  );
  app.post("/api/bookings/:id/review", auth("student"), (req, res) => {
    const b = booking(req);
    if (b.student_id !== req.user.id || b.status !== "completed")
      fail(403, "Chỉ học sinh đã hoàn thành buổi học mới có thể đánh giá.");
    if (b.offer_id) fail(409, "Buổi học này thuộc một đề nghị học. Hãy chấm buổi học hoặc đánh giá khóa học khi kết thúc.");
    const d = z
      .object({ rating: z.number().int().min(1).max(5), body: text(1000) })
      .parse(req.body);
    // One review per student and tutor: a later lesson edits it instead of adding another.
    const existing = one(
      db,
      "SELECT r.booking_id FROM reviews r JOIN bookings x ON x.id=r.booking_id WHERE x.student_id=? AND x.tutor_id=? ORDER BY r.created_at DESC,r.booking_id DESC LIMIT 1",
      b.student_id,
      b.tutor_id,
    );
    if (existing) {
      run(db, "UPDATE reviews SET rating=?,body=?,created_at=CURRENT_TIMESTAMP WHERE booking_id=?", d.rating, d.body, existing.booking_id);
      return res.json({ ok: true, updated: true });
    }
    run(
      db,
      "INSERT INTO reviews(booking_id,rating,body) VALUES (?,?,?)",
      b.id,
      d.rating,
      d.body,
    );
    res.status(201).json({ ok: true, updated: false });
  });
  app.post("/api/bookings/:id/report", auth("student", "tutor"), (req, res) => {
    const b = booking(req);
    const d = z.object({ reason: z.string().min(1).max(300) }).parse(req.body);
    if (!one(db, "SELECT 1 FROM reviews WHERE booking_id=?", b.id)) fail(404, "Chưa có đánh giá cho buổi học này.");
    run(db, "UPDATE reviews SET reported=1,reported_reason=?,reported_by=? WHERE booking_id=?", d.reason, req.user.id, b.id);
    res.status(201).json({ ok: true });
  });
  const resourceRows = (admin) =>
    all(
      db,
      `SELECT r.*,s.name AS subject_name FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.archived=0 ${admin ? "" : "AND published=1"} ORDER BY r.id`,
    ).map((r) => ({ ...r, published: !!r.published }));
  app.get("/api/resources", (req, res) => res.json(resourceRows(false)));
  app.get("/api/admin", auth("admin"), (req, res) =>
    res.json({
      theme_catalog: themeCatalog,
      users: all(
        db,
        "SELECT id,name,email,role,learner_type,status,demo,created_at,community_locked,community_lock_reason FROM users WHERE status<>'deleted' ORDER BY id DESC",
      ),
      tutors: all(
        db,
        "SELECT t.*,u.name,u.email,u.demo,u.timezone FROM tutors t JOIN users u ON u.id=t.user_id WHERE u.status<>'deleted'",
      ).map((t) => ({
        ...t,
        published: publishedView(t.published),
        ...uploadMetadata(db, t.user_id),
        theme_inventory: themeInventory(db, t.user_id),
        weekly_blocks: weeklySchedule(db, t.user_id).blocks,
        gallery: galleryMetadata(db, t.user_id),
        subjects: JSON.parse(t.subjects),
        levels: JSON.parse(t.levels),
        goals: JSON.parse(t.goals),
        education_history: JSON.parse(t.education_history),
        profile_sections: JSON.parse(t.profile_sections),
      })),
      resources: resourceRows(true),
      audit: all(
        db,
        `SELECT a.*,u.name,
        (SELECT c.tutor_id FROM tutor_credentials c WHERE a.action LIKE 'credential.%' AND c.id=CAST(a.target AS INTEGER)) AS credential_tutor
        FROM audit a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 50`,
      ),
    }),
  );
  // Full audit trail: paged by an id cursor, filterable by action group, actor,
  // affected user, target or free text (searches the JSON detail too).
  app.get("/api/admin/audit", auth("admin"), (req, res) => {
    const q = z.object({
      before: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      action: z.string().trim().max(80).optional(),
      actor: z.string().trim().max(120).optional(),
      target: z.string().trim().max(120).optional(),
      target_user: z.coerce.number().int().positive().optional(),
      from: z.string().trim().max(20).optional(),
      to: z.string().trim().max(20).optional(),
      q: z.string().trim().max(120).optional(),
    }).parse(req.query);
    const where = ["1=1"], args = [];
    if (q.before) { where.push("a.id < ?"); args.push(q.before); }
    if (q.action) { where.push("a.action LIKE ?"); args.push(q.action.includes("%") ? q.action : q.action); }
    if (q.actor) { where.push("u.name LIKE ?"); args.push(`%${q.actor}%`); }
    if (q.target) { where.push("a.target = ?"); args.push(q.target); }
    if (q.target_user) {
      where.push("(a.target = ? OR a.detail LIKE ? OR a.detail LIKE ? OR a.detail LIKE ?)");
      args.push(String(q.target_user), `%"user_id":${q.target_user}%`, `%"tutor_id":${q.target_user}%`, `%"student_id":${q.target_user}%`);
    }
    if (q.from) { where.push("a.created_at >= ?"); args.push(q.from); }
    if (q.to) { where.push("a.created_at <= ?"); args.push(q.to); }
    if (q.q) { where.push("(a.action LIKE ? OR a.target LIKE ? OR a.detail LIKE ?)"); args.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
    const rows = all(
      db,
      `SELECT a.*,u.name,
      (SELECT c.tutor_id FROM tutor_credentials c WHERE a.action LIKE 'credential.%' AND c.id=CAST(a.target AS INTEGER)) AS credential_tutor
      FROM audit a JOIN users u ON u.id=a.actor_id WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT ?`,
      ...args, q.limit + 1,
    );
    res.json({ rows: rows.slice(0, q.limit), next: rows.length > q.limit ? rows[q.limit - 1].id : null });
  });
  registerTutorReview(app, db, auth, audit, { sendEmail: sendAdminEmail || sendEmail, origin });
  app.patch("/api/admin/users/:id/role", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    z.object({ role: z.literal("admin") }).strict().parse(req.body);
    transaction(db, () => {
      const user = one(db, "SELECT * FROM users WHERE id=?", id);
      if (!user) fail(404, "Không tìm thấy tài khoản.");
      if (user.status !== "active")
        fail(409, "Hãy kích hoạt tài khoản trước khi cấp quyền quản trị.");
      if (user.role === "admin") return;
      run(db, "UPDATE users SET role='admin',onboarding_step=3 WHERE id=?", id);
      run(db, "DELETE FROM sessions WHERE user_id=?", id);
      audit(req.user.id, "user.promoted_to_admin", id, { user_id: id, email: user.email });
    });
    res.json({ ok: true });
  });
  app.patch("/api/admin/users/:id", auth("admin"), (req, res) => {
    const d = z
        .object({ status: z.enum(["active", "suspended"]) })
        .parse(req.body),
      u = one(db, "SELECT * FROM users WHERE id=?", req.params.id);
    if (!u || u.status === "deleted") fail(404, "Không tìm thấy tài khoản.");
    if (u.role === "admin")
      fail(403, "Không thể khóa quản trị viên qua giao diện này.");
    run(db, "UPDATE users SET status=? WHERE id=?", d.status, u.id);
    if (d.status === "suspended")
      run(db, "DELETE FROM sessions WHERE user_id=?", u.id);
    audit(req.user.id, `user.${d.status}`, u.id, { user_id: u.id, email: u.email, status: d.status });
    res.json({ ok: true });
  });
  registerCatalogRemoval(app, db, auth, audit);
  app.put("/api/admin/subjects/:id", auth("admin"), (req, res) => {
    const d = subjectSchema.parse({ ...req.body, id: req.params.id });
    if (one(db, "SELECT id FROM subjects WHERE id=? AND archived=1", d.id)) fail(409, "Mã môn đã được sử dụng. Chọn mã mới.");
    run(
      db,
      "INSERT INTO subjects(id,name,stage,description) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,stage=excluded.stage,description=excluded.description",
      d.id,
      d.name,
      d.stage,
      d.description,
    );
    audit(req.user.id, "subject.save", d.id, { title: d.name });
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
    audit(req.user.id, "resource.create", id, { title: d.title, published: d.published });
    res.status(201).json({ id });
  });
  app.put("/api/admin/resources/:id", auth("admin"), (req, res) => {
    const d = resourceSchema.parse(req.body);
    ensureSubjects([d.subject_id]);
    if (!one(db, "SELECT id FROM resources WHERE id=? AND archived=0", req.params.id))
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
    audit(req.user.id, "resource.update", req.params.id, { title: d.title, published: d.published });
    res.json({ ok: true });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Không tìm thấy yêu cầu." }),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: req.path.includes("/community/") ? err.issues.map(i => i.message).join(" ") : "Thông tin chưa hợp lệ. Kiểm tra các trường và thử lại.",
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
        .json({ error: req.path.startsWith("/api/chat/") ? "Tệp quá lớn. Giới hạn tải lên là 8 MB." : "Tệp quá lớn. Giới hạn tải lên là 5 MB." });
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

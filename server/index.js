import { communitySitemap, publicCommunityPost, publicPosts as communityPublic } from "./community.js";
import { pathToFileURL } from "node:url";
import { createMailflareSender } from "./email-verification.js";
import { NEWS_PATH, newsPath, pageSeo, renderSeo, robots, newsSitemap } from "./seo.js";
import { crawlLinks, tutorSeoProfile, tutorSitemapIds } from "./seo-data.js";
import { liveTutorSql, isLiveTutor, publicView } from "./tutor-visibility.js";
import { classRatings } from "./classes.js";
import { all, one } from "./db.js";
import { processPhoto } from "./photo.js";
import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "./local-db.js";

import { seedCatalog } from "./seed.js";
import { createApi } from "./api.js";
export async function startServer({ sendEmail, sendAdminEmail } = {}) {
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 4174);
const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
if (production && !process.env.APP_ORIGIN?.startsWith("https://"))
  throw new Error("Production requires an HTTPS APP_ORIGIN.");
const db = openDatabase();
seedCatalog(db);
const app = createApi(db, {
  processPhoto,
  sendEmail: sendEmail || createMailflareSender({ url: process.env.MAILFLARE_URL, key: process.env.MAILFLARE_API_KEY, mailboxId: process.env.MAILFLARE_MAILBOX_ID }),
      sendAdminEmail: sendAdminEmail || createMailflareSender({ url: process.env.MAILFLARE_URL, key: process.env.MAILFLARE_ADMIN_API_KEY, mailboxId: process.env.MAILFLARE_ADMIN_MAILBOX_ID, from: "admin@giasudiem10.online" }),
  limit: process.env.NODE_ENV !== "test",
  production,
  origin,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    adminEmail: process.env.GOOGLE_ADMIN_EMAIL,
    calendarTokenKey: process.env.GOOGLE_CALENDAR_TOKEN_KEY,
  },
});
app.use("/assets", express.static(path.resolve("assets")));
app.get(["/favicon.ico", "/apple-touch-icon.png", "/favicon-32.png"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.resolve("assets", req.path.slice(1)));
});
app.get(["/app", "/app/"], (req, res) => res.redirect("/"));
app.get("/robots.txt", (req, res) => res.type("text/plain").send(robots));
app.get("/sitemap.xml", (req, res) => res.type("application/xml").send(newsSitemap(
  all(db, "SELECT id,slug,published_at,updated_at,revised_at FROM posts WHERE published=1 ORDER BY published_at DESC,id DESC"),
  communitySitemap(db),
  tutorSitemapIds(all(db, `SELECT t.user_id FROM tutors t JOIN users u ON u.id=t.user_id WHERE ${liveTutorSql("t")} AND u.status='active' AND u.role='tutor' ORDER BY t.user_id`)),
)));
app.get(["/privacy", "/terms"], (req, res) => res.sendFile(path.resolve(`dist/legal${req.path}.html`)));
app.get("/index.html", (req, res) => res.redirect(308, "/"));
app.get("/", (req, res) => res.sendFile(path.resolve("index.html")));
const sendApp = async (req, res, html) => {
  const match = req.path.match(NEWS_PATH);
  const post = match ? one(db, "SELECT id,slug,title,summary,cover_url,cover_alt,published_at,updated_at,revised_at FROM posts WHERE id=? AND published=1", match[1]) : null;
  const communityMatch = req.path.match(/^\/app\/community\/(\d+)$/);
  const community = communityMatch ? publicCommunityPost(db, communityMatch[1]) : null;
  // A live tutor profile is indexable; draft/blocked profiles keep noindex.
  const tutorMatch = req.path.match(/^\/app\/tutors\/(\d+)$/);
  let tutor = null;
  if (tutorMatch) {
    const row = one(db, `SELECT t.*,u.name,u.status AS user_status,u.role FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=?`, tutorMatch[1]);
    if (row && row.user_status === "active" && row.role === "tutor" && isLiveTutor(row)) {
      const { published, moderation_note, ...rest } = publicView(row);
      const subjectMap = new Map(all(db, "SELECT id,name FROM subjects").map((s) => [s.id, s.name]));
      tutor = tutorSeoProfile({ ...rest, rating: classRatings(db)(row.user_id) }, (id) => subjectMap.get(id) || "");
    }
  }
  // Crawlers get a real heading + links even without running the SPA.
  const crawl = await crawlLinks(req.path, {
    tutors: () => all(db, `SELECT t.user_id,u.name FROM tutors t JOIN users u ON u.id=t.user_id WHERE ${liveTutorSql("t")} AND u.status='active' AND u.role='tutor' ORDER BY t.user_id LIMIT 20`),
    posts: () => all(db, "SELECT id,slug,title FROM posts WHERE published=1 ORDER BY published_at DESC,id DESC LIMIT 20"),
    community: () => all(db, `SELECT p.id,p.title FROM community_posts p JOIN users u ON u.id=p.author_id WHERE ${communityPublic} ORDER BY p.id DESC LIMIT 20`),
    subjects: () => all(db, "SELECT id,name FROM subjects ORDER BY id LIMIT 20"),
  });
  const seo = pageSeo(req.path, post, community, tutor);
  // Old id-only and wrong-slug links go to the canonical address.
  if (seo.redirect) return res.redirect(301, seo.redirect + req.url.slice(req.path.length));
  res.set("X-Robots-Tag", seo.robots).set("Cache-Control", "no-cache")
    .status(seo.status).type("html").send(renderSeo(html, req.path, post, community, tutor, crawl));
};
if (production || process.env.SERVE_BUILD === "1") {
  app.use("/app/assets", express.static(path.resolve("dist/app/assets")));
  app.get("/app{/*path}", async (req, res) =>
    await sendApp(req, res, await readFile("dist/app/index.html", "utf8")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    cacheDir: `.data/vite-${port}`,
    server: { middlewareMode: true, hmr: { port: port + 1000 } },
    appType: "custom",
  });
  app.get("/app{/*path}", async (req, res, next) => {
    if (!req.headers.accept?.includes("text/html")) return next();
    try {
      const html = await vite.transformIndexHtml(
        req.originalUrl,
        await readFile("app/index.html", "utf8"),
      );
      await sendApp(req, res, html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
  app.use(vite.middlewares);
}
const calendarTimer = setInterval(() => { void app.locals.calendarSync.syncDue().catch(() => {}); }, 60000);
calendarTimer.unref();
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Gia Sư 10 Điểm: ${origin}/app/`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      clearInterval(calendarTimer);
      db.close();
      process.exit(0);
    }),
  );

return { app, server, db };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startServer();

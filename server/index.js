import { communitySitemap, publicCommunityPost } from "./community.js";
import { pathToFileURL } from "node:url";
import { createMailflareSender } from "./email-verification.js";
import { pageSeo, renderSeo, robots, newsSitemap } from "./seo.js";
import { all, one } from "./db.js";
import { processPhoto } from "./photo.js";
import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "./local-db.js";

import { seedCatalog } from "./seed.js";
import { createApi } from "./api.js";
export async function startServer({ sendEmail } = {}) {
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
  limit: process.env.NODE_ENV !== "test",
  production,
  origin,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    adminEmail: process.env.GOOGLE_ADMIN_EMAIL,
  },
});
app.use("/assets", express.static(path.resolve("assets")));
app.get(["/favicon.ico", "/apple-touch-icon.png", "/favicon-32.png"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.resolve("assets", req.path.slice(1)));
});
app.get(["/app", "/app/"], (req, res) => res.redirect("/"));
app.get("/robots.txt", (req, res) => res.type("text/plain").send(robots));
app.get("/sitemap.xml", (req, res) => res.type("application/xml").send(newsSitemap(all(db, "SELECT id FROM posts WHERE published=1"), communitySitemap(db))));
app.get(["/privacy", "/terms"], (req, res) => res.sendFile(path.resolve(`dist/legal${req.path}.html`)));
app.get("/index.html", (req, res) => res.redirect(308, "/"));
app.get("/", (req, res) => res.sendFile(path.resolve("index.html")));
const sendApp = (req, res, html) => {
  const match = req.path.match(/^\/app\/news\/(\d+)$/);
  const post = match ? one(db, "SELECT title,summary FROM posts WHERE id=? AND published=1", match[1]) : null;
  const communityMatch = req.path.match(/^\/app\/community\/(\d+)$/);
  const community = communityMatch ? publicCommunityPost(db, communityMatch[1]) : null;
  const seo = pageSeo(req.path, post, community);
  res.set("X-Robots-Tag", seo.robots).set("Cache-Control", "no-cache")
    .status(seo.status).type("html").send(renderSeo(html, req.path, post, community));
};
if (production || process.env.SERVE_BUILD === "1") {
  app.use("/app/assets", express.static(path.resolve("dist/app/assets")));
  app.get("/app{/*path}", async (req, res) =>
    sendApp(req, res, await readFile("dist/app/index.html", "utf8")),
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
      sendApp(req, res, html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Gia Sư 10 Điểm: ${origin}/app/`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );

return { app, server, db };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startServer();

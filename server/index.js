import { processPhoto } from "./photo.js";
import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "./local-db.js";

import { seedCatalog } from "./seed.js";
import { createApi } from "./api.js";
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 4174);
const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
if (production && !process.env.APP_ORIGIN?.startsWith("https://"))
  throw new Error("Production requires an HTTPS APP_ORIGIN.");
const db = openDatabase();
seedCatalog(db);
const app = createApi(db, {
  processPhoto,
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
app.get(["/app", "/app/"], (req, res) => res.redirect("/"));
app.get("/", (req, res) => res.sendFile(path.resolve("index.html")));
if (production || process.env.SERVE_BUILD === "1") {
  app.use("/app", express.static(path.resolve("dist/app"), { index: false }));
  app.get("/app{/*path}", (req, res) =>
    res.sendFile(path.resolve("dist/app/index.html")),
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
      res.type("html").send(html);
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

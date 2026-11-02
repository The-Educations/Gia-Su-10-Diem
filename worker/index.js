import { pageSeo, renderSeo, robots, sitemap } from "../server/seo.js";
import { DurableObject } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { createServer } from "node:http";
import { createApi } from "../server/api.js";
import { migrateDatabase } from "../server/db.js";
import { seedCatalog } from "../server/seed-catalog.js";

export class Marketplace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    const bindings = (args) =>
      args.map((v) =>
        ArrayBuffer.isView(v)
          ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)
          : v,
      );
    const db = {
      exec: (query) => sql.exec(query),
      transactionSync: (fn) => ctx.storage.transactionSync(fn),
      prepare: (query) => ({
        all: (...args) => sql.exec(query, ...bindings(args)).toArray(),
        get: (...args) => sql.exec(query, ...bindings(args)).toArray()[0],
        run: (...args) => {
          sql.exec(query, ...bindings(args)).toArray();
          const row = sql
            .exec("SELECT last_insert_rowid() AS id, changes() AS changes")
            .one();
          return { lastInsertRowid: row.id, changes: row.changes };
        },
      }),
    };
    ctx.storage.transactionSync(() => {
      migrateDatabase(db);
      seedCatalog(db);
    });
    const api = createApi(db, {
      production: env.APP_ORIGIN.startsWith("https://"),
      origin: env.APP_ORIGIN,
      clientIp: (req) => req.headers["x-giasu-client-ip"] || "unknown",
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        adminEmail: env.GOOGLE_ADMIN_EMAIL,
      },
      processPhoto: async (data, gallery = false) => {
        const stream = () => new Response(data).body;
        const info = await env.IMAGES.info(stream());
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(info.format) ||
          info.width * info.height > 16000000 ||
          (info.frames || 1) > 1
        )
          throw new Error("Invalid image");
        const output = await env.IMAGES.input(stream())
          .transform({
            width: gallery ? 1280 : 640,
            height: gallery ? 1280 : 640,
            fit: gallery ? "scale-down" : "cover",
          })
          .output({ format: "image/webp", quality: 85 });
        return Buffer.from(await output.response().arrayBuffer());
      },
    });
    this.handler = httpServerHandler(createServer(api));
  }
  fetch(request) {
    return this.handler.fetch(request);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Bind callbacks/cookies to the canonical host; preview is a separate local environment.
    if (
      url.origin !== env.APP_ORIGIN &&
      env.APP_ORIGIN.startsWith("https://")
    ) {
      return Response.redirect(env.APP_ORIGIN + url.pathname + url.search, 308);
    }
    if (url.pathname.startsWith("/api/")) {
      const headers = new Headers(request.headers);
      headers.set(
        "x-giasu-client-ip",
        request.headers.get("cf-connecting-ip") || "local",
      );
      const stub = env.MARKETPLACE.getByName("marketplace-v1");
      return stub.fetch(new Request(request, { headers }));
    }
    if (["/app", "/app/"].includes(url.pathname))
      return Response.redirect(url.origin + "/", 302);
    if (url.pathname === "/index.html") return Response.redirect(url.origin + "/", 308);
    if (["/robots.txt", "/sitemap.xml"].includes(url.pathname)) {
      return new Response(url.pathname === "/robots.txt" ? robots : sitemap, {
        headers: { "Content-Type": url.pathname === "/robots.txt" ? "text/plain; charset=utf-8" : "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }
    const assetUrl = new URL(request.url);
    if (url.pathname === "/") assetUrl.pathname = "/index.html";
    if (["/privacy", "/terms"].includes(url.pathname)) assetUrl.pathname = `/legal${url.pathname}.html`;
    if (
      ["/favicon.ico", "/apple-touch-icon.png", "/favicon-32.png"].includes(
        url.pathname,
      )
    )
      assetUrl.pathname = "/assets" + url.pathname;
    if (
      url.pathname.startsWith("/app/") &&
      !url.pathname.startsWith("/app/assets/")
    )
      assetUrl.pathname = "/app/index.html";
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (url.protocol === "https:")
      headers.set("Strict-Transport-Security", "max-age=31536000");
    if (
      headers.get("content-type")?.includes("text/html") ||
      /(?:favicon|icon-v2|apple-touch-icon|brand-icon-|brand-touch-)/.test(url.pathname)
    )
      headers.set("Cache-Control", "no-cache");
    if (headers.get("content-type")?.includes("text/html")) {
      const seo = pageSeo(url.pathname);
      headers.set("X-Robots-Tag", seo.robots);
      headers.delete("Content-Length");
      headers.delete("ETag");
      return new Response(renderSeo(await response.text(), url.pathname), {
        status: response.ok ? seo.status : response.status, headers,
      });
    }
    return new Response(response.body, { status: response.status, headers });
  },
};

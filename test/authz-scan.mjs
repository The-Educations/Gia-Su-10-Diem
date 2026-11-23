// Scans server/*.js for Express route registrations so every API route is
// declared in test/authz-routes.json with an expected permission class.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Returns [{ method, path, auth }], auth = "public" | "user" | role list.
export function scanRoutes() {
  const out = [];
  for (const name of readdirSync(join(root, "server")).filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(join(root, "server", name), "utf8");
    for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\(\s*"(\/api[^"]*)"(.{0,120})/gs)) {
      const [, method, path, tail] = m;
      // auth() is only the route's gate when it is the immediate first
      // argument after the path; an auth() inside the handler or on the
      // next route must not leak in.
      const am = tail.match(/^\s*,\s*auth\(([^)]*)\)/);
      const roles = am ? am[1].replace(/["'\s]/g, "") : null;
      out.push({
        method: method.toUpperCase(),
        path: path.replace(/:(\w+)/g, "{$1}"),
        auth: am ? (roles ? roles : "user") : "public",
        file: name,
      });
    }
  }
  // De-dupe (same route can be registered for several methods).
  const seen = new Map();
  for (const r of out) seen.set(`${r.method} ${r.path}`, r);
  return [...seen.values()].sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const routes = scanRoutes();
  const manifest = {};
  for (const r of routes) manifest[`${r.method} ${r.path}`] = { auth: r.auth, file: r.file };
  writeFileSync(join(root, "test/authz-routes.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${routes.length} routes written to test/authz-routes.json`);
}

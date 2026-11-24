import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { createApi } from "../server/api.js";
import { processPhoto } from "../server/photo.js";

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-area-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = openDatabase(join(dir, "db.sqlite"));
  seedCatalog(db);
  await seedDemo(db, "TestStudy2026!");
  const app = createApi(db, { processPhoto, limit: false, sendEmail: async () => {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = "";
    return {
      async request(path, method = "GET", body) {
        const r = await fetch(base + "/api" + path, {
          method,
          headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const set = r.headers.get("set-cookie");
        if (set) cookie = set.split(";")[0];
        return { status: r.status, data: r.status === 204 ? null : await r.json() };
      },
      async login(slug) {
        const r = await this.request("/auth/login", "POST", { email: `${slug}@demo.giasu.test`, password: "TestStudy2026!" });
        assert.equal(r.status, 200);
        return r.data.user;
      },
    };
  };
  return { db, client };
}

test("tutor profile saves the offline teaching area and hides exact coordinates publicly", async (t) => {
  const { client } = await fixture(t);
  const tutor = client();
  await tutor.login("chau");
  const profile = (await tutor.request("/tutor/profile")).data;
  const saved = await tutor.request("/tutor/profile", "PUT", {
    ...profile,
    mode: "both",
    area_lat: 21.0285,
    area_lng: 105.8542,
    area_km: 8,
  });
  assert.equal(saved.status, 200);
  const after = (await tutor.request("/tutor/profile")).data;
  assert.equal(after.area_lat, 21.0285);
  assert.equal(after.area_lng, 105.8542);
  assert.equal(after.area_km, 8);

  // The public card keeps the radius but never the exact center coordinates.
  const publicView = (await tutor.request(`/tutors/${after.user_id}`)).data;
  assert.equal(publicView.area_km, 8);
  assert.equal(publicView.area_lat, undefined);
  assert.equal(publicView.area_lng, undefined);
});

test("area fields reject out-of-range values", async (t) => {
  const { client } = await fixture(t);
  const tutor = client();
  await tutor.login("chau");
  const profile = (await tutor.request("/tutor/profile")).data;
  for (const bad of [
    { area_lat: 91 },
    { area_lat: -91 },
    { area_lng: 181 },
    { area_km: 0 },
    { area_km: 31 },
  ]) {
    const r = await tutor.request("/tutor/profile", "PUT", { ...profile, ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});

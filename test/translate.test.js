import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// translate() runs the EN dictionary over raw DOM text. Keys whose literal
// part is too short used to compile into patterns that swallowed words:
// "T{n}" became ^T(.+?)$, turning "Thứ 6" into "Mhứ 6" and "Toán" into "Moán".
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), "translate-"));
writeFileSync(join(tmp, "entry.ts"), `export { translate } from "${join(root, "app/src/lib/page-translator").replace(/\\/g, "/")}";`);
buildSync({ entryPoints: [join(tmp, "entry.ts")], bundle: true, format: "esm", outfile: join(tmp, "bundle.mjs"), logLevel: "silent" });
const { translate } = await import(join(tmp, "bundle.mjs"));

test("short literal keys do not corrupt words starting with T", () => {
  assert.equal(translate("Toán"), "Maths");
  assert.equal(translate("Thứ 6"), "Fri");
  assert.equal(translate("Tuần"), "Week");
  assert.equal(translate("Thứ 6, 27/11 19:00"), "Fri, 27/11 19:00");
  assert.equal(translate("Tìm gia sư"), "Find tutors");
});

rmSync(tmp, { recursive: true, force: true });

import test from "node:test";
import { spawnSync } from "node:child_process";

// Runs the repo-wide i18n coverage check (scripts/i18n-check.js): every t()
// key must exist in en.ts/en-more.ts, and no .tsx may render raw Vietnamese.
test("i18n coverage: all t() keys translated, no raw Vietnamese in JSX", () => {
  const r = spawnSync(process.execPath, ["scripts/i18n-check.js"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${r.stdout}${r.stderr}`);
});

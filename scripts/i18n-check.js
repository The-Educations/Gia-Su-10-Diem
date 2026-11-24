#!/usr/bin/env node
// i18n coverage check (việc J). Runs inside `npm test` via test/i18n.test.js.
//
// Two checks:
//  1. Every t("…") call in app/src must have a key in en.ts or en-more.ts.
//  2. .tsx files must not render Vietnamese text outside t() — JSX text nodes
//     containing Vietnamese diacritics fail unless the file is on the small,
//     documented exclusion list below.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../app/src/", import.meta.url).pathname;
const LOCALES = [new URL("../app/src/lib/locales/en.ts", import.meta.url).pathname, new URL("../app/src/lib/locales/en-more.ts", import.meta.url).pathname];

// Exclusions (documented): files whose visible Vietnamese is user-authored
// content, demo fixtures, or non-JSX data (not chrome text).
const T_EXCLUDE = [
  "app/src/lib/locales/", // the translations themselves
];
const VI_TEXT_EXCLUDE = [
  // Data/catalog constants rendered verbatim — subject names, seeded content.
  "app/src/lib/subjects.ts",
  // i18n plumbing only defines the translator itself.
  "app/src/lib/i18n.tsx",
];

const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/;

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(join(dir, e.name));
    else if (/\.(ts|tsx)$/.test(e.name)) yield join(dir, e.name);
  }
}

// 1. Keys available for translation: every "…": inside the two locale files.
const keys = new Set();
for (const f of LOCALES)
  for (const m of readFileSync(f, "utf8").matchAll(/^\s*["'`]([^"'`]+)["'`]\s*:/gm)) keys.add(m[1]);

const missing = new Map(), viNodes = new Map();
for (const file of walk(SRC)) {
  const rel = relative(process.cwd(), file), src = readFileSync(file, "utf8");
  if (!T_EXCLUDE.some((p) => rel.startsWith(p)))
    for (const m of src.matchAll(/\bt\(\s*["'`]([^"'`]+)["'`]/g))
      if (!keys.has(m[1])) missing.set(m[1], (missing.get(m[1]) || []).concat(rel));
  // JSX text: >text< outside of t(), attribute strings and comments.
  if (!file.endsWith(".tsx") || VI_TEXT_EXCLUDE.some((p) => rel.startsWith(p))) continue;
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of code.matchAll(/>([^<>{}\n]+)</g)) {
    const text = m[1].trim();
    if (text && VI.test(text)) viNodes.set(rel, (viNodes.get(rel) || []).concat(text.slice(0, 60)));
  }
}

let fail = 0;
if (missing.size) {
  fail = 1;
  console.error(`i18n: ${missing.size} t() key(s) without an English entry:`);
  for (const [k, files] of [...missing].sort().slice(0, 40)) console.error(`  "${k}"  <- ${[...new Set(files)].join(", ")}`);
  if (missing.size > 40) console.error(`  … and ${missing.size - 40} more`);
}
if (viNodes.size) {
  fail = 1;
  console.error(`i18n: ${viNodes.size} .tsx file(s) render Vietnamese outside t():`);
  for (const [f, texts] of [...viNodes].sort()) console.error(`  ${f}: ${texts.slice(0, 3).join(" | ")}`);
}
if (fail) process.exit(1);
console.log(`i18n: ${keys.size} EN keys, all t() calls covered, no raw Vietnamese in JSX.`);

import { mkdir, cp, copyFile, rm, writeFile } from "node:fs/promises";
await rm("dist/site", { recursive: true, force: true });
await mkdir("dist/site", { recursive: true });
await copyFile("index.html", "dist/site/index.html");
await cp("assets", "dist/site/assets", { recursive: true });
await cp("dist/app", "dist/site/app", { recursive: true });
// The worker has no filesystem for seo-pages.json's mtime — the sitemap reads
// this build date instead of guessing a lastmod.
await writeFile("dist/site/seo-build.json", JSON.stringify({ date: new Date().toISOString().slice(0, 10) }));

await cp("dist/legal", "dist/site/legal", { recursive: true });

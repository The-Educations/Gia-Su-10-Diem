import { mkdir, cp, copyFile, rm } from "node:fs/promises";
await rm("dist/site", { recursive: true, force: true });
await mkdir("dist/site", { recursive: true });
await copyFile("index.html", "dist/site/index.html");
await cp("assets", "dist/site/assets", { recursive: true });
await cp("dist/app", "dist/site/app", { recursive: true });

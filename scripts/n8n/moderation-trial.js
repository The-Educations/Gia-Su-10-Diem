// Chạy thử THẬT bộ bài mẫu qua Claude trước khi bật shadow trên web thật. Tốn một ít hạn mức Haiku (mỗi bài một lần gọi).
// Chạy: node scripts/n8n/moderation-trial.js [--model haiku] [--only 3] [--repeat 2]
// Không đụng tới web hay n8n: dùng đúng prompt, đúng cách đọc kết quả và đúng quyết định cuối như workflow.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildModerationPrompt, parseVerdict, decideModeration, looksLikeInjection, riskSignals } from "./lib/moderation.js";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const model = arg("model", "haiku");
const only = arg("only", "");
const repeat = Number(arg("repeat", "1"));
const rubric = readFileSync(fileURLToPath(new URL("./moderation-rubric.md", import.meta.url)), "utf8");
const samples = JSON.parse(readFileSync(fileURLToPath(new URL("./moderation-samples.json", import.meta.url)), "utf8"));

const FLAGS = ["-p", "--model", model, "--tools", "", "--output-format", "json", "--max-turns", "1", "--no-session-persistence",
  "--strict-mcp-config", "--mcp-config", '{"mcpServers":{} }', "--disable-slash-commands", "--setting-sources", "project"];

let bad = 0;
let total = 0;
const ctx = { mode: "full", daily: { date: "", approved: 0, rejected: 0 }, today: "x", caps: { approve: 999, reject: 999 } };
for (const [i, s] of samples.entries()) {
  if (only !== "" && Number(only) !== i + 1) continue;
  if (looksLikeInjection(s.title + "\n" + s.body)) {
    const ok = s.preBlocked === true;
    console.log(`${ok ? "ĐÚNG " : "SAI  "} ${String(i + 1).padStart(2)} ${s.name}\n        bị bộ lọc cài lệnh chặn trước, không gọi Claude`);
    total += 1;
    if (!ok) bad += 1;
    continue;
  }
  for (let r = 0; r < repeat; r++) {
    const prompt = buildModerationPrompt({ ...s, revision: false }, rubric);
    let verdict = null;
    let error = "";
    try {
      const raw = execFileSync("claude", FLAGS, { input: prompt, encoding: "utf8", timeout: 120000 });
      verdict = parseVerdict(raw);
      if (!verdict) error = "không đọc được kết quả: " + raw.slice(0, 400).replace(/\s+/g, " ");
    } catch (e) {
      error = String(e.message).split("\n")[0];
    }
    const d = decideModeration(verdict, { ...ctx, risk: riskSignals(s.title + "\n" + s.body, s.links) });
    const got = verdict ? verdict.verdict : "LỖI";
    // Đúng khi kết quả AI nằm trong tập cho phép (nếu từ chối thì đúng nhóm) VÀ quyết định cuối không tự duyệt bài vi phạm.
    const ok = Boolean(verdict) && s.allow.includes(got) && (got !== "reject" || !s.rejectCategory || s.rejectCategory.includes(verdict.category)) && (s.allow.includes("approve") || d.action !== "approve");
    total += 1;
    if (!ok) bad += 1;
    console.log(`${ok ? "ĐÚNG " : "SAI  "} ${String(i + 1).padStart(2)} ${s.name}\n        AI: ${got}${verdict && verdict.category ? "/" + verdict.category : ""} — ${verdict ? verdict.detail : error}\n        quyết định cuối: ${d.action}${d.note ? " | lý do gửi tác giả: " + d.note : ""}`);
  }
}
console.log(`\n${total - bad}/${total} đúng.${bad ? " Có bài SAI: xem lại bộ tiêu chí scripts/n8n/moderation-rubric.md." : ""}`);
process.exit(bad ? 1 : 0);

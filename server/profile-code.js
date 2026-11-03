import { randomInt } from "node:crypto";

const alphabet = "abcdefghijklmnopqrstuvwxyz23456789";
export function assignProfileCode(db, id) {
  const existing = db
    .prepare("SELECT profile_code FROM users WHERE id=?")
    .get(id);
  if (existing.profile_code) return existing.profile_code;
  for (;;) {
    const code = Array.from(
      { length: 8 },
      () => alphabet[randomInt(alphabet.length)],
    ).join("");
    const result = db
      .prepare(
        "UPDATE OR IGNORE users SET profile_code=? WHERE id=? AND profile_code IS NULL",
      )
      .run(code, id);
    if (result.changes) return code;
  }
}

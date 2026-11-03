import { assignProfileCode } from "./profile-code.js";
import { openDatabase } from "./local-db.js";
import { passwordHash, run } from "./db.js";
import { loginSchema } from "./validation.js";
const { email, password } = loginSchema.parse({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
const db = openDatabase();
const result = run(
  db,
  "INSERT INTO users(name,email,password,role) VALUES (?,?,?,'admin')",
  process.env.ADMIN_NAME || "Quản trị viên",
  email,
  await passwordHash(password),
);
assignProfileCode(db, Number(result.lastInsertRowid));
db.close();
console.log("Admin account created.");

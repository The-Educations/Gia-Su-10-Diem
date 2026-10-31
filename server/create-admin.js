import { openDatabase } from "./local-db.js";
import { passwordHash, run } from "./db.js";
import { loginSchema } from "./validation.js";
const { email, password } = loginSchema.parse({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
const db = openDatabase();
run(
  db,
  "INSERT INTO users(name,email,password,role) VALUES (?,?,?,'admin')",
  process.env.ADMIN_NAME || "Quản trị viên",
  email,
  await passwordHash(password),
);
db.close();
console.log("Admin account created.");

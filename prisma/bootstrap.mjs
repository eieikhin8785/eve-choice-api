import "dotenv/config";
import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const configuredUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const relativePath = configuredUrl.replace(/^file:/, "");
const databasePath = resolve(process.cwd(), relativePath);
mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
const hasSchema = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'User'").get();
if (!hasSchema) {
  const prismaCli = resolve(process.cwd(), "node_modules/prisma/build/index.js");
  const generated = execFileSync(process.execPath, [prismaCli, "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8" });
  const sqlStart = generated.indexOf("-- CreateTable");
  if (sqlStart < 0) throw new Error("Prisma did not produce an initialization script.");
  database.exec(`PRAGMA foreign_keys = OFF;\n${generated.slice(sqlStart)}\nPRAGMA foreign_keys = ON;`);
  console.log(`Initialized SQLite database at ${databasePath}`);
} else {
  console.log(`SQLite database already initialized at ${databasePath}`);
}
database.close();


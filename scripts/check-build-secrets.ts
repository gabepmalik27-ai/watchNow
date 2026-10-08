// Run with: npm run build && npm run check-secrets
// Searches every file under .next/ for the raw values of the server-only
// secrets. Prints only NAME: FOUND / NOT FOUND. Never prints values or paths
// with matched content. Exits 1 if any secret is found.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SECRET_NAMES = ["SUPABASE_SERVICE_ROLE_KEY", "TMDB_READ_TOKEN"] as const;
const BUILD_DIR = path.join(process.cwd(), ".next");

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.isFile() ? [full] : [];
  });
}

try {
  statSync(BUILD_DIR);
} catch {
  console.error("No .next/ directory. Run `npm run build` first.");
  process.exit(1);
}

const secrets = SECRET_NAMES.map((name) => ({ name, value: process.env[name] ?? "" }));
const missing = secrets.filter((secret) => secret.value.length === 0);
if (missing.length > 0) {
  console.error(`Not set: ${missing.map((s) => s.name).join(", ")} (check .env.local)`);
  process.exit(1);
}

const files = listFiles(BUILD_DIR);
const found = new Set<string>();
for (const file of files) {
  const contents = readFileSync(file);
  for (const { name, value } of secrets) {
    if (!found.has(name) && contents.includes(value)) found.add(name);
  }
}

console.log(`Scanned ${files.length} files in .next/`);
for (const { name } of secrets) {
  console.log(`${name}: ${found.has(name) ? "FOUND" : "NOT FOUND"}`);
}
if (found.size > 0) process.exit(1);

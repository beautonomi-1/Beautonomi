/**
 * Ensures apps/web/vercel.json cron paths map to route handlers that
 * export GET and call verifyCronRequest (repo guardrail; run from repo root).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const vercelPath = path.join(root, "apps", "web", "vercel.json");
const cronRoot = path.join(root, "apps", "web", "src", "app", "api", "cron");

function main() {
  const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
  const crons = vercel.crons ?? [];
  const errors = [];

  for (const c of crons) {
    const p = c.path;
    if (typeof p !== "string" || !p.startsWith("/api/cron/")) {
      errors.push(`Invalid cron path: ${JSON.stringify(p)}`);
      continue;
    }
    const slug = p.slice("/api/cron/".length);
    const routeFile = path.join(cronRoot, slug, "route.ts");
    if (!fs.existsSync(routeFile)) {
      errors.push(`Missing handler: ${p} → ${path.relative(root, routeFile)}`);
      continue;
    }
    const src = fs.readFileSync(routeFile, "utf8");
    if (!/\bexport\s+async\s+function\s+GET\b/.test(src)) {
      errors.push(`${p}: no export async function GET`);
    }
    if (!src.includes("verifyCronRequest")) {
      errors.push(`${p}: does not reference verifyCronRequest`);
    }
  }

  const scheduled = new Set(
    crons.map((c) => (typeof c.path === "string" ? c.path.slice("/api/cron/".length) : "")),
  );
  const dirs = fs
    .readdirSync(cronRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const d of dirs) {
    if (!scheduled.has(d)) {
      errors.push(`api/cron/${d} exists but is not listed in apps/web/vercel.json crons`);
    }
  }

  if (errors.length) {
    console.error("verify-cron-schedule failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`verify-cron-schedule: OK (${crons.length} crons, ${dirs.length} handler dirs)`);
}

main();

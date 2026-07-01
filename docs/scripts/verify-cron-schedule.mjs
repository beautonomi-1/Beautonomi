#!/usr/bin/env node
/**
 * verify-cron-schedule.mjs
 *
 * Verifies that every cron path registered in apps/web/vercel.json has a
 * corresponding route handler file at apps/web/src/app/<path>/route.ts.
 *
 * Exit 0: all handlers exist.
 * Exit 1: one or more handlers are missing.
 *
 * Usage:
 *   node scripts/verify-cron-schedule.mjs
 *   pnpm verify:cron-schedule   (alias in root package.json)
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// docs/scripts/ → docs/ → repo root
const ROOT = join(__dirname, "..", "..");
const VERCEL_JSON = join(ROOT, "apps", "web", "vercel.json");
const ROUTES_ROOT = join(ROOT, "apps", "web", "src", "app");

const raw = await readFile(VERCEL_JSON, "utf8");
const { crons } = JSON.parse(raw);

if (!Array.isArray(crons) || crons.length === 0) {
  console.error("No crons array found in vercel.json");
  process.exit(1);
}

console.log(`\nCron Schedule Verification — ${new Date().toISOString()}`);
console.log(`Checking ${crons.length} cron job(s) from apps/web/vercel.json\n`);

let missing = 0;

for (const { path, schedule } of crons) {
  const handlerTs = join(ROUTES_ROOT, path, "route.ts");
  const handlerTsx = join(ROUTES_ROOT, path, "route.tsx");
  const exists = existsSync(handlerTs) || existsSync(handlerTsx);
  const icon = exists ? "✓" : "✗";
  console.log(`  ${icon}  ${path}   [${schedule}]`);
  if (!exists) missing++;
}

console.log("");

if (missing > 0) {
  console.error(
    `FAILED: ${missing} of ${crons.length} cron route handler(s) are missing.\n` +
      `Create the missing route.ts files or remove stale entries from vercel.json.`
  );
  process.exit(1);
} else {
  console.log(`All ${crons.length} cron handlers verified.\n`);
}

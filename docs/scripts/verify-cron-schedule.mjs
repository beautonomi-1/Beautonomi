#!/usr/bin/env node
/**
 * verify-cron-schedule.mjs
 *
 * Verifies cron hygiene for apps/web/vercel.json:
 * - every scheduled path has a route handler
 * - every api/cron handler is scheduled (no orphans)
 * - each schedule is a valid 5-field cron expression
 *
 * Exit 0: all checks pass.
 * Exit 1: one or more checks fail.
 *
 * Usage:
 *   node docs/scripts/verify-cron-schedule.mjs
 *   pnpm verify:cron-schedule
 */

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const VERCEL_JSON = join(ROOT, "apps", "web", "vercel.json");
const ROUTES_ROOT = join(ROOT, "apps", "web", "src", "app");
const CRON_ROOT = join(ROUTES_ROOT, "api", "cron");

const CRON_ATOM = /^(\*|\*\/[0-9]{1,2}|[0-9]{1,2}(-[0-9]{1,2})?(\/[0-9]{1,2})?)$/;

function isValidCronField(field) {
  return field.split(",").every((atom) => CRON_ATOM.test(atom));
}

function isValidCronSchedule(schedule) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every(isValidCronField);
}

function listCronHandlerPaths() {
  if (!existsSync(CRON_ROOT)) return [];
  return readdirSync(CRON_ROOT, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (existsSync(join(CRON_ROOT, entry.name, "route.ts")) ||
          existsSync(join(CRON_ROOT, entry.name, "route.tsx"))),
    )
    .map((entry) => `/api/cron/${entry.name}`);
}

const raw = await readFile(VERCEL_JSON, "utf8");
const { crons } = JSON.parse(raw);

if (!Array.isArray(crons) || crons.length === 0) {
  console.error("No crons array found in vercel.json");
  process.exit(1);
}

console.log(`\nCron Schedule Verification — ${new Date().toISOString()}`);
console.log(`Checking ${crons.length} cron job(s) from apps/web/vercel.json\n`);

let failures = 0;
const scheduledPaths = new Set();

for (const { path, schedule } of crons) {
  scheduledPaths.add(path);
  const handlerTs = join(ROUTES_ROOT, path, "route.ts");
  const handlerTsx = join(ROUTES_ROOT, path, "route.tsx");
  const exists = existsSync(handlerTs) || existsSync(handlerTsx);
  const validSchedule = isValidCronSchedule(schedule);

  const handlerIcon = exists ? "✓" : "✗";
  const scheduleIcon = validSchedule ? "✓" : "✗";
  console.log(`  ${handlerIcon}${scheduleIcon}  ${path}   [${schedule}]`);

  if (!exists) failures++;
  if (!validSchedule) {
    failures++;
    console.error(`       invalid cron schedule: ${schedule}`);
  }
}

const handlerPaths = listCronHandlerPaths();
for (const path of handlerPaths) {
  if (!scheduledPaths.has(path)) {
    failures++;
    console.error(`  ✗  ${path}   (handler exists but is not scheduled in vercel.json)`);
  }
}

console.log("");

if (failures > 0) {
  console.error(
    `FAILED: ${failures} cron hygiene issue(s) found.\n` +
      `Fix missing handlers, orphan routes, or invalid schedules in vercel.json.`,
  );
  process.exit(1);
}

console.log(`All ${crons.length} cron handlers and schedules verified.\n`);

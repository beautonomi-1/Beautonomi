#!/usr/bin/env node
/**
 * Verifies localization-related DB objects expected by apps/web are present.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (reads apps/web/.env.local when unset).
 *
 * Exit 0 when all required objects exist; exit 1 with a checklist otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

function loadEnvLocal() {
  const envPath = path.join(repoRoot, "apps", "web", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !serviceKey || url.includes("placeholder")) {
  console.error(
    "verify:db skipped — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or apps/web/.env.local).",
  );
  process.exit(0);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const errors = [];
const warnings = [];

async function tableReadable(name, select = "id") {
  const { error } = await supabase.from(name).select(select).limit(1);
  if (error) {
    errors.push(`${name}: ${error.message}`);
    return false;
  }
  return true;
}

async function countRows(name, filter) {
  let query = supabase.from(name).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) {
    warnings.push(`${name} count: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

async function columnReadable(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (error) {
    errors.push(`${table}.${column}: ${error.message}`);
    return false;
  }
  return true;
}

console.log("Checking localization DB objects...\n");

// 897 — notification template translations
await tableReadable("notification_template_translations", "template_key");

// 898 — emergency contact language column
await columnReadable("users", "emergency_contact_language");

// 824 — home materialized views (graceful degradation in app, but required for prod perf)
const topRatedOk = await tableReadable("public_home_top_rated", "tenant_id");
const hottestOk = await tableReadable("public_home_hottest", "tenant_id");
if (!topRatedOk || !hottestOk) {
  warnings.push(
    "Home MVs missing — app falls back to live queries; run migration 824 and refresh_reporting_views().",
  );
}

// 892–894 seeds (warn when empty, not hard fail)
const langCount = await countRows("iso_languages");
const prefLangCount = await countRows("preference_options", (q) =>
  q.eq("type", "language"),
);
const localeCount = await countRows("iso_locales");
const tzCount = await countRows("iso_timezones");

const seedChecks = [
  ["iso_languages (892)", langCount, 13],
  ["preference_options language rows (892)", prefLangCount, 1],
  ["iso_locales (894)", localeCount, 14],
  ["iso_timezones (894)", tzCount, 15],
];

for (const [label, count, min] of seedChecks) {
  if (count === null) continue;
  if (count < min) {
    warnings.push(`${label}: expected >= ${min} rows, found ${count}`);
  } else {
    console.log(`  OK ${label}: ${count} rows`);
  }
}

if (errors.length > 0) {
  console.error("\nMissing or unreadable objects:\n" + errors.map((e) => `  - ${e}`).join("\n"));
}

if (warnings.length > 0) {
  console.warn("\nWarnings:\n" + warnings.map((w) => `  - ${w}`).join("\n"));
}

if (errors.length > 0) {
  console.error(
    "\nApply pending migrations: npx supabase link --project-ref YOUR_REF && npx supabase db push",
  );
  process.exit(1);
}

console.log("\nDB object check passed (see warnings above if any).");
process.exit(0);

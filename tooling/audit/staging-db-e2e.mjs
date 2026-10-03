#!/usr/bin/env node
/**
 * End-to-end staging database prep: migrations, readiness, config sync from prod, seeds.
 *
 *   node tooling/audit/staging-db-e2e.mjs --check
 *   node tooling/audit/staging-db-e2e.mjs --apply
 *
 * --apply also runs:
 *   - supabase-push-staging (PowerShell on Windows)
 *   - readiness (buckets, verify:db, public asset sync)
 *   - sync-staging-config-from-production --apply
 *   - seed:postal:za (staging URL), seed:ai-platform, grc:seed, e2e seed-staging
 *   - optional sync:paystack:staging when apps/web/.env.paystack.sync.local exists
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECTS, serviceRoleKey } from "./supabase-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apply = process.argv.includes("--apply");
if (!apply && !process.argv.includes("--check")) {
  console.error("Usage: staging-db-e2e.mjs --check | --apply");
  process.exit(2);
}

function run(label, cmd, cmdArgs, extraEnv = {}) {
  console.log(`\n>>> ${label}`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (r.status !== 0) {
    console.error(`FAILED: ${label}`);
    process.exit(r.status ?? 1);
  }
}

function stagingEnv() {
  const key = serviceRoleKey(PROJECTS.staging.ref);
  return {
    SUPABASE_URL: PROJECTS.staging.url,
    NEXT_PUBLIC_SUPABASE_URL: PROJECTS.staging.url,
    SUPABASE_SERVICE_ROLE_KEY: key,
  };
}

if (apply) {
  run("Link Supabase staging project", "supabase", [
    "link",
    "--project-ref",
    PROJECTS.staging.ref,
  ]);
  if (process.platform === "win32") {
    run("Staging migrations", "powershell", ["-File", "scripts/supabase-push-staging.ps1"]);
  } else {
    run("Staging db push", "supabase", ["db", "push", "--yes", "--include-all"]);
  }

  run(
    "Supabase readiness + public assets",
    "node",
    ["tooling/audit/supabase-e2e-readiness.mjs", "--sync-public-assets"],
  );

  run("Config sync prod → staging", "node", [
    "tooling/audit/sync-staging-config-from-production.mjs",
    "--apply",
  ]);
} else {
  run("Config sync dry-run", "node", [
    "tooling/audit/sync-staging-config-from-production.mjs",
    "--dry-run",
  ]);
}

run("Compare prod vs staging", "node", ["tooling/audit/compare-supabase-envs.mjs"]);

if (apply) {
  const env = stagingEnv();

  run("Postal areas (ZA)", "node", ["scripts/import-za-postal-areas.mjs"], env);
  run("GRC catalogue seed", "pnpm", ["grc:seed"], env);
  run("AI platform seed", "pnpm", ["seed:ai-platform"], env);
  run("E2E bookable provider", "node", ["scripts/e2e/seed-staging.mjs"], env);
}

if (apply) {
  const paystackEnvFile = path.join(root, "apps/web/.env.paystack.sync.local");
  if (fs.existsSync(paystackEnvFile)) {
    run("Paystack staging keys", "pnpm", ["sync:paystack:staging"], {
      DOTENV_PATH: paystackEnvFile,
    });
  } else {
    console.log("\n(skip) pnpm sync:paystack:staging — no apps/web/.env.paystack.sync.local");
  }
}

run("Readiness check", "node", ["tooling/audit/supabase-e2e-readiness.mjs"]);

console.log("\n=== Staging DB E2E complete ===");

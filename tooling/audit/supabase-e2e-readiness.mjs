#!/usr/bin/env node
/**
 * End-to-end Supabase readiness: buckets, core tables, verify:db, optional asset sync.
 *
 * Usage:
 *   node tooling/audit/supabase-e2e-readiness.mjs
 *   node tooling/audit/supabase-e2e-readiness.mjs --sync-public-assets
 *   node tooling/audit/supabase-e2e-readiness.mjs --fix-prod-receipts-bucket
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  CANONICAL_BUCKET_IDS,
  PROJECTS,
  ensureBucket,
  listBuckets,
  serviceRoleKey,
} from "./supabase-env.mjs";

const args = new Set(process.argv.slice(2));
const CORE_TABLES = [
  "tenants",
  "tenant_domains",
  "providers",
  "offerings",
  "bookings",
  "platform_settings",
  "feature_flags",
  "notification_templates",
  "global_service_categories",
];

const RECEIPTS_SPEC = {
  id: "receipts",
  name: "receipts",
  public: false,
  file_size_limit: 5242880,
  allowed_mime_types: ["application/pdf", "image/jpeg", "image/png", "image/jpg"],
};

async function checkEnv(name, cfg) {
  const key = serviceRoleKey(cfg.ref);
  const supabase = createClient(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const buckets = await listBuckets(cfg.url, key);
  const bucketIds = new Set(buckets.map((b) => b.id));
  const missingBuckets = CANONICAL_BUCKET_IDS.filter((id) => !bucketIds.has(id));
  const tables = {};
  for (const t of CORE_TABLES) {
    const { error } = await supabase.from(t).select("id").limit(1);
    tables[t] = error ? error.message : "ok";
  }
  const { error: rpcErr } = await supabase.rpc("refresh_reporting_views");
  const { count: previewDomains } = await supabase
    .from("tenant_domains")
    .select("*", { count: "exact", head: true })
    .eq("environment", "preview");
  return {
    name,
    ref: cfg.ref,
    bucketCount: buckets.length,
    missingBuckets,
    tables,
    refresh_reporting_views: rpcErr ? rpcErr.message : "ok",
    preview_domain_rows: previewDomains ?? 0,
  };
}

function runVerifyDb(url, serviceKey) {
  const r = spawnSync("pnpm", ["verify:db"], {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: url,
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    },
    stdio: "inherit",
    shell: true,
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  });
  return r.status === 0;
}

async function main() {
  console.log("=== Supabase E2E readiness ===\n");
  const report = { production: null, staging: null, actions: [] };

  if (args.has("--fix-prod-receipts-bucket")) {
    const key = serviceRoleKey(PROJECTS.production.ref);
    const result = await ensureBucket(PROJECTS.production.url, key, RECEIPTS_SPEC);
    report.actions.push({ fix_prod_receipts_bucket: result });
    console.log(`Production receipts bucket: ${result}`);
  }

  report.production = await checkEnv("production", PROJECTS.production);
  report.staging = await checkEnv("staging", PROJECTS.staging);

  console.log(JSON.stringify(report, null, 2));

  let exitCode = 0;
  for (const env of [report.production, report.staging]) {
    if (env.missingBuckets.length) {
      console.error(`\n${env.name}: missing buckets: ${env.missingBuckets.join(", ")}`);
      exitCode = 1;
    }
    for (const [t, status] of Object.entries(env.tables)) {
      if (status !== "ok") {
        console.error(`${env.name}: table ${t}: ${status}`);
        exitCode = 1;
      }
    }
  }

  if (report.staging.preview_domain_rows < 1) {
    console.error("\nstaging: no preview tenant_domains — run migration 970 or insert staging host.");
    exitCode = 1;
  }

  console.log("\n--- verify:db staging ---");
  const stageKey = serviceRoleKey(PROJECTS.staging.ref);
  if (!runVerifyDb(PROJECTS.staging.url, stageKey)) exitCode = 1;

  console.log("\n--- verify:db production ---");
  const prodKey = serviceRoleKey(PROJECTS.production.ref);
  if (!runVerifyDb(PROJECTS.production.url, prodKey)) exitCode = 1;

  if (args.has("--sync-public-assets")) {
    console.log("\n--- sync public assets prod → staging ---");
    const sync = spawnSync("node", ["tooling/audit/sync-staging-public-assets.mjs"], {
      stdio: "inherit",
      shell: true,
    });
    if (sync.status !== 0) exitCode = 1;
  }

  if (exitCode === 0) console.log("\nReadiness checks passed.");
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

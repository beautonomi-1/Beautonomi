#!/usr/bin/env node
/**
 * Compare staging vs production Supabase (buckets + core tables).
 */
import { createClient } from "@supabase/supabase-js";
import {
  CANONICAL_BUCKET_IDS,
  PROJECTS,
  listBuckets,
  serviceRoleKey,
} from "./supabase-env.mjs";

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
  "finance_transactions",
  "subscription_plans",
  "pricing_plans",
];

async function probeTable(supabase, table) {
  const { error } = await supabase.from(table).select("id").limit(1);
  return error ? { ok: false, message: error.message } : { ok: true };
}

async function main() {
  const results = { production: {}, staging: {}, gaps: [] };

  for (const [name, cfg] of Object.entries(PROJECTS)) {
    const key = serviceRoleKey(cfg.ref);
    const supabase = createClient(cfg.url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const buckets = await listBuckets(cfg.url, key);
    results[name].buckets = buckets.map((b) => b.id).sort();
    results[name].missing_canonical = CANONICAL_BUCKET_IDS.filter(
      (id) => !results[name].buckets.includes(id),
    );
    results[name].tables = {};
    for (const t of CORE_TABLES) {
      results[name].tables[t] = await probeTable(supabase, t);
    }
    const { count: previewDomains } = await supabase
      .from("tenant_domains")
      .select("*", { count: "exact", head: true })
      .eq("environment", "preview");
    results[name].preview_domains_count = previewDomains ?? 0;
  }

  const prodBuckets = new Set(results.production.buckets);
  const stageBuckets = new Set(results.staging.buckets);
  for (const id of prodBuckets) {
    if (!stageBuckets.has(id)) {
      results.gaps.push({ kind: "storage_bucket", missing_on: "staging", id });
    }
  }

  for (const t of CORE_TABLES) {
    const p = results.production.tables[t];
    const s = results.staging.tables[t];
    if (p.ok && !s.ok) {
      results.gaps.push({ kind: "table", missing_on: "staging", table: t, error: s.message });
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const blocking = results.gaps.filter((g) => g.missing_on === "staging");
  if (blocking.length || results.staging.missing_canonical.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

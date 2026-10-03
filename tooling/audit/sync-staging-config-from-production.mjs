#!/usr/bin/env node
/**
 * Copy production configuration / catalogue rows into staging so Preview E2E
 * matches prod admin settings before a production tenant reset.
 *
 * Does NOT copy transactional data (bookings, payments, etc.).
 * Skips live payment secrets — run `pnpm sync:paystack:staging` after this.
 *
 * Usage:
 *   node tooling/audit/sync-staging-config-from-production.mjs --dry-run
 *   node tooling/audit/sync-staging-config-from-production.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { PROJECTS, serviceRoleKey } from "./supabase-env.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--apply");

/** Full-row upserts (non-transactional config / reference data). */
const CONFIG_TABLES = [
  { table: "notification_template_translations", onConflict: "template_key,language_code" },
  { table: "region_settings", onConflict: "region_id" },
  { table: "payment_gateway_fee_configs", onConflict: "id" },
  { table: "tax_rates", onConflict: "id" },
  { table: "iso_languages", onConflict: "code" },
  { table: "iso_locales", onConflict: "code" },
  { table: "iso_timezones", onConflict: "code" },
  { table: "integration_capabilities", onConflict: "integration_key" },
  { table: "payment_webhook_event_types", onConflict: "id", optional: true },
  { table: "agent_workforce_config", onConflict: "environment", optional: true },
  { table: "ai_platform_agents", onConflict: "id", optional: true },
];

const AI_SECRET_STRIP = new Set([
  "gateway_api_key_secret",
  "openai_api_key_secret",
  "anthropic_api_key_secret",
]);

const SECRET_COLUMN_STRIP = new Set([
  "paystack_secret_key",
  "paystack_public_key",
  "paystack_webhook_secret",
]);

const PLATFORM_SECRET_STRIP = new Set([
  "paystack_secret_key",
  "paystack_public_key",
]);

function client(ref, url) {
  return createClient(url, serviceRoleKey(ref), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchAll(supabase, table) {
  const pageSize = 500;
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} select: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function stripKeys(row, keys) {
  const out = { ...row };
  for (const k of keys) {
    if (k in out) out[k] = null;
  }
  return out;
}

async function upsertRows(stage, table, onConflict, rows) {
  const chunk = 100;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await stage.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

async function syncTenantDomains(prod, stage, tenantIdMap, report) {
  const prodRows = await fetchAll(prod, "tenant_domains");
  const stageRows = await fetchAll(stage, "tenant_domains");
  const previewHosts = new Set(
    stageRows.filter((r) => r.environment === "preview").map((r) => r.hostname),
  );

  const toUpsert = prodRows
    .filter((r) => !previewHosts.has(r.hostname))
    .map((r) => remapEnvIds(r, tenantIdMap, new Map()));
  report.tenant_domains = {
    prod: prodRows.length,
    staging_before: stageRows.length,
    upsert: toUpsert.length,
    preserved_preview_hosts: [...previewHosts],
  };

  if (!dryRun) {
    for (const row of toUpsert) {
      const { id: _id, ...patch } = row;
      const { data: existing } = await stage
        .from("tenant_domains")
        .select("id")
        .eq("hostname", row.hostname)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await stage.from("tenant_domains").update(patch).eq("id", existing.id);
        if (error) throw new Error(`tenant_domains update ${row.hostname}: ${error.message}`);
      } else {
        const { error } = await stage.from("tenant_domains").insert(patch);
        if (error) throw new Error(`tenant_domains insert ${row.hostname}: ${error.message}`);
      }
    }
  }
}

async function syncPlatformSecrets(prod, stage, tenantIdMap, stripCols, report) {
  let rows;
  try {
    rows = await fetchAll(prod, "platform_secrets");
  } catch (e) {
    report.platform_secrets = { skipped: e.message };
    return;
  }
  let updated = 0;
  for (const row of rows) {
    const mappedTenant = row.tenant_id ? tenantIdMap.get(row.tenant_id) : null;
    if (row.tenant_id && !mappedTenant) continue;
    const { id: _id, ...patch } = stripKeys(row, stripCols);
    const payload = { ...patch, tenant_id: mappedTenant };
    if (dryRun) {
      updated++;
      continue;
    }
    let q = stage.from("platform_secrets").select("id");
    q = mappedTenant ? q.eq("tenant_id", mappedTenant) : q.is("tenant_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      const { error } = await stage.from("platform_secrets").update(payload).eq("id", existing.id);
      if (error) throw new Error(`platform_secrets update: ${error.message}`);
    } else {
      const { error } = await stage.from("platform_secrets").insert(payload);
      if (error) throw new Error(`platform_secrets insert: ${error.message}`);
    }
    updated++;
  }
  report.platform_secrets = { prod_rows: rows.length, updated, stripped_columns: [...stripCols] };
}

async function syncRegionSecrets(prod, stage, report, regionIdMap) {
  let rows;
  try {
    rows = await fetchAll(prod, "region_secrets");
  } catch (e) {
    report.region_secrets = { skipped: e.message };
    return;
  }
  const filtered = rows
    .filter((r) => r.key !== "paystack_secret_key")
    .map((r) => remapEnvIds(r, new Map(), regionIdMap));
  report.region_secrets = {
    prod: rows.length,
    upsert_non_paystack: filtered.length,
    skipped_paystack: rows.length - filtered.length,
  };
  if (!dryRun && filtered.length) {
    await upsertRows(stage, "region_secrets", "region_id,key", filtered);
  }
}

/** Prod/staging tenant UUIDs differ; align rows by slug and keep staging ids. */
async function buildTenantIdMap(prod, stage) {
  const prodTenants = await fetchAll(prod, "tenants");
  const stageTenants = await fetchAll(stage, "tenants");
  const stageBySlug = new Map(stageTenants.map((t) => [t.slug, t]));
  const idMap = new Map();
  for (const pt of prodTenants) {
    const st = stageBySlug.get(pt.slug);
    if (st) idMap.set(pt.id, st.id);
  }
  return { idMap, prodTenants, stageBySlug };
}

async function buildRegionIdMap(prod, stage) {
  const prodRegions = await fetchAll(prod, "regions");
  const stageRegions = await fetchAll(stage, "regions");
  const stageByCode = new Map(stageRegions.map((r) => [r.code, r]));
  const idMap = new Map();
  for (const pr of prodRegions) {
    const sr = stageByCode.get(pr.code);
    if (sr) idMap.set(pr.id, sr.id);
  }
  return idMap;
}

const STRIP_USER_FKS = ["updated_by", "created_by", "author_id"];

function remapEnvIds(row, tenantIdMap, regionIdMap) {
  const out = { ...row };
  if (out.tenant_id && tenantIdMap.has(out.tenant_id)) {
    out.tenant_id = tenantIdMap.get(out.tenant_id);
  }
  if (out.region_id && regionIdMap.has(out.region_id)) {
    out.region_id = regionIdMap.get(out.region_id);
  }
  for (const k of STRIP_USER_FKS) {
    if (k in out) out[k] = null;
  }
  return out;
}

async function syncRegionsByCode(prod, stage, report) {
  const prodRegions = await fetchAll(prod, "regions");
  const stageRegions = await fetchAll(stage, "regions");
  const stageByCode = new Map(stageRegions.map((r) => [r.code, r]));
  let updated = 0;
  for (const pr of prodRegions) {
    const sr = stageByCode.get(pr.code);
    if (!sr) continue;
    const { id: _id, created_at: _ca, ...patch } = pr;
    if (!dryRun) {
      const { error } = await stage.from("regions").update(patch).eq("id", sr.id);
      if (error) throw new Error(`regions update ${pr.code}: ${error.message}`);
    }
    updated++;
  }
  report.regions = { updated_by_code: updated };
}

async function syncTenantsBySlug(prod, stage, report) {
  const { prodTenants, stageBySlug } = await buildTenantIdMap(prod, stage);
  let updated = 0;
  let missingOnStaging = 0;
  for (const pt of prodTenants) {
    const st = stageBySlug.get(pt.slug);
    if (!st) {
      missingOnStaging++;
      continue;
    }
    const { id: _id, created_at: _ca, ...patch } = pt;
    if (!dryRun) {
      const { error } = await stage.from("tenants").update(patch).eq("id", st.id);
      if (error) throw new Error(`tenants update ${pt.slug}: ${error.message}`);
    }
    updated++;
  }
  report.tenants = { updated_by_slug: updated, missing_on_staging: missingOnStaging };
}

/** Rows keyed by (tenant_id, key) — staging UUIDs differ from production. */
async function syncKeyedTenantRows(prod, stage, table, keyColumn, tenantIdMap, regionIdMap, report) {
  const rows = await fetchAll(prod, table);
  let updated = 0;
  let inserted = 0;
  for (const row of rows) {
    const hasTenantCol = Object.prototype.hasOwnProperty.call(row, "tenant_id");
    const mappedTenant = hasTenantCol && row.tenant_id ? tenantIdMap.get(row.tenant_id) : null;
    if (hasTenantCol && row.tenant_id && !mappedTenant) continue;
    const naturalKey = row[keyColumn];
    if (!naturalKey) continue;
    const { id: _id, created_at: _ca, ...patch } = row;
    const payload = remapEnvIds(
      hasTenantCol ? { ...patch, tenant_id: mappedTenant } : patch,
      tenantIdMap,
      regionIdMap,
    );
    if (dryRun) {
      updated++;
      continue;
    }
    let q = stage.from(table).select("id").eq(keyColumn, naturalKey);
    if (hasTenantCol) {
      q = mappedTenant ? q.eq("tenant_id", mappedTenant) : q.is("tenant_id", null);
    }
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      const { error } = await stage.from(table).update(payload).eq("id", existing.id);
      if (error) throw new Error(`${table} update ${naturalKey}: ${error.message}`);
      updated++;
    } else {
      const { error } = await stage.from(table).insert(payload);
      if (error) throw new Error(`${table} insert ${naturalKey}: ${error.message}`);
      inserted++;
    }
  }
  report[table] = { prod_rows: rows.length, updated, inserted };
}

async function syncAiRuntimeConfig(prod, stage, tenantIdMap, report) {
  let rows;
  try {
    rows = await fetchAll(prod, "ai_runtime_config");
  } catch (e) {
    report.ai_runtime_config = { skipped: e.message };
    return;
  }
  let updated = 0;
  for (const row of rows) {
    const mappedTenant = row.tenant_id ? tenantIdMap.get(row.tenant_id) : null;
    if (row.tenant_id && !mappedTenant) continue;
    const { id: _id, created_at: _ca, ...patch } = stripKeys(row, AI_SECRET_STRIP);
    const payload = remapEnvIds({ ...patch, tenant_id: mappedTenant }, tenantIdMap, new Map());
    if (dryRun) {
      updated++;
      continue;
    }
    let q = stage.from("ai_runtime_config").select("id").eq("environment", row.environment);
    q = mappedTenant ? q.eq("tenant_id", mappedTenant) : q.is("tenant_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      const { error } = await stage.from("ai_runtime_config").update(payload).eq("id", existing.id);
      if (error) throw new Error(`ai_runtime_config update: ${error.message}`);
    } else {
      const { error } = await stage.from("ai_runtime_config").insert(payload);
      if (error) throw new Error(`ai_runtime_config insert: ${error.message}`);
    }
    updated++;
  }
  report.ai_runtime_config = { prod_rows: rows.length, updated };
}

async function syncAiModelCatalog(prod, stage, tenantIdMap, report) {
  let rows;
  try {
    rows = await fetchAll(prod, "ai_model_catalog");
  } catch (e) {
    report.ai_model_catalog = { skipped: e.message };
    return;
  }
  let updated = 0;
  for (const row of rows) {
    const mappedTenant = row.tenant_id ? tenantIdMap.get(row.tenant_id) : null;
    if (row.tenant_id && !mappedTenant) continue;
    const { id: _id, created_at: _ca, ...patch } = row;
    const payload = remapEnvIds({ ...patch, tenant_id: mappedTenant }, tenantIdMap, new Map());
    if (dryRun) {
      updated++;
      continue;
    }
    let q = stage
      .from("ai_model_catalog")
      .select("id")
      .eq("environment", row.environment)
      .eq("model_id", row.model_id);
    q = mappedTenant ? q.eq("tenant_id", mappedTenant) : q.is("tenant_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      const { error } = await stage.from("ai_model_catalog").update(payload).eq("id", existing.id);
      if (error) throw new Error(`ai_model_catalog update: ${error.message}`);
    } else {
      const { error } = await stage.from("ai_model_catalog").insert(payload);
      if (error) throw new Error(`ai_model_catalog insert: ${error.message}`);
    }
    updated++;
  }
  report.ai_model_catalog = { prod_rows: rows.length, updated };
}

async function syncPreferenceOptions(prod, stage, tenantIdMap, regionIdMap, report) {
  const rows = await fetchAll(prod, "preference_options");
  let updated = 0;
  let inserted = 0;
  for (const row of rows) {
    const hasTenantCol = Object.prototype.hasOwnProperty.call(row, "tenant_id");
    const mappedTenant = hasTenantCol && row.tenant_id ? tenantIdMap.get(row.tenant_id) : null;
    if (hasTenantCol && row.tenant_id && !mappedTenant) continue;
    const { id: _id, created_at: _ca, ...patch } = row;
    const payload = remapEnvIds(
      hasTenantCol ? { ...patch, tenant_id: mappedTenant } : patch,
      tenantIdMap,
      regionIdMap,
    );
    if (dryRun) {
      updated++;
      continue;
    }
    let q = stage
      .from("preference_options")
      .select("id")
      .eq("type", row.type)
      .eq("code", row.code);
    if (hasTenantCol) {
      q = mappedTenant ? q.eq("tenant_id", mappedTenant) : q.is("tenant_id", null);
    }
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      const { error } = await stage.from("preference_options").update(payload).eq("id", existing.id);
      if (error) throw new Error(`preference_options update: ${error.message}`);
      updated++;
    } else {
      const { error } = await stage.from("preference_options").insert(payload);
      if (error) throw new Error(`preference_options insert: ${error.message}`);
      inserted++;
    }
  }
  report.preference_options = { prod_rows: rows.length, updated, inserted };
}

async function syncRegionPaymentGateways(prod, stage, regionIdMap, report) {
  const rows = await fetchAll(prod, "region_payment_gateways");
  let updated = 0;
  let inserted = 0;
  for (const row of rows) {
    const mappedRegion = regionIdMap.get(row.region_id);
    if (!mappedRegion) continue;
    const { id: _id, created_at: _ca, ...patch } = row;
    const payload = remapEnvIds({ ...patch, region_id: mappedRegion }, new Map(), regionIdMap);
    if (dryRun) {
      updated++;
      continue;
    }
    const { data: existing } = await stage
      .from("region_payment_gateways")
      .select("id")
      .eq("region_id", mappedRegion)
      .eq("gateway", row.gateway)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await stage
        .from("region_payment_gateways")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(`region_payment_gateways update: ${error.message}`);
      updated++;
    } else {
      const { error } = await stage.from("region_payment_gateways").insert(payload);
      if (error) throw new Error(`region_payment_gateways insert: ${error.message}`);
      inserted++;
    }
  }
  report.region_payment_gateways = { prod_rows: rows.length, updated, inserted };
}

async function syncFeatureFlags(prod, stage, tenantIdMap, report) {
  const rows = await fetchAll(prod, "feature_flags");
  let updated = 0;
  let inserted = 0;
  for (const row of rows) {
    const mappedTenant = row.tenant_id ? tenantIdMap.get(row.tenant_id) : null;
    if (row.tenant_id && !mappedTenant) continue;
    const { id: _id, created_at: _ca, ...patch } = row;
    const payload = remapEnvIds(
      { ...patch, tenant_id: mappedTenant },
      tenantIdMap,
      new Map(),
    );
    if (dryRun) {
      updated++;
      continue;
    }
    let q = stage.from("feature_flags").select("id");
    q = mappedTenant ? q.eq("tenant_id", mappedTenant) : q.is("tenant_id", null);
    q = q.eq("feature_key", row.feature_key);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      const { error } = await stage.from("feature_flags").update(payload).eq("id", existing.id);
      if (error) throw new Error(`feature_flags update ${row.feature_key}: ${error.message}`);
      updated++;
    } else {
      const { error } = await stage.from("feature_flags").insert(payload);
      if (error) throw new Error(`feature_flags insert ${row.feature_key}: ${error.message}`);
      inserted++;
    }
  }
  report.feature_flags = { prod_rows: rows.length, updated, inserted };
}

async function syncPlatformSettings(prod, stage, tenantIdMap, report) {
  const rows = await fetchAll(prod, "platform_settings");
  let updated = 0;
  let inserted = 0;
  for (const row of rows) {
    const mappedTenant = row.tenant_id ? tenantIdMap.get(row.tenant_id) : null;
    if (row.tenant_id && !mappedTenant) continue;
    const { id: _id, created_at: _ca, ...patch } = row;
    const payload = { ...patch, tenant_id: mappedTenant };
    if (dryRun) {
      updated++;
      continue;
    }
    let q = stage.from("platform_settings").select("id");
    q = mappedTenant ? q.eq("tenant_id", mappedTenant) : q.is("tenant_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      const { error } = await stage.from("platform_settings").update(payload).eq("id", existing.id);
      if (error) throw new Error(`platform_settings update: ${error.message}`);
      updated++;
    } else {
      const { error } = await stage.from("platform_settings").insert(payload);
      if (error) throw new Error(`platform_settings insert: ${error.message}`);
      inserted++;
    }
  }
  report.platform_settings = { prod_rows: rows.length, updated, inserted };
}

async function syncTenantScopedTable(prod, stage, table, onConflict, idMap, report) {
  const rows = await fetchAll(prod, table);
  const remapped = rows
    .map((row) => {
      const mappedId = idMap.get(row.tenant_id);
      if (!mappedId) return null;
      return { ...row, tenant_id: mappedId };
    })
    .filter(Boolean);
  report[table] = { prod_rows: rows.length, staging_upsert: remapped.length };
  if (!dryRun && remapped.length) {
    await upsertRows(stage, table, onConflict, remapped);
  }
}

async function syncTable(prod, stage, cfg, report, tenantIdMap, regionIdMap) {
  const { table, onConflict, optional } = cfg;
  let rows;
  try {
    rows = await fetchAll(prod, table);
  } catch (e) {
    if (optional) {
      report[table] = { skipped: e.message };
      return;
    }
    throw e;
  }
  const remapped = rows.map((r) => remapEnvIds(r, tenantIdMap, regionIdMap));
  report[table] = { prod_rows: rows.length };
  if (!dryRun && remapped.length) {
    await upsertRows(stage, table, onConflict, remapped);
  }
}

async function main() {
  console.log(`=== Staging config sync from production (${dryRun ? "DRY RUN" : "APPLY"}) ===\n`);
  const prod = client(PROJECTS.production.ref, PROJECTS.production.url);
  const stage = client(PROJECTS.staging.ref, PROJECTS.staging.url);
  const report = { dryRun };
  const { idMap: tenantIdMap } = await buildTenantIdMap(prod, stage);
  const regionIdMap = await buildRegionIdMap(prod, stage);

  await syncTenantsBySlug(prod, stage, report);
  await syncRegionsByCode(prod, stage, report);
  await syncTenantScopedTable(prod, stage, "tenant_settings", "tenant_id", tenantIdMap, report);
  await syncPlatformSettings(prod, stage, tenantIdMap, report);
  await syncFeatureFlags(prod, stage, tenantIdMap, report);
  await syncKeyedTenantRows(
    prod,
    stage,
    "notification_templates",
    "key",
    tenantIdMap,
    regionIdMap,
    report,
  );
  await syncKeyedTenantRows(
    prod,
    stage,
    "global_service_categories",
    "slug",
    tenantIdMap,
    regionIdMap,
    report,
  );
  await syncKeyedTenantRows(
    prod,
    stage,
    "subscription_plans",
    "slug",
    tenantIdMap,
    regionIdMap,
    report,
  );
  await syncKeyedTenantRows(
    prod,
    stage,
    "pricing_plans",
    "slug",
    tenantIdMap,
    regionIdMap,
    report,
  );
  await syncRegionPaymentGateways(prod, stage, regionIdMap, report);
  await syncPreferenceOptions(prod, stage, tenantIdMap, regionIdMap, report);
  await syncAiRuntimeConfig(prod, stage, tenantIdMap, report);
  await syncAiModelCatalog(prod, stage, tenantIdMap, report);

  for (const cfg of CONFIG_TABLES) {
    await syncTable(prod, stage, cfg, report, tenantIdMap, regionIdMap);
  }

  await syncTenantDomains(prod, stage, tenantIdMap, report);
  await syncPlatformSecrets(prod, stage, tenantIdMap, PLATFORM_SECRET_STRIP, report);

  const tenantSecretRows = await fetchAll(prod, "tenant_secrets").catch(() => []);
  const remappedSecrets = tenantSecretRows
    .map((row) => {
      const mappedId = tenantIdMap.get(row.tenant_id);
      if (!mappedId) return null;
      return stripKeys({ ...row, tenant_id: mappedId }, SECRET_COLUMN_STRIP);
    })
    .filter(Boolean);
  report.tenant_secrets = {
    prod_rows: tenantSecretRows.length,
    staging_upsert: remappedSecrets.length,
  };
  if (!dryRun && remappedSecrets.length) {
    await upsertRows(stage, "tenant_secrets", "tenant_id", remappedSecrets);
  }
  await syncRegionSecrets(prod, stage, report, regionIdMap);

  console.log(JSON.stringify(report, null, 2));
  if (dryRun) {
    console.log("\nRe-run with --apply to write to staging.");
    console.log("Then: pnpm sync:paystack:staging  and  node scripts/e2e/seed-staging.mjs");
  } else {
    console.log("\nDone. Run pnpm sync:paystack:staging and E2E seeds against staging.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

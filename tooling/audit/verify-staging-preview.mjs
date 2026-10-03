#!/usr/bin/env node
/**
 * Staging Preview end-to-end gate: staging DB tenant map + optional live Vercel probe.
 *
 * Usage:
 *   node tooling/audit/verify-staging-preview.mjs
 *   VERCEL_AUTOMATION_BYPASS_SECRET=... node tooling/audit/verify-staging-preview.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { PROJECTS, serviceRoleKey } from "./supabase-env.mjs";

const STAGING_HOSTS = ["staging.beautonomi.com", "staging.beautonomi.co.za", "staging-uk.beautonomi.com"];
const PREVIEW_BASE = process.env.STAGING_PREVIEW_BASE ?? "https://staging.beautonomi.com";

let failures = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures += 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

async function checkStagingDb() {
  const key = serviceRoleKey(PROJECTS.staging.ref);
  const supabase = createClient(PROJECTS.staging.url, key, { auth: { persistSession: false } });

  const { data: za, error: zaErr } = await supabase
    .from("tenants")
    .select("id, slug, is_active")
    .eq("slug", "za")
    .maybeSingle();
  if (zaErr || !za?.is_active) {
    fail(`staging tenants.za missing or inactive (${zaErr?.message ?? "no row"})`);
    return null;
  }
  ok(`staging za tenant ${za.id.slice(0, 8)}… active`);

  const { data: domains, error: dErr } = await supabase
    .from("tenant_domains")
    .select("hostname, environment, is_active, tenant_id")
    .in("hostname", STAGING_HOSTS)
    .eq("environment", "preview");
  if (dErr) {
    fail(`tenant_domains query: ${dErr.message}`);
    return za.id;
  }
  for (const host of STAGING_HOSTS) {
    const row = (domains ?? []).find((d) => d.hostname === host && d.is_active);
    if (!row) fail(`missing tenant_domains preview row for ${host}`);
    else if (host.startsWith("staging.") && row.tenant_id !== za.id) {
      fail(`${host} not mapped to za tenant`);
    } else ok(`${host} → preview → tenant ${row.tenant_id.slice(0, 8)}…`);
  }

  const { count, error: pErr } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", za.id);
  if (pErr) fail(`providers count: ${pErr.message}`);
  else if ((count ?? 0) === 0) fail("no providers on staging za tenant (run staging:db:e2e or seed)");
  else ok(`staging providers for za: ${count}`);

  return za.id;
}

async function checkLivePreview() {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) {
    console.log("\nSKIP live Preview probe (set VERCEL_AUTOMATION_BYPASS_SECRET to test through Vercel SSO wall).");
    return;
  }

  const headers = {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  };

  for (const path of ["/api/health", "/api/public/home"]) {
    const res = await fetch(`${PREVIEW_BASE.replace(/\/$/, "")}${path}`, { headers });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (res.status !== 200) {
      fail(`${path} → HTTP ${res.status} (Vercel protection or deploy error)`);
      console.error(`  body: ${text.slice(0, 160)}`);
      continue;
    }
    if (path.endsWith("/home") && json?.error?.code === "TENANT_UNAVAILABLE") {
      fail("/api/public/home → Tenant not configured (Preview Vercel env)");
      console.error(`
  Fix Preview env on Vercel (see docs/STAGING_VERCEL_PREVIEW_ENV.md):
    NEXT_PUBLIC_SUPABASE_URL=https://byfzhyqvtbasxptxdupf.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon>
    SUPABASE_SERVICE_ROLE_KEY=<staging service_role>  (required for tenant resolution)
    TENANT_DOMAIN_ENV=preview
    TENANT_DOMAIN_FALLBACK_TO_PRODUCTION=false
    STRICT_TENANT_HOST_RESOLUTION=true only if the above are set; else use false on Preview
  Then redeploy Preview.`);
      continue;
    }
    ok(`${path} → 200`);
  }
}

console.log("=== Staging Preview verify ===\n");
await checkStagingDb();
console.log("");
await checkLivePreview();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nStaging Preview verify passed.");

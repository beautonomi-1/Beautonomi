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
const requireLive = process.argv.includes("--require-live");

let failures = 0;
let liveProbeIncomplete = false;

function jwtProjectRef(apiKey) {
  try {
    const segment = apiKey.split(".")[1];
    if (!segment) return null;
    const json = Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json);
    return payload.ref ?? payload.project_ref ?? null;
  } catch {
    return null;
  }
}

function printVercelPreviewEnvChecklist() {
  console.log(`
  Vercel Preview must match staging Supabase (docs/STAGING_VERCEL_PREVIEW_ENV.md):
    NEXT_PUBLIC_SUPABASE_URL=${PROJECTS.staging.url}
    NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon JWT ref ${PROJECTS.staging.ref}>
    SUPABASE_SERVICE_ROLE_KEY=<staging service_role JWT ref ${PROJECTS.staging.ref}>
    TENANT_DOMAIN_ENV=preview
    TENANT_DOMAIN_FALLBACK_TO_PRODUCTION=false
    STRICT_TENANT_HOST_RESOLUTION=true (only when service role is set)
  After changes: redeploy the Preview deployment for staging.beautonomi.com.`);
}

function validateLocalSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url && !service && !anon) return;

  console.log("\n--- Local shell env (informational; does not affect Vercel) ---");
  if (url) {
    const urlOk = url.replace(/\/$/, "") === PROJECTS.staging.url;
    console.log(urlOk ? "OK" : "WARN", `NEXT_PUBLIC_SUPABASE_URL ${urlOk ? "is staging" : `expected ${PROJECTS.staging.url}, got ${url}`}`);
  }
  for (const [label, key] of [
    ["SUPABASE_SERVICE_ROLE_KEY", service],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anon],
  ]) {
    if (!key) continue;
    const ref = jwtProjectRef(key);
    const okRef = ref === PROJECTS.staging.ref;
    console.log(
      okRef ? "OK" : "WARN",
      `${label} JWT ref=${ref ?? "?"} (want ${PROJECTS.staging.ref}) — unset or fix in PowerShell if confusing local runs`,
    );
  }
}

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

const MAX_REDIRECTS = 8;

function isVercelSsoRedirect(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (!hostname.endsWith("vercel.com")) return false;
    return pathname.includes("sso") || pathname.startsWith("/login");
  } catch {
    return false;
  }
}

/** Manual redirects only on same host; never chase Vercel SSO (causes loops with bad bypass). */
async function fetchPreview(url, headers = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let res;
    try {
      res = await fetch(current, { headers, redirect: "manual" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("redirect count exceeded")) {
        return { res: null, text: "", json: null, error: "redirect_loop" };
      }
      throw err;
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { res, text: await res.text(), json: null, error: "redirect_no_location" };
      }
      const next = new URL(location, current).href;
      if (isVercelSsoRedirect(next)) {
        return { res, text: "", json: null, error: "sso_wall" };
      }
      if (hop === MAX_REDIRECTS) {
        return { res, text: await res.text(), json: null, error: "redirect_limit" };
      }
      current = next;
      continue;
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* HTML / SSO page */
    }
    return { res, text, json, error: null };
  }
  return { res: null, text: "", json: null, error: "redirect_limit" };
}

function bypassHeaders(secret) {
  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  };
}

function bypassProbeFailed(result) {
  if (!result.res && result.error) return true;
  if (result.error === "sso_wall" || result.error === "redirect_loop" || result.error === "redirect_limit") {
    return true;
  }
  if (result.res && (result.res.status === 302 || result.res.status === 401)) return true;
  return false;
}

async function probePreviewPath(path, { secret, allowBypassFallback = true } = {}) {
  const url = `${PREVIEW_BASE.replace(/\/$/, "")}${path}`;
  const trimmed = secret?.trim();
  if (trimmed) {
    const withBypass = await fetchPreview(url, bypassHeaders(trimmed));
    if (!bypassProbeFailed(withBypass)) {
      return { ...withBypass, mode: "bypass" };
    }
    if (allowBypassFallback) {
      console.log(
        `NOTE: bypass probe failed for ${path} (${withBypass.error ?? `HTTP ${withBypass.res?.status}`}); retrying without bypass headers.`,
      );
      console.log(
        "  If this repeats, unset VERCEL_AUTOMATION_BYPASS_SECRET or rotate the secret in Vercel → Deployment Protection.",
      );
    }
  }
  const plain = await fetchPreview(url, {});
  return { ...plain, mode: "plain" };
}

function evaluateLiveProbe(path, result) {
  if (result.error === "sso_wall") {
    liveProbeIncomplete = true;
    console.log(`\nINCOMPLETE: ${path} blocked by Vercel Deployment Protection (SSO redirect).`);
    return;
  }
  if (result.error === "redirect_loop" || result.error === "redirect_limit") {
    liveProbeIncomplete = true;
    console.log(`\nINCOMPLETE: ${path} hit too many redirects (${result.error}).`);
    return;
  }
  if (!result.res) {
    liveProbeIncomplete = true;
    console.log(`\nINCOMPLETE: ${path} — no HTTP response.`);
    return;
  }
  if (result.res.status !== 200) {
    if (result.res.status === 302 || result.res.status === 401) {
      liveProbeIncomplete = true;
      console.log(`\nINCOMPLETE: ${path} → HTTP ${result.res.status} (Deployment Protection).`);
      return;
    }
    fail(`${path} → HTTP ${result.res.status}`);
    console.error(`  body: ${result.text.slice(0, 160)}`);
    return;
  }
  if (path.endsWith("/home") && result.json?.error?.code === "TENANT_UNAVAILABLE") {
    fail("/api/public/home → Tenant not configured (Preview Vercel env)");
    printVercelPreviewEnvChecklist();
    return;
  }
  const via = result.mode === "bypass" ? "via bypass" : "direct";
  ok(`${path} → 200 (${via})`);
}

async function checkLivePreview() {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  for (const path of ["/api/health", "/api/public/home"]) {
    const result = await probePreviewPath(path, { secret });
    evaluateLiveProbe(path, result);
  }
}

console.log("=== Staging Preview verify ===\n");
await checkStagingDb();
console.log("");
validateLocalSupabaseEnv();
await checkLivePreview();

if (liveProbeIncomplete) {
  console.log("\n--- Diagnosis ---");
  console.log("Staging Supabase tenant map and providers look correct from this machine.");
  console.log(
    "If the browser still shows Tenant not configured while logged into Vercel, the Preview deployment env is wrong — not the DB.",
  );
  printVercelPreviewEnvChecklist();
  console.log(
    "  In browser (Vercel SSO): https://staging.beautonomi.com/api/public/staging-deploy-meta",
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
if (liveProbeIncomplete && requireLive) {
  console.error("\nLive Preview probe required (--require-live) but bypass secret was not set or probe was blocked.");
  process.exit(1);
}
if (liveProbeIncomplete) {
  console.log("\nStaging Preview verify passed (DB only — live Preview not verified).");
} else {
  console.log("\nStaging Preview verify passed.");
}

#!/usr/bin/env node
/**
 * Smoke-check staging multi-tenant E2E hosts (requires VERCEL_AUTOMATION_BYPASS_SECRET).
 *
 * Usage:
 *   VERCEL_AUTOMATION_BYPASS_SECRET=... node tooling/audit/verify-staging-e2e-hosts.mjs
 */
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
if (!secret) {
  console.error("VERCEL_AUTOMATION_BYPASS_SECRET is required.");
  process.exit(2);
}

const A_BASE = (process.env.E2E_TENANT_A_BASE ?? "https://staging.beautonomi.com").replace(/\/$/, "");
const B_BASE = (process.env.E2E_TENANT_B_BASE ?? "https://staging-uk.beautonomi.com").replace(/\/$/, "");
const PROVIDER = process.env.E2E_TENANT_A_PROVIDER ?? "e2e-test-provider-beautonomi";

const headers = {
  "x-vercel-protection-bypass": secret,
  "x-vercel-set-bypass-cookie": "true",
};

async function get(path, base) {
  const res = await fetch(`${base}${path}`, { headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML challenge page */
  }
  return { status: res.status, json, text: text.slice(0, 120) };
}

let fail = 0;

for (const [label, base] of [
  ["A (ZA)", A_BASE],
  ["B (UK)", B_BASE],
]) {
  const health = await get("/api/health", base);
  console.log(`${label} health ${base} → ${health.status}`);
  if (health.status !== 200) {
    fail++;
    console.error(`  body: ${health.text}`);
  }
}

const [bundleA, bundleB] = await Promise.all([
  get("/api/public/config-bundle?platform=web&environment=production", A_BASE),
  get("/api/public/config-bundle?platform=web&environment=production", B_BASE),
]);
const tenantA = bundleA.json?.meta?.tenant_id ?? bundleA.json?.meta?.tenant?.id;
const tenantB = bundleB.json?.meta?.tenant_id ?? bundleB.json?.meta?.tenant?.id;
console.log(`tenant A ${tenantA}`);
console.log(`tenant B ${tenantB}`);
if (!tenantA || !tenantB || tenantA === tenantB) {
  console.error("FAIL: tenants must resolve and differ");
  fail++;
}

const path = `/api/public/providers/${encodeURIComponent(PROVIDER)}`;
const provA = await get(path, A_BASE);
const provB = await get(path, B_BASE);
console.log(`provider on A → ${provA.status}`);
console.log(`provider on B → ${provB.status}`);
if (provA.status !== 200) fail++;
if (provB.status === 200) {
  const slug = provB.json?.data?.slug ?? provB.json?.data?.id;
  if (slug) {
    console.error("FAIL: provider leaked on B host");
    fail++;
  }
} else if (![404, 403].includes(provB.status)) {
  console.error(`FAIL: unexpected B status ${provB.status}`);
  fail++;
}

if (fail) process.exit(1);
console.log("Staging E2E host smoke OK.");

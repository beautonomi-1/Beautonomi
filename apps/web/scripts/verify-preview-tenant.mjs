#!/usr/bin/env node
/**
 * Staging release gate helper — verifies preview tenant + public home.
 * Usage: node apps/web/scripts/verify-preview-tenant.mjs https://your-preview.vercel.app
 */

const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base.startsWith("http")) {
  console.error("Usage: node verify-preview-tenant.mjs <preview-origin>");
  process.exit(2);
}

async function main() {
  const metaUrl = `${base}/api/staging-deploy-meta`;
  const homeUrl = `${base}/api/public/home`;

  const metaRes = await fetch(metaUrl);
  const metaText = await metaRes.text();
  let metaJson;
  try {
    metaJson = JSON.parse(metaText);
  } catch {
    console.error("staging-deploy-meta: invalid JSON", metaRes.status);
    process.exit(1);
  }

  const tenantOk =
    metaJson?.tenant_resolution === "ok" ||
    metaJson?.data?.tenant_resolution === "ok";
  if (!tenantOk) {
    console.error("staging-deploy-meta: tenant_resolution not ok", metaJson);
    process.exit(1);
  }

  const homeRes = await fetch(homeUrl);
  if (homeRes.status !== 200) {
    console.error("public/home:", homeRes.status);
    process.exit(1);
  }

  console.log("OK:", { tenant_resolution: "ok", public_home: 200 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

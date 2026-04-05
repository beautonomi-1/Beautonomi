/**
 * Optional CI: warn if route.ts touches tenant tables without resolveAdminApiTenantId or @admin-global.
 * Exit 0 always (non-blocking).
 * Run: node docs/scripts/check-admin-tenant-scope.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADMIN = join(ROOT, "apps/web/src/app/api/admin");

function walkRouteTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkRouteTs(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const SENSITIVE =
  /\.from\(\s*['"](bookings|providers|payment_transactions|finance_transactions|payouts|wallet_topups|wallet_transactions|gift_cards|gift_card_orders|gift_card_redemptions|membership_orders|provider_subscription_orders|ads_budget_orders|user_reports|user_verifications|promotions|payment_fee_adjustments|booking_refunds|feature_flags|product_orders|tenant_domains|tenants)['"]/;
let bad = 0;
for (const abs of walkRouteTs(ADMIN)) {
  const src = readFileSync(abs, "utf8");
  if (!SENSITIVE.test(src)) continue;
  if (src.includes("resolveAdminApiTenantId") || src.includes("@admin-global")) continue;
  console.warn("[admin-tenant-scope]", relative(ROOT, abs));
  bad++;
}
console.log(bad ? `Found ${bad} files to review.` : "All sensitive admin routes tagged or scoped.");
process.exit(0);

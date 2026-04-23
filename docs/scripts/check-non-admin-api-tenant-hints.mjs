/**
 * Optional CI: flag apps/web API routes (excluding /api/admin) that use getSupabaseAdmin
 * and touch tenant-scoped tables without obvious tenant-resolution hints in source.
 * Heuristic. Default: exit 0 (warnings only). Set `TENANT_API_HINTS_STRICT=1` to exit 1 when any
 * route is flagged. Set `ALLOW_TENANT_AUDIT_WARNINGS=1` to force exit 0 even in strict mode (e.g. temporary bypass).
 * Recognizes: Host tenant resolution, portal/cron/webhook guards,
 * provider_id / user_id scoping, purchaser_user_id, booking customer checks, and @tenant-hint in a comment
 * for narrow service-role follow-ups after an RLS-scoped read.
 *
 * Run: node docs/scripts/check-non-admin-api-tenant-hints.mjs
 * Strict: node docs/scripts/run-tenant-api-hints-strict.mjs  (or TENANT_API_HINTS_STRICT=1)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const API = join(ROOT, "apps/web/src/app/api");

const SENSITIVE =
  /\.from\(\s*['"](bookings|providers|payment_transactions|finance_transactions|payouts|wallet_topups|wallet_transactions|gift_cards|gift_card_orders|gift_card_redemptions|membership_orders|user_reports|user_verifications|promotions|booking_refunds|product_orders|booking_payments)['"]/;

// Patterns that usually mean the route scopes data (market, provider, or user), not a blind cross-tenant read.
const TENANT_HINTS =
  /resolveTenantIdWithZaFallback|resolveTenantFromRequest|resolveAdminApiTenantId|@tenant-global|@admin-global|tenant_id|booking\.tenant_id|bookings\.tenant_id|providers\.tenant_id|eq\(['"]tenant_id['"]|\.eq\(['"]tenant_id['"]|requirePublicTenant|validatePortalToken|verifyCronRequest|getProviderIdForUser|userHasProviderAccessAdmin|verifyPaystackWebhook|fetchBookingInAdminTenant|\.eq\(\s*['"]provider_id['"]|\.eq\(\s*['"]user_id['"],\s*user\.id\)|\.eq\(\s*['"]purchaser_user_id['"]|booking\.customer_id\s*!==|customer_id\s*!==\s*user|@tenant-hint/;

function walkRouteTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "admin") continue;
      walkRouteTs(p, out);
    } else if (name === "route.ts") {
      out.push(p);
    }
  }
  return out;
}

let bad = 0;
for (const abs of walkRouteTs(API)) {
  const src = readFileSync(abs, "utf8");
  if (!src.includes("getSupabaseAdmin")) continue;
  if (!SENSITIVE.test(src)) continue;
  if (TENANT_HINTS.test(src)) continue;
  console.warn("[non-admin-tenant-hint]", relative(ROOT, abs));
  bad++;
}
console.log(
  bad
    ? `Found ${bad} non-admin route files to review (heuristic; expect false positives).`
    : "No non-admin routes flagged by heuristic (or none use getSupabaseAdmin + sensitive tables without hints).",
);

const strict =
  process.env.TENANT_API_HINTS_STRICT === "1" || process.env.TENANT_API_HINTS_STRICT === "true";
const allowWarn =
  process.env.ALLOW_TENANT_AUDIT_WARNINGS === "1" ||
  process.env.ALLOW_TENANT_AUDIT_WARNINGS === "true";

if (bad > 0 && strict && !allowWarn) {
  console.error(
    "[non-admin-tenant-hint] Strict mode: fix routes or add @tenant-hint / tenant scoping; set ALLOW_TENANT_AUDIT_WARNINGS=1 to bypass temporarily.",
  );
  process.exit(1);
}
process.exit(0);

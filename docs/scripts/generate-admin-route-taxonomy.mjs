/**
 * Heuristic T/U/G classification for admin route.ts files under api/admin.
 * T = tenant commercial data, U = user directory, G = intentionally global.
 * Run: node docs/scripts/generate-admin-route-taxonomy.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const ADMIN_ROOT = join(ROOT, "apps/web/src/app/api/admin");

function walkRouteTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkRouteTs(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const G_PREFIXES = [
  "iso-codes",
  "content/",
  "control-plane/",
  "catalog/global-categories",
  "maintenance",
  "app-version",
  "feature-flags",
  "email-templates",
  "sms-templates",
  "notification-templates",
  "plans",
  "pricing-plans",
  "subscription-plans",
  "platform-zones",
];

const TENANT_TABLE_HINTS =
  /\.from\(\s*['"](bookings|providers|payment_transactions|finance_transactions|bookings_|provider_|payouts|invoices|product_orders|promotions|disputes|reviews|gift_cards|loyalty)/;

const USER_HINTS = /\.from\(\s*['"]users['"]/;

function classify(relPath, src) {
  const apiPath =
    "/api/admin/" +
    relPath
      .replace(/\\/g, "/")
      .replace(/^apps\/web\/src\/app\/api\/admin\//, "")
      .replace(/\/route\.ts$/, "");

  if (src.includes("@admin-global")) return { cls: "G", note: "tagged @admin-global" };

  const seg = apiPath.split("/").filter(Boolean)[0] ?? "";
  if (G_PREFIXES.some((p) => apiPath.startsWith(p.replace(/\/$/, "")) || seg === p.replace(/\/$/, ""))) {
    return { cls: "G", note: "global prefix" };
  }

  const hasTenant = src.includes("resolveAdminApiTenantId");
  const hasBookings = /\.from\(\s*['"]bookings['"]/.test(src);
  const hasProviders = /\.from\(\s*['"]providers['"]/.test(src);
  const hasPay = /\.from\(\s*['"]payment_transactions['"]/.test(src) || /\.from\(\s*['"]finance_transactions['"]/.test(src);

  if (USER_HINTS.test(src) && !hasBookings && !hasProviders && !hasPay && !TENANT_TABLE_HINTS.test(src)) {
    return { cls: "U", note: hasTenant ? "scoped" : "needs tenant review" };
  }

  if (hasBookings || hasProviders || hasPay || TENANT_TABLE_HINTS.test(src)) {
    return { cls: "T", note: hasTenant ? "uses resolveAdminApiTenantId" : "needs explicit tenant filter" };
  }

  return { cls: "T", note: hasTenant ? "uses resolveAdminApiTenantId" : "review: likely tenant-scoped ops" };
}

const files = walkRouteTs(ADMIN_ROOT);
const rows = [['path','class','note']];

for (const abs of files.sort()) {
  const rel = relative(ROOT, abs);
  const src = readFileSync(abs, "utf8");
  const { cls, note } = classify(rel, src);
  const apiPath =
    "/api/admin/" +
    rel
      .replace(/\\/g, "/")
      .replace(/^apps\/web\/src\/app\/api\/admin\//, "")
      .replace(/\/route\.ts$/, "");
  rows.push([apiPath, cls, `"${note.replace(/"/g, '""')}"`]);
}

const csv = rows.map((r) => r.join(",")).join("\n");
const out = join(ROOT, "docs", "admin-api-route-taxonomy.csv");
writeFileSync(out, csv, "utf8");
console.log(`Wrote ${rows.length - 1} rows to ${relative(ROOT, out)}`);

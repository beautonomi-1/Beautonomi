#!/usr/bin/env node
/**
 * Scans apps for t("...") and prefix-helper calls; fails if keys are absent from en.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(__dirname, "../../..");
const en = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/locales/en.json"), "utf8"));

/** Keys built at runtime (namespaces only) — not checked. */
const ALLOWLIST_PREFIX = new Set([
  "provider.mobile.screens.aiStudio.",
  "provider.mobile.screens.billingHistory.",
  "provider.mobile.screens.billing.",
  "provider.mobile.screens.contactSupport.",
  "provider.mobile.screens.customRequests.",
  "provider.mobile.screens.deleteAccount.",
  "provider.mobile.screens.giftCards.",
  "provider.mobile.screens.invoices.",
  "provider.mobile.screens.addLocation.",
  "provider.mobile.screens.payouts.",
  "provider.mobile.screens.productDetail.",
  "provider.mobile.screens.productsEcommerceHub.",
  "provider.mobile.screens.promotions.",
  "provider.mobile.screens.bookingsReport.",
  "provider.mobile.screens.reviews.",
  "provider.mobile.screens.blockedTimeTypes.",
  "provider.mobile.screens.groupAppointments.",
  "provider.mobile.screens.noteTemplates.",
  "provider.mobile.screens.serviceAddons.",
  "provider.mobile.screens.serviceCategories.",
  "provider.mobile.screens.shippingConfig.",
  "provider.mobile.screens.taxConfiguration.",
  "provider.mobile.screens.appointmentDefaults.",
  "provider.mobile.screens.team.",
  "provider.mobile.screens.signup.",
  "provider.mobile.screens.postCompletion.",
  "provider.mobile.screens.advancedPricing.",
  "provider.mobile.screens.pricingOptions.",
  "provider.mobile.screens.clientRetentionReport.",
  "provider.mobile.screens.clientSummaryReport.",
  "provider.mobile.screens.endOfDayReport.",
  "provider.mobile.screens.occupancyReport.",
  "provider.mobile.screens.paymentSummaryReport.",
  "provider.mobile.screens.payoutsReport.",
  "provider.mobile.screens.performanceDashboardReport.",
  "provider.mobile.screens.productSalesReport.",
  "provider.mobile.screens.refundsReport.",
  "provider.mobile.screens.topProductsReport.",
]);

function flat(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flat(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

const enFlat = flat(en);

function keyExists(key) {
  if (!key || key.endsWith(".")) return true;
  if (enFlat.has(key)) return true;
  if (enFlat.has(`${key}_one`) || enFlat.has(`${key}_other`)) return true;
  return false;
}

function isAllowlisted(key) {
  for (const p of ALLOWLIST_PREFIX) {
    if (key === p.replace(/\.$/, "") || key.startsWith(p)) return true;
  }
  return false;
}

const SCAN_ROOTS = [
  path.join(repo, "apps/customer"),
  path.join(repo, "apps/provider"),
  path.join(repo, "apps/web/src"),
  path.join(repo, "apps/admin-web/src"),
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "dist",
  "android",
  "ios",
  ".next",
  ".turbo",
  "test-results",
]);

const litRe = /\bt\(\s*["'`]([a-zA-Z][\w.\-]+)["'`]/g;
const i18nLitRe = /\bi18n\.t\(\s*["'`]([a-zA-Z][\w.\-]+)["'`]/g;
const helperRe =
  /(\w+)\s*=\s*(?:useCallback\(\s*)?\(\s*(\w+)[^)]*\)\s*(?::\s*[\w<>,\s|]+)?\s*=>\s*[\s\S]{0,80}?t\(\s*`([\w.]+)\.\$\{\s*\2\s*\}`/g;

/** @type {Map<string, Set<string>>} */
const missing = new Map();

function record(key, file) {
  if (!key.includes(".")) return;
  if (isAllowlisted(key)) return;
  if (keyExists(key)) return;
  const rel = path.relative(repo, file).replace(/\\/g, "/");
  if (!missing.has(key)) missing.set(key, new Set());
  missing.get(key).add(rel);
}

function scanFile(fp) {
  const src = fs.readFileSync(fp, "utf8");
  let m;
  litRe.lastIndex = 0;
  while ((m = litRe.exec(src))) record(m[1], fp);
  i18nLitRe.lastIndex = 0;
  while ((m = i18nLitRe.exec(src))) record(m[1], fp);

  const helpers = new Map();
  helperRe.lastIndex = 0;
  while ((m = helperRe.exec(src))) {
    helpers.set(m[1], m[3]);
  }
  for (const [fn, prefix] of helpers) {
    const callRe = new RegExp(`\\b${fn}\\(\\s*["'\`]([\\w.]+)["'\`]`, "g");
    while ((m = callRe.exec(src))) {
      const suffix = m[1];
      const key =
        /^(common|auth|booking|checkout|customer|provider|web|agent|errors|payments)\./.test(suffix)
          ? suffix
          : `${prefix}.${suffix}`;
      record(key, fp);
    }
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(fp);
    else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) scanFile(fp);
  }
}

for (const root of SCAN_ROOTS) walk(root);

const sorted = [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log(`missing keys: ${sorted.length}`);
for (const [k, files] of sorted) {
  const sample = [...files].slice(0, 3).join(", ");
  console.log(`${k}\n  ${sample}${files.size > 3 ? ` (+${files.size - 3} more)` : ""}`);
}
process.exitCode = sorted.length > 0 ? 1 : 0;

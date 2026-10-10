#!/usr/bin/env node
/**
 * Audit customer app + customer website i18n (no curated-map exemption).
 *
 * Usage: node scripts/audit-customer-surfaces.mjs [--json]
 */
import { auditCustomerSurfaces, TARGET_LOCALES } from "./_customer-surfaces-scope.mjs";

const jsonOut = process.argv.includes("--json");
const report = auditCustomerSurfaces();

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Customer surfaces scope: ${report.scopeSize} keys`);
  for (const locale of TARGET_LOCALES) {
    const row = report.perLocale[locale];
    console.log(`${locale}: leftover=${row.leftover} missing=${row.missing}`);
  }
  console.log(`Total leftover keys (all locales): ${report.totalLeftover}`);
}

process.exit(report.totalLeftover === 0 ? 0 : 1);

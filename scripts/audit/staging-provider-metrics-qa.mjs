#!/usr/bin/env node
/**
 * Recompute provider recognized revenue from a finance-accuracy report JSON
 * and compare it with the provider revenue semantics used by the dashboard,
 * finance page, payment summary, and payout report.
 *
 * Usage: node scripts/audit/staging-provider-metrics-qa.mjs <report.json>
 */

import { readFileSync } from "node:fs";

function addMoney(left, right) {
  return Math.round((left + right) * 100) / 100;
}

function n(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("Pass the staging finance accuracy JSON.");
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const RPC_FIELDS = [
  ["serviceEarnings", "sql_service_earnings"],
  ["tips", "sql_tips"],
  ["travelFees", "sql_travel"],
  ["cancellationFees", "sql_cancellation"],
  ["refundDeduction", "sql_refund_deduction"],
];

let failed = 0;
for (const summary of report.provider_summaries || []) {
  const rpc = summary.rpc || {};
  const mismatches = RPC_FIELDS.filter(([rpcKey, sqlKey]) => rpc[rpcKey] != null && Math.abs(n(rpc[rpcKey]) - n(summary[sqlKey])) > 0.02);
  const recognizedRevenue = addMoney(
    addMoney(n(summary.sql_service_earnings), n(summary.sql_tips)),
    addMoney(n(summary.sql_travel), n(summary.sql_cancellation)),
  );
  const ok = mismatches.length === 0;
  if (!ok) failed += 1;
  console.log(JSON.stringify({
    provider_id: summary.provider_id,
    service_earnings: n(summary.sql_service_earnings),
    recognized_revenue_without_walk_in: recognizedRevenue,
    mismatches: mismatches.map(([key]) => key),
    verdict: ok ? "PASS" : "FAIL",
  }));
}

process.exit(failed === 0 ? 0 : 1);

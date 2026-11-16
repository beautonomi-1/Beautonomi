#!/usr/bin/env node
/**
 * Read-only staging finance accuracy audit.
 *
 *   node scripts/audit/staging-finance-accuracy.mjs
 *
 * Runs scripts/audit/staging-finance-accuracy.sql against the linked Supabase
 * project (staging) via `supabase db query`. SELECT only. Writes JSON and CSV
 * under scripts/audit/out/. Does not print service-role keys.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sqlTemplatePath = path.join(root, "scripts/audit/staging-finance-accuracy.sql");
const outDir = path.join(root, "scripts/audit/out");
const stagingOrigin = process.env.STAGING_APP_ORIGIN || "https://staging.beautonomi.com";
const projectRef = "byfzhyqvtbasxptxdupf";

const NON_CASH = new Set([
  "promotion_discount",
  "membership_discount",
  "loyalty_redemption",
  "loyalty_discount",
  "wallet_payment",
  "gift_card_payment",
  "gift_card_liability_reduction",
]);
const NON_PROVIDER = new Set([
  "platform_fee",
  "service_fee",
  "tax",
  "payment",
  "promotion_discount",
  "membership_discount",
  "loyalty_redemption",
  "loyalty_discount",
  "wallet_payment",
  "gift_card_payment",
  "gift_card_liability_reduction",
  "membership_sale",
  "additional_charge_payment",
  "cashback",
]);
const SUBSCRIPTION_VAT = new Set(["provider_subscription_payment", "provider_subscription_refund"]);
const TERMINAL_TYPES = ["terminal_sale", "terminal_rental", "terminal_bundle_alloc", "terminal_promotion"];

function roundHalfAwayFromZero(value) {
  if (!Number.isFinite(value)) return 0;
  if (value === 0) return 0;
  const abs = Number(Math.abs(value).toPrecision(15));
  const rounded = Math.round(abs);
  return value < 0 ? -rounded : rounded;
}
function toMinor(amount) {
  return roundHalfAwayFromZero(Number(amount || 0) * 100);
}
function fromMinor(minor) {
  return minor / 100;
}
function addMoney(a, b) {
  return fromMinor(toMinor(a) + toMinor(b));
}
function subMoney(a, b) {
  return fromMinor(toMinor(a) - toMinor(b));
}
function sumMoney(...xs) {
  return fromMinor(xs.reduce((s, x) => s + toMinor(x), 0));
}
function n(v) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function close(a, b) {
  return Math.abs(toMinor(a) - toMinor(b)) <= 0;
}

function sum(rows, types, field) {
  return rows
    .filter((r) => types.includes(r.transaction_type ?? ""))
    .reduce((s, r) => addMoney(s, n(r[field])), 0);
}
function sumFees(rows, types) {
  return sum(rows, types, "fees");
}
function isCashRefund(r) {
  return r.transaction_type === "refund" && (r.refund_component == null || !NON_CASH.has(r.refund_component));
}
function isProviderRefund(r) {
  return r.transaction_type === "refund" && (r.refund_component == null || !NON_PROVIDER.has(r.refund_component));
}
function isSubscriptionVat(r) {
  return r.transaction_type === "tax" && SUBSCRIPTION_VAT.has(r.vat_source);
}
function isProductVat(r) {
  return r.transaction_type === "tax" && (r.product_order_id || r.vat_source === "product_order");
}
function isReversedPayout(r) {
  return r.transaction_type === "payout" && typeof r.reversed_at === "string" && r.reversed_at.length > 0;
}

/** Same formulas as apps/web/src/lib/admin/aggregate-finance-ledger-rows.ts */
function aggregate(rows) {
  const currencies = new Set(rows.map((r) => r.currency).filter(Boolean));
  const currency = currencies.size === 0 ? "ZAR" : currencies.size === 1 ? [...currencies][0] : "MIXED";
  const gatewayFeesServices = sumFees(rows, ["payment", "additional_charge_payment"]);
  const bookingPlatformFees = rows
    .filter((r) => (r.transaction_type === "platform_fee" && r.booking_id) || r.transaction_type === "service_fee")
    .reduce((s, r) => addMoney(s, n(r.amount)), 0);
  const bookingPlatformFeeRefundNet = rows
    .filter(
      (r) =>
        r.transaction_type === "refund" &&
        !r.product_order_id &&
        (r.refund_component === "platform_fee" || r.refund_component === "service_fee"),
    )
    .reduce((s, r) => addMoney(s, n(r.net)), 0);
  const bookingPlatformFeesNet = addMoney(bookingPlatformFees, bookingPlatformFeeRefundNet);
  const gmvByBooking = new Map();
  for (const r of rows) {
    if (!r.booking_id) continue;
    const b = gmvByBooking.get(r.booking_id) || { payment: 0 };
    if (r.transaction_type === "payment") b.payment = addMoney(b.payment, n(r.amount));
    gmvByBooking.set(r.booking_id, b);
  }
  let baseGmv = 0;
  for (const b of gmvByBooking.values()) baseGmv = addMoney(baseGmv, b.payment);
  const unbooked = rows
    .filter((r) => !r.booking_id && r.transaction_type === "payment")
    .reduce((s, r) => addMoney(s, n(r.amount)), 0);
  baseGmv = addMoney(baseGmv, unbooked);
  const bookingTaxes = rows
    .filter((r) => r.transaction_type === "tax" && !isSubscriptionVat(r) && !isProductVat(r))
    .reduce((s, r) => addMoney(s, n(r.amount)), 0);
  const bookingGmv = sumMoney(baseGmv, sum(rows, ["tip"], "amount"), bookingTaxes, sum(rows, ["travel_fee"], "amount"), bookingPlatformFees);
  const additionalChargeGross = addMoney(sum(rows, ["additional_charge_payment"], "amount"), sumFees(rows, ["additional_charge_payment"]));
  const serviceCollectedGross = addMoney(bookingGmv, additionalChargeGross);
  const platformCommissionGross = sum(rows, ["payment", "additional_charge_payment"], "net");
  const platformRefundContra = sum(rows, ["refund"], "commission");
  const platformCommissionNet = addMoney(platformCommissionGross, platformRefundContra);
  const manualAdjustments = sum(rows, ["manual_adjustment"], "net");
  const platformTakeNet = addMoney(subMoney(platformCommissionNet, gatewayFeesServices), manualAdjustments);
  const subscriptionNet = sumMoney(
    sum(rows, ["subscription_recognition"], "net"),
    sum(rows, ["provider_subscription_payment"], "net"),
    sum(rows, ["provider_subscription_refund"], "net"),
  );
  const adsNet = sumMoney(sum(rows, ["ads_recognition"], "net"), sum(rows, ["provider_ads_payment"], "net"), sum(rows, ["provider_ads_refund"], "net"));
  const marketingNet = sumMoney(
    sum(rows, ["marketing_credit_recognition"], "net"),
    sum(rows, ["provider_marketing_credit_topup"], "net"),
    sum(rows, ["provider_marketing_credit_refund"], "net"),
  );
  const serviceFeeRevenue = bookingPlatformFeesNet;
  const giftCardBreakage = sum(rows, ["gift_card_breakage"], "amount");
  const platformRevenueNet = sumMoney(platformTakeNet, subscriptionNet, adsNet, marketingNet, serviceFeeRevenue, giftCardBreakage);
  const livePayouts = rows.filter((r) => r.transaction_type === "payout" && !isReversedPayout(r));
  const gatewayFeesTotal = sumMoney(
    gatewayFeesServices,
    sumFees(rows, TERMINAL_TYPES),
    sumFees(rows, ["provider_subscription_payment"]),
    sumFees(rows, ["provider_ads_payment"]),
    sumFees(rows, ["provider_marketing_credit_topup"]),
    sumFees(rows, ["gift_card_sale", "wallet_topup"]),
    sumFees(rows, ["gateway_fee_adjustment"]),
    sumFees(rows, ["membership_sale"]),
    livePayouts.reduce((s, r) => addMoney(s, n(r.fees)), 0),
    sumFees(rows, ["payout_transfer_fee"]),
  );
  const providerEarnings = sum(rows, ["provider_earnings", "membership_provider_earnings"], "net");
  const providerRefundImpact = rows.filter(isProviderRefund).reduce((s, r) => addMoney(s, n(r.net)), 0);
  const cashRefunds = rows.filter(isCashRefund).reduce((s, r) => addMoney(s, Math.abs(n(r.net))), 0);
  const cancellationFees = sum(rows, ["cancellation_fee"], "net");
  const walkIn = sum(rows, ["walk_in_additional_charge"], "net");
  const travelFees = sum(rows, ["travel_fee"], "amount");
  const tipsNet = sum(rows, ["tip"], "net");
  const providerRecognizedGross = sumMoney(providerEarnings, sum(rows, ["membership_recognition"], "net"), tipsNet, sum(rows, ["travel_fee"], "net"), cancellationFees, walkIn);
  const subscriptionGatewayFees = sumFees(rows, ["provider_subscription_payment"]);
  const adsGatewayFees = sumFees(rows, ["provider_ads_payment"]);
  const marketingGatewayFees = sumFees(rows, ["provider_marketing_credit_topup"]);
  const otherGatewayFees = sumMoney(sumFees(rows, ["gift_card_sale", "wallet_topup"]), sumFees(rows, ["gateway_fee_adjustment"]));
  const payoutTransferFees = sumMoney(livePayouts.reduce((s, r) => addMoney(s, n(r.fees)), 0), sumFees(rows, ["payout_transfer_fee"]));
  const ecommerceFees = addMoney(
    rows.filter((r) => r.transaction_type === "platform_fee" && r.product_order_id).reduce((s, r) => addMoney(s, n(r.amount)), 0),
    rows
      .filter((r) => r.transaction_type === "refund" && r.product_order_id && (r.refund_component === "platform_fee" || r.refund_component === "service_fee"))
      .reduce((s, r) => addMoney(s, n(r.net)), 0),
  );
  const loyalty = sum(rows, ["loyalty_redemption"], "amount");
  return {
    currency,
    service_collected_gross: serviceCollectedGross,
    service_collected_net: subMoney(serviceCollectedGross, gatewayFeesServices),
    platform_revenue_net: platformRevenueNet,
    service_fee_revenue: serviceFeeRevenue,
    platform_fee_revenue: serviceFeeRevenue,
    platform_commission_gross: platformCommissionGross,
    platform_refund_impact: platformRefundContra,
    platform_commission_net: platformCommissionNet,
    platform_take_net: platformTakeNet,
    gateway_fees_services: gatewayFeesServices,
    gateway_fees_total: gatewayFeesTotal,
    subscription_gateway_fees: subscriptionGatewayFees,
    ads_gateway_fees: adsGatewayFees,
    marketing_credit_gateway_fees: marketingGatewayFees,
    other_gateway_fees: otherGatewayFees,
    membership_gateway_fees: sumFees(rows, ["membership_sale"]),
    payout_transfer_fees: payoutTransferFees,
    terminal_gateway_fees: sumFees(rows, TERMINAL_TYPES),
    terminal_revenue_gross: sum(rows, TERMINAL_TYPES, "amount"),
    provider_earnings_net: providerEarnings,
    provider_recognized_revenue_gross: providerRecognizedGross,
    provider_refund_net_impact: providerRefundImpact,
    refunds_gross: cashRefunds,
    refunds_abs_gross: cashRefunds,
    tips_gross: sum(rows, ["tip"], "amount"),
    taxes_gross: bookingTaxes,
    subscription_vat: rows.filter(isSubscriptionVat).reduce((s, r) => addMoney(s, n(r.amount)), 0),
    wallet_topup_ledger: sum(rows, ["wallet_topup"], "amount"),
    gift_card_sales: sum(rows, ["gift_card_sale"], "amount"),
    gift_card_breakage: giftCardBreakage,
    gift_card_liability_reductions: sum(rows, ["gift_card_liability_reduction"], "amount"),
    membership_sales: sum(rows, ["membership_sale"], "amount"),
    payouts_paid_total: livePayouts.reduce((s, r) => addMoney(s, n(r.net)), 0),
    subscription_net: subscriptionNet,
    subscription_gross: addMoney(subscriptionNet, subscriptionGatewayFees),
    ads_net: adsNet,
    ads_gross: addMoney(adsNet, adsGatewayFees),
    marketing_credit_net: marketingNet,
    marketing_credit_gross: addMoney(marketingNet, marketingGatewayFees),
    cancellation_fees_retained: cancellationFees,
    travel_fees: travelFees,
    walk_in_additional_charges: walkIn,
    ecommerce_platform_fees: ecommerceFees,
    additional_charge_gross: additionalChargeGross,
    manual_adjustments_net: manualAdjustments,
    promotion_discounts: sum(rows, ["promotion_discount"], "amount"),
    membership_discounts: sum(rows, ["membership_discount"], "amount"),
    loyalty_redemptions: loyalty,
    loyalty_discounts: loyalty,
    row_count: rows.length,
  };
}

function parseCliJson(stdout) {
  const text = String(stdout);
  const obj = text.indexOf("{");
  const arr = text.indexOf("[");
  const start = obj < 0 ? arr : arr < 0 ? obj : Math.min(obj, arr);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("supabase CLI did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function runQuery(sqlPath) {
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-o", "json", "-f", sqlPath],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "query failed").slice(0, 4000);
    throw new Error(detail);
  }
  const parsed = parseCliJson(result.stdout || "");
  const report = parsed.rows?.[0]?.report;
  if (!report) throw new Error("query returned no report row");
  return typeof report === "string" ? JSON.parse(report) : report;
}

async function probeApis() {
  const paths = [
    "/api/admin/finance/summary",
    "/api/admin/dashboard",
    "/api/admin/reports/revenue",
    "/api/admin/analytics",
    "/api/admin/gods-eye",
    "/api/admin/finance/integrity-report",
    "/api/admin/finance/ledger-health",
    "/api/admin/finance/trial-balance",
    "/api/admin/finance/refund-anomalies",
    "/api/admin/finance/wallet-reconciliation",
    "/api/provider/finance",
    "/api/provider/reports/revenue",
    "/api/me/bookings",
  ];
  const probes = [];
  for (const p of paths) {
    try {
      const res = await fetch(stagingOrigin + p, { redirect: "manual" });
      probes.push({ path: p, status: res.status });
    } catch (error) {
      probes.push({ path: p, status: null, error: error instanceof Error ? error.message : "fetch failed" });
    }
  }
  return probes;
}

function runNamedLedgerAudit() {
  let key = "";
  try {
    const raw = spawnSync("supabase", ["projects", "api-keys", "--project-ref", projectRef, "-o", "json"], {
      cwd: root,
      encoding: "utf8",
    });
    if (raw.status !== 0) return { status: "blocked", detail: "could not read staging API keys" };
    const keys = parseCliJson(raw.stdout || "");
    const list = Array.isArray(keys) ? keys : keys.rows || keys.keys || keys.items || [];
    const row = list.find((k) => k.id === "service_role" || k.name === "service_role");
    key = row?.api_key || row?.apiKey || "";
  } catch (error) {
    return {
      status: "blocked",
      detail: error instanceof Error ? error.message : "could not read staging API keys",
    };
  }
  if (!key) return { status: "blocked", detail: "service_role key missing" };
  const result = spawnSync("node", ["scripts/prod/audit-finance-ledger.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: key,
    },
  });
  key = "";
  const text = `${result.stdout || ""}\n${result.stderr || ""}`.replace(/eyJ[A-Za-z0-9_-]{20,}/g, "[redacted]");
  return {
    status: result.status === 0 ? "pass" : "fail",
    exit_code: result.status,
    output: text.slice(0, 4000),
  };
}

function windowRows(rows, startMs, endMs) {
  return rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    if (Number.isNaN(t)) return false;
    if (startMs != null && t < startMs) return false;
    if (endMs != null && t > endMs) return false;
    return true;
  });
}

function sastMonthStartUtc(asOf) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(asOf).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month);
  return Date.parse(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+02:00`);
}

function buildComparisons(report) {
  const rows = report.ledger || [];
  const asOfMs = new Date(report.as_of).getTime();
  const asOf = new Date(report.as_of);
  const utcMonth = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1);
  const utcPrev = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, 1);
  const sastMonth = sastMonthStartUtc(asOf);
  const utc24 = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 24, 1);
  const windows = {
    all_time: aggregate(windowRows(rows, null, asOfMs)),
    utc_month: aggregate(windowRows(rows, utcMonth, asOfMs)),
    utc_previous_month: aggregate(windowRows(rows, utcPrev, utcMonth - 1)),
    sast_month: aggregate(windowRows(rows, sastMonth, asOfMs)),
    dashboard_24_month_utc: aggregate(windowRows(rows, utc24, asOfMs)),
  };
  const paidBookings = (report.bookings || []).filter((b) => n(b.total_paid) > 0);
  const sourcePaid = paidBookings.reduce((s, b) => addMoney(s, n(b.total_paid)), 0);
  const sourceRefunded = (report.bookings || []).reduce((s, b) => addMoney(s, n(b.total_refunded)), 0);
  const providerDiffs = (report.provider_summaries || []).map((p) => {
    const rpc = p.rpc || {};
    const fields = [
      ["serviceEarnings", p.sql_service_earnings],
      ["tips", p.sql_tips],
      ["travelFees", p.sql_travel],
      ["cancellationFees", p.sql_cancellation],
      ["refundDeduction", p.sql_refund_deduction],
    ];
    const mismatches = fields
      .filter(([key, sql]) => !close(rpc[key], sql))
      .map(([key, sql]) => ({ field: key, rpc: n(rpc[key]), sql: n(sql) }));
    return { provider_id: p.provider_id, mismatches };
  });
  return {
    windows,
    source_vs_dashboard: {
      bookings_total_paid: sourcePaid,
      bookings_total_refunded: sourceRefunded,
      ledger_service_collected_gross: windows.all_time.service_collected_gross,
      ledger_refunds_gross: windows.all_time.refunds_gross,
      paid_vs_gmv_diff: subMoney(windows.all_time.service_collected_gross, sourcePaid),
      refund_column_vs_cash_legs_diff: subMoney(sourceRefunded, windows.all_time.refunds_gross),
      utc_month_vs_sast_month_gmv_diff: subMoney(windows.utc_month.service_collected_gross, windows.sast_month.service_collected_gross),
      all_time_vs_24_month_gmv_diff: subMoney(windows.all_time.service_collected_gross, windows.dashboard_24_month_utc.service_collected_gross),
    },
    provider_rpc_vs_sql: providerDiffs,
  };
}

function isVacuous(check, inventory) {
  const id = check.check_id;
  if (id.startsWith("product_orders.") || id === "existing.paid_product_orders_missing_ledger") {
    return n(inventory.product_orders) === 0;
  }
  if (id.startsWith("group_bookings.")) {
    return n(inventory.group_bookings) === 0 && n(inventory.booking_participants) === 0;
  }
  if (id.startsWith("custom_offers.")) {
    return n(inventory.custom_offers) === 0 && n(inventory.custom_requests) === 0;
  }
  if (id.startsWith("gift_cards.")) return n(inventory.gift_cards) === 0;
  if (id.startsWith("memberships.")) return n(inventory.membership_orders) === 0;
  if (id.startsWith("terminal.")) return n(inventory.terminal_orders) === 0;
  if (
    id === "existing.completed_payouts_without_ledger" ||
    id === "existing.orphan_payout_ledger_rows"
  ) {
    return n(inventory.payouts) === 0;
  }
  return false;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const asOf = new Date().toISOString();
const template = fs.readFileSync(sqlTemplatePath, "utf8");
if (!template.includes("__AS_OF__")) {
  console.error("SQL template is missing __AS_OF__");
  process.exit(2);
}
const sql = template.replaceAll("__AS_OF__", asOf);
const tempSql = path.join(os.tmpdir(), `staging-finance-accuracy-${Date.now()}.sql`);
fs.writeFileSync(tempSql, sql);

console.log(`[staging-finance-audit] as_of ${asOf}`);
console.log("[staging-finance-audit] running read-only SQL");
const report = runQuery(tempSql);
fs.unlinkSync(tempSql);

console.log("[staging-finance-audit] probing staging HTTP APIs (no credentials)");
const apiProbes = await probeApis();
console.log("[staging-finance-audit] running scripts/prod/audit-finance-ledger.mjs");
const namedAudit = runNamedLedgerAudit();

const comparisons = buildComparisons(report);
const checks = (report.checks || []).map((c) => {
  const vacuous = isVacuous(c, report.inventory || {}) && n(c.violations) === 0;
  const failed = n(c.violations) > 0;
  return { ...c, verdict: failed ? "FAIL" : vacuous ? "VACUOUS" : "PASS" };
});

const output = {
  as_of: report.as_of,
  project_ref: report.project_ref,
  required_migrations: report.required_migrations,
  enums: report.enums,
  inventory: report.inventory,
  observed: report.observed,
  shadow_gl: report.shadow_gl,
  checks,
  comparisons,
  provider_summaries: report.provider_summaries,
  bookings: report.bookings,
  api_probes: apiProbes,
  named_ledger_audit: namedAudit,
  code_risks: {
    wallet_topup_count: n(report.inventory?.wallet_topups),
    wallet_topup_page_limit_exceeded: n(report.inventory?.wallet_topups) > 1000,
    ledger_rows: n(report.inventory?.finance_transactions),
    ledger_older_than_24_months: comparisons.source_vs_dashboard.all_time_vs_24_month_gmv_diff !== 0,
    utc_vs_sast_month_gmv_diff: comparisons.source_vs_dashboard.utc_month_vs_sast_month_gmv_diff,
    sast_boundary_ledger_rows: n(report.observed?.sast_boundary_ledger_rows),
    sast_boundary_bookings: n(report.observed?.sast_boundary_bookings),
    currencies: report.observed?.currencies || [],
    mixed_currency: (report.observed?.currencies || []).length > 1,
    timezone_setting: report.observed?.timezone || null,
  },
};

fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, "staging-finance-accuracy.json");
const csvPath = path.join(outDir, "staging-finance-accuracy.csv");
fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
const header = "check_id,domain,violations,verdict,samples";
const lines = checks.map((c) =>
  [c.check_id, c.domain, c.violations, c.verdict, c.samples].map(csvEscape).join(","),
);
fs.writeFileSync(csvPath, [header, ...lines].join("\n") + "\n");

const metricRows = buildSuperadminMetricQa(comparisons, report);
const metricFailed = metricRows.filter((row) => row.verdict === "FAIL");
const metricJsonPath = path.join(outDir, "staging-superadmin-metrics-qa.json");
const metricCsvPath = path.join(outDir, "staging-superadmin-metrics-qa.csv");
fs.writeFileSync(
  metricJsonPath,
  JSON.stringify(
    {
      as_of: report.as_of,
      currency: comparisons.windows.all_time.currency,
      rows: metricRows,
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  metricCsvPath,
  ["metric,expected,actual,verdict,note", ...metricRows.map((row) =>
    [row.metric, row.expected, row.actual, row.verdict, row.note].map(csvEscape).join(","),
  )].join("\n") + "\n",
);

const failed = checks.filter((c) => c.verdict === "FAIL");
console.log(`[staging-finance-audit] ${checks.length} checks, ${failed.length} failed`);
for (const c of failed) console.log(`  FAIL ${c.check_id} = ${c.violations} ${c.samples || ""}`);
console.log(`[staging-finance-audit] metric QA ${metricRows.length} rows, ${metricFailed.length} failed`);
for (const row of metricFailed) console.log(`  FAIL ${row.metric} expected ${row.expected} actual ${row.actual}`);
console.log(`[staging-finance-audit] wrote ${path.relative(root, jsonPath)}`);
console.log(`[staging-finance-audit] wrote ${path.relative(root, csvPath)}`);
console.log(`[staging-finance-audit] wrote ${path.relative(root, metricJsonPath)}`);
process.exit(failed.length > 0 || metricFailed.length > 0 ? 1 : 0);

function qaRow(metric, expected, actual, note = "") {
  return {
    metric,
    expected,
    actual,
    verdict: close(expected, actual) ? "PASS" : "FAIL",
    note,
  };
}

function buildSuperadminMetricQa(comparisons, report) {
  const all = comparisons.windows.all_time;
  const month = comparisons.windows.utc_month;
  const prev = comparisons.windows.utc_previous_month;
  const dash = comparisons.windows.dashboard_24_month_utc;
  const observed = report.observed || {};
  const cash = n(observed.wallet_topup_cash_collected);
  const completedRefunds = n(observed.completed_booking_refunds);
  const providerNetAfter = subMoney(all.provider_recognized_revenue_gross, Math.abs(all.provider_refund_net_impact));
  const commissionOnly = sumMoney(all.platform_take_net, all.subscription_net, all.ads_net, all.marketing_credit_net);
  const cashCollected = sumMoney(all.service_collected_gross, cash, all.gift_card_sales, all.subscription_gross, all.ads_gross, all.marketing_credit_gross);
  const netPlatformCash = subMoney(subMoney(subMoney(cashCollected, all.payouts_paid_total), all.refunds_abs_gross), all.gateway_fees_total);
  const takeNumerator = addMoney(all.platform_take_net, all.service_fee_revenue);
  const contribution = subMoney(subMoney(all.platform_revenue_net, all.gateway_fees_total), Math.abs(all.platform_refund_impact));
  const shadow = report.shadow_gl || {};
  const rows = [
    qaRow("service_collected_gross", 502.5, all.service_collected_gross, "paid bookings GMV"),
    qaRow("refunds_gross", 315, all.refunds_gross, "abs(net) of cash refund legs"),
    qaRow("provider_earnings_net", 400, all.provider_earnings_net),
    qaRow("provider_net_after_refunds", 172.5, providerNetAfter, "earnings + tips + provider refund nets"),
    qaRow("tips_gross", 62.5, all.tips_gross),
    qaRow("taxes_gross", 0, all.taxes_gross),
    qaRow("gateway_fees_services", 20.23, all.gateway_fees_services),
    qaRow("gateway_fees_total", 20.23, all.gateway_fees_total),
    qaRow("service_fee_revenue", 15, all.service_fee_revenue, "posted platform fees plus refund nets"),
    qaRow("platform_take_net", -20.23, all.platform_take_net),
    qaRow("total_platform_take_net", -5.23, all.platform_revenue_net, "platformRevenueNetFromAggregate"),
    qaRow("wallet_topup_ledger", 100, all.wallet_topup_ledger),
    qaRow("wallet_topup_cash_collected", 100, cash),
    qaRow("gift_card_sales", 0, all.gift_card_sales),
    qaRow("subscription_net", 0, all.subscription_net),
    qaRow("ads_net", 0, all.ads_net),
    qaRow("marketing_credit_net", 0, all.marketing_credit_net),
    qaRow("payouts_paid_total", 0, all.payouts_paid_total),
    qaRow("cross.gmv_vs_paid_bookings", all.service_collected_gross, comparisons.source_vs_dashboard.bookings_total_paid),
    qaRow("cross.refunds_vs_completed_refunds", all.refunds_gross, completedRefunds),
    qaRow("cross.refunds_vs_booking_column", all.refunds_gross, comparisons.source_vs_dashboard.bookings_total_refunded),
    qaRow("cross.finance_month_gmv_vs_dashboard_24", month.service_collected_gross, dash.service_collected_gross),
    qaRow("cross.finance_month_gmv_vs_all_time", month.service_collected_gross, all.service_collected_gross),
    qaRow("cross.month_refunds_vs_all_time", month.refunds_gross, all.refunds_gross),
    qaRow("cross.month_platform_vs_dashboard_24", month.platform_revenue_net, dash.platform_revenue_net),
    qaRow("cross.wallet_ledger_vs_cash", all.wallet_topup_ledger, cash),
    qaRow("previous_month.gmv", 0, prev.service_collected_gross),
    qaRow("previous_month.refunds", 0, prev.refunds_gross),
    qaRow("shadow.debit_minus_credit", 0, subMoney(n(shadow.ledger_sum_debits), n(shadow.ledger_sum_credits))),
    qaRow("finance.service_collected_net", 482.27, all.service_collected_net),
    qaRow("finance.platform_commission_gross", 0, all.platform_commission_gross),
    qaRow("finance.platform_refund_impact", 0, all.platform_refund_impact),
    qaRow("finance.platform_commission_net", 0, all.platform_commission_net),
    qaRow("finance.total_platform_commission_net", -20.23, commissionOnly),
    qaRow("finance.total_platform_take_after_referrals", -5.23, all.platform_revenue_net, "no referral payouts on staging"),
    qaRow("finance.subscription_gross", 0, all.subscription_gross),
    qaRow("finance.subscription_gateway_fees", 0, all.subscription_gateway_fees),
    qaRow("finance.subscription_vat", 0, all.subscription_vat),
    qaRow("finance.ads_gross", 0, all.ads_gross),
    qaRow("finance.ads_gateway_fees", 0, all.ads_gateway_fees),
    qaRow("finance.marketing_credit_gross", 0, all.marketing_credit_gross),
    qaRow("finance.marketing_credit_gateway_fees", 0, all.marketing_credit_gateway_fees),
    qaRow("finance.ecommerce_platform_fees", 0, all.ecommerce_platform_fees),
    qaRow("finance.gift_card_breakage", 0, all.gift_card_breakage),
    qaRow("finance.gift_card_liability_reductions", 0, all.gift_card_liability_reductions),
    qaRow("finance.membership_sales", 0, all.membership_sales),
    qaRow("finance.cancellation_fees_retained", 0, all.cancellation_fees_retained),
    qaRow("finance.travel_fees", 0, all.travel_fees),
    qaRow("finance.walk_in_additional_charges", 0, all.walk_in_additional_charges),
    qaRow("finance.additional_charge_gross", 0, all.additional_charge_gross),
    qaRow("finance.manual_adjustments_net", 0, all.manual_adjustments_net),
    qaRow("finance.promotion_discounts", 0, all.promotion_discounts),
    qaRow("finance.membership_discounts", 0, all.membership_discounts),
    qaRow("finance.loyalty_discounts", 0, all.loyalty_discounts),
    qaRow("finance.loyalty_redemptions", 0, all.loyalty_redemptions),
    qaRow("finance.provider_refund_net_impact", -290, all.provider_refund_net_impact),
    qaRow("finance.terminal_revenue_gross", 0, all.terminal_revenue_gross),
    qaRow("finance.terminal_gateway_fees", 0, all.terminal_gateway_fees),
    qaRow("finance.gateway_fees_breakdown.services", 20.23, all.gateway_fees_services),
    qaRow("finance.gateway_fees_breakdown.other", 0, sumMoney(all.terminal_gateway_fees, all.subscription_gateway_fees, all.ads_gateway_fees, all.marketing_credit_gateway_fees, all.other_gateway_fees, all.membership_gateway_fees, all.payout_transfer_fees)),
    qaRow("finance.platform_cash.collected", 602.5, cashCollected),
    qaRow("finance.platform_cash.refunds_gross", 315, all.refunds_abs_gross),
    qaRow("finance.platform_cash.net", 267.27, netPlatformCash),
    qaRow("finance.platform_revenue.booking_commission", -20.23, all.platform_take_net),
    qaRow("finance.platform_revenue.customer_paid_platform_fees", 15, all.service_fee_revenue),
    qaRow("finance.platform_revenue.total", -5.23, all.platform_revenue_net),
    qaRow("finance.provider_revenue.net_after_refunds", 172.5, providerNetAfter),
    qaRow("dashboard.gmv_total", all.service_collected_gross, dash.service_collected_gross),
    qaRow("dashboard.refunds_total", all.refunds_gross, dash.refunds_gross),
    qaRow("dashboard.provider_earnings_total", all.provider_earnings_net, dash.provider_earnings_net),
    qaRow("dashboard.tips_total", all.tips_gross, dash.tips_gross),
    qaRow("dashboard.taxes_total", all.taxes_gross, dash.taxes_gross),
    qaRow("dashboard.platform_revenue.total", all.platform_revenue_net, dash.platform_revenue_net),
    qaRow("dashboard.wallet_topups_cash_collected", cash, all.wallet_topup_ledger),
    qaRow("dashboard.this_month.gmv", month.service_collected_gross, all.service_collected_gross),
    qaRow("dashboard.this_month.refunds", month.refunds_gross, all.refunds_gross),
    qaRow("dashboard.this_month.platform", month.platform_revenue_net, all.platform_revenue_net),
    qaRow("dashboard.last_month.gmv", 0, prev.service_collected_gross),
    qaRow("dashboard.last_month.platform", 0, prev.platform_revenue_net),
    qaRow("revenue.refunds_gross", all.refunds_gross, month.refunds_gross),
    qaRow("revenue.service_fee_revenue_net", all.service_fee_revenue, month.service_fee_revenue),
    qaRow("revenue.total_platform_revenue_net", all.platform_revenue_net, month.platform_revenue_net),
    qaRow("gods_eye.this_month", month.platform_revenue_net, all.platform_revenue_net),
    qaRow("gods_eye.all_time", all.platform_revenue_net, dash.platform_revenue_net),
    qaRow("analytics.platform_net_total", all.platform_revenue_net, month.platform_revenue_net),
    qaRow("analytics.gateway_fees_total", all.gateway_fees_total, month.gateway_fees_total),
    qaRow("marketplace.take_numerator", -5.23, takeNumerator),
    qaRow("marketplace.contribution_margin", -25.46, contribution),
    qaRow("reconciliation.gmv_variance", 0, subMoney(all.service_collected_gross, comparisons.source_vs_dashboard.bookings_total_paid)),
  ];
  rows.push(qaRow("finance.gift_card_outstanding", 0, n(report.inventory?.gift_cards) === 0 ? 0 : n(report.inventory?.gift_cards), "no gift cards, so outstanding liability is 0"));
  const currencies = observed.currencies || [];
  rows.push({
    metric: "currency",
    expected: "ZAR",
    actual: currencies.length > 1 ? "MIXED" : all.currency,
    verdict: currencies.length > 1 || all.currency === "MIXED" ? "FAIL" : "PASS",
    note: "MIXED must stay flagged and is not summed as ZAR",
  });
  return rows;
}

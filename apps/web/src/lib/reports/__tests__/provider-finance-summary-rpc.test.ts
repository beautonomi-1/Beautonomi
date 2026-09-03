import { readFileSync } from "node:fs";
import path from "node:path";
import type { ProviderRevenueLedgerRow } from "@/lib/reports/provider-revenue-semantics";
import { computeProviderRevenueBreakdown } from "@/lib/reports/provider-revenue-semantics";
import { NON_PROVIDER_REFUND_COMPONENTS } from "@/lib/ledger/refund-components";
import {
  mapFinanceSummaryRpcRow,
  shadowCompareFinanceSummary,
} from "@/lib/reports/provider-finance-summary-rpc";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "../../supabase/migrations/868_commerce_memberships_gift_cards.sql",
);

function readMigrationSql(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

/**
 * Mirrors the aggregation the SQL function performs, so the fixtures below prove the
 * two implementations agree rather than restating hardcoded expectations.
 */
function simulateRpc(rows: ReadonlyArray<ProviderRevenueLedgerRow>) {
  const excluded = extractExcludedRefundComponents(readMigrationSql());
  const netOf = (r: ProviderRevenueLedgerRow) => Number(r.net ?? r.amount ?? 0);
  const sumType = (type: string) =>
    rows.filter((r) => r.transaction_type === type).reduce((s, r) => s + netOf(r), 0);

  const serviceEarnings = sumType("provider_earnings");
  const membershipEarnings = sumType("membership_provider_earnings");
  const tips = sumType("tip");
  const travelFees = sumType("travel_fee");
  const cancellationFees = sumType("cancellation_fee");
  const walkInAdditionalCharges = sumType("walk_in_additional_charge");
  const refundDeduction = rows
    .filter(
      (r) =>
        r.transaction_type === "refund" &&
        (r.refund_component == null || !excluded.has(r.refund_component)),
    )
    .reduce((s, r) => s + Math.abs(netOf(r)), 0);

  const recognizedRevenue =
    serviceEarnings + membershipEarnings + tips + travelFees + cancellationFees + walkInAdditionalCharges;

  return mapFinanceSummaryRpcRow({
    serviceEarnings,
    membershipEarnings,
    tips,
    travelFees,
    cancellationFees,
    walkInAdditionalCharges,
    recognizedRevenue,
    refundDeduction,
    netAfterRefunds: recognizedRevenue - refundDeduction,
  });
}

/** Pull the `refund_component NOT IN (...)` list straight out of the migration. */
function extractExcludedRefundComponents(sql: string): Set<string> {
  const match = sql.match(/refund_component\s+NOT\s+IN\s*\(([\s\S]*?)\)/i);
  if (!match) throw new Error("migration 823 no longer contains a refund_component NOT IN list");
  return new Set(
    Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]),
  );
}

describe("provider finance summary RPC parity", () => {
  it("excludes exactly the non-provider refund components the TS source of truth defines", () => {
    const fromSql = extractExcludedRefundComponents(readMigrationSql());
    expect([...fromSql].sort()).toEqual([...NON_PROVIDER_REFUND_COMPONENTS].sort());
  });

  it("aggregates only the recognized revenue transaction types", () => {
    const sql = readMigrationSql();
    for (const type of [
      "provider_earnings",
      "membership_provider_earnings",
      "tip",
      "travel_fee",
      "cancellation_fee",
      "walk_in_additional_charge",
    ]) {
      expect(sql).toContain(`transaction_type = '${type}'`);
    }
  });

  it("uses inclusive UTC bounds supplied by the caller rather than deriving ranges in SQL", () => {
    const sql = readMigrationSql();
    expect(sql).toContain("created_at >= p_from");
    expect(sql).toContain("created_at <= p_to");
    expect(sql).not.toMatch(/date_trunc|AT TIME ZONE/i);
  });

  it("is not executable by anon or authenticated roles", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.provider_finance_summary[\s\S]*FROM PUBLIC/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.provider_finance_summary[\s\S]*TO service_role/i);
  });

  it.each([
    [
      "mixed revenue with provider and platform refund legs",
      [
        { transaction_type: "provider_earnings", net: 100, amount: 100, refund_component: null },
        { transaction_type: "tip", net: 20, amount: 20, refund_component: null },
        { transaction_type: "travel_fee", net: 15, amount: 15, refund_component: null },
        { transaction_type: "refund", net: -10, amount: -10, refund_component: "provider_earnings" },
        { transaction_type: "refund", net: -5, amount: -5, refund_component: "platform_fee" },
      ],
    ],
    [
      "legacy and null refund components count as a full clawback",
      [
        { transaction_type: "provider_earnings", net: 80, amount: 80, refund_component: null },
        { transaction_type: "refund", net: -12, amount: -12, refund_component: "_legacy" },
        { transaction_type: "refund", net: -8, amount: -8, refund_component: null },
      ],
    ],
    [
      "every non-provider component is ignored",
      [
        { transaction_type: "provider_earnings", net: 250, amount: 250, refund_component: null },
        ...[...NON_PROVIDER_REFUND_COMPONENTS].map((refund_component) => ({
          transaction_type: "refund",
          net: -7,
          amount: -7,
          refund_component,
        })),
      ],
    ],
    [
      "legacy negative provider_earnings reversals net down recognized revenue",
      [
        { transaction_type: "provider_earnings", net: 300, amount: 300, refund_component: null },
        { transaction_type: "provider_earnings", net: -50, amount: -50, refund_component: null },
        { transaction_type: "cancellation_fee", net: 40, amount: 40, refund_component: null },
        { transaction_type: "walk_in_additional_charge", net: 25, amount: 25, refund_component: null },
      ],
    ],
    [
      "non-revenue ledger types are excluded entirely",
      [
        { transaction_type: "provider_earnings", net: 60, amount: 60, refund_component: null },
        { transaction_type: "payout", net: -60, amount: -60, refund_component: null },
        { transaction_type: "platform_fee", net: -9, amount: -9, refund_component: null },
        { transaction_type: "additional_charge_payment", net: -3, amount: -3, refund_component: null },
      ],
    ],
    [
      "falls back to amount when net is null",
      [
        { transaction_type: "provider_earnings", net: null, amount: 45, refund_component: null },
        { transaction_type: "tip", net: null, amount: 5, refund_component: null },
      ],
    ],
  ] as [string, ProviderRevenueLedgerRow[]][])(
    "matches the JS breakdown: %s",
    (_label, rows) => {
      const js = computeProviderRevenueBreakdown(rows);
      const rpc = simulateRpc(rows);
      expect(rpc).toEqual(js);
      expect(
        shadowCompareFinanceSummary(js, rpc!, { providerId: "p1", route: "/api/provider/finance" }),
      ).toBe(true);
    },
  );

  it("reports a mismatch when the aggregates diverge", () => {
    const js = computeProviderRevenueBreakdown([
      { transaction_type: "provider_earnings", net: 100, amount: 100, refund_component: null },
    ]);
    const drifted = { ...js, serviceEarnings: js.serviceEarnings + 1 };
    expect(
      shadowCompareFinanceSummary(js, drifted, { providerId: "p1", route: "/api/provider/finance" }),
    ).toBe(false);
  });
});

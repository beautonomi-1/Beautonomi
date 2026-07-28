import { describe, expect, it } from "vitest";

import {
  computeSalesHistoryTotalsFromAggs,
  resolveSalesHistoryIsoRange,
} from "@/lib/reports/provider-sales-history";

describe("resolveSalesHistoryIsoRange", () => {
  it("uses 24-month default when no explicit dates", () => {
    const result = resolveSalesHistoryIsoRange("Africa/Johannesburg");
    expect(result.usesDefaultRange).toBe(true);
    expect(result.fromIso).toMatch(/T/);
    expect(result.toIso).toMatch(/T/);
  });

  it("does not treat explicit all-time client range as default", () => {
    const result = resolveSalesHistoryIsoRange("Africa/Johannesburg", "1970-01-01", "2026-07-28");
    expect(result.usesDefaultRange).toBe(false);
  });
});

const emptyAgg = {
  provider_earnings_net: 0,
  platform_fee: 0,
  commission: 0,
  tip: 0,
  tax: 0,
  travel_fee: 0,
  cancellation_fee: 0,
  walk_in_additional_charge: 0,
  discount_contra: 0,
  refunds: 0,
  last_at: "2026-07-01",
};

describe("computeSalesHistoryTotalsFromAggs", () => {
  it("sums booking and order aggregates for included IDs only", () => {
    const bookingAggs = new Map([
      [
        "b1",
        {
          ...emptyAgg,
          provider_earnings_net: 80,
          platform_fee: 5,
          commission: 2,
          tip: 10,
          refunds: 5,
        },
      ],
      [
        "b2-excluded-by-branch",
        {
          ...emptyAgg,
          provider_earnings_net: 999,
          platform_fee: 50,
          commission: 20,
        },
      ],
    ]);
    const totals = computeSalesHistoryTotalsFromAggs(
      bookingAggs,
      new Map(),
      // Only b1 passed location/search filters
      new Map([["b1", 100]]),
      new Map(),
      [],
    );
    expect(totals.total_gross).toBe(100);
    expect(totals.total_provider_net).toBe(85);
    expect(totals.total_platform_fee).toBe(5);
    expect(totals.total_commission).toBe(2);
  });

  it("ignores ledger aggs that have no matching included gross row", () => {
    const bookingAggs = new Map([
      ["orphan", { ...emptyAgg, provider_earnings_net: 500, platform_fee: 10 }],
    ]);
    const totals = computeSalesHistoryTotalsFromAggs(bookingAggs, new Map(), new Map(), new Map(), []);
    expect(totals.total_gross).toBe(0);
    expect(totals.total_provider_net).toBe(0);
    expect(totals.total_platform_fee).toBe(0);
  });
});

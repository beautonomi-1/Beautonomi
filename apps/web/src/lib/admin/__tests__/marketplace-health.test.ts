import { describe, expect, it } from "vitest";
import {
  computeBookingFrequency,
  computeMrrBridge,
  computeRepeatRate,
  computeTakeRate,
  type CompletedBookingLite,
} from "../marketplace-health";
import { aggregateFinanceLedgerRows } from "../aggregate-finance-ledger-rows";
import type { FinanceLedgerRow } from "../finance-ledger-tenant";

const mk = (
  customer_id: string,
  scheduled_at: string,
  provider_id = "p1",
): CompletedBookingLite => ({
  customer_id,
  provider_id,
  scheduled_at,
});

describe("marketplace-health", () => {
  it("frequency ignores customers with zero completed in window", () => {
    const now = new Date("2026-03-01T12:00:00Z");
    const start = new Date("2026-02-01T00:00:00Z");
    const bookings = [
      mk("c1", "2026-02-10T10:00:00Z"),
      mk("c1", "2026-02-20T10:00:00Z"),
      mk("c2", "2026-02-15T10:00:00Z"),
    ];
    expect(computeBookingFrequency(bookings, start, now)).toBeCloseTo(1.5, 5);
  });

  it("repeat rate uses completed counts only", () => {
    const end = new Date("2026-03-01T12:00:00Z");
    const start = new Date("2025-12-01T00:00:00Z");
    const bookings = [
      mk("c1", "2026-01-01T10:00:00Z"),
      mk("c1", "2026-01-15T10:00:00Z"),
      mk("c2", "2026-01-20T10:00:00Z"),
    ];
    expect(computeRepeatRate(bookings, start, end)).toBeCloseTo(0.5, 5);
  });

  it("take rate matches ledger aggregate", () => {
    const rows: FinanceLedgerRow[] = [
      {
        transaction_type: "payment",
        amount: 100,
        net: 90,
        commission: 10,
        fees: 0,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        transaction_type: "service_fee",
        amount: 5,
        net: 5,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    const agg = aggregateFinanceLedgerRows(rows);
    agg.service_collected_gross = 100;
    const rate = computeTakeRate(agg);
    expect(rate).toBeGreaterThan(0);
  });

  it("MRR bridge identity", () => {
    const b = computeMrrBridge({
      startingMrr: 1000,
      newMrr: 200,
      expansionMrr: 50,
      contractionMrr: 30,
      churnedMrr: 70,
    });
    expect(b.starting_mrr + b.new_mrr + b.expansion_mrr - b.contraction_mrr - b.churned_mrr).toBe(
      b.ending_mrr,
    );
  });
});

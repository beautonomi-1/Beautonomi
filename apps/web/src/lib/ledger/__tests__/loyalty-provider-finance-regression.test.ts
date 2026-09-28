/**
 * Plan §2h: loyalty discount/redemption must not change provider net or payout balance.
 */
import { describe, expect, it } from "vitest";
import {
  isPayoutRefundComponent,
  isProviderEarningsRefundComponent,
} from "../refund-components";
import { computeProviderRevenueBreakdown } from "@/lib/reports/provider-revenue-semantics";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";

type Row = Record<string, unknown>;

class Query {
  private filters: Array<{ op: "eq" | "in"; key: string; value: unknown }> = [];

  constructor(
    private readonly table: string,
    private readonly rowsByTable: Record<string, Row[]>,
  ) {}

  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push({ op: "eq", key, value });
    return this;
  }
  in(key: string, value: unknown[]) {
    this.filters.push({ op: "in", key, value });
    return this;
  }
  gte() {
    return this;
  }
  lte() {
    return this;
  }
  order() {
    return this;
  }
  range() {
    return this;
  }

  then(onfulfilled?: (v: { data: Row[]; error: null }) => unknown) {
    const data = (this.rowsByTable[this.table] ?? []).filter((row) =>
      this.filters.every((f) => {
        if (f.op === "eq") return row[f.key] === f.value;
        if (f.op === "in") return (f.value as unknown[]).includes(row[f.key]);
        return true;
      }),
    );
    return Promise.resolve({ data, error: null }).then(onfulfilled as never);
  }
}

function mockSupabase(rowsByTable: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new Query(table, rowsByTable);
    },
  } as never;
}

const providerId = "prov-loyalty";
const bookingId = "bk-loyalty";
const T = "2026-04-01T00:00:00.000Z";

describe("loyalty provider finance regression (plan §2h)", () => {
  it("treats loyalty refund legs as non-provider money", () => {
    expect(isProviderEarningsRefundComponent("loyalty_redemption")).toBe(false);
    expect(isProviderEarningsRefundComponent("loyalty_discount")).toBe(false);
    expect(isPayoutRefundComponent("loyalty_redemption")).toBe(false);
  });

  it("leaves recognized provider net unchanged when a loyalty contra row is present", () => {
    const baseline = computeProviderRevenueBreakdown([
      { transaction_type: "provider_earnings", net: 850 },
    ]);
    const withLoyaltyContra = computeProviderRevenueBreakdown([
      { transaction_type: "provider_earnings", net: 850 },
      { transaction_type: "loyalty_redemption", net: -50 },
    ]);

    expect(withLoyaltyContra.recognizedRevenue).toBe(baseline.recognizedRevenue);
    expect(withLoyaltyContra.netAfterRefunds).toBe(baseline.netAfterRefunds);
    expect(withLoyaltyContra.netAfterRefunds).toBe(850);
  });

  it("does not reduce payout balance for loyalty contra rows or loyalty refund components", async () => {
    const rows = {
      finance_transactions: [
        {
          provider_id: providerId,
          transaction_type: "provider_earnings",
          amount: 850,
          net: 850,
          booking_id: bookingId,
          created_at: T,
        },
        {
          provider_id: providerId,
          transaction_type: "loyalty_redemption",
          amount: 50,
          net: -50,
          booking_id: bookingId,
          created_at: T,
        },
        {
          provider_id: providerId,
          transaction_type: "refund",
          amount: 50,
          net: -50,
          refund_component: "loyalty_redemption",
          booking_id: bookingId,
          created_at: T,
        },
      ],
      bookings: [{ id: bookingId, booking_source: "online" }],
      booking_payments: [
        { booking_id: bookingId, payment_provider: "paystack", status: "completed" },
      ],
      payouts: [],
    };

    const result = await getAvailablePayoutBalance(mockSupabase(rows), providerId);
    expect(result.rawBalance).toBe(850);
    expect(result.availableBalance).toBe(850);
  });
});

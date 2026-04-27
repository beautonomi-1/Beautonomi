import { describe, expect, it } from "vitest";
import { getAvailablePayoutBalance } from "../available-payout-balance";

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

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    try {
      const data = (this.rowsByTable[this.table] ?? []).filter((row) =>
        this.filters.every((filter) => {
          if (filter.op === "eq") return row[filter.key] === filter.value;
          if (filter.op === "in") return (filter.value as unknown[]).includes(row[filter.key]);
          return true;
        }),
      );
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }
}

function mockSupabase(rowsByTable: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new Query(table, rowsByTable);
    },
  } as never;
}

const providerId = "provider-1";

describe("getAvailablePayoutBalance", () => {
  it("includes platform-held Paystack earnings and pass-through amounts, then subtracts payout reservations", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 100, net: 100, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "tip", amount: 20, net: 20, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "travel_fee", amount: 10, net: 10, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "service_fee", amount: 5, net: 5, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "payout", amount: 30, net: 30, created_at: "2026-01-02T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "payment", amount: 999, net: 999, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "wallet_payment", amount: 999, net: 999, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "gift_card_payment", amount: 999, net: 999, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "promotion_discount", amount: 999, net: -999, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [{ provider_id: providerId, amount: 15, status: "pending" }],
      }),
      providerId,
    );

    expect(result).toEqual({
      availableBalance: 90,
      pendingPayoutsSum: 15,
      rawBalance: 90,
      hasNegativeBalance: false,
    });
  });

  it("excludes direct walk-in non-Paystack booking money from platform-held payout balance", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 100, net: 100, booking_id: "cash-walkin", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "tip", amount: 25, net: 25, booking_id: "cash-walkin", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 70, net: 70, booking_id: "paystack-walkin", created_at: "2026-01-01T00:00:00.000Z" },
        ],
        bookings: [
          { id: "cash-walkin", booking_source: "walk_in" },
          { id: "paystack-walkin", booking_source: "walk_in" },
        ],
        booking_payments: [
          { booking_id: "cash-walkin", payment_provider: "cash", status: "completed" },
          { booking_id: "paystack-walkin", payment_provider: "paystack", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(70);
    expect(result.availableBalance).toBe(70);
  });

  it("keeps refund clawbacks immediate and can expose a negative balance", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 50, net: 50, booking_id: "b1", created_at: "2999-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "refund", amount: -120, net: -120, booking_id: "b1", created_at: "2026-01-03T00:00:00.000Z" },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
      { holdDays: 30 },
    );

    expect(result.rawBalance).toBe(-120);
    expect(result.availableBalance).toBe(0);
    expect(result.hasNegativeBalance).toBe(true);
  });
});

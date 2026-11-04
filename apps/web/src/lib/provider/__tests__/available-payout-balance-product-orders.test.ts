import { describe, expect, it } from "vitest";
import { getAvailablePayoutBalance } from "../available-payout-balance";

type Row = Record<string, unknown>;

class Query {
  private filters: Array<{ op: "eq" | "in"; key: string; value: unknown }> = [];
  private rangeFrom?: number;
  private rangeTo?: number;

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

  range(from?: number, to?: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    try {
      let data = (this.rowsByTable[this.table] ?? []).filter((row) =>
        this.filters.every((filter) => {
          if (filter.op === "eq") return row[filter.key] === filter.value;
          if (filter.op === "in") return (filter.value as unknown[]).includes(row[filter.key]);
          return true;
        }),
      );
      if (this.rangeFrom != null && this.rangeTo != null) {
        data = data.slice(this.rangeFrom, this.rangeTo + 1);
      }
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

describe("getAvailablePayoutBalance — product order ledger rows", () => {
  const providerId = "provider-1";

  it("includes product-order provider_earnings rows (platform-held) and ignores platform_fee refunds for payout balance", async () => {
    const baseRows: Row[] = [
      {
        provider_id: providerId,
        product_order_id: "po-1",
        booking_id: null,
        transaction_type: "provider_earnings",
        amount: 54,
        net: 54,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        provider_id: providerId,
        product_order_id: "po-1",
        booking_id: null,
        transaction_type: "refund",
        refund_component: "platform_fee",
        amount: 6,
        net: -6,
        created_at: "2026-01-02T00:00:00.000Z",
      },
    ];

    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: baseRows,
        bookings: [],
        booking_payments: [],
        payouts: [],
      }),
      providerId,
    );

    // provider_earnings is payoutable; platform_fee is not, even when present as a refund row.
    expect(result.rawBalance).toBe(54);
    expect(result.availableBalance).toBe(54);
  });

  it("claws back payout balance when a product-order refund row has refund_component provider_earnings", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          {
            provider_id: providerId,
            product_order_id: "po-1",
            booking_id: null,
            transaction_type: "provider_earnings",
            amount: 54,
            net: 54,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            provider_id: providerId,
            product_order_id: "po-1",
            booking_id: null,
            transaction_type: "refund",
            refund_component: "provider_earnings",
            amount: 54,
            net: -54,
            created_at: "2026-01-02T00:00:00.000Z",
          },
          {
            provider_id: providerId,
            product_order_id: "po-1",
            booking_id: null,
            transaction_type: "refund",
            refund_component: "platform_fee",
            amount: 6,
            net: -6,
            created_at: "2026-01-02T00:00:00.000Z",
          },
        ],
        bookings: [],
        booking_payments: [],
        payouts: [],
      }),
      providerId,
    );

    // Only provider_earnings refund affects payout; platform_fee refund is ignored.
    expect(result.rawBalance).toBe(0);
    expect(result.availableBalance).toBe(0);
  });
});


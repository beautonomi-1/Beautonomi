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
  it("includes platform-held Paystack earnings and provider pass-throughs, excluding platform fees, then subtracts payout reservations", async () => {
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
      availableBalance: 85,
      pendingPayoutsSum: 15,
      rawBalance: 85,
      hasNegativeBalance: false,
      breakdown: {
        recognizedPayoutableEarnings: 130,
        onHold: 0,
        excludedProviderCollected: 0,
        completedPayouts: 30,
        pendingPayouts: 15,
        availableBalance: 85,
      },
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

  it("does NOT deduct subscription/ads charges from payout balance (they are billed to the provider's card)", async () => {
    // Subscription and ads are charged to the provider's own card via Paystack. Netting them
    // against the payout balance would double-charge the provider, so the engine ignores them.
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 200, net: 200, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "provider_subscription_payment", amount: 50, net: 50, created_at: "2026-01-02T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "provider_ads_payment", amount: 30, net: 30, created_at: "2026-01-03T00:00:00.000Z" },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(200);
    expect(result.availableBalance).toBe(200);
  });

  it("ignores walk-in add-on recognition + its platform commission leg (migration 660: not payoutable)", async () => {
    // Migration 660 stores walk_in_additional_charge net-of-commission and the platform
    // commission on a sibling `payment` row. Neither type is in the payout-balance query, so
    // the available balance must be identical with or without them present.
    const base = {
      finance_transactions: [
        { provider_id: providerId, transaction_type: "provider_earnings", amount: 100, net: 100, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
      ],
      bookings: [{ id: "b1", booking_source: "online" }],
      booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
      payouts: [] as Row[],
    };
    const withWalkIn = {
      ...base,
      finance_transactions: [
        ...base.finance_transactions,
        // Provider-collected cash add-on: recognition row (net-of-commission) + commission leg.
        { provider_id: providerId, transaction_type: "walk_in_additional_charge", amount: 150, net: 135, commission: 0, booking_id: "b2", created_at: "2026-01-01T00:00:00.000Z" },
        { provider_id: providerId, transaction_type: "payment", amount: 150, net: 15, commission: 15, booking_id: "b2", created_at: "2026-01-01T00:00:00.000Z" },
      ],
      bookings: [...base.bookings, { id: "b2", booking_source: "walk_in" }],
      booking_payments: [...base.booking_payments, { booking_id: "b2", payment_provider: "cash", status: "completed" }],
    };

    const baseResult = await getAvailablePayoutBalance(mockSupabase(base), providerId);
    const walkInResult = await getAvailablePayoutBalance(mockSupabase(withWalkIn), providerId);

    expect(baseResult.rawBalance).toBe(100);
    // The walk-in add-on recognition + commission leg must NOT change the payout balance.
    expect(walkInResult.rawBalance).toBe(100);
    expect(walkInResult.availableBalance).toBe(100);
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

  it("counts a travel_fee row exactly once (net=gross; travel is not inside provider_earnings)", async () => {
    // Both ledger writers (Paystack webhook + create_finance_ledger_from_payment trigger)
    // store the gross travel fee in BOTH amount and net, and exclude travel from the
    // commission base, so travel never appears inside provider_earnings. The engine must
    // therefore add the standalone travel_fee row once and only once.
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 100, net: 100, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "travel_fee", amount: 40, net: 40, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(140);
    expect(result.availableBalance).toBe(140);
  });

  it("subtracts the NET amount of a completed payout when net differs from amount (fees)", async () => {
    // recordPayoutLedger writes amount === net today, but a payout ledger row that ever
    // carries fees (net < amount) must subtract the net actually paid out, not the gross.
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 100, net: 100, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "payout", amount: 50, net: 40, created_at: "2026-01-02T00:00:00.000Z" },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(60);
    expect(result.availableBalance).toBe(60);
  });

  it("gates provider_earnings/tip/travel_fee by hold period but never gates cancellation_fee or refunds", async () => {
    const rows = {
      finance_transactions: [
        // Settled (old) — always available
        { provider_id: providerId, transaction_type: "provider_earnings", amount: 200, net: 200, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
        // Newer than hold window — gated when holdDays > 0
        { provider_id: providerId, transaction_type: "provider_earnings", amount: 100, net: 100, booking_id: "b2", created_at: "2999-01-01T00:00:00.000Z" },
        { provider_id: providerId, transaction_type: "tip", amount: 20, net: 20, booking_id: "b2", created_at: "2999-01-01T00:00:00.000Z" },
        { provider_id: providerId, transaction_type: "travel_fee", amount: 10, net: 10, booking_id: "b2", created_at: "2999-01-01T00:00:00.000Z" },
        // Cancellation fee is never hold-gated (provider-retained, platform-processed)
        { provider_id: providerId, transaction_type: "cancellation_fee", amount: 50, net: 50, booking_id: null, created_at: "2999-01-01T00:00:00.000Z" },
      ],
      bookings: [
        { id: "b1", booking_source: "online" },
        { id: "b2", booking_source: "online" },
      ],
      booking_payments: [
        { booking_id: "b1", payment_provider: "paystack", status: "completed" },
        { booking_id: "b2", payment_provider: "paystack", status: "completed" },
      ],
      payouts: [] as Row[],
    };

    const gated = await getAvailablePayoutBalance(mockSupabase(rows), providerId, { holdDays: 30 });
    // 200 old earnings + 50 cancellation fee (never gated); the future-dated earnings/tip/travel are held.
    expect(gated.rawBalance).toBe(250);

    const ungated = await getAvailablePayoutBalance(mockSupabase(rows), providerId, { holdDays: 0 });
    // Everything available: 200 + 100 + 20 + 10 + 50.
    expect(ungated.rawBalance).toBe(380);
  });

  it("floors a balance driven negative by a refund clawback and flags hasNegativeBalance", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 20, net: 20, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
          { provider_id: providerId, transaction_type: "refund", amount: -100, net: -100, booking_id: "b1", created_at: "2026-01-02T00:00:00.000Z", refund_component: "provider_earnings" },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(-80);
    expect(result.availableBalance).toBe(0);
    expect(result.hasNegativeBalance).toBe(true);
  });

  it("reserves pending AND processing payouts and includes earnings when a booking has no completed payments (fail-open)", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          // booking_id present but no completed booking_payments row -> fail-open includes it.
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 100, net: 100, booking_id: "b1", created_at: "2026-01-01T00:00:00.000Z" },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [],
        payouts: [
          { provider_id: providerId, amount: 30, status: "pending" },
          { provider_id: providerId, amount: 20, status: "processing" },
        ],
      }),
      providerId,
    );

    expect(result.pendingPayoutsSum).toBe(50);
    // 100 earnings (fail-open) - 50 reserved (pending + processing).
    expect(result.rawBalance).toBe(50);
    expect(result.availableBalance).toBe(50);
  });

  it("returns a reconciliation breakdown that bridges recognized earnings to available balance", async () => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          // Released platform-held earnings: 200
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 200, net: 200, booking_id: "online-old", created_at: "2024-01-01T00:00:00.000Z" },
          // On hold (recent, inside 30-day window): 60
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 60, net: 60, booking_id: "online-new", created_at: recent },
          // Provider-collected cash (excluded from payout, surfaced as breakdown): 40
          { provider_id: providerId, transaction_type: "provider_earnings", amount: 40, net: 40, booking_id: "cash", created_at: "2024-01-01T00:00:00.000Z" },
          // Completed payout already transferred: 30
          { provider_id: providerId, transaction_type: "payout", amount: 30, net: 30, created_at: "2024-02-01T00:00:00.000Z" },
        ],
        bookings: [
          { id: "online-old", booking_source: "online" },
          { id: "online-new", booking_source: "online" },
          { id: "cash", booking_source: "walk_in" },
        ],
        booking_payments: [
          { booking_id: "online-old", payment_provider: "paystack", status: "completed" },
          { booking_id: "online-new", payment_provider: "paystack", status: "completed" },
          { booking_id: "cash", payment_provider: "cash", status: "completed" },
        ],
        payouts: [{ provider_id: providerId, amount: 25, status: "pending" }],
      }),
      providerId,
      { holdDays: 30 },
    );

    expect(result.breakdown).toEqual({
      recognizedPayoutableEarnings: 260,
      onHold: 60,
      excludedProviderCollected: 40,
      completedPayouts: 30,
      pendingPayouts: 25,
      availableBalance: 145,
    });
    // recognized 260 - onHold 60 - completed 30 - pending 25 = 145.
    expect(result.rawBalance).toBe(145);
    expect(result.availableBalance).toBe(145);
  });
});

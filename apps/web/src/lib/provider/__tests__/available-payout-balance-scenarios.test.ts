/**
 * Scenario tests for `getAvailablePayoutBalance` covering the full payout
 * exclusion matrix promised in the manual finance validation doc:
 *
 * - Walk-in cash, EFT (`bank_transfer`), manual card (`other`), Yoco terminal, and
 *   PayCloud card-machine bookings are NOT payoutable (provider already collected).
 * - Walk-in **paystack** bookings ARE payoutable (platform held the money).
 * - Online bookings of every payment shape are payoutable (platform-held).
 * - Hold-period gates earnings but NEVER refund clawbacks.
 * - Pending and processing payouts are reserved against the balance.
 * - `service_fee` (legacy customer-paid platform-fee rows) is excluded.
 * - Tips, travel, and cancellation fees are payoutable pass-throughs.
 *
 * If a provider can collect cash/EFT/manual card directly under a future
 * ops policy and we change the exclusion semantics, these tests should
 * fail loudly and force the doc + helper to update together.
 */
import { describe, expect, it } from "vitest";
import { getAvailablePayoutBalance } from "../available-payout-balance";

type Row = Record<string, unknown>;

class Query {
  private filters: Array<{ op: "eq" | "in" | "gte" | "lte"; key: string; value: unknown }> = [];

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

  gte(key: string, value: unknown) {
    this.filters.push({ op: "gte", key, value });
    return this;
  }

  lte(key: string, value: unknown) {
    this.filters.push({ op: "lte", key, value });
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
          if (filter.op === "gte") return String(row[filter.key] ?? "") >= String(filter.value ?? "");
          if (filter.op === "lte") return String(row[filter.key] ?? "") <= String(filter.value ?? "");
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
const T = "2026-04-01T00:00:00.000Z";

function earnings(
  bookingId: string,
  amount: number,
  createdAt: string = T,
  sourcePaymentId?: string,
) {
  return {
    provider_id: providerId,
    transaction_type: "provider_earnings",
    amount,
    net: amount,
    booking_id: bookingId,
    created_at: createdAt,
    ...(sourcePaymentId ? { source_payment_id: sourcePaymentId } : {}),
  };
}

describe("getAvailablePayoutBalance — payout exclusion matrix", () => {
  it("excludes walk-in cash, EFT (bank_transfer), manual card (other), and Yoco terminal", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("walk-cash", 50),
          earnings("walk-eft", 60),
          earnings("walk-other", 70),
          earnings("walk-yoco", 80),
          earnings("walk-paystack", 90),
        ],
        bookings: [
          { id: "walk-cash", booking_source: "walk_in" },
          { id: "walk-eft", booking_source: "walk_in" },
          { id: "walk-other", booking_source: "walk_in" },
          { id: "walk-yoco", booking_source: "walk_in" },
          { id: "walk-paystack", booking_source: "walk_in" },
        ],
        booking_payments: [
          { booking_id: "walk-cash", payment_provider: "cash", status: "completed" },
          { booking_id: "walk-eft", payment_provider: "bank_transfer", status: "completed" },
          { booking_id: "walk-other", payment_provider: "other", status: "completed" },
          { booking_id: "walk-yoco", payment_provider: "yoco", status: "completed" },
          { booking_id: "walk-paystack", payment_provider: "paystack", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    /** Only the walk-in paystack 90 reaches platform-held balance. */
    expect(result.rawBalance).toBe(90);
    expect(result.availableBalance).toBe(90);
    expect(result.hasNegativeBalance).toBe(false);
  });

  it("excludes pure PayCloud card-machine bookings and tips from payout balance", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("walk-paycloud", 120, T, "bp-paycloud-base"),
          {
            provider_id: providerId,
            transaction_type: "tip",
            amount: 20,
            net: 20,
            booking_id: "walk-paycloud",
            created_at: T,
            source_payment_id: "bp-paycloud-tip",
          },
        ],
        bookings: [{ id: "walk-paycloud", booking_source: "walk_in" }],
        booking_payments: [
          { id: "bp-paycloud-base", booking_id: "walk-paycloud", payment_provider: "paycloud", status: "completed" },
          { id: "bp-paycloud-tip", booking_id: "walk-paycloud", payment_provider: "paycloud", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(0);
    expect(result.breakdown.excludedProviderCollected).toBe(140);
  });

  it("mixed Paystack deposit + PayCloud balance only includes platform-held earnings", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("mixed", 50, T, "bp-paystack-deposit"),
          earnings("mixed", 80, T, "bp-paycloud-balance"),
          {
            provider_id: providerId,
            transaction_type: "tip",
            amount: 10,
            net: 10,
            booking_id: "mixed",
            created_at: T,
            source_payment_id: "bp-paycloud-tip",
          },
        ],
        bookings: [{ id: "mixed", booking_source: "online" }],
        booking_payments: [
          { id: "bp-paystack-deposit", booking_id: "mixed", payment_provider: "paystack", status: "completed" },
          { id: "bp-paycloud-balance", booking_id: "mixed", payment_provider: "paycloud", status: "completed" },
          { id: "bp-paycloud-tip", booking_id: "mixed", payment_provider: "paycloud", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(50);
    expect(result.breakdown.excludedProviderCollected).toBe(90);
  });

  it("mixed Paystack (no source_payment_id) + PayCloud (with source) still only includes platform-held earnings", async () => {
    /** Paystack webhook PE rows historically omit source_payment_id; PayCloud trigger rows include it. */
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("mixed-legacy", 60),
          earnings("mixed-legacy", 90, T, "bp-paycloud-leg"),
        ],
        bookings: [{ id: "mixed-legacy", booking_source: "online" }],
        booking_payments: [
          { booking_id: "mixed-legacy", payment_provider: "paystack", status: "completed" },
          {
            id: "bp-paycloud-leg",
            booking_id: "mixed-legacy",
            payment_provider: "paycloud",
            status: "completed",
          },
        ],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(60);
    expect(result.breakdown.excludedProviderCollected).toBe(90);
  });

  it("excludes pure PayCloud even when finance rows lack source_payment_id (booking-level fallback)", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [earnings("pure-pc", 200)],
        bookings: [{ id: "pure-pc", booking_source: "online" }],
        booking_payments: [
          { booking_id: "pure-pc", payment_provider: "paycloud", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(0);
    expect(result.breakdown.excludedProviderCollected).toBe(200);
  });

  it("includes online bookings paid via wallet, gift_card, paystack, and split tender", async () => {
    /** Wallet/gift booking_payments rows fire the DB trigger (skipped only for Paystack)
     *  and create proportional `provider_earnings`. Splits sum to the booking total.
     */
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("online-wallet-only", 100),
          earnings("online-gift-only", 100),
          earnings("online-paystack", 100),
          earnings("online-split-card", 80),
          earnings("online-split-wallet", 20),
        ],
        bookings: [
          { id: "online-wallet-only", booking_source: "online" },
          { id: "online-gift-only", booking_source: "online" },
          { id: "online-paystack", booking_source: "online" },
          { id: "online-split-card", booking_source: "online" },
          { id: "online-split-wallet", booking_source: "online" },
        ],
        booking_payments: [
          { booking_id: "online-wallet-only", payment_provider: "wallet", status: "completed" },
          { booking_id: "online-gift-only", payment_provider: "gift_card", status: "completed" },
          { booking_id: "online-paystack", payment_provider: "paystack", status: "completed" },
          { booking_id: "online-split-card", payment_provider: "paystack", status: "completed" },
          { booking_id: "online-split-wallet", payment_provider: "wallet", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(400);
    expect(result.availableBalance).toBe(400);
  });

  it("subtracts completed payouts (ledger) and reserves pending/processing payouts (table)", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("b1", 200),
          {
            provider_id: providerId,
            transaction_type: "payout",
            amount: 50,
            net: 50,
            created_at: T,
          },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [
          { provider_id: providerId, amount: 30, status: "pending" },
          { provider_id: providerId, amount: 20, status: "processing" },
          { provider_id: providerId, amount: 99, status: "completed" } /* not reserved */,
        ],
      }),
      providerId,
    );

    /** 200 earnings - 50 ledger payout - (30 pending + 20 processing reservation) = 100. */
    expect(result.pendingPayoutsSum).toBe(50);
    expect(result.rawBalance).toBe(100);
    expect(result.availableBalance).toBe(100);
  });

  it("respects payout hold period for earnings but applies refund clawbacks immediately", async () => {
    const longAgo = "2024-01-01T00:00:00.000Z";
    /** "Recent" must be inside the past 30-day hold AND inside the query window.
     *  We anchor at 1 day ago to satisfy both. */
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("old", 100, longAgo),
          earnings("new", 200, recent),
          {
            provider_id: providerId,
            transaction_type: "refund",
            amount: -150,
            net: -150,
            booking_id: "old",
            created_at: recent,
          },
        ],
        bookings: [
          { id: "old", booking_source: "online" },
          { id: "new", booking_source: "online" },
        ],
        booking_payments: [
          { booking_id: "old", payment_provider: "paystack", status: "completed" },
          { booking_id: "new", payment_provider: "paystack", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
      { holdDays: 30 },
    );

    /** Old earnings 100 are released, new 200 are still on hold; refund -150 always applies.
     *  Net = 100 - 150 = -50 → exposed as negative; available floors to 0. */
    expect(result.rawBalance).toBe(-50);
    expect(result.availableBalance).toBe(0);
    expect(result.hasNegativeBalance).toBe(true);
  });

  it("multi-component refund only claws back the provider's components, not platform fee/commission/tender", async () => {
    // Full refund of a 115 online booking. The 654 trigger splits the refund into
    // per-component rows; only provider_earnings/tip/travel/cancellation claw back the
    // payout balance. platform_fee, payment (commission), tax, discount + wallet/gift
    // tender legs, and walk-in add-ons must NOT reduce the platform-held payout.
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("b1", 90),
          {
            provider_id: providerId,
            transaction_type: "refund",
            amount: 90,
            net: -90,
            booking_id: "b1",
            created_at: T,
            refund_component: "provider_earnings",
          },
          {
            provider_id: providerId,
            transaction_type: "refund",
            amount: 15,
            net: -15,
            booking_id: "b1",
            created_at: T,
            refund_component: "platform_fee",
          },
          {
            provider_id: providerId,
            transaction_type: "refund",
            amount: 10,
            net: -10,
            commission: -10,
            booking_id: "b1",
            created_at: T,
            refund_component: "payment",
          },
          {
            provider_id: providerId,
            transaction_type: "refund",
            amount: 50,
            net: -50,
            booking_id: "b1",
            created_at: T,
            refund_component: "wallet_payment",
          },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
    );

    // 90 earned − 90 provider clawback = 0 (NOT −75 from also subtracting fee+commission+wallet).
    expect(result.rawBalance).toBe(0);
  });

  it("legacy/manual whole-refund rows (no refund_component) still fully claw back", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("b1", 100),
          {
            provider_id: providerId,
            transaction_type: "refund",
            amount: -40,
            net: -40,
            booking_id: "b1",
            created_at: T,
            // no refund_component → legacy/manual → full clawback
          },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(60);
  });

  it("excludes service_fee (customer-paid platform-fee revenue) from provider payout balance", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("b1", 100),
          {
            provider_id: providerId,
            transaction_type: "service_fee",
            amount: 25,
            net: 25,
            booking_id: "b1",
            created_at: T,
          },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(100);
  });

  it("includes tips, travel, and cancellation fees as platform-held payoutable pass-throughs", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("b1", 100),
          {
            provider_id: providerId,
            transaction_type: "tip",
            amount: 30,
            net: 30,
            booking_id: "b1",
            created_at: T,
          },
          {
            provider_id: providerId,
            transaction_type: "travel_fee",
            amount: 40,
            net: 40,
            booking_id: "b1",
            created_at: T,
          },
          {
            provider_id: providerId,
            transaction_type: "cancellation_fee",
            amount: 50,
            net: 50,
            booking_id: "b2",
            created_at: T,
          },
        ],
        bookings: [
          { id: "b1", booking_source: "online" },
          { id: "b2", booking_source: "online" },
        ],
        booking_payments: [
          { booking_id: "b1", payment_provider: "paystack", status: "completed" },
          { booking_id: "b2", payment_provider: "paystack", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(220);
  });

  it("excludes walk-in cash/EFT/Yoco/manual tip and travel rows even if recorded on those bookings", async () => {
    /** Tips/travel on walk-in non-Paystack bookings are still provider-collected
     *  (they're part of the cash drawer). Excluding them here matches end-of-day:
     *  cash register, not platform-payoutable.
     */
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          {
            provider_id: providerId,
            transaction_type: "tip",
            amount: 30,
            net: 30,
            booking_id: "walk-cash",
            created_at: T,
          },
          {
            provider_id: providerId,
            transaction_type: "travel_fee",
            amount: 20,
            net: 20,
            booking_id: "walk-eft",
            created_at: T,
          },
        ],
        bookings: [
          { id: "walk-cash", booking_source: "walk_in" },
          { id: "walk-eft", booking_source: "walk_in" },
        ],
        booking_payments: [
          { booking_id: "walk-cash", payment_provider: "cash", status: "completed" },
          { booking_id: "walk-eft", payment_provider: "bank_transfer", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    expect(result.rawBalance).toBe(0);
  });

  it("rounds to 2dp so UI and POST validation never disagree on fractional cents", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("b1", 50.123456),
          earnings("b2", 25.005),
        ],
        bookings: [
          { id: "b1", booking_source: "online" },
          { id: "b2", booking_source: "online" },
        ],
        booking_payments: [
          { booking_id: "b1", payment_provider: "paystack", status: "completed" },
          { booking_id: "b2", payment_provider: "paystack", status: "completed" },
        ],
        payouts: [],
      }),
      providerId,
    );

    /** 50.123456 + 25.005 = 75.128456 → round2 = 75.13. */
    expect(result.rawBalance).toBe(75.13);
    expect(result.availableBalance).toBe(75.13);
    expect(result.hasNegativeBalance).toBe(false);
  });

  it("only treats negatives below the 1c tolerance as negative balances (drift gate)", async () => {
    const result = await getAvailablePayoutBalance(
      mockSupabase({
        finance_transactions: [
          earnings("b1", 100),
          {
            provider_id: providerId,
            transaction_type: "refund",
            amount: -100.005,
            net: -100.005,
            booking_id: "b1",
            created_at: T,
          },
        ],
        bookings: [{ id: "b1", booking_source: "online" }],
        booking_payments: [{ booking_id: "b1", payment_provider: "paystack", status: "completed" }],
        payouts: [],
      }),
      providerId,
    );

    /** -0.005 floats to 0 (or -0) after round2; safe band, not flagged as negative. */
    expect(Math.abs(result.rawBalance)).toBe(0);
    expect(result.hasNegativeBalance).toBe(false);
  });
});

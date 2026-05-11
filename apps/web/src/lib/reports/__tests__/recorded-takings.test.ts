/**
 * Tests for `getRecordedTakingsForRange` — the cash-register / end-of-day helper
 * used by `/api/provider/reports/end-of-day` and the related range exports.
 *
 * Semantics under test:
 * - Each paid `booking_payments` row inside the range counts under its method bucket.
 * - Wallet portions are added per booking only when not already represented by a
 *   matching `booking_payments` row in the same range (split-safe).
 * - Walk-in `product_orders` and legacy `sales` rows are summed into salesTotal
 *   under their declared payment method.
 * - Tips and cancellation fees come from `finance_transactions` with the same range.
 * - Provider/location filters are honored (bookings outside provider scope ignored).
 * - Method labels are normalized (`credit_card` -> `card`, unknown -> `other`).
 */
import { describe, expect, it } from "vitest";
import {
  getRecordedTakingsForRange,
  normalizeRecordedPaymentMethod,
} from "../recorded-takings";

type Row = Record<string, unknown>;

class FakeQuery {
  private filters: Array<{ op: string; key: string; value: unknown }> = [];

  constructor(private readonly table: string, private readonly db: Record<string, Row[]>) {}

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
  gt(key: string, value: unknown) {
    this.filters.push({ op: "gt", key, value });
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
  is(key: string, value: unknown) {
    this.filters.push({ op: "is", key, value });
    return this;
  }
  order() {
    return this;
  }
  maybeSingle() {
    const rows = this.evalRows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }
  single() {
    const rows = this.evalRows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  private evalRows(): Row[] {
    return (this.db[this.table] ?? []).filter((row) =>
      this.filters.every((f) => {
        const v = row[f.key];
        switch (f.op) {
          case "eq":
            return v === f.value;
          case "in":
            return (f.value as unknown[]).includes(v);
          case "gt":
            return Number(v ?? 0) > Number(f.value ?? 0);
          case "gte":
            return String(v ?? "") >= String(f.value ?? "");
          case "lte":
            return String(v ?? "") <= String(f.value ?? "");
          case "is":
            return f.value === null ? v == null : v === f.value;
          default:
            return true;
        }
      }),
    );
  }

  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    try {
      const data = this.evalRows();
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(undefined, onrejected);
    }
  }
}

function mockSupabase(db: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new FakeQuery(table, db);
    },
  } as never;
}

const providerId = "provider-1";
const tenantId = "tenant-1";
const start = "2026-04-01T00:00:00.000Z";
const end = "2026-04-01T23:59:59.999Z";
const inRange = "2026-04-01T10:00:00.000Z";

function providerRow() {
  return { id: providerId, tenant_id: tenantId };
}

describe("normalizeRecordedPaymentMethod", () => {
  it("maps known methods to canonical buckets", () => {
    expect(normalizeRecordedPaymentMethod("cash")).toBe("cash");
    expect(normalizeRecordedPaymentMethod("CARD")).toBe("card");
    expect(normalizeRecordedPaymentMethod("credit_card")).toBe("card");
    expect(normalizeRecordedPaymentMethod("debit_card")).toBe("card");
    expect(normalizeRecordedPaymentMethod("bank_transfer")).toBe("bank_transfer");
    expect(normalizeRecordedPaymentMethod("yoco")).toBe("yoco");
    expect(normalizeRecordedPaymentMethod("paystack")).toBe("paystack");
    expect(normalizeRecordedPaymentMethod("wallet_credit")).toBe("wallet");
    expect(normalizeRecordedPaymentMethod("wallet_payment")).toBe("wallet");
    expect(normalizeRecordedPaymentMethod("gift_card")).toBe("gift_card");
    expect(normalizeRecordedPaymentMethod(null)).toBe("other");
    expect(normalizeRecordedPaymentMethod("crypto")).toBe("other");
  });
});

describe("getRecordedTakingsForRange", () => {
  it("aggregates per-method booking payments inside the range and only for the provider", () => {
    const result = getRecordedTakingsForRange(
      mockSupabase({
        providers: [providerRow()],
        booking_payments: [
          { booking_id: "b-mine-1", amount: 100, payment_method: "cash", status: "completed", created_at: inRange, tenant_id: tenantId },
          { booking_id: "b-mine-1", amount: 50, payment_method: "card", status: "completed", created_at: inRange, tenant_id: tenantId },
          { booking_id: "b-mine-1", amount: 25, payment_method: "card", status: "partially_refunded", created_at: inRange, tenant_id: tenantId },
          { booking_id: "b-other-prov", amount: 999, payment_method: "card", status: "completed", created_at: inRange, tenant_id: tenantId },
          /** Out-of-range row should be ignored. */
          { booking_id: "b-mine-1", amount: 200, payment_method: "cash", status: "completed", created_at: "2026-03-31T00:00:00.000Z", tenant_id: tenantId },
        ],
        bookings: [
          { id: "b-mine-1", provider_id: providerId, location_id: null },
          { id: "b-other-prov", provider_id: "other-provider", location_id: null },
        ],
        product_orders: [],
        sales: [],
        finance_transactions: [],
      }),
      { providerId, rangeStartIso: start, rangeEndIso: end },
    );

    return result.then((r) => {
      expect(r.bookingPaymentsTotal).toBe(175);
      expect(r.byPaymentMethod.cash).toBe(100);
      expect(r.byPaymentMethod.card).toBe(75);
      /** Other-provider booking is silently dropped. */
      expect(r.bookingCount).toBe(1);
    });
  });

  it("split-safe: does not double-count wallet share already represented by a wallet booking_payments row", async () => {
    const r = await getRecordedTakingsForRange(
      mockSupabase({
        providers: [providerRow()],
        booking_payments: [
          /** Migration 582 synthetic wallet row in same range — wallet bucket already counted. */
          { booking_id: "b-split", amount: 50, payment_method: "wallet", status: "completed", created_at: inRange, tenant_id: tenantId },
          { booking_id: "b-split", amount: 50, payment_method: "card", status: "completed", created_at: inRange, tenant_id: tenantId },
        ],
        bookings: [
          {
            id: "b-split",
            provider_id: providerId,
            location_id: null,
            wallet_amount: 50,
            total_paid: 100,
            total_amount: 100,
            payment_status: "paid",
            scheduled_at: inRange,
          },
        ],
        product_orders: [],
        sales: [],
        finance_transactions: [],
      }),
      { providerId, rangeStartIso: start, rangeEndIso: end },
    );

    expect(r.bookingPaymentsTotal).toBe(100);
    expect(r.byPaymentMethod.wallet).toBe(50);
    expect(r.byPaymentMethod.card).toBe(50);
    /** Wallet is NOT double-added because bpSum already covers wallet+card = collected. */
    expect(r.walletTotal).toBe(0);
  });

  it("legacy wallet-paid booking with no wallet booking_payments row still falls into wallet bucket", async () => {
    const r = await getRecordedTakingsForRange(
      mockSupabase({
        providers: [providerRow()],
        /** No booking_payments rows for this legacy booking. */
        booking_payments: [],
        bookings: [
          {
            id: "legacy",
            provider_id: providerId,
            location_id: null,
            wallet_amount: 80,
            total_paid: 0,
            total_amount: 80,
            payment_status: "paid",
            scheduled_at: inRange,
          },
        ],
        product_orders: [],
        sales: [],
        finance_transactions: [],
      }),
      { providerId, rangeStartIso: start, rangeEndIso: end },
    );

    expect(r.walletTotal).toBe(80);
    expect(r.byPaymentMethod.wallet).toBe(80);
    expect(r.bookingCount).toBe(1);
  });

  it("legacy partially-refunded wallet booking still reports original wallet takings", async () => {
    const r = await getRecordedTakingsForRange(
      mockSupabase({
        providers: [providerRow()],
        booking_payments: [],
        bookings: [
          {
            id: "legacy-refunded",
            provider_id: providerId,
            location_id: null,
            wallet_amount: 80,
            total_paid: 0,
            total_amount: 80,
            payment_status: "partially_refunded",
            scheduled_at: inRange,
          },
        ],
        product_orders: [],
        sales: [],
        finance_transactions: [],
      }),
      { providerId, rangeStartIso: start, rangeEndIso: end },
    );

    expect(r.walletTotal).toBe(80);
    expect(r.byPaymentMethod.wallet).toBe(80);
  });

  it("includes walk-in product orders paid in range under their payment method", async () => {
    const r = await getRecordedTakingsForRange(
      mockSupabase({
        providers: [providerRow()],
        booking_payments: [],
        bookings: [],
        product_orders: [
          {
            id: "walk-order-1",
            provider_id: providerId,
            order_source: "walk_in",
            payment_status: "paid",
            paid_at: inRange,
            total_amount: 130,
            payment_method: "cash",
            tenant_id: tenantId,
            collection_location_id: null,
            fulfillment_type: null,
          },
          /** Online order not eligible. */
          {
            id: "online-order",
            provider_id: providerId,
            order_source: "online",
            payment_status: "paid",
            paid_at: inRange,
            total_amount: 999,
            payment_method: "paystack",
            tenant_id: tenantId,
          },
        ],
        sales: [],
        finance_transactions: [],
      }),
      { providerId, rangeStartIso: start, rangeEndIso: end },
    );

    expect(r.salesTotal).toBe(130);
    expect(r.salesCount).toBe(1);
    expect(r.byPaymentMethod.cash).toBe(130);
  });

  it("attributes tips and cancellation fees from finance_transactions in range", async () => {
    const r = await getRecordedTakingsForRange(
      mockSupabase({
        providers: [providerRow()],
        booking_payments: [],
        bookings: [],
        product_orders: [],
        sales: [],
        finance_transactions: [
          { provider_id: providerId, transaction_type: "tip", amount: 25, net: 25, created_at: inRange },
          { provider_id: providerId, transaction_type: "cancellation_fee", amount: 50, net: 50, created_at: inRange },
        ],
      }),
      { providerId, rangeStartIso: start, rangeEndIso: end },
    );

    expect(r.tipsTotal).toBe(25);
    expect(r.cancellationFeesTotal).toBe(50);
    expect(r.totalRecorded).toBe(75);
  });

  it("totalRecorded equals booking + wallet + sales + tips + cancellation_fee", async () => {
    const r = await getRecordedTakingsForRange(
      mockSupabase({
        providers: [providerRow()],
        booking_payments: [
          { booking_id: "b1", amount: 100, payment_method: "card", status: "completed", created_at: inRange, tenant_id: tenantId },
        ],
        bookings: [
          { id: "b1", provider_id: providerId, location_id: null },
          {
            id: "legacy-wallet",
            provider_id: providerId,
            location_id: null,
            wallet_amount: 40,
            total_paid: 0,
            total_amount: 40,
            payment_status: "paid",
            scheduled_at: inRange,
          },
        ],
        product_orders: [
          {
            id: "walk-order",
            provider_id: providerId,
            order_source: "walk_in",
            payment_status: "paid",
            paid_at: inRange,
            total_amount: 30,
            payment_method: "cash",
            tenant_id: tenantId,
          },
        ],
        sales: [
          { provider_id: providerId, payment_status: "completed", sale_date: inRange, total_amount: 20, payment_method: "yoco" },
        ],
        finance_transactions: [
          { provider_id: providerId, transaction_type: "tip", amount: 10, net: 10, created_at: inRange },
          { provider_id: providerId, transaction_type: "cancellation_fee", amount: 5, net: 5, created_at: inRange },
        ],
      }),
      { providerId, rangeStartIso: start, rangeEndIso: end },
    );

    /** 100 (card bp) + 40 (wallet legacy) + (30 walk-in + 20 sales) + 10 tip + 5 cancel = 205. */
    expect(r.bookingPaymentsTotal).toBe(100);
    expect(r.walletTotal).toBe(40);
    expect(r.salesTotal).toBe(50);
    expect(r.tipsTotal).toBe(10);
    expect(r.cancellationFeesTotal).toBe(5);
    expect(r.totalRecorded).toBe(205);
  });

  it("normalizes unknown payment methods into the 'other' bucket", async () => {
    const r = await getRecordedTakingsForRange(
      mockSupabase({
        providers: [providerRow()],
        booking_payments: [
          { booking_id: "b1", amount: 75, payment_method: "voucher_code", status: "completed", created_at: inRange, tenant_id: tenantId },
        ],
        bookings: [{ id: "b1", provider_id: providerId, location_id: null }],
        product_orders: [],
        sales: [],
        finance_transactions: [],
      }),
      { providerId, rangeStartIso: start, rangeEndIso: end },
    );

    expect(r.byPaymentMethod.other).toBe(75);
  });
});

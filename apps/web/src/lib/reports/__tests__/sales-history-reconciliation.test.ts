/**
 * Reconciliation coverage for provider sales history.
 *
 * Guards the invariant that a booking row's gross_total (= bookings.total_amount)
 * reconciles against the ledger-derived breakdown:
 *
 *   gross_total === provider_net + commission + platform_fee + tax + discount_contra (no refund)
 *
 * The 2026-06 audit fix added `walk_in_additional_charge` to `provider_net` and
 * `additional_charge_payment` commission to `commission`, because the walk-in
 * settlement RPC bumps total_amount (gross) without posting provider_earnings.
 * Before the fix, gross rose while provider_net did not — these scenarios fail
 * loudly if that regression ever returns.
 */
import { describe, it, expect } from "vitest";
import {
  buildProviderSalesHistoryRows,
  salesHistoryTotals,
  type SalesHistoryRow,
} from "../provider-sales-history";

type Row = Record<string, unknown>;

class Query {
  private filters: Array<{ op: "eq" | "in" | "gte" | "lte"; key: string; value: unknown }> = [];
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;

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
  or() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  private compute(): Row[] {
    let data = (this.rowsByTable[this.table] ?? []).filter((row) =>
      this.filters.every((f) => {
        if (f.op === "eq") return row[f.key] === f.value;
        if (f.op === "in") return (f.value as unknown[]).includes(row[f.key]);
        if (f.op === "gte") return String(row[f.key] ?? "") >= String(f.value ?? "");
        if (f.op === "lte") return String(row[f.key] ?? "") <= String(f.value ?? "");
        return true;
      }),
    );
    if (this.rangeStart != null && this.rangeEnd != null) {
      data = data.slice(this.rangeStart, this.rangeEnd + 1);
    }
    return data;
  }

  maybeSingle() {
    const data = this.compute();
    return Promise.resolve({ data: data[0] ?? null, error: null });
  }
  single() {
    const data = this.compute();
    return Promise.resolve({ data: data[0] ?? null, error: null });
  }
  then<T1 = { data: Row[]; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve({ data: this.compute(), error: null }).then(onfulfilled, onrejected);
  }
}

function mockSupabase(rowsByTable: Record<string, Row[]>) {
  return {
    from(table: string) {
      return new Query(table, rowsByTable);
    },
  } as never;
}

const providerId = "prov-1";
const T = "2026-06-01T10:00:00.000Z";

function ft(bookingId: string, type: string, fields: Partial<Row> = {}): Row {
  return {
    provider_id: providerId,
    booking_id: bookingId,
    product_order_id: null,
    transaction_type: type,
    amount: 0,
    net: 0,
    commission: 0,
    created_at: T,
    ...fields,
  };
}

function booking(id: string, totalAmount: number, extra: Partial<Row> = {}): Row {
  return {
    id,
    provider_id: providerId,
    booking_number: id.toUpperCase(),
    customer_id: "cust-1",
    guest_name: null,
    total_amount: totalAmount,
    currency: "ZAR",
    payment_status: "paid",
    location_id: null,
    custom_offer_id: null,
    is_group_booking: false,
    group_booking_id: null,
    created_at: T,
    updated_at: T,
    ...extra,
  };
}

async function run(rowsByTable: Record<string, Row[]>): Promise<SalesHistoryRow[]> {
  const { rows } = await buildProviderSalesHistoryRows({
    db: mockSupabase(rowsByTable),
    providerId,
    timezone: "Africa/Johannesburg",
    dateFromYmd: "2026-01-01",
    dateToYmd: "2026-12-31",
    locationId: null,
    source: "booking",
  });
  return rows;
}

const usersTable: Row[] = [{ id: "cust-1", full_name: "Test Customer" }];

describe("provider sales history — gross vs provider_net reconciliation", () => {
  it("online booking: gross = provider_net + commission + tax", async () => {
    const rows = await run({
      users: usersTable,
      bookings: [booking("b-online", 115)],
      finance_transactions: [
        ft("b-online", "payment", { amount: 100, commission: 10, net: 10 }),
        ft("b-online", "provider_earnings", { amount: 90, net: 90 }),
        ft("b-online", "tax", { amount: 15, net: 0 }),
      ],
    });
    const r = rows.find((x) => x.id === "b-online")!;
    expect(r).toBeDefined();
    expect(r.gross_total).toBe(115);
    expect(r.provider_net).toBe(90);
    expect(r.commission).toBe(10);
    expect(r.tax).toBe(15);
    expect(r.discount_contra).toBe(0);
    expect(r.provider_net + r.commission + r.platform_fee + r.tax + r.discount_contra).toBe(
      r.gross_total,
    );
  });

  it("membership discount contra reconciles pre-discount gross (migration 656 shape)", async () => {
    const rows = await run({
      users: usersTable,
      bookings: [booking("b-mem", 100)],
      finance_transactions: [
        ft("b-mem", "provider_earnings", { amount: 80, net: 80 }),
        ft("b-mem", "membership_discount", { amount: 20, net: -20 }),
      ],
    });
    const r = rows.find((x) => x.id === "b-mem")!;
    expect(r.gross_total).toBe(100);
    expect(r.provider_net).toBe(80);
    expect(r.discount_contra).toBe(20);
    expect(r.provider_net + r.discount_contra).toBe(r.gross_total);
  });

  it("walk-in cash additional charge flows into provider_net so gross reconciles", async () => {
    const rows = await run({
      users: usersTable,
      // RPC bumped total_amount by the 50 add-on; ledger posted only walk_in_additional_charge.
      bookings: [booking("b-walkin", 50)],
      finance_transactions: [
        ft("b-walkin", "walk_in_additional_charge", { amount: 50, net: 50 }),
      ],
    });
    const r = rows.find((x) => x.id === "b-walkin")!;
    expect(r.gross_total).toBe(50);
    // Regression guard: before the fix this was 0 and gross != net.
    expect(r.provider_net).toBe(50);
    expect(r.provider_net + r.commission + r.platform_fee + r.tax + r.discount_contra).toBe(
      r.gross_total,
    );
  });

  it("custom offer + online add-on: provider_earnings(base+addon) + addon commission reconcile", async () => {
    const rows = await run({
      users: usersTable,
      bookings: [booking("b-custom", 200, { custom_offer_id: "co-1" })],
      finance_transactions: [
        ft("b-custom", "payment", { amount: 150, commission: 15, net: 15 }),
        ft("b-custom", "provider_earnings", { amount: 135, net: 135 }),
        ft("b-custom", "additional_charge_payment", { amount: 45, commission: 5, net: 5 }),
        ft("b-custom", "provider_earnings", { amount: 45, net: 45 }),
      ],
    });
    const r = rows.find((x) => x.id === "b-custom")!;
    expect(r.subtype).toBe("custom");
    expect(r.gross_total).toBe(200);
    expect(r.provider_net).toBe(180);
    expect(r.commission).toBe(20);
    expect(r.provider_net + r.commission + r.platform_fee + r.tax).toBe(r.gross_total);
  });

  it("refund reduces provider_net via the refund clawback", async () => {
    const rows = await run({
      users: usersTable,
      bookings: [booking("b-refund", 100)],
      finance_transactions: [
        ft("b-refund", "provider_earnings", { amount: 90, net: 90 }),
        ft("b-refund", "payment", { amount: 100, commission: 10, net: 10 }),
        // Legacy/manual whole-refund row (no refund_component) → full provider clawback.
        ft("b-refund", "refund", { amount: -90, net: -90 }),
      ],
    });
    const r = rows.find((x) => x.id === "b-refund")!;
    expect(r.refunds).toBe(90);
    expect(r.provider_net).toBe(0); // 90 earned − 90 clawed back
  });

  it("multi-component refund only deducts the provider's share from provider_net", async () => {
    // Full refund of a 115 online booking (pe 90, commission 10, platform_fee 15, tax 0).
    // The 654 trigger splits the refund into per-component rows; only the provider's
    // own components (provider_earnings/tip/travel/cancellation/walk-in) reduce
    // provider_net. Platform fee/commission, tax, discount + tender legs must NOT.
    const rows = await run({
      users: usersTable,
      bookings: [booking("b-multi", 115)],
      finance_transactions: [
        ft("b-multi", "provider_earnings", { amount: 90, net: 90 }),
        ft("b-multi", "payment", { amount: 100, commission: 10, net: 10 }),
        ft("b-multi", "platform_fee", { amount: 15, net: 15 }),
        ft("b-multi", "tax", { amount: 0, net: 0 }),
        // Component refund rows (all transaction_type 'refund', tagged by refund_component):
        ft("b-multi", "refund", { amount: 90, net: -90, refund_component: "provider_earnings" }),
        ft("b-multi", "refund", { amount: 15, net: -15, refund_component: "platform_fee" }),
        ft("b-multi", "refund", { amount: 10, net: -10, refund_component: "payment", commission: -10 }),
        ft("b-multi", "refund", { amount: 0, net: 0, refund_component: "tax" }),
      ],
    });
    const r = rows.find((x) => x.id === "b-multi")!;
    // Only the provider_earnings component (90) counts; not platform_fee/commission.
    expect(r.refunds).toBe(90);
    expect(r.provider_net).toBe(0); // 90 earned − 90 provider clawback (NOT −115)
  });

  it("refund of a discounted/wallet-split booking ignores discount + tender refund legs", async () => {
    const rows = await run({
      users: usersTable,
      bookings: [booking("b-disc", 80)],
      finance_transactions: [
        ft("b-disc", "provider_earnings", { amount: 80, net: 80 }),
        ft("b-disc", "promotion_discount", { amount: 20, net: -20 }),
        // Refund split: provider take clawed back + parallel discount/tender reversals
        // that are NOT the provider's loss.
        ft("b-disc", "refund", { amount: 80, net: -80, refund_component: "provider_earnings" }),
        ft("b-disc", "refund", { amount: 20, net: 20, refund_component: "promotion_discount" }),
        ft("b-disc", "refund", { amount: 50, net: -50, refund_component: "wallet_payment" }),
        ft("b-disc", "refund", { amount: 30, net: -30, refund_component: "gift_card_payment" }),
      ],
    });
    const r = rows.find((x) => x.id === "b-disc")!;
    expect(r.refunds).toBe(80); // only provider_earnings component
    expect(r.provider_net).toBe(0); // 80 − 80
  });

  it("walk-in add-on refund still reduces provider_net (provider-collected revenue)", async () => {
    const rows = await run({
      users: usersTable,
      bookings: [booking("b-walkref", 50)],
      finance_transactions: [
        ft("b-walkref", "walk_in_additional_charge", { amount: 50, net: 50 }),
        ft("b-walkref", "refund", { amount: 50, net: -50, refund_component: "walk_in_additional_charge" }),
      ],
    });
    const r = rows.find((x) => x.id === "b-walkref")!;
    expect(r.refunds).toBe(50);
    expect(r.provider_net).toBe(0);
  });

  it("salesHistoryTotals sums per-row gross and provider_net consistently", async () => {
    const rows = await run({
      users: usersTable,
      bookings: [booking("b1", 115), booking("b2", 50)],
      finance_transactions: [
        ft("b1", "provider_earnings", { amount: 90, net: 90 }),
        ft("b1", "payment", { amount: 100, commission: 10, net: 10 }),
        ft("b1", "tax", { amount: 15, net: 0 }),
        ft("b2", "walk_in_additional_charge", { amount: 50, net: 50 }),
      ],
    });
    const totals = salesHistoryTotals(rows);
    expect(totals.total_gross).toBe(165);
    expect(totals.total_provider_net).toBe(140); // 90 + 50
    expect(totals.total_commission).toBe(10);
  });
});

/**
 * Unit tests for recordPaystackBookingSettlement and commissionMode.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { recordPaystackBookingSettlement } from "../record-paystack-booking-settlement";
import { recordBookingOnlineChargeLedger } from "../record-booking-online-charge-ledger";

vi.mock("../record-booking-paystack-payment", () => ({
  recordBookingPaystackPayment: vi.fn(async () => ({
    ok: true,
    paymentProviderId: "ref-1",
    inserted: true,
    bookingPaymentId: "bp-1",
  })),
}));

vi.mock("@/lib/payments/resolve-paystack-fee", () => ({
  resolvePaystackFeeMajor: vi.fn(async () => ({ feesMajor: 3.5, feeSource: "paystack" as const })),
}));

vi.mock("../record-booking-online-charge-ledger", () => ({
  recordBookingOnlineChargeLedger: vi.fn(async () => ({
    ok: true,
    skipped: false,
    isSecondCharge: false,
  })),
}));

describe("recordPaystackBookingSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never throws on unexpected errors", async () => {
    vi.mocked(recordBookingOnlineChargeLedger).mockRejectedValueOnce(new Error("db down"));
    const supabase = {} as never;
    const result = await recordPaystackBookingSettlement(supabase, {
      bookingId: "b1",
      reference: "ref-1",
      amountMajor: 100,
      bookingPaymentId: "bp-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unexpected_error");
    }
  });

  it("calls ledger with sourcePaymentId and commissionMode", async () => {
    const supabase = {} as never;
    const result = await recordPaystackBookingSettlement(supabase, {
      bookingId: "b1",
      reference: "ref-1",
      amountMajor: 208,
      feesSmallestOrMajor: 600,
      bookingPaymentId: "bp-1",
      isDeposit: false,
      commissionMode: "provider_collected",
    });
    expect(result.ok).toBe(true);
    expect(recordBookingOnlineChargeLedger).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        sourcePaymentId: "bp-1",
        commissionMode: "provider_collected",
        feesMajor: 3.5,
      }),
    );
  });
});

describe("recordBookingOnlineChargeLedger commissionMode", () => {
  it("exports CommissionMode type via provider_collected path", () => {
    expect(typeof recordBookingOnlineChargeLedger).toBe("function");
  });
});

// ─── Real writer fixture (bypasses the module mock above) ─────────────────────

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

// Platform settings say 10% — provider_collected must ignore this and post 0.
vi.mock("@/lib/finance/resolve-commission-percentage", () => ({
  resolveCommissionPercentageForProvider: vi.fn(async () => 10),
}));

type Row = Record<string, unknown>;

function makeLedgerSupabase(booking: Row) {
  const stores: Record<string, Row[]> = {
    bookings: [booking],
    payment_transactions: [],
    finance_transactions: [],
    booking_payments: [],
  };
  const inserts: Record<string, Row[]> = { payment_transactions: [], finance_transactions: [] };

  type Filter =
    | { op: "eq"; col: string; val: unknown }
    | { op: "in"; col: string; vals: unknown[] }
    | { op: "ilike"; col: string; pattern: string };

  class Query {
    constructor(
      private table: string,
      private filters: Filter[] = [],
    ) {}
    select() {
      return this;
    }
    eq(col: string, val: unknown) {
      return new Query(this.table, [...this.filters, { op: "eq", col, val }]);
    }
    in(col: string, vals: unknown[]) {
      return new Query(this.table, [...this.filters, { op: "in", col, vals }]);
    }
    ilike(col: string, pattern: string) {
      return new Query(this.table, [...this.filters, { op: "ilike", col, pattern }]);
    }
    private match(): Row[] {
      let rows = [...(stores[this.table] ?? [])];
      for (const f of this.filters) {
        if (f.op === "eq") rows = rows.filter((r) => r[f.col] === f.val);
        else if (f.op === "in") rows = rows.filter((r) => f.vals.includes(r[f.col]));
        else rows = rows.filter((r) => String(r[f.col] ?? "").includes(f.pattern.replace(/%/g, "")));
      }
      return rows;
    }
    async maybeSingle() {
      return { data: this.match()[0] ?? null, error: null };
    }
    then(resolve: (value: { data: Row[]; error: null }) => void) {
      resolve({ data: this.match(), error: null });
    }
  }

  const supabase = {
    from: (table: string) => ({
      select: () => new Query(table),
      insert: (payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          const stored = { id: `${table}-${stores[table]?.length ?? 0}`, ...row };
          stores[table]?.push(stored);
          inserts[table]?.push(stored);
        }
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  };
  return { supabase, inserts };
}

const terminalBooking: Row = {
  id: "booking-terminal",
  booking_number: "BTN-TERM-1",
  provider_id: "provider-1",
  tenant_id: "tenant-1",
  currency: "NGN",
  total_amount: 208,
  tip_amount: 0,
  tax_amount: 0,
  travel_fee: 0,
  platform_fee_amount: 0,
  service_fee_amount: 0,
  platform_service_fee: 0,
  promotion_discount_amount: 0,
  membership_discount_amount: 0,
  loyalty_discount_amount: 0,
};

describe("recordBookingOnlineChargeLedger (real writer) commissionMode fixture", () => {
  async function loadRealWriter() {
    const actual = await vi.importActual<typeof import("../record-booking-online-charge-ledger")>(
      "../record-booking-online-charge-ledger",
    );
    return actual.recordBookingOnlineChargeLedger;
  }

  it("provider_collected posts commission 0, full amount to provider earnings, and passes currency through", async () => {
    const realWriter = await loadRealWriter();
    const { supabase, inserts } = makeLedgerSupabase(terminalBooking);

    const result = await realWriter(supabase as any, {
      bookingId: "booking-terminal",
      reference: "term-ref-1",
      provider: "paystack",
      amountMajor: 208,
      feesMajor: 6,
      sourcePaymentId: "bp-terminal",
      commissionMode: "provider_collected",
      feeSource: "paystack_terminal",
    });

    expect(result).toEqual({ ok: true, skipped: false, isSecondCharge: false });

    const payment = inserts.finance_transactions.find((r) => r.transaction_type === "payment");
    const earnings = inserts.finance_transactions.find((r) => r.transaction_type === "provider_earnings");
    expect(payment).toMatchObject({
      amount: 208,
      fees: 6,
      commission: 0,
      net: 0,
      currency: "NGN",
      source_payment_id: "bp-terminal",
    });
    expect(earnings).toMatchObject({ amount: 208, net: 208, currency: "NGN", source_payment_id: "bp-terminal" });
    expect(inserts.payment_transactions[0]).toMatchObject({
      currency: "NGN",
      fees: 6,
      net_amount: 202,
      metadata: expect.objectContaining({ fee_source: "paystack_terminal" }),
    });
    for (const row of inserts.finance_transactions) {
      expect(row.currency).toBe("NGN");
    }
  });

  it("platform_settings (default) takes the configured commission on the same booking", async () => {
    const realWriter = await loadRealWriter();
    const { supabase, inserts } = makeLedgerSupabase(terminalBooking);

    await realWriter(supabase as any, {
      bookingId: "booking-terminal",
      reference: "online-ref-1",
      provider: "paystack",
      amountMajor: 208,
      feesMajor: 6,
      sourcePaymentId: "bp-online",
    });

    const payment = inserts.finance_transactions.find((r) => r.transaction_type === "payment");
    const earnings = inserts.finance_transactions.find((r) => r.transaction_type === "provider_earnings");
    expect(payment).toMatchObject({ amount: 208, commission: 20.8, net: 20.8, currency: "NGN" });
    expect(earnings).toMatchObject({ amount: 187.2, net: 187.2 });
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { recordBookingOnlineChargeLedger } from "../record-booking-online-charge-ledger";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/finance/resolve-commission-percentage", () => ({
  resolveCommissionPercentageForProvider: vi.fn(async () => 10),
}));

type Row = Record<string, unknown>;

type LedgerScenario = {
  booking?: Row;
  paymentTransactions?: Row[];
  financeTransactions?: Row[];
  bookingPayments?: Row[];
  paymentTxInsertError?: { code: string; message?: string } | null;
};

function normalizeRows(rows: Row[]) {
  return rows.map((row) => {
    const copy = { ...row };
    delete copy.created_at;
    delete copy.id;
    return copy;
  });
}

function makeLedgerSupabase(scenario: LedgerScenario = {}) {
  const stores: Record<string, Row[]> = {
    bookings: scenario.booking ? [scenario.booking] : [],
    payment_transactions: [...(scenario.paymentTransactions ?? [])],
    finance_transactions: [...(scenario.financeTransactions ?? [])],
    booking_payments: [...(scenario.bookingPayments ?? [])],
  };

  const inserts: Record<string, Row[]> = {
    payment_transactions: [],
    finance_transactions: [],
  };

  type Filter =
    | { op: "eq"; col: string; val: unknown }
    | { op: "in"; col: string; vals: unknown[] }
    | { op: "ilike"; col: string; pattern: string };

  class Query {
    constructor(
      private table: string,
      private filters: Filter[] = [],
    ) {}

    select(_cols?: string) {
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
      for (const filter of this.filters) {
        if (filter.op === "eq") {
          rows = rows.filter((row) => row[filter.col] === filter.val);
        } else if (filter.op === "in") {
          rows = rows.filter((row) => filter.vals.includes(row[filter.col]));
        } else if (filter.op === "ilike") {
          const needle = filter.pattern.replace(/%/g, "");
          rows = rows.filter((row) => String(row[filter.col] ?? "").includes(needle));
        }
      }
      return rows;
    }

    async maybeSingle() {
      const rows = this.match();
      return { data: rows[0] ?? null, error: null };
    }

    then(resolve: (value: { data: Row[]; error: null }) => void) {
      resolve({ data: this.match(), error: null });
    }
  }

  const supabase = {
    from: (table: string) => ({
      select: (_cols?: string) => new Query(table),
      insert: (payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        if (table === "payment_transactions" && scenario.paymentTxInsertError) {
          return Promise.resolve({ data: null, error: scenario.paymentTxInsertError });
        }
        for (const row of rows) {
          const stored = { id: `${table}-${stores[table]?.length ?? 0}`, ...row };
          stores[table]?.push(stored);
          inserts[table]?.push(stored);
        }
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  };

  return { supabase, stores, inserts };
}

const defaultBooking: Row = {
  id: "booking-1",
  booking_number: "BK-1001",
  provider_id: "provider-1",
  tenant_id: "tenant-1",
  total_amount: 208,
  tip_amount: 10,
  tax_amount: 0,
  travel_fee: 120,
  platform_fee_amount: 18,
  service_fee_amount: 0,
  platform_service_fee: 0,
  promotion_discount_amount: 0,
  membership_discount_amount: 0,
  loyalty_discount_amount: 0,
};

describe("recordBookingOnlineChargeLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts first full charge with booking-level legs and shared audit style defaults", async () => {
    const { supabase, inserts } = makeLedgerSupabase({ booking: defaultBooking });

    const result = await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-full",
      provider: "stripe",
      amountMajor: 208,
      feesMajor: 0,
      sourcePaymentId: "bp-1",
    });

    expect(result).toEqual({ ok: true, skipped: false, isSecondCharge: false });
    expect(normalizeRows(inserts.payment_transactions)).toEqual([
      {
        booking_id: "booking-1",
        reference: "ref-full",
        amount: 208,
        fees: 0,
        net_amount: 208,
        status: "success",
        provider: "stripe",
        metadata: {
          fee_source: "stripe_webhook",
          customer_email: null,
        },
      },
    ]);
    const financeTypes = normalizeRows(inserts.finance_transactions).map((r) => r.transaction_type);
    expect(financeTypes).toEqual(
      expect.arrayContaining([
        "payment",
        "provider_earnings",
        "platform_fee",
        "tip",
        "travel_fee",
      ]),
    );
    expect(
      normalizeRows(inserts.finance_transactions).find((r) => r.transaction_type === "payment"),
    ).toMatchObject({
      amount: 60,
      fees: 0,
      commission: 6,
      net: 6,
      source_payment_id: "bp-1",
    });
  });

  it("defers booking-level legs on deposit-only first charge", async () => {
    const { supabase, inserts } = makeLedgerSupabase({ booking: defaultBooking });

    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-deposit",
      provider: "paystack",
      amountMajor: 100,
      feesMajor: 2,
      isDeposit: true,
      auditLegStyle: "paystack_standard",
    });

    const types = normalizeRows(inserts.finance_transactions).map((r) => r.transaction_type);
    expect(types).toEqual(["payment", "provider_earnings"]);
  });

  it("posts charge-2 rows and deferred catch-up on second charge", async () => {
    const { supabase, inserts } = makeLedgerSupabase({
      booking: defaultBooking,
      financeTransactions: [
        {
          id: "ft-payment-1",
          booking_id: "booking-1",
          transaction_type: "payment",
          net: 6,
        },
      ],
      bookingPayments: [
        {
          id: "bp-deposit",
          booking_id: "booking-1",
          amount: 100,
          status: "completed",
          payment_provider_id: "ref-deposit",
        },
      ],
    });

    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-balance",
      provider: "paystack",
      amountMajor: 108,
      feesMajor: 2,
      sourcePaymentId: "bp-balance",
      bookingLevelAmountOverrides: {
        tip: 10,
        tax: 0,
        travel: 120,
        platformFee: 18,
      },
      auditLegStyle: "paystack_standard",
    });

    const finance = normalizeRows(inserts.finance_transactions);
    expect(finance.filter((r) => r.transaction_type === "payment")).toEqual([
      expect.objectContaining({
        description: "Payment (charge 2) for booking BK-1001",
        source_payment_id: "bp-balance",
      }),
    ]);
    expect(finance.map((r) => r.transaction_type)).toEqual(
      expect.arrayContaining(["platform_fee", "tip", "travel_fee"]),
    );
  });

  it("uses pay-remaining descriptions in the second-charge branch", async () => {
    const { supabase, inserts } = makeLedgerSupabase({
      booking: defaultBooking,
      financeTransactions: [
        {
          id: "ft-payment-1",
          booking_id: "booking-1",
          transaction_type: "payment",
        },
      ],
    });

    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-remain",
      provider: "paystack",
      amountMajor: 108,
      feesMajor: 0,
      paymentTransactionType: "charge",
      auditLegStyle: "paystack_pay_remaining",
      descriptions: {
        payment: "Remaining balance for booking BK-1001",
        providerEarnings: "Provider earnings (remaining balance) for booking BK-1001",
      },
      metadata: { payment_type: "booking_remaining" },
    });

    const paymentRow = normalizeRows(inserts.finance_transactions).find(
      (r) => r.transaction_type === "payment",
    );
    expect(paymentRow?.description).toBe("Remaining balance for booking BK-1001");
    expect(normalizeRows(inserts.payment_transactions)[0]).toMatchObject({
      transaction_type: "charge",
      metadata: expect.objectContaining({ payment_type: "booking_remaining" }),
    });
  });

  it("posts wallet/gift audit legs for paystack_standard without discount legs", async () => {
    const { supabase, inserts } = makeLedgerSupabase({
      booking: {
        ...defaultBooking,
        promotion_discount_amount: 20,
        membership_discount_amount: 5,
        loyalty_discount_amount: 3,
      },
    });

    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-split",
      provider: "paystack",
      amountMajor: 100,
      walletAmountApplied: 30,
      giftCardAmountApplied: 20,
      auditLegStyle: "paystack_standard",
    });

    const finance = normalizeRows(inserts.finance_transactions);
    expect(finance.map((r) => r.transaction_type)).toEqual(
      expect.arrayContaining([
        "wallet_payment",
        "gift_card_payment",
        "gift_card_liability_reduction",
      ]),
    );
    expect(finance.some((r) => r.transaction_type === "promotion_discount")).toBe(false);
    expect(
      finance.find((r) => r.transaction_type === "wallet_payment")?.description,
    ).toBe("Wallet contribution for booking BK-1001 (split payment)");
    expect(finance.find((r) => r.transaction_type === "wallet_payment")).not.toHaveProperty(
      "source_payment_id",
    );
  });

  it("uses reference-scoped dedupe for paystack_pay_remaining audit legs", async () => {
    const { supabase, inserts } = makeLedgerSupabase({ booking: defaultBooking });

    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-a",
      provider: "paystack",
      amountMajor: 50,
      walletAmountApplied: 10,
      auditLegStyle: "paystack_pay_remaining",
    });
    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-b",
      provider: "paystack",
      amountMajor: 50,
      walletAmountApplied: 10,
      auditLegStyle: "paystack_pay_remaining",
    });

    const walletRows = normalizeRows(inserts.finance_transactions).filter(
      (r) => r.transaction_type === "wallet_payment",
    );
    expect(walletRows).toHaveLength(2);
    expect(walletRows[0].description).toContain("ref-a");
    expect(walletRows[1].description).toContain("ref-b");
  });

  it("skips when payment_transactions and finance payment already exist", async () => {
    const { supabase, inserts } = makeLedgerSupabase({
      booking: defaultBooking,
      paymentTransactions: [{ id: "pt-1", provider: "paystack", reference: "ref-dup" }],
      financeTransactions: [
        { id: "ft-1", booking_id: "booking-1", transaction_type: "payment" },
      ],
    });

    const result = await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-dup",
      provider: "paystack",
      amountMajor: 100,
    });

    expect(result).toEqual({ ok: true, skipped: true, isSecondCharge: false });
    expect(inserts.payment_transactions).toHaveLength(0);
    expect(inserts.finance_transactions).toHaveLength(0);
  });

  it("backfills finance when payment_transactions exists but finance payment is missing", async () => {
    const { supabase, inserts } = makeLedgerSupabase({
      booking: defaultBooking,
      paymentTransactions: [{ id: "pt-1", provider: "paystack", reference: "ref-crash" }],
    });

    const result = await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-crash",
      provider: "paystack",
      amountMajor: 208,
      feesMajor: 2,
    });

    expect(result).toEqual({ ok: true, skipped: false, isSecondCharge: false });
    expect(inserts.payment_transactions).toHaveLength(0);
    expect(inserts.finance_transactions.length).toBeGreaterThan(0);
  });

  it("nets the deferred catch-up off the residual so a second charge cannot double-count", async () => {
    // Deposit of 100 on a 208 booking recognised 28.85 (proportional, booking-level
    // legs deferred). A promotion_discount row makes bookingLevelItemsAlreadyPosted
    // true, so the balance charge takes the residual branch AND posts the 148 of
    // deferred tip/travel/platform_fee legs in the same run.
    const { supabase, inserts } = makeLedgerSupabase({
      booking: defaultBooking,
      financeTransactions: [
        { id: "ft-1", booking_id: "booking-1", transaction_type: "payment", net: 2.88 },
        { id: "ft-2", booking_id: "booking-1", transaction_type: "provider_earnings", net: 25.97 },
        { id: "ft-3", booking_id: "booking-1", transaction_type: "promotion_discount", net: -20 },
      ],
      bookingPayments: [
        {
          id: "bp-deposit",
          booking_id: "booking-1",
          amount: 100,
          status: "completed",
          payment_provider_id: "ref-deposit",
        },
      ],
    });

    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-balance",
      provider: "paystack",
      amountMajor: 108,
      feesMajor: 0,
      sourcePaymentId: "bp-balance",
      bookingLevelAmountOverrides: { tip: 10, tax: 0, travel: 120, platformFee: 18 },
      auditLegStyle: "paystack_standard",
    });

    const finance = normalizeRows(inserts.finance_transactions);
    // residual = cumulativePaid(208) - postedLegs(28.85) - catchUp(148) = 31.15
    expect(finance.find((r) => r.transaction_type === "payment")?.amount).toBeCloseTo(31.15, 2);
    const recognised =
      Number(finance.find((r) => r.transaction_type === "payment")?.net ?? 0) +
      Number(finance.find((r) => r.transaction_type === "provider_earnings")?.net ?? 0) +
      Number(finance.find((r) => r.transaction_type === "platform_fee")?.net ?? 0) +
      Number(finance.find((r) => r.transaction_type === "tip")?.net ?? 0) +
      Number(finance.find((r) => r.transaction_type === "travel_fee")?.net ?? 0);
    // 28.85 already recognised by the deposit + 179.15 now = the 208 booking total.
    expect(28.85 + recognised).toBeCloseTo(208, 2);
  });

  it("backfills a second charge whose payment_transactions row exists but finance rows do not", async () => {
    // Pay-remaining crash recovery: the deposit's `payment` row is present, so the
    // booking-level guard alone would wrongly skip. Attribution is by source_payment_id.
    const { supabase, inserts } = makeLedgerSupabase({
      booking: defaultBooking,
      paymentTransactions: [{ id: "pt-1", provider: "paystack", reference: "ref-remain" }],
      financeTransactions: [
        {
          id: "ft-1",
          booking_id: "booking-1",
          transaction_type: "payment",
          net: 2.88,
          source_payment_id: "bp-deposit",
        },
      ],
    });

    const result = await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-remain",
      provider: "paystack",
      amountMajor: 108,
      sourcePaymentId: "bp-remain",
      paymentTransactionType: "charge",
      auditLegStyle: "paystack_pay_remaining",
      descriptions: {
        payment: "Remaining balance for booking BK-1001",
        providerEarnings: "Provider earnings (remaining balance) for booking BK-1001",
      },
    });

    expect(result).toEqual({ ok: true, skipped: false, isSecondCharge: true });
    expect(inserts.payment_transactions).toHaveLength(0);
    expect(
      normalizeRows(inserts.finance_transactions).find((r) => r.transaction_type === "payment"),
    ).toMatchObject({
      description: "Remaining balance for booking BK-1001",
      source_payment_id: "bp-remain",
    });
  });

  it("skips rather than backfills when an existing payment row is not attributable", async () => {
    const { supabase, inserts } = makeLedgerSupabase({
      booking: defaultBooking,
      paymentTransactions: [{ id: "pt-1", provider: "paystack", reference: "ref-legacy" }],
      financeTransactions: [
        { id: "ft-1", booking_id: "booking-1", transaction_type: "payment", net: 5 },
      ],
    });

    const result = await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-legacy",
      provider: "paystack",
      amountMajor: 108,
      sourcePaymentId: "bp-new",
    });

    expect(result).toEqual({ ok: true, skipped: true, isSecondCharge: false });
    expect(inserts.finance_transactions).toHaveLength(0);
  });

  it("returns skipped on concurrent payment_transactions 23505", async () => {
    const { supabase } = makeLedgerSupabase({
      booking: defaultBooking,
      paymentTxInsertError: { code: "23505", message: "duplicate" },
    });

    const result = await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-race",
      provider: "paystack",
      amountMajor: 100,
    });

    expect(result).toEqual({ ok: true, skipped: true, isSecondCharge: false });
  });

  it("writes raw net_amount without clamping", async () => {
    const { supabase, inserts } = makeLedgerSupabase({ booking: defaultBooking });

    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-fees",
      provider: "paystack",
      amountMajor: 5,
      feesMajor: 10,
    });

    expect(normalizeRows(inserts.payment_transactions)[0].net_amount).toBe(-5);
  });

  it("treats existing service_fee as posted when catching up platform_fee", async () => {
    const { supabase, inserts } = makeLedgerSupabase({
      booking: defaultBooking,
      financeTransactions: [
        { id: "ft-1", booking_id: "booking-1", transaction_type: "payment" },
        { id: "ft-2", booking_id: "booking-1", transaction_type: "service_fee", net: 18 },
      ],
    });

    await recordBookingOnlineChargeLedger(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-second",
      provider: "paystack",
      amountMajor: 108,
      bookingLevelAmountOverrides: { platformFee: 18, tip: 10, travel: 120 },
    });

    const types = normalizeRows(inserts.finance_transactions).map((r) => r.transaction_type);
    expect(types).not.toContain("platform_fee");
    expect(types).toEqual(expect.arrayContaining(["tip", "travel_fee"]));
  });
});

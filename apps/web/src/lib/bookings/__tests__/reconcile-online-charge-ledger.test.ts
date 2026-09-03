/**
 * Reconcile cron: posts missing Paystack ledger rows, routes refunded/cancelled to
 * needs_review (persisted in reconciliation_exceptions), patches backfilled fees,
 * stays idempotent across runs, and only logs Stripe/Flutterwave gaps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSettlement, mockNotifySlack, mockFetch } = vi.hoisted(() => ({
  mockSettlement: vi.fn(),
  mockNotifySlack: vi.fn(async () => undefined),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/payments/paystack-server", () => ({
  getPaystackSecretKey: vi.fn(async () => "sk_test_reconcile"),
}));

vi.mock("@/lib/payments/paystack", () => ({
  convertFromSmallestUnit: (amount: number) => Math.round(amount) / 100,
}));

vi.mock("../record-paystack-booking-settlement", () => ({
  recordPaystackBookingSettlement: (...args: unknown[]) => mockSettlement(...args),
}));

vi.mock("@/lib/integrations/slack/dispatch", () => ({
  tryNotifySlackEvent: (...args: unknown[]) => mockNotifySlack(...(args as [])),
}));

import {
  reconcileOnlineChargeLedger,
  RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE,
} from "../reconcile-online-charge-ledger";

type Row = Record<string, unknown>;
type Filter =
  | { op: "eq"; col: string; val: unknown }
  | { op: "in"; col: string; vals: unknown[] }
  | { op: "lt"; col: string; val: unknown };

type Stores = Record<string, Row[]>;

function readCol(row: Row, col: string): unknown {
  if (col.includes("->>")) {
    const [base, key] = col.split("->>");
    const obj = row[base];
    return obj && typeof obj === "object" ? (obj as Row)[key] : undefined;
  }
  return row[col];
}

function makeSupabase(initial: Partial<Stores> = {}) {
  const stores: Stores = {
    booking_payments: [],
    bookings: [],
    finance_transactions: [],
    payment_transactions: [],
    booking_refunds: [],
    reconciliation_exceptions: [],
    ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, [...(v ?? [])]])),
  };
  const inserts: Stores = {};
  const updates: Array<{ table: string; patch: Row; matched: Row[] }> = [];
  let idSeq = 0;

  class Query {
    private filters: Filter[] = [];
    private selectCols = "*";
    private headOnly = false;
    private limitN: number | null = null;
    private mode: "select" | "update" = "select";
    private patch: Row = {};

    constructor(private table: string) {}

    select(cols?: string, opts?: { count?: string; head?: boolean }) {
      this.selectCols = cols ?? "*";
      this.headOnly = Boolean(opts?.head);
      return this;
    }
    update(patch: Row) {
      this.mode = "update";
      this.patch = patch;
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push({ op: "eq", col, val });
      return this;
    }
    in(col: string, vals: unknown[]) {
      this.filters.push({ op: "in", col, vals });
      return this;
    }
    lt(col: string, val: unknown) {
      this.filters.push({ op: "lt", col, val });
      return this;
    }
    order() {
      return this;
    }
    limit(n: number) {
      this.limitN = n;
      return this;
    }

    private match(): Row[] {
      let rows = [...(stores[this.table] ?? [])];
      for (const f of this.filters) {
        if (f.op === "eq") rows = rows.filter((r) => readCol(r, f.col) === f.val);
        else if (f.op === "in") rows = rows.filter((r) => f.vals.includes(readCol(r, f.col)));
        else if (f.op === "lt") rows = rows.filter((r) => String(readCol(r, f.col)) < String(f.val));
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      if (this.table === "booking_payments" && this.selectCols.includes("bookings(")) {
        rows = rows.map((r) => ({
          ...r,
          bookings: stores.bookings.find((b) => b.id === r.booking_id) ?? null,
        }));
      }
      return rows;
    }

    private run() {
      const rows = this.match();
      if (this.mode === "update") {
        for (const row of rows) Object.assign(row, this.patch);
        updates.push({ table: this.table, patch: this.patch, matched: rows });
        return { data: rows, error: null, count: rows.length };
      }
      return { data: this.headOnly ? null : rows, error: null, count: rows.length };
    }

    async maybeSingle() {
      const res = this.run();
      return { data: (res.data ?? [])[0] ?? null, error: null };
    }

    then<T>(resolve: (value: { data: Row[] | null; error: null; count: number }) => T) {
      return Promise.resolve(resolve(this.run()));
    }
  }

  const supabase = {
    from: (table: string) => ({
      select: (cols?: string, opts?: { count?: string; head?: boolean }) =>
        new Query(table).select(cols, opts),
      update: (patch: Row) => new Query(table).update(patch),
      insert: async (payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        stores[table] ??= [];
        inserts[table] ??= [];
        for (const row of rows) {
          const stored = { id: `${table}-${++idSeq}`, created_at: NOW_ISO, ...row };
          stores[table].push(stored);
          inserts[table].push(stored);
        }
        return { data: rows, error: null };
      },
    }),
  };

  return { supabase: supabase as never, stores, inserts, updates };
}

const NOW = new Date("2026-09-02T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();
const AN_HOUR_AGO = "2026-09-02T11:00:00.000Z";
const TWO_DAYS_AGO = "2026-08-31T12:00:00.000Z";

const booking = (overrides: Row = {}): Row => ({
  id: "booking-1",
  status: "completed",
  tenant_id: "tenant-1",
  currency: "ZAR",
  total_amount: 208,
  payment_option: "full",
  ...overrides,
});

const bookingPayment = (overrides: Row = {}): Row => ({
  id: "bp-1",
  booking_id: "booking-1",
  amount: 208,
  status: "completed",
  payment_provider: "paystack",
  payment_provider_id: "ref-1",
  payment_provider_data: {},
  created_at: AN_HOUR_AGO,
  ...overrides,
});

function paystackVerify(byReference: Record<string, { status?: string; amount?: number; fees?: number } | null>) {
  mockFetch.mockImplementation(async (url: string) => {
    const reference = decodeURIComponent(url.split("/transaction/verify/")[1] ?? "");
    const data = byReference[reference];
    if (!data) return { ok: false, json: async () => ({ status: false }) };
    return { ok: true, json: async () => ({ status: true, data: { reference, ...data } }) };
  });
}

/** Default settlement mock: behaves like the real helper by writing the attributed ledger. */
function settlementWritesLedger() {
  mockSettlement.mockImplementation(async (supabase: any, input: any) => {
    await supabase.from("finance_transactions").insert([
      {
        booking_id: input.bookingId,
        transaction_type: "payment",
        source_payment_id: input.bookingPaymentId,
        amount: input.amountMajor,
        fees: (input.feesSmallestOrMajor ?? 0) / 100,
      },
      {
        booking_id: input.bookingId,
        transaction_type: "provider_earnings",
        source_payment_id: input.bookingPaymentId,
        amount: input.amountMajor,
      },
    ]);
    return {
      ok: true,
      bookingPaymentId: input.bookingPaymentId,
      ledger: { skipped: false, isSecondCharge: false },
      feesMajor: (input.feesSmallestOrMajor ?? 0) / 100,
      feeSource: input.feeSource,
    };
  });
}

describe("reconcileOnlineChargeLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    settlementWritesLedger();
    paystackVerify({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the missing ledger for a verified Paystack payment", async () => {
    const { supabase, stores } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment()],
    });
    paystackVerify({ "ref-1": { status: "success", amount: 20800, fees: 600 } });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(mockSettlement).toHaveBeenCalledTimes(1);
    expect(mockSettlement).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        bookingId: "booking-1",
        reference: "ref-1",
        amountMajor: 208,
        feesSmallestOrMajor: 600,
        bookingPaymentId: "bp-1",
        isDeposit: false,
        feeSource: "paystack_verify_reconcile",
        metadata: { source: RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE },
      }),
    );
    expect(summary).toMatchObject({ scanned: 1, posted: 1, skipped: 0, needsReview: [], errors: [] });
    expect(
      stores.finance_transactions.filter(
        (r) => r.transaction_type === "payment" && r.source_payment_id === "bp-1",
      ),
    ).toHaveLength(1);
  });

  it("ignores payments captured less than 5 minutes ago", async () => {
    const { supabase } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment({ created_at: "2026-09-02T11:58:00.000Z" })],
    });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(summary.scanned).toBe(0);
    expect(mockSettlement).not.toHaveBeenCalled();
  });

  it("routes cancelled and refunded bookings to needs_review and persists them once", async () => {
    const { supabase, stores } = makeSupabase({
      bookings: [
        booking({ id: "booking-cancelled", status: "cancelled" }),
        booking({ id: "booking-refunded" }),
      ],
      booking_payments: [
        bookingPayment({ id: "bp-cancelled", booking_id: "booking-cancelled", payment_provider_id: "ref-c" }),
        bookingPayment({ id: "bp-refunded", booking_id: "booking-refunded", payment_provider_id: "ref-r" }),
      ],
      booking_refunds: [{ id: "rf-1", booking_id: "booking-refunded" }],
    });
    paystackVerify({
      "ref-c": { status: "success", amount: 20800, fees: 600 },
      "ref-r": { status: "success", amount: 20800, fees: 600 },
    });

    const first = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(mockSettlement).not.toHaveBeenCalled();
    expect(first.posted).toBe(0);
    expect(first.needsReview).toEqual([
      expect.objectContaining({ bookingPaymentId: "bp-cancelled", reason: "booking_status" }),
      expect.objectContaining({ bookingPaymentId: "bp-refunded", reason: "has_refunds" }),
    ]);

    const exceptions = stores.reconciliation_exceptions;
    expect(exceptions).toHaveLength(2);
    expect(exceptions.map((e) => e.external_id).sort()).toEqual(["bp-cancelled", "bp-refunded"]);
    expect(exceptions[0]).toMatchObject({
      tenant_id: "tenant-1",
      psp: "paystack",
      source: "ledger",
      status: "open",
      mismatch_reason: "online_charge_ledger_missing:booking_status",
      metadata: expect.objectContaining({ source: RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE }),
    });
    // Fresh items (< 24h) do not alert.
    expect(mockNotifySlack).not.toHaveBeenCalled();
    expect(first.reviewAlertSent).toBe(false);

    // Second run: same items, no duplicate exceptions.
    const second = await reconcileOnlineChargeLedger(supabase, { now: NOW });
    expect(second.needsReview).toHaveLength(2);
    expect(stores.reconciliation_exceptions).toHaveLength(2);
  });

  it("marks a Paystack verify that is not success as needs_review without posting", async () => {
    const { supabase } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment()],
    });
    paystackVerify({ "ref-1": { status: "failed", amount: 20800, fees: 0 } });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(mockSettlement).not.toHaveBeenCalled();
    expect(summary.needsReview).toEqual([
      expect.objectContaining({ bookingPaymentId: "bp-1", reason: "paystack_not_success" }),
    ]);
  });

  it("alerts ops once when a review item has been open for more than 24h", async () => {
    const { supabase, stores } = makeSupabase({
      bookings: [booking({ id: "booking-cancelled", status: "cancelled" })],
      booking_payments: [
        bookingPayment({ id: "bp-cancelled", booking_id: "booking-cancelled", payment_provider_id: "ref-c" }),
      ],
      reconciliation_exceptions: [
        {
          id: "exc-old",
          tenant_id: "tenant-1",
          psp: "paystack",
          source: "ledger",
          status: "open",
          external_id: "bp-cancelled",
          created_at: TWO_DAYS_AGO,
          metadata: { source: RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE, reason: "booking_status" },
        },
      ],
    });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(stores.reconciliation_exceptions).toHaveLength(1);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "finance.reconciliation.warning",
        dedupeKey: "reconcile-online-charge-ledger:needs_review:2026-09-02",
      }),
    );
    expect(summary.reviewAlertSent).toBe(true);
  });

  it("resolves an open review item once the ledger exists and does not alert for it", async () => {
    const { supabase, stores } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment()],
      finance_transactions: [
        { id: "ft-1", booking_id: "booking-1", transaction_type: "payment", source_payment_id: "bp-1" },
      ],
      reconciliation_exceptions: [
        {
          id: "exc-old",
          tenant_id: "tenant-1",
          psp: "paystack",
          source: "ledger",
          status: "open",
          external_id: "bp-1",
          created_at: TWO_DAYS_AGO,
          metadata: { source: RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE },
        },
      ],
    });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(summary.skipped).toBe(1);
    expect(stores.reconciliation_exceptions[0]).toMatchObject({
      status: "matched",
      resolved_at: NOW_ISO,
    });
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("fee-patch pass patches a backfilled payment_transactions row and its finance payment leg", async () => {
    const { supabase, stores } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment()],
      payment_transactions: [
        {
          id: "pt-backfill",
          provider: "paystack",
          booking_id: "booking-1",
          reference: "ref-1",
          amount: 208,
          fees: 0,
          net_amount: 208,
          metadata: { fee_source: "manual_backfill" },
          created_at: AN_HOUR_AGO,
        },
        {
          id: "pt-real",
          provider: "paystack",
          booking_id: "booking-2",
          reference: "ref-2",
          amount: 100,
          fees: 0,
          net_amount: 100,
          metadata: { fee_source: "paystack" },
          created_at: AN_HOUR_AGO,
        },
      ],
      finance_transactions: [
        {
          id: "ft-payment",
          booking_id: "booking-1",
          transaction_type: "payment",
          source_payment_id: "bp-1",
          fees: 0,
          net: 0,
        },
        {
          id: "ft-earnings",
          booking_id: "booking-1",
          transaction_type: "provider_earnings",
          source_payment_id: "bp-1",
          fees: 0,
        },
      ],
    });
    paystackVerify({
      "ref-1": { status: "success", amount: 20800, fees: 604 },
      "ref-2": { status: "success", amount: 10000, fees: 300 },
    });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    // Pass 1 skips (ledger already attributed) — the fee patch must still run.
    expect(mockSettlement).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(summary.feePatched).toBe(1);

    const patched = stores.payment_transactions.find((r) => r.id === "pt-backfill");
    expect(patched).toMatchObject({
      fees: 6.04,
      net_amount: 201.96,
      metadata: expect.objectContaining({
        fee_source: "paystack_verify_reconcile",
        fee_source_before_patch: "manual_backfill",
        fee_patched_at: NOW_ISO,
      }),
    });
    expect(stores.payment_transactions.find((r) => r.id === "pt-real")).toMatchObject({ fees: 0 });

    expect(stores.finance_transactions.find((r) => r.id === "ft-payment")).toMatchObject({ fees: 6.04 });
    expect(stores.finance_transactions.find((r) => r.id === "ft-earnings")).toMatchObject({ fees: 0 });
  });

  it("fee-patch leaves rows alone when Paystack still reports no fee", async () => {
    const { supabase, stores } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment()],
      payment_transactions: [
        {
          id: "pt-backfill",
          provider: "paystack",
          booking_id: "booking-1",
          reference: "ref-1",
          amount: 208,
          fees: 0,
          metadata: { fee_source: "estimate" },
        },
      ],
      finance_transactions: [
        { id: "ft-payment", booking_id: "booking-1", transaction_type: "payment", source_payment_id: "bp-1", fees: 0 },
      ],
    });
    paystackVerify({ "ref-1": { status: "success", amount: 20800, fees: 0 } });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(summary.feePatched).toBe(0);
    expect(stores.payment_transactions[0]).toMatchObject({ fees: 0, metadata: { fee_source: "estimate" } });
  });

  it("is idempotent: a second run does not post again once the ledger exists", async () => {
    const { supabase, stores } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment()],
    });
    paystackVerify({ "ref-1": { status: "success", amount: 20800, fees: 600 } });

    const first = await reconcileOnlineChargeLedger(supabase, { now: NOW });
    expect(first.posted).toBe(1);
    expect(mockSettlement).toHaveBeenCalledTimes(1);

    const second = await reconcileOnlineChargeLedger(supabase, { now: NOW });
    expect(second).toMatchObject({ scanned: 1, posted: 0, skipped: 1 });
    expect(mockSettlement).toHaveBeenCalledTimes(1);
    expect(
      stores.finance_transactions.filter((r) => r.transaction_type === "payment"),
    ).toHaveLength(1);
  });

  it("skips bookings whose existing payment rows predate source attribution", async () => {
    const { supabase } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment()],
      finance_transactions: [
        { id: "ft-legacy", booking_id: "booking-1", transaction_type: "payment", source_payment_id: null },
      ],
    });
    paystackVerify({ "ref-1": { status: "success", amount: 20800, fees: 600 } });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(summary).toMatchObject({ scanned: 1, posted: 0, skipped: 1 });
    expect(mockSettlement).not.toHaveBeenCalled();
  });

  it("lists Stripe/Flutterwave gaps without posting them", async () => {
    const { supabase, stores } = makeSupabase({
      bookings: [
        booking({ id: "booking-stripe" }),
        booking({ id: "booking-flw" }),
        booking({ id: "booking-stripe-ok" }),
      ],
      booking_payments: [
        bookingPayment({ id: "bp-stripe", booking_id: "booking-stripe", payment_provider: "stripe", payment_provider_id: "pi_1" }),
        bookingPayment({ id: "bp-flw", booking_id: "booking-flw", payment_provider: "flutterwave", payment_provider_id: "flw_1" }),
        bookingPayment({ id: "bp-stripe-ok", booking_id: "booking-stripe-ok", payment_provider: "stripe", payment_provider_id: "pi_2" }),
      ],
      finance_transactions: [
        { id: "ft-ok", booking_id: "booking-stripe-ok", transaction_type: "payment", source_payment_id: "bp-stripe-ok" },
      ],
    });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(mockSettlement).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(summary.scanned).toBe(0);
    expect(summary.otherGatewaysMissing).toEqual([
      { bookingPaymentId: "bp-stripe", bookingId: "booking-stripe", provider: "stripe" },
      { bookingPaymentId: "bp-flw", bookingId: "booking-flw", provider: "flutterwave" },
    ]);
    expect(stores.finance_transactions).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("non-Paystack gateway"),
      expect.objectContaining({ provider: "stripe", bookingPaymentId: "bp-stripe" }),
    );
  });

  it("records settlement failures without aborting the run", async () => {
    mockSettlement.mockResolvedValueOnce({ ok: false, stage: "ledger", reason: "insert_failed" });
    const { supabase } = makeSupabase({
      bookings: [booking()],
      booking_payments: [bookingPayment()],
    });
    paystackVerify({ "ref-1": { status: "success", amount: 20800, fees: 600 } });

    const summary = await reconcileOnlineChargeLedger(supabase, { now: NOW });

    expect(summary.errors).toEqual([{ bookingPaymentId: "bp-1", reason: "insert_failed" }]);
    expect(summary.posted).toBe(0);
  });
});

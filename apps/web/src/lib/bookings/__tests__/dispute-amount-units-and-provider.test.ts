/**
 * F2-15: dispute amounts use gateway-documented units — Paystack is ALWAYS
 *        minor units (kobo/cents), Flutterwave is ALWAYS major units. No
 *        `n >= 1000` guessing.
 * F2-27: `upsertOpenPaymentDispute` always resolves provider_id (and
 *        booking/tenant) from the disputed charge's booking when the caller
 *        did not supply it, so the payout reserve keyed on provider_id works.
 * F2-28: the provider is notified when a dispute is opened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  paystackDisputeAmountMajor,
  upsertOpenPaymentDispute,
} from "../paystack-dispute-lifecycle";
import { flutterwaveDisputeAmountMajor } from "@/lib/payments/flutterwave-dispute-handler";

const sendToUserMock = vi.fn(async () => undefined);
const insertNotificationMock = vi.fn(async () => undefined);
vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: (...args: unknown[]) => sendToUserMock(...args),
}));
vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: (...args: unknown[]) => insertNotificationMock(...args),
}));
vi.mock("@/lib/bookings/process-booking-chargeback", () => ({
  processBookingChargeback: vi.fn(),
  shouldProcessPaystackDisputeChargeback: vi.fn(() => false),
  isPlatformBillingPaymentKind: vi.fn(() => false),
}));

describe("F2-15 dispute amount units", () => {
  it("Paystack: small amounts are minor units (500 kobo → 5.00)", () => {
    expect(paystackDisputeAmountMajor({ amount: 500, currency: "ZAR" }, null)).toBe(5);
  });
  it("Paystack: large amounts are minor units (150000 → 1500.00)", () => {
    expect(paystackDisputeAmountMajor({ refund_amount: 150000, currency: "ZAR" }, null)).toBe(1500);
  });
  it("Paystack: falls back to the disputed transaction amount (minor units)", () => {
    expect(paystackDisputeAmountMajor({}, { amount: 2599, currency: "ZAR" })).toBe(25.99);
  });
  it("Flutterwave: small amounts are major units (500 → 500.00)", () => {
    expect(flutterwaveDisputeAmountMajor({ amount: 500, currency: "ZAR" })).toBe(500);
  });
  it("Flutterwave: large amounts are major units (150000 → 150000.00)", () => {
    expect(flutterwaveDisputeAmountMajor({ chargeback_amount: 150000, currency: "ZAR" })).toBe(150000);
  });
  it("Flutterwave: decimals are preserved (12.5 → 12.5)", () => {
    expect(flutterwaveDisputeAmountMajor({ amount: 12.5, currency: "ZAR" })).toBe(12.5);
  });
});

function makeSupabase(opts: { existingDispute?: boolean }) {
  const upserts: Array<Record<string, unknown>> = [];
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "payment_disputes") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({
          data: opts.existingDispute ? { id: "pd-1", provider_id: "prov-1", status: "open" } : null,
          error: null,
        }));
        chain.upsert = vi.fn(async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { error: null };
        });
        return chain;
      }
      if (table === "payment_transactions") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.in = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({ data: { booking_id: "booking-1" }, error: null }));
        return chain;
      }
      if (table === "bookings") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({
          data: { provider_id: "prov-1", tenant_id: "tenant-1", booking_number: "BK-9", currency: "ZAR" },
          error: null,
        }));
        return chain;
      }
      if (table === "providers") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({ data: { user_id: "prov-user-1" }, error: null }));
        chain.single = chain.maybeSingle;
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as any;
  return { supabase, upserts };
}

describe("F2-27 / F2-28 upsertOpenPaymentDispute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves provider_id / booking_id / tenant_id from the booking when the caller passes none (Flutterwave/Stripe closed)", async () => {
    const { supabase, upserts } = makeSupabase({});
    await upsertOpenPaymentDispute({
      supabase,
      paymentProvider: "flutterwave",
      disputeId: "cb-1",
      reference: "ref-1",
      amountMajor: 120,
      currency: "ZAR",
      status: "open",
      rawPayload: {},
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      provider_id: "prov-1",
      booking_id: "booking-1",
      tenant_id: "tenant-1",
      amount: 120,
    });
  });

  it("does not overwrite an existing provider_id with null on a closed/funds_withdrawn upsert", async () => {
    const { supabase, upserts } = makeSupabase({ existingDispute: true });
    await upsertOpenPaymentDispute({
      supabase,
      paymentProvider: "stripe",
      disputeId: "dp-1",
      reference: "pi_1",
      amountMajor: 50,
      currency: "ZAR",
      status: "customer_won",
      rawPayload: {},
      bookingId: null,
      providerId: null,
      tenantId: null,
    });
    expect(upserts[0]?.provider_id).toBe("prov-1");
  });

  it("F2-28: notifies the provider when a dispute is first opened", async () => {
    const { supabase } = makeSupabase({});
    await upsertOpenPaymentDispute({
      supabase,
      paymentProvider: "paystack",
      disputeId: "dp-open",
      reference: "ref-1",
      amountMajor: 120,
      currency: "ZAR",
      status: "open",
      rawPayload: {},
    });
    expect(sendToUserMock).toHaveBeenCalledWith(
      "prov-user-1",
      expect.objectContaining({ data: expect.objectContaining({ type: "dispute_opened", booking_id: "booking-1" }) }),
      ["push"],
      { appType: "provider" },
    );
    expect(insertNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "prov-user-1", type: "dispute_opened" }),
    );
  });

  it("F2-28: does not re-notify on a replay of an already-recorded open dispute", async () => {
    const { supabase } = makeSupabase({ existingDispute: true });
    await upsertOpenPaymentDispute({
      supabase,
      paymentProvider: "paystack",
      disputeId: "dp-open",
      reference: "ref-1",
      amountMajor: 120,
      currency: "ZAR",
      status: "open",
      rawPayload: {},
    });
    expect(sendToUserMock).not.toHaveBeenCalled();
  });
});

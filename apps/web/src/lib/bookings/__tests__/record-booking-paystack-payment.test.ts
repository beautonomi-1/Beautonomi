import { describe, expect, it, vi } from "vitest";
import { recordBookingPaystackPayment } from "../record-booking-paystack-payment";

function makeSupabaseMock(existing: unknown = null) {
  const insert = vi.fn().mockResolvedValue({ data: { id: "bp-new" }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
  const eq = vi.fn(() => ({ eq, maybeSingle }));
  const select = vi.fn(() => ({ eq, maybeSingle }));
  const insertChain = {
    select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "bp-new" }, error: null }) })),
  };
  const from = vi.fn((table: string) => {
    if (table === "booking_payments") {
      return { select, insert: vi.fn(() => insertChain) };
    }
    return {};
  });
  return { supabase: { from }, insert: insertChain, maybeSingle } as const;
}

describe("recordBookingPaystackPayment", () => {
  it("inserts a canonical booking payment row", async () => {
    const { supabase, insert } = makeSupabaseMock();

    const result = await recordBookingPaystackPayment(supabase as any, {
      bookingId: "booking-1",
      tenantId: "tenant-1",
      reference: "ref-1",
      transactionId: 123,
      amountMajor: 233.8,
      source: "test",
      paymentOption: "full",
      requiresDeposit: false,
    });

    expect(result).toEqual({
      ok: true,
      paymentProviderId: "ref-1",
      inserted: true,
      bookingPaymentId: "bp-new",
    });
    expect(insert.select).toHaveBeenCalled();
  });

  it("is idempotent when a payment row already exists", async () => {
    const { supabase, insert } = makeSupabaseMock({ id: "bp-1" });

    const result = await recordBookingPaystackPayment(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-1",
      amountMajor: 100,
      source: "test",
    });

    expect(result).toEqual({
      ok: true,
      paymentProviderId: "ref-1",
      inserted: false,
      bookingPaymentId: "bp-1",
    });
    expect(insert.select).not.toHaveBeenCalled();
  });

  it("rejects successful charges without a provider identifier", async () => {
    const { supabase } = makeSupabaseMock();

    const result = await recordBookingPaystackPayment(supabase as any, {
      bookingId: "booking-1",
      amountMajor: 100,
      source: "test",
    });

    expect(result).toEqual({ ok: false, reason: "missing_provider_id" });
  });
});

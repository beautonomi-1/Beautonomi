import { describe, expect, it, vi } from "vitest";
import { recordBookingPaystackPayment } from "../record-booking-paystack-payment";

function makeSupabaseMock(existing: unknown = null) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
  const eq = vi.fn(() => ({ eq, maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table === "booking_payments") {
      return { select, insert };
    }
    return {};
  });
  return { supabase: { from }, insert, maybeSingle } as const;
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

    expect(result).toEqual({ ok: true, paymentProviderId: "ref-1", inserted: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: "booking-1",
        tenant_id: "tenant-1",
        amount: 233.8,
        payment_provider: "paystack",
        payment_provider_id: "ref-1",
        status: "completed",
      }),
    );
  });

  it("is idempotent when a payment row already exists", async () => {
    const { supabase, insert } = makeSupabaseMock({ id: "bp-1" });

    const result = await recordBookingPaystackPayment(supabase as any, {
      bookingId: "booking-1",
      reference: "ref-1",
      amountMajor: 100,
      source: "test",
    });

    expect(result).toEqual({ ok: true, paymentProviderId: "ref-1", inserted: false });
    expect(insert).not.toHaveBeenCalled();
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

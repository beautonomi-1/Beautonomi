import { describe, expect, it } from "vitest";
import { resolveBookingPaymentIdForRefund } from "../resolve-booking-refund-payment-id";

function makeSupabase(responses: {
  byProviderId?: { id: string } | null;
  latest?: { id: string } | null;
}) {
  let callCount = 0;
  return {
    from: (table: string) => {
      if (table !== "booking_payments") throw new Error(`unexpected table ${table}`);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          callCount += 1;
          if (callCount === 1) {
            return { data: responses.byProviderId ?? null };
          }
          return { data: responses.latest ?? null };
        },
      };
      return chain;
    },
  } as any;
}

describe("resolveBookingPaymentIdForRefund", () => {
  it("matches booking_payments by payment_provider_id", async () => {
    const supabase = makeSupabase({
      byProviderId: { id: "bp-paystack" },
    });
    await expect(
      resolveBookingPaymentIdForRefund(supabase, "booking-1", "ref-paystack-1"),
    ).resolves.toBe("bp-paystack");
  });

  it("falls back to latest completed payment when reference is unknown", async () => {
    const supabase = makeSupabase({
      byProviderId: null,
      latest: { id: "bp-latest" },
    });
    await expect(
      resolveBookingPaymentIdForRefund(supabase, "booking-1", "missing-ref"),
    ).resolves.toBe("bp-latest");
  });
});

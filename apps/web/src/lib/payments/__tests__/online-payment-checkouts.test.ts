import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

describe("online payment checkouts registry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("upsertOnlinePaymentCheckout stores stripe provider", async () => {
    const { upsertOnlinePaymentCheckout } = await import("../online-payment-checkouts");
    await expect(
      upsertOnlinePaymentCheckout({
        reference: "booking_test_1",
        provider: "stripe",
        tenantId: "tenant-1",
        checkoutSessionId: "cs_test",
        paymentIntentId: "pi_test",
        metadata: { booking_id: "b1" },
      }),
    ).resolves.toBeUndefined();
  });
});

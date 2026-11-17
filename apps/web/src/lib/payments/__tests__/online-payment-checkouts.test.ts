import { describe, expect, it, vi, beforeEach } from "vitest";

const updateEq = vi.fn();
const updateSelect = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: () => ({
        eq: (...args: unknown[]) => {
          updateEq(...args);
          return {
            eq: (...inner: unknown[]) => {
              updateEq(...inner);
              return {
                select: (...sel: unknown[]) => {
                  updateSelect(...sel);
                  return Promise.resolve({ data: [{ reference: "booking_test_1" }], error: null });
                },
              };
            },
          };
        },
      }),
    }),
  }),
}));

describe("online payment checkouts registry", () => {
  beforeEach(() => {
    vi.resetModules();
    updateEq.mockClear();
    updateSelect.mockClear();
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

  it("claimOnlinePaymentCheckoutFailed returns true only on the first pending claim", async () => {
    const { claimOnlinePaymentCheckoutFailed } = await import("../online-payment-checkouts");
    await expect(claimOnlinePaymentCheckoutFailed("booking_test_1")).resolves.toBe(true);
    expect(updateEq).toHaveBeenCalledWith("reference", "booking_test_1");
    expect(updateEq).toHaveBeenCalledWith("status", "pending");
  });
});

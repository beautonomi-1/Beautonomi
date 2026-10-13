import { describe, expect, it, vi } from "vitest";
import { computeShippingReadiness } from "@/lib/orders/shipping-readiness";

vi.mock("@/lib/orders/shipping-runtime", () => ({
  isShippingKillSwitchActive: () => false,
  isLiveCourierBookingEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/orders/provider-shipping-credentials", () => ({
  loadProviderCourierCredentialsRow: vi.fn(async () => null),
  publicCourierCredentialsStatus: vi.fn(() => ({
    "courier-guy": { connected: false, verifiedAt: null, apiKeyHint: null, baseUrl: null },
    "bob-go": { connected: false, verifiedAt: null, apiKeyHint: null, baseUrl: null },
    aramex: {
      connected: false,
      verifiedAt: null,
      usernameHint: null,
      accountNumberHint: null,
      accountEntity: null,
      accountCountryCode: null,
      domesticProductType: null,
      baseUrl: null,
    },
  })),
}));

describe("computeShippingReadiness", () => {
  it("requires at least one fulfillment mode", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({ data: [] }),
            }),
          }),
        }),
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await computeShippingReadiness(admin, "p1", {
      offers_delivery: false,
      offers_collection: false,
    });
    expect(result.items.find((i) => i.id === "fulfillment_mode")?.ok).toBe(false);
  });
});

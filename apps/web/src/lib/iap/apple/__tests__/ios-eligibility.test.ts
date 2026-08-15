import { describe, expect, it } from "vitest";
import {
  APPLE_BILLING_ACTIVE_MESSAGE,
  getAppleBillingPaystackBlock,
  resolveIosPurchaseEligibility,
} from "@/lib/iap/apple/ios-eligibility";

function mockSupabase(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  } as never;
}

describe("resolveIosPurchaseEligibility", () => {
  it("allows IAP when billing_provider is apple", async () => {
    const result = await resolveIosPurchaseEligibility(
      mockSupabase({ billing_provider: "apple", status: "active", plan: { is_free: false } }),
      "provider-1",
    );
    expect(result.eligible).toBe(true);
    expect(result.billing_provider).toBe("apple");
  });

  it("blocks subscription switch for active Paystack subscribers", async () => {
    const result = await resolveIosPurchaseEligibility(
      mockSupabase({
        billing_provider: "paystack",
        status: "active",
        paystack_subscription_code: "SUB_123",
        plan: { is_free: false },
      }),
      "provider-1",
    );
    expect(result.eligible).toBe(false);
    expect(result.billing_provider).toBe("paystack");
    expect(result.reason).toMatch(/website/i);
  });

  it("blocks Paystack checkout while Apple billing is still entitled", async () => {
    const blocked = await getAppleBillingPaystackBlock(
      mockSupabase({ billing_provider: "apple", status: "past_due" }),
      "provider-1",
    );
    expect(blocked).toEqual({ blocked: true, message: APPLE_BILLING_ACTIVE_MESSAGE });
  });

  it("allows Paystack checkout after an Apple subscription has expired", async () => {
    const allowed = await getAppleBillingPaystackBlock(
      mockSupabase({ billing_provider: "apple", status: "expired" }),
      "provider-1",
    );
    expect(allowed).toEqual({ blocked: false });
  });

  it("allows IAP for free-tier Paystack accounts", async () => {
    const result = await resolveIosPurchaseEligibility(
      mockSupabase({
        billing_provider: "paystack",
        status: "active",
        paystack_subscription_code: "SUB_123",
        plan: { is_free: true },
      }),
      "provider-1",
    );
    expect(result.eligible).toBe(true);
  });
});

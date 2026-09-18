import { describe, expect, it } from "vitest";
import {
  APPLE_BILLING_ACTIVE_MESSAGE,
  getAppleBillingPaystackBlock,
  resolveIosPurchaseEligibility,
} from "@/lib/iap/apple/ios-eligibility";

function mockSupabase(
  subRow: Record<string, unknown> | null,
  pendingOrder: { id: string } | null = null,
) {
  return {
    from: (table: string) => ({
      select: () => {
        const subChain = {
          maybeSingle: async () => ({ data: subRow, error: null }),
        };
        const orderChain = {
          limit: () => ({
            maybeSingle: async () => ({ data: pendingOrder, error: null }),
          }),
          maybeSingle: async () => ({ data: pendingOrder, error: null }),
        };
        return {
          eq: (_col: string, _val: string) => {
            if (table === "provider_subscription_orders") {
              return {
                eq: () => orderChain,
                ...orderChain,
              };
            }
            return subChain;
          },
        };
      },
    }),
  } as never;
}

describe("resolveIosPurchaseEligibility", () => {
  it("allows IAP when billing_provider is apple and entitled", async () => {
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

  it("blocks IAP for cancel-at-period-end Paystack (active + cancelled_at)", async () => {
    const result = await resolveIosPurchaseEligibility(
      mockSupabase({
        billing_provider: "paystack",
        status: "active",
        paystack_subscription_code: "SUB_123",
        cancelled_at: new Date().toISOString(),
        plan: { is_free: false },
      }),
      "provider-1",
    );
    expect(result.eligible).toBe(false);
  });

  it("blocks IAP for past_due Paystack", async () => {
    const result = await resolveIosPurchaseEligibility(
      mockSupabase({
        billing_provider: "paystack",
        status: "past_due",
        paystack_subscription_code: "SUB_123",
        plan: { is_free: false },
      }),
      "provider-1",
    );
    expect(result.eligible).toBe(false);
  });

  it("blocks IAP when a pending checkout order exists", async () => {
    const result = await resolveIosPurchaseEligibility(
      mockSupabase(
        {
          billing_provider: "paystack",
          status: "active",
          plan: { is_free: true },
        },
        { id: "order-1" },
      ),
      "provider-1",
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/checkout in progress/i);
  });

  it("allows IAP for expired Apple on free tier", async () => {
    const result = await resolveIosPurchaseEligibility(
      mockSupabase({
        billing_provider: "apple",
        status: "expired",
        plan: { is_free: true },
      }),
      "provider-1",
    );
    expect(result.eligible).toBe(true);
    expect(result.billing_provider).toBe("apple");
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

  it("allows IAP for free-tier Paystack accounts without live billing", async () => {
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

import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeCustomOfferPricing } from "../custom-offer-pricing";

vi.mock("@/lib/pricing/checkout-promotion-discount", () => ({
  resolveCheckoutPromotionDiscount: vi.fn(async () => ({
    promotionId: null,
    promotionDiscountAmount: 0,
  })),
}));

vi.mock("@/lib/pricing/checkout-tax-defaults", () => ({
  getPlatformDefaultTaxRateAndInclusive: vi.fn(async () => ({
    taxRate: 15,
    taxIncluded: false,
  })),
}));

vi.mock("@/lib/provider/salon-membership-entitlement", () => ({
  resolveMembershipDiscount: vi.fn(async () => ({
    membershipPlanId: null,
    membershipId: null,
    membershipDiscountAmount: 0,
  })),
}));

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: vi.fn(async () => ({
    data: {
      settings: {
        payouts: {
          platform_service_fee_type: "percentage",
          platform_service_fee_percentage: 5,
          show_service_fee_to_customer: true,
        },
      },
    },
  })),
}));

function makeSupabase(overrides?: {
  taxRate?: number | null;
  taxInclusive?: boolean;
  loyalty?: { redemption_rate: number; min_redemption_points: number; max_redemption_percentage: number } | null;
  loyaltyBalance?: number;
}) {
  const provider = {
    tax_rate_percent: overrides?.taxRate ?? 15,
    tax_inclusive: overrides?.taxInclusive ?? false,
    tips_enabled: true,
    customer_fee_config_id: null,
    tenant_id: "tenant-1",
  };

  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = async () => {
        if (table === "providers") return { data: provider, error: null };
        if (table === "loyalty_point_config") {
          return { data: overrides?.loyalty ?? null, error: null };
        }
        return { data: null, error: null };
      };
      chain.single = async () => {
        if (table === "providers") return { data: provider, error: null };
        return { data: null, error: null };
      };
      return chain;
    },
    rpc: vi.fn(async (fn: string) => {
      if (fn === "get_customer_available_points") {
        return { data: overrides?.loyaltyBalance ?? 0, error: null };
      }
      return { data: null, error: null };
    }),
  } as never;
}

describe("computeCustomOfferPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes travel fee in customer total but excludes it from commission base", async () => {
    const supabase = makeSupabase();
    const res = await computeCustomOfferPricing(supabase, {
      offerPrice: 100,
      travelFee: 25,
      currency: "ZAR",
      providerId: "provider-1",
      customerId: "customer-1",
      tenantId: "tenant-1",
      supabaseAdmin: supabase,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.subtotal).toBe(100);
    expect(res.result.travelFee).toBe(25);
    expect(res.result.commissionBase).toBe(100);
    expect(res.result.totalAmount).toBeGreaterThan(125);
  });

  it("computes exclusive tax and platform fee on subtotal after discounts", async () => {
    const supabase = makeSupabase({ taxRate: 15, taxInclusive: false });
    const res = await computeCustomOfferPricing(supabase, {
      offerPrice: 200,
      travelFee: 0,
      currency: "ZAR",
      providerId: "provider-1",
      customerId: "customer-1",
      tenantId: "tenant-1",
      supabaseAdmin: supabase,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.taxAmount).toBeCloseTo(30, 1);
    expect(res.result.serviceFeeAmount).toBeCloseTo(10, 1);
    expect(res.result.totalAmount).toBeCloseTo(240, 1);
    expect(res.result.commissionBase).toBe(200);
  });

  it("does not reduce commission base by loyalty redemption (platform-funded)", async () => {
    const supabase = makeSupabase({
      loyalty: {
        redemption_rate: 10,
        min_redemption_points: 100,
        max_redemption_percentage: 50,
      },
      loyaltyBalance: 1000,
    });
    const res = await computeCustomOfferPricing(supabase, {
      offerPrice: 100,
      travelFee: 0,
      currency: "ZAR",
      providerId: "provider-1",
      customerId: "customer-1",
      tenantId: "tenant-1",
      supabaseAdmin: supabase,
      loyaltyPointsRequested: 500,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.loyaltyDiscountAmount).toBe(50);
    expect(res.result.loyaltyPointsRedeemed).toBe(500);
    expect(res.result.commissionBase).toBe(100);
    expect(res.result.totalAmount).toBeLessThan(240);
  });

  it("handles tax-inclusive pricing without double-counting tax in total", async () => {
    const supabase = makeSupabase({ taxRate: 15, taxInclusive: true });
    const res = await computeCustomOfferPricing(supabase, {
      offerPrice: 115,
      travelFee: 0,
      currency: "ZAR",
      providerId: "provider-1",
      customerId: "customer-1",
      tenantId: "tenant-1",
      supabaseAdmin: supabase,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.taxAmount).toBeGreaterThan(0);
    expect(res.result.totalAmount).toBeGreaterThanOrEqual(115);
  });
});

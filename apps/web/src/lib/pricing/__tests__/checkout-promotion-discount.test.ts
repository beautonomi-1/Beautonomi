import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCheckoutPromotionDiscount } from "../checkout-promotion-discount";
import { ONCE_PER_CUSTOMER_MESSAGE } from "@/lib/promotions/once-per-customer";

const PROVIDER_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_ID = "00000000-0000-4000-8000-000000000002";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000099";

function makeCheckoutSupabase(
  promo: Record<string, unknown> | null,
  priorUsage: boolean,
): SupabaseClient {
  const promoChain = () => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.is = () => chain;
    chain.maybeSingle = async () => ({ data: promo });
    return chain;
  };
  return {
    from: (table: string) => {
      if (table === "promotion_usage") {
        const result = { count: priorUsage ? 1 : 0, error: null };
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          then: (onFulfilled: (v: typeof result) => unknown) =>
            Promise.resolve(result).then(onFulfilled),
        };
        return chain;
      }
      return promoChain();
    },
  } as unknown as SupabaseClient;
}

describe("resolveCheckoutPromotionDiscount", () => {
  it("sets blockedReason when once_per_customer and prior usage", async () => {
    const supabase = makeCheckoutSupabase(
      {
        id: "promo-1",
        code: "SAVE10",
        type: "percentage",
        value: 10,
        is_active: true,
        provider_id: PROVIDER_ID,
        once_per_customer: true,
        usage_count: 0,
        usage_limit: null,
        min_purchase_amount: null,
        location_id: null,
      },
      true,
    );
    const r = await resolveCheckoutPromotionDiscount(supabase, {
      promoCode: "SAVE10",
      providerId: PROVIDER_ID,
      promoTenantId: TENANT_ID,
      prePromoSubtotal: 200,
      locationType: "at_salon",
      locationId: null,
      customerId: CUSTOMER_ID,
    });
    expect(r.promotionDiscountAmount).toBe(0);
    expect(r.promotionId).toBeNull();
    expect(r.blockedReason).toBe(ONCE_PER_CUSTOMER_MESSAGE);
  });

  it("expired promo returns zero discount and null blockedReason", async () => {
    const supabase = makeCheckoutSupabase(
      {
        id: "promo-exp",
        code: "OLD",
        type: "percentage",
        value: 10,
        is_active: true,
        provider_id: PROVIDER_ID,
        valid_until: new Date(Date.now() - 86400000).toISOString(),
        usage_count: 0,
        usage_limit: null,
        min_purchase_amount: null,
        location_id: null,
      },
      false,
    );
    const r = await resolveCheckoutPromotionDiscount(supabase, {
      promoCode: "OLD",
      providerId: PROVIDER_ID,
      promoTenantId: TENANT_ID,
      prePromoSubtotal: 200,
      locationType: "at_salon",
      locationId: null,
      customerId: CUSTOMER_ID,
    });
    expect(r.promotionDiscountAmount).toBe(0);
    expect(r.blockedReason).toBeNull();
  });

  it("once_per_customer without customerId still discounts at quote time", async () => {
    const supabase = makeCheckoutSupabase(
      {
        id: "promo-3",
        code: "SAVE10",
        type: "percentage",
        value: 10,
        is_active: true,
        provider_id: PROVIDER_ID,
        once_per_customer: true,
        usage_count: 0,
        usage_limit: null,
        min_purchase_amount: null,
        location_id: null,
      },
      true,
    );
    const r = await resolveCheckoutPromotionDiscount(supabase, {
      promoCode: "SAVE10",
      providerId: PROVIDER_ID,
      promoTenantId: TENANT_ID,
      prePromoSubtotal: 200,
      locationType: "at_salon",
      locationId: null,
    });
    expect(r.promotionDiscountAmount).toBe(20);
    expect(r.blockedReason).toBeNull();
  });

  it("applies discount when once_per_customer and no prior usage", async () => {
    const supabase = makeCheckoutSupabase(
      {
        id: "promo-2",
        code: "SAVE10",
        type: "percentage",
        value: 10,
        is_active: true,
        provider_id: PROVIDER_ID,
        once_per_customer: true,
        usage_count: 0,
        usage_limit: null,
        min_purchase_amount: null,
        location_id: null,
      },
      false,
    );
    const r = await resolveCheckoutPromotionDiscount(supabase, {
      promoCode: "SAVE10",
      providerId: PROVIDER_ID,
      promoTenantId: TENANT_ID,
      prePromoSubtotal: 200,
      locationType: "at_salon",
      locationId: null,
      customerId: CUSTOMER_ID,
    });
    expect(r.promotionDiscountAmount).toBe(20);
    expect(r.promotionId).toBe("promo-2");
    expect(r.blockedReason).toBeNull();
  });
});

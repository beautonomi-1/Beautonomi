import { describe, expect, it, vi } from "vitest";
import { computeCustomOfferSplits } from "../custom-offer-splits";

/**
 * Lightweight Supabase mock.
 *
 * Only the surface area used by `computeCustomOfferSplits` is implemented:
 *   .from(table).select(...).eq(...).maybeSingle()
 *   .from(table).select(...).order(...).limit(...).maybeSingle()
 *   .rpc(name, args)
 *
 * Each handler can return a different shape per call to simulate sequencing.
 */
function makeSupabase(
  fixtures: {
    loyalty_point_config?: any;
    loyalty_rules?: any;
    user_wallets?: any;
    gift_cards?: any;
    rpc_get_customer_available_points?: number;
  } = {},
) {
  const select = (table: string) => {
    const chain: any = {
      _table: table,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => ({ data: pickFixture(table), error: null }),
      maybeSingle: async () => ({ data: pickFixture(table), error: null }),
    };
    return chain;
  };
  const pickFixture = (table: string) => {
    if (table === "loyalty_point_config") return fixtures.loyalty_point_config ?? null;
    if (table === "loyalty_rules") return fixtures.loyalty_rules ?? null;
    if (table === "user_wallets") return fixtures.user_wallets ?? null;
    if (table === "gift_cards") return fixtures.gift_cards ?? null;
    return null;
  };
  return {
    from: (table: string) => ({ select: () => select(table) }),
    rpc: vi.fn(async (name: string) => {
      if (name === "get_customer_available_points") {
        return { data: fixtures.rpc_get_customer_available_points ?? 0, error: null };
      }
      return { data: null, error: null };
    }),
  } as any;
}

const baseInput = {
  collectibleAmount: 1000,
  bookingSubtotal: 1000,
  customerId: "user-1",
  currency: "ZAR",
};

describe("computeCustomOfferSplits", () => {
  it("returns zero splits when no inputs are provided", async () => {
    const supabase = makeSupabase();
    const out = await computeCustomOfferSplits(supabase, baseInput);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.walletAmount).toBe(0);
    expect(out.result.giftCardAmount).toBe(0);
    expect(out.result.loyaltyPointsRedeemed).toBe(0);
    expect(out.result.loyaltyDiscountAmount).toBe(0);
    expect(out.result.paystackAmount).toBe(1000);
  });

  it("applies wallet up to balance and leaves remainder for paystack", async () => {
    const supabase = makeSupabase({
      user_wallets: { balance: 300, currency: "ZAR" },
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      useWallet: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.walletAmount).toBe(300);
    expect(out.result.paystackAmount).toBe(700);
  });

  it("caps wallet at the collectible (no negative paystack)", async () => {
    const supabase = makeSupabase({
      user_wallets: { balance: 5000, currency: "ZAR" },
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      useWallet: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.walletAmount).toBe(1000);
    expect(out.result.paystackAmount).toBe(0);
  });

  it("rejects mismatched wallet currency with a warning, doesn't apply wallet", async () => {
    const supabase = makeSupabase({
      user_wallets: { balance: 5000, currency: "USD" },
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      useWallet: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.walletAmount).toBe(0);
    expect(out.result.paystackAmount).toBe(1000);
    expect(out.result.warnings.some((w) => /currency/i.test(w))).toBe(true);
  });

  it("redeems loyalty points before gift card and wallet", async () => {
    const supabase = makeSupabase({
      loyalty_point_config: {
        redemption_rate: 1, // 1 point = R1
        min_redemption_points: 50,
        max_redemption_percentage: 50,
      },
      user_wallets: { balance: 1000, currency: "ZAR" },
      rpc_get_customer_available_points: 1000,
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      useWallet: true,
      loyaltyPointsToRedeem: 200,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 200 points = R200 discount → R800 left
    expect(out.result.loyaltyPointsRedeemed).toBe(200);
    expect(out.result.loyaltyDiscountAmount).toBe(200);
    // Wallet covers the remaining R800
    expect(out.result.walletAmount).toBe(800);
    expect(out.result.paystackAmount).toBe(0);
  });

  it("caps loyalty at max_redemption_percentage of subtotal", async () => {
    const supabase = makeSupabase({
      loyalty_point_config: {
        redemption_rate: 1,
        min_redemption_points: 50,
        max_redemption_percentage: 30, // can only redeem up to 30% of subtotal
      },
      rpc_get_customer_available_points: 1000,
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      loyaltyPointsToRedeem: 1000, // would imply R1000 discount
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Capped at 30% of R1000 = R300
    expect(out.result.loyaltyDiscountAmount).toBe(300);
    expect(out.result.loyaltyPointsRedeemed).toBe(300);
    expect(out.result.warnings.some((w) => /capped/i.test(w))).toBe(true);
  });

  it("rejects below-minimum point redemption", async () => {
    const supabase = makeSupabase({
      loyalty_point_config: {
        redemption_rate: 1,
        min_redemption_points: 100,
        max_redemption_percentage: 100,
      },
      rpc_get_customer_available_points: 1000,
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      loyaltyPointsToRedeem: 50,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("LOYALTY_MIN");
  });

  it("rejects insufficient point balance", async () => {
    const supabase = makeSupabase({
      loyalty_point_config: {
        redemption_rate: 1,
        min_redemption_points: 50,
        max_redemption_percentage: 100,
      },
      rpc_get_customer_available_points: 100,
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      loyaltyPointsToRedeem: 200,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("LOYALTY_INSUFFICIENT");
  });

  it("rejects expired gift card", async () => {
    const supabase = makeSupabase({
      gift_cards: {
        id: "gc-1",
        balance: 500,
        currency: "ZAR",
        is_active: true,
        expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      },
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      giftCardCode: "GIFT123",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("GIFT_CARD_EXPIRED");
  });

  it("applies gift card up to balance and routes remainder to paystack", async () => {
    const supabase = makeSupabase({
      gift_cards: {
        id: "gc-1",
        balance: 400,
        currency: "ZAR",
        is_active: true,
        status: "active",
      },
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      giftCardCode: "GIFT123",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.giftCardId).toBe("gc-1");
    expect(out.result.giftCardAmount).toBe(400);
    expect(out.result.paystackAmount).toBe(600);
  });

  it("loyalty + gift card + wallet fully cover collectible (zero paystack)", async () => {
    const supabase = makeSupabase({
      loyalty_point_config: {
        redemption_rate: 1,
        min_redemption_points: 50,
        max_redemption_percentage: 100,
      },
      rpc_get_customer_available_points: 500,
      gift_cards: {
        id: "gc-1",
        balance: 300,
        currency: "ZAR",
        is_active: true,
        status: "active",
      },
      user_wallets: { balance: 200, currency: "ZAR" },
    });
    const out = await computeCustomOfferSplits(supabase, {
      ...baseInput,
      useWallet: true,
      giftCardCode: "GIFT123",
      loyaltyPointsToRedeem: 500,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Loyalty discount 500 → R500 left → gift covers 300 → R200 left → wallet covers 200
    expect(out.result.loyaltyDiscountAmount).toBe(500);
    expect(out.result.giftCardAmount).toBe(300);
    expect(out.result.walletAmount).toBe(200);
    expect(out.result.paystackAmount).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { computeCollectibleSplits } from "../compute-collectible-splits";

function makeSupabase(
  fixtures: {
    user_wallets?: { balance: number; currency?: string } | null;
    gift_cards?: {
      id: string;
      balance: number;
      currency?: string;
      is_active?: boolean;
      status?: string;
      expires_at?: string | null;
    } | null;
  } = {},
) {
  const pickFixture = (table: string) => {
    if (table === "user_wallets") return fixtures.user_wallets ?? null;
    if (table === "gift_cards") return fixtures.gift_cards ?? null;
    return null;
  };

  const select = (table: string) => {
    const chain: Record<string, unknown> = {
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: pickFixture(table), error: null }),
      single: async () => ({ data: pickFixture(table), error: null }),
    };
    return chain;
  };

  return {
    from: (table: string) => ({ select: () => select(table) }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  } as never;
}

const baseInput = {
  collectibleAmount: 700,
  customerId: "user-1",
  currency: "ZAR",
};

describe("computeCollectibleSplits", () => {
  it("returns full collectible as paystack when no wallet or gift", async () => {
    const supabase = makeSupabase();
    const out = await computeCollectibleSplits(supabase, baseInput);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.walletAmount).toBe(0);
    expect(out.result.giftCardAmount).toBe(0);
    expect(out.result.paystackAmount).toBe(700);
    expect(out.result.warnings).toEqual([]);
  });

  it("does not apply loyalty (loyaltyPointsToRedeem is always 0)", async () => {
    const supabase = makeSupabase({
      user_wallets: { balance: 700, currency: "ZAR" },
    });
    const out = await computeCollectibleSplits(supabase, {
      ...baseInput,
      useWallet: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.walletAmount).toBe(700);
    expect(out.result.paystackAmount).toBe(0);
  });

  it("applies gift card before wallet (gift then wallet on remainder)", async () => {
    const supabase = makeSupabase({
      gift_cards: {
        id: "gc-1",
        balance: 250,
        currency: "ZAR",
        is_active: true,
        status: "active",
      },
      user_wallets: { balance: 300, currency: "ZAR" },
    });
    const out = await computeCollectibleSplits(supabase, {
      ...baseInput,
      useWallet: true,
      giftCardCode: "GIFT250",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.giftCardAmount).toBe(250);
    expect(out.result.walletAmount).toBe(300);
    expect(out.result.paystackAmount).toBe(150);
    expect(out.result.giftCardAmount + out.result.walletAmount + out.result.paystackAmount).toBe(
      700,
    );
  });

  it("caps gift at collectible and routes remainder to wallet then paystack", async () => {
    const supabase = makeSupabase({
      gift_cards: {
        id: "gc-2",
        balance: 1000,
        currency: "ZAR",
        is_active: true,
        status: "active",
      },
      user_wallets: { balance: 100, currency: "ZAR" },
    });
    const out = await computeCollectibleSplits(supabase, {
      collectibleAmount: 500,
      customerId: "user-1",
      currency: "ZAR",
      useWallet: true,
      giftCardCode: "BIGGIFT",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.giftCardAmount).toBe(500);
    expect(out.result.walletAmount).toBe(0);
    expect(out.result.paystackAmount).toBe(0);
  });

  it("wallet covers partial collectible; paystack gets the rest", async () => {
    const supabase = makeSupabase({
      user_wallets: { balance: 200, currency: "ZAR" },
    });
    const out = await computeCollectibleSplits(supabase, {
      ...baseInput,
      useWallet: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.walletAmount).toBe(200);
    expect(out.result.paystackAmount).toBe(500);
  });

  it("skips wallet when currency mismatches collectible", async () => {
    const supabase = makeSupabase({
      user_wallets: { balance: 500, currency: "USD" },
    });
    const out = await computeCollectibleSplits(supabase, {
      ...baseInput,
      useWallet: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.walletAmount).toBe(0);
    expect(out.result.paystackAmount).toBe(700);
    expect(out.result.warnings.some((w) => /currency/i.test(w))).toBe(true);
  });

  it("rejects inactive gift card", async () => {
    const supabase = makeSupabase({
      gift_cards: {
        id: "gc-bad",
        balance: 100,
        currency: "ZAR",
        is_active: false,
        status: "inactive",
      },
    });
    const out = await computeCollectibleSplits(supabase, {
      ...baseInput,
      giftCardCode: "BAD",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("GIFT_CARD_INACTIVE");
  });
});

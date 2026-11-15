import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A gift card redeemed to a wallet moves gift-card liability into wallet
 * liability. The wallet credit is saved first. A later redeem of the same card
 * posts the redemption and the two finance rows when they are missing.
 */
export async function ensureGiftCardWalletRedemptionLedger(
  supabase: SupabaseClient,
  input: {
    giftCardId: string;
    code: string;
    userId: string;
    amount: number;
    currency: string;
    tenantId: string | null;
  },
): Promise<void> {
  const code = input.code.trim().toUpperCase();
  const liabilityDescription = `Gift card ${code} redeemed to wallet`;
  const walletDescription = `Wallet liability increase from gift card ${code} redemption`;

  const { data: existingRedemption, error: redemptionLookupError } = await supabase
    .from("gift_card_redemptions")
    .select("id")
    .eq("gift_card_id", input.giftCardId)
    .eq("user_id", input.userId)
    .eq("status", "captured")
    .limit(1)
    .maybeSingle();
  if (redemptionLookupError) {
    console.error("[redeem-gift-card] redemption lookup failed:", redemptionLookupError);
    throw redemptionLookupError;
  }
  if (!existingRedemption) {
    const { error: redemptionError } = await supabase.from("gift_card_redemptions").insert({
      gift_card_id: input.giftCardId,
      booking_id: null,
      user_id: input.userId,
      amount: input.amount,
      currency: input.currency,
      status: "captured",
      captured_at: new Date().toISOString(),
    });
    if (redemptionError && (redemptionError as { code?: string }).code !== "23505") {
      console.error("[redeem-gift-card] Failed to record redemption audit row:", redemptionError);
    }
  }

  await insertFinanceOnce(supabase, {
    transactionType: "gift_card_liability_reduction",
    description: liabilityDescription,
    amount: input.amount,
    net: -input.amount,
    tenantId: input.tenantId,
    metadata: null,
  });
  await insertFinanceOnce(supabase, {
    transactionType: "wallet_topup",
    description: walletDescription,
    amount: input.amount,
    net: input.amount,
    tenantId: input.tenantId,
    metadata: { source: "gift_card_redemption", gift_card_id: input.giftCardId },
  });
}

async function insertFinanceOnce(
  supabase: SupabaseClient,
  input: {
    transactionType: string;
    description: string;
    amount: number;
    net: number;
    tenantId: string | null;
    metadata: Record<string, unknown> | null;
  },
): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("transaction_type", input.transactionType)
    .eq("description", input.description)
    .limit(1)
    .maybeSingle();
  if (lookupError) {
    console.error("[redeem-gift-card] finance lookup failed:", lookupError);
    throw lookupError;
  }
  if (existing) return;

  const { error } = await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: null,
    tenant_id: input.tenantId,
    transaction_type: input.transactionType,
    amount: input.amount,
    fees: 0,
    commission: 0,
    net: input.net,
    description: input.description,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    created_at: new Date().toISOString(),
  });
  if (error) {
    const code = String((error as { code?: string }).code || "");
    const msg = String((error as { message?: string }).message || "");
    if (code === "23505" || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      return;
    }
    console.error(`[redeem-gift-card] Failed to record ${input.transactionType}:`, error);
    throw error;
  }
}

/**
 * Returns the credited amount when this user already received the gift card
 * in their wallet. A card with no saved credit returns null.
 */
export async function creditedGiftCardRedemptionAmount(
  supabase: SupabaseClient,
  input: { giftCardId: string; userId: string },
): Promise<number | null> {
  const keys = [
    `gift_card_redemption:${input.giftCardId}`,
    `gift_card_claim:${input.giftCardId}:${input.userId}`,
  ];
  const { data: credit, error } = await supabase
    .from("wallet_transactions")
    .select("id, wallet_id, amount")
    .in("idempotency_key", keys)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[redeem-gift-card] wallet credit lookup failed:", error);
    throw error;
  }
  if (!credit) return null;
  const walletId = (credit as { wallet_id?: string }).wallet_id;
  const { data: wallet, error: walletError } = await supabase
    .from("user_wallets")
    .select("user_id")
    .eq("id", walletId)
    .maybeSingle();
  if (walletError) {
    console.error("[redeem-gift-card] wallet owner lookup failed:", walletError);
    throw walletError;
  }
  if ((wallet as { user_id?: string } | null)?.user_id !== input.userId) return null;
  const amount = Number((credit as { amount?: number }).amount);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

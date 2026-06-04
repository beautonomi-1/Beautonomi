/**
 * Split-tender preview for any collectible amount (booking remainder, additional charge, etc.).
 * Order: gift card → wallet → Paystack remainder. Loyalty is not applied here (handled at checkout pricing).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCustomOfferSplits,
  type CustomOfferSplit,
  type CustomOfferSplitResult,
} from "@/app/api/me/custom-offers/_helpers/custom-offer-splits";

export type CollectibleSplitInput = {
  collectibleAmount: number;
  customerId: string;
  currency: string;
  useWallet?: boolean;
  giftCardCode?: string | null;
};

export type CollectibleSplit = Pick<
  CustomOfferSplit,
  | "walletAmount"
  | "giftCardAmount"
  | "giftCardId"
  | "giftCardBalance"
  | "paystackAmount"
  | "warnings"
>;

export type CollectibleSplitResult =
  | { ok: true; result: CollectibleSplit }
  | { ok: false; error: string; code?: string };

export async function computeCollectibleSplits(
  supabase: SupabaseClient,
  input: CollectibleSplitInput,
): Promise<CollectibleSplitResult> {
  const preview = await computeCustomOfferSplits(supabase, {
    collectibleAmount: input.collectibleAmount,
    bookingSubtotal: input.collectibleAmount,
    customerId: input.customerId,
    currency: input.currency,
    useWallet: input.useWallet,
    giftCardCode: input.giftCardCode ?? null,
    loyaltyPointsToRedeem: 0,
  });
  if (preview.ok === false) {
    return preview;
  }
  const r = preview.result;
  return {
    ok: true,
    result: {
      walletAmount: r.walletAmount,
      giftCardAmount: r.giftCardAmount,
      giftCardId: r.giftCardId,
      giftCardBalance: r.giftCardBalance,
      paystackAmount: r.paystackAmount,
      warnings: r.warnings,
    },
  };
}

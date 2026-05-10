/**
 * Custom-offer split-tender preview.
 *
 * Pure compute (no DB writes) that mirrors the booking-checkout split logic so
 * both the /quote preview and the /pay endpoint share the same arithmetic.
 *
 * Inputs are the validated pricing total + the customer's intent (use wallet,
 * apply gift card balance, redeem N loyalty points). Outputs are the per-tender
 * amounts and the residual `paystack_amount` the gateway must collect.
 *
 * Validation note: gift-card balance and wallet balance are looked up
 * (read-only). The actual reservation / debit happens inside the /pay route
 * just before the Paystack call (so we can roll back on init failure).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { percentOf } from "@beautonomi/utils";

export interface CustomOfferSplitInput {
  /** Amount the customer would owe before any wallet / gift / loyalty (after promo+tax+fees+tip). */
  collectibleAmount: number;
  /** Pre-discount subtotal — used for loyalty max-redemption-percentage cap. */
  bookingSubtotal: number;
  customerId: string;
  currency: string;
  useWallet?: boolean;
  giftCardCode?: string | null;
  loyaltyPointsToRedeem?: number;
}

export interface CustomOfferSplit {
  walletAmount: number;
  giftCardAmount: number;
  giftCardId: string | null;
  giftCardBalance: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscountAmount: number;
  /** Residual to charge via Paystack (0 means fully covered by wallet+gift+loyalty). */
  paystackAmount: number;
  warnings: string[];
}

export type CustomOfferSplitResult =
  | { ok: true; result: CustomOfferSplit }
  | { ok: false; error: string; code?: string };

/**
 * Compute split tenders. Order of application (matches booking checkout):
 *   1. Loyalty points (a *discount*, not a tender — reduces collectible)
 *   2. Gift card (consumes balance up to remaining collectible)
 *   3. Wallet (covers remainder up to balance)
 *   4. Paystack (whatever is left)
 *
 * This function does not write to the DB. The /pay route reserves gift cards
 * and debits the wallet only after pricing is confirmed and just before the
 * Paystack call, so init failures can be rolled back cleanly.
 */
export async function computeCustomOfferSplits(
  supabase: SupabaseClient,
  input: CustomOfferSplitInput,
): Promise<CustomOfferSplitResult> {
  const warnings: string[] = [];

  let remaining = Math.max(0, Math.round(input.collectibleAmount * 100) / 100);

  // ── 1. Loyalty redemption preview ────────────────────────────────────────
  let loyaltyPointsRedeemed = 0;
  let loyaltyDiscountAmount = 0;
  if ((input.loyaltyPointsToRedeem ?? 0) > 0) {
    const requested = Math.floor(Number(input.loyaltyPointsToRedeem) || 0);

    let { data: config } = await supabase
      .from("loyalty_point_config")
      .select("redemption_rate, min_redemption_points, max_redemption_percentage")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config) {
      const { data: legacy } = await supabase
        .from("loyalty_rules")
        .select("redemption_rate, min_redemption_points, max_redemption_percentage")
        .eq("is_active", true)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (legacy) {
        config = {
          redemption_rate: (legacy as any).redemption_rate,
          min_redemption_points: (legacy as any).min_redemption_points ?? 50,
          max_redemption_percentage: (legacy as any).max_redemption_percentage ?? 100,
        } as any;
      }
    }

    if (!config) {
      warnings.push("Loyalty points are not configured for this tenant.");
    } else {
      const cfg = config as {
        redemption_rate: number;
        min_redemption_points: number;
        max_redemption_percentage: number;
      };

      const { data: ledgerBal } = await (supabase.rpc as any)("get_customer_available_points", {
        customer_uuid: input.customerId,
      });
      const available = Number(ledgerBal) || 0;

      if (requested < cfg.min_redemption_points) {
        return {
          ok: false,
          error: `Minimum ${cfg.min_redemption_points} points required to redeem.`,
          code: "LOYALTY_MIN",
        };
      }
      if (requested > available) {
        return {
          ok: false,
          error: "You don't have enough loyalty points for this redemption.",
          code: "LOYALTY_INSUFFICIENT",
        };
      }

      const rate = Number(cfg.redemption_rate) || 0;
      if (rate <= 0) {
        warnings.push("Loyalty redemption rate is 0 — points cannot be applied.");
      } else {
        const requestedDiscount = requested / rate;
        const maxDiscount = percentOf(input.bookingSubtotal, Number(cfg.max_redemption_percentage));
        let discount = Math.min(requestedDiscount, maxDiscount);
        let usedPoints = requested;
        if (discount < requestedDiscount) {
          usedPoints = Math.floor(maxDiscount * rate);
          warnings.push(
            `Loyalty discount capped at ${cfg.max_redemption_percentage}% of subtotal (${maxDiscount.toFixed(2)} ${input.currency}).`,
          );
        }
        // Don't redeem more than what is left to collect.
        if (discount > remaining) {
          discount = remaining;
          usedPoints = Math.floor(discount * rate);
        }
        loyaltyPointsRedeemed = Math.max(0, Math.floor(usedPoints));
        loyaltyDiscountAmount = Math.max(0, Math.round(discount * 100) / 100);
        remaining = Math.max(0, Math.round((remaining - loyaltyDiscountAmount) * 100) / 100);
      }
    }
  }

  // ── 2. Gift card preview (read-only balance lookup; reservation in /pay) ─
  let giftCardId: string | null = null;
  let giftCardBalance = 0;
  let giftCardAmount = 0;
  const giftCode = (input.giftCardCode || "").toString().trim().toUpperCase();
  if (giftCode) {
    const { data: gcRow } = await (supabase.from("gift_cards") as any)
      .select("id, code, balance, currency, status, expires_at, is_active")
      .eq("code", giftCode)
      .maybeSingle();
    if (!gcRow) {
      return { ok: false, error: "Gift card not found.", code: "GIFT_CARD_NOT_FOUND" };
    }
    const gc = gcRow as {
      id: string;
      balance: number;
      currency?: string;
      status?: string;
      expires_at?: string | null;
      is_active?: boolean | null;
    };
    if (gc.is_active === false || (gc.status && gc.status !== "active")) {
      return { ok: false, error: "Gift card is no longer active.", code: "GIFT_CARD_INACTIVE" };
    }
    if (gc.expires_at && new Date(gc.expires_at).getTime() < Date.now()) {
      return { ok: false, error: "Gift card has expired.", code: "GIFT_CARD_EXPIRED" };
    }
    if (gc.currency && input.currency && gc.currency !== input.currency) {
      return {
        ok: false,
        error: `Gift card currency (${gc.currency}) doesn't match the offer (${input.currency}).`,
        code: "GIFT_CARD_CURRENCY",
      };
    }
    giftCardId = gc.id;
    giftCardBalance = Math.max(0, Number(gc.balance) || 0);
    if (remaining > 0) {
      giftCardAmount = Math.min(giftCardBalance, remaining);
      remaining = Math.max(0, Math.round((remaining - giftCardAmount) * 100) / 100);
    }
  }

  // ── 3. Wallet preview ────────────────────────────────────────────────────
  let walletAmount = 0;
  if (input.useWallet && remaining > 0) {
    const { data: wallet } = await supabase
      .from("user_wallets")
      .select("balance, currency")
      .eq("user_id", input.customerId)
      .maybeSingle();
    const balance = Math.max(0, Number((wallet as any)?.balance ?? 0));
    const walletCurrency = (wallet as any)?.currency as string | undefined;
    if (walletCurrency && input.currency && walletCurrency !== input.currency) {
      warnings.push(
        `Wallet currency (${walletCurrency}) doesn't match the offer (${input.currency}); wallet skipped.`,
      );
    } else if (balance > 0) {
      walletAmount = Math.min(balance, remaining);
      remaining = Math.max(0, Math.round((remaining - walletAmount) * 100) / 100);
    }
  }

  return {
    ok: true,
    result: {
      walletAmount,
      giftCardAmount,
      giftCardId,
      giftCardBalance,
      loyaltyPointsRedeemed,
      loyaltyDiscountAmount,
      paystackAmount: remaining,
      warnings,
    },
  };
}

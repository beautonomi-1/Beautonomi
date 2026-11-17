import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCurrency, subtractMoney } from "@beautonomi/utils";

/**
 * One redemption row exists per booking. Reuse it only when it already holds
 * this exact amount. A different amount must not be credited on top.
 */
export function existingGiftHoldDecision(input: {
  existingAmount: number | null;
  existingStatus: string | null;
  requested: number;
}): "reuse" | "reject" | "create" {
  if (input.existingAmount == null && input.existingStatus == null) return "create";
  const held = Number(input.existingAmount);
  const sameAmount = Number.isFinite(held) && Math.abs(held - input.requested) <= 0.02;
  const open = input.existingStatus === "reserved" || input.existingStatus === "captured";
  return sameAmount && open ? "reuse" : "reject";
}

/** Balance left after a hold. Null when the card cannot cover the amount. */
export function giftCardBalanceAfterHold(current: number, amount: number): number | null {
  const balance = Number(current);
  const take = Number(amount);
  if (!Number.isFinite(balance) || !Number.isFinite(take) || take <= 0 || balance + 0.001 < take) {
    return null;
  }
  return subtractMoney(balance, take);
}

export type GiftHoldResult =
  | { ok: true; giftCardId: string; amount: number; alreadyHeld: boolean }
  | { ok: false; reason: string };

/**
 * Hold a gift card against a booking using the service connection.
 * `reserve_gift_card_redemption` requires auth.uid(), which is null for the
 * service role, so custom-offer finalize cannot use that function.
 * The balance update matches the balance we just read, so two charges cannot
 * both spend the same funds.
 */
export async function holdGiftCardOnBooking(
  admin: SupabaseClient,
  input: {
    code: string;
    amount: number;
    bookingId: string;
    currency: string;
    userId: string | null;
  },
): Promise<GiftHoldResult> {
  const amount = roundCurrency(Math.max(0, Number(input.amount) || 0));
  const code = input.code.trim().toUpperCase();
  if (amount <= 0 || !code) return { ok: false, reason: "invalid_gift_card" };

  const { data: existing, error: existingError } = await admin
    .from("gift_card_redemptions")
    .select("amount, status, gift_card_id")
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (existingError) return { ok: false, reason: "gift_card_lookup_failed" };

  const decision = existingGiftHoldDecision({
    existingAmount: existing == null ? null : Number((existing as { amount?: number }).amount),
    existingStatus: existing == null ? null : String((existing as { status?: string }).status ?? ""),
    requested: amount,
  });
  if (decision === "reject") return { ok: false, reason: "gift_card_already_applied" };
  if (decision === "reuse") {
    return {
      ok: true,
      giftCardId: String((existing as { gift_card_id?: string }).gift_card_id ?? ""),
      amount,
      alreadyHeld: true,
    };
  }

  const { data: cards, error: cardError } = await admin
    .from("gift_cards")
    .select("id, code, balance, currency, is_active, expires_at")
    .ilike("code", code)
    .limit(5);
  if (cardError) return { ok: false, reason: "gift_card_lookup_failed" };
  const card = (cards ?? []).find(
    (row) => String((row as { code?: string }).code ?? "").trim().toUpperCase() === code,
  ) as
    | {
        id: string;
        balance: number | string;
        currency?: string;
        is_active?: boolean;
        expires_at?: string | null;
      }
    | undefined;
  if (!card || card.is_active === false) return { ok: false, reason: "invalid_gift_card" };
  if (card.expires_at && new Date(card.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "gift_card_expired" };
  }
  if (String(card.currency || "ZAR").toUpperCase() !== input.currency.toUpperCase()) {
    return { ok: false, reason: "gift_card_currency_mismatch" };
  }

  const nextBalance = giftCardBalanceAfterHold(Number(card.balance), amount);
  if (nextBalance == null) return { ok: false, reason: "insufficient_gift_card_balance" };

  const { data: updated, error: updateError } = await admin
    .from("gift_cards")
    .update({ balance: nextBalance })
    .eq("id", card.id)
    .eq("balance", card.balance)
    .select("id");
  if (updateError || !updated || updated.length === 0) {
    return { ok: false, reason: "gift_card_balance_changed" };
  }

  const { error: insertError } = await admin.from("gift_card_redemptions").insert({
    gift_card_id: card.id,
    booking_id: input.bookingId,
    user_id: input.userId,
    amount,
    currency: input.currency,
    status: "reserved",
    reserved_at: new Date().toISOString(),
  });
  if (insertError) {
    await admin.from("gift_cards").update({ balance: card.balance }).eq("id", card.id).eq("balance", nextBalance);
    return { ok: false, reason: "gift_card_redemption_failed" };
  }

  return { ok: true, giftCardId: card.id, amount, alreadyHeld: false };
}

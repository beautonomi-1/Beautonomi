import type { SupabaseClient } from "@supabase/supabase-js";
import { LAST_RESORT_CURRENCY, addMoney, fromMinorUnits, roundCurrency, subtractMoney } from "@beautonomi/utils";

type GiftCardRow = {
  id: string;
  code?: string | null;
  balance?: number | string | null;
  currency?: string | null;
  is_active?: boolean | null;
  expires_at?: string | null;
};

type RedemptionRow = {
  id: string;
  status?: string | null;
  amount?: number | string | null;
  gift_card_id?: string | null;
};

/**
 * The reserved gift amount has to be the gift-card payment, not an extra charge
 * and not a different figure from the gift line.
 * With no other tender, the gift has to cover the sale.
 */
export function saleGiftTenderMismatch(input: {
  giftCode: string;
  giftAmount: number;
  saleTotal: number;
  legs: Array<{ method?: string | null; amount?: number | string | null }> | null;
}): string | null {
  const giftLegTotal = (input.legs ?? [])
    .filter((leg) => String(leg.method ?? "").trim().toLowerCase() === "gift_card")
    .reduce((sum, leg) => addMoney(sum, Number(leg.amount ?? 0)), 0);
  const giftAmount = roundCurrency(Number(input.giftAmount) || 0);
  const hasCode = input.giftCode.trim().length > 0;
  const hasLegs = (input.legs ?? []).length > 0;

  if (giftLegTotal > 0.009 && (!hasCode || Math.abs(giftAmount - giftLegTotal) > 0.02)) {
    return "Gift card amount does not match the gift card payment";
  }
  if (hasCode && giftAmount > 0.009 && giftLegTotal <= 0.009) {
    if (!hasLegs && Math.abs(giftAmount - roundCurrency(input.saleTotal)) <= 0.02) return null;
    return "Gift card amount does not match the gift card payment";
  }
  return null;
}

export function saleGiftCardRejectReason(
  card: Pick<GiftCardRow, "is_active" | "expires_at" | "currency" | "balance">,
  amount: number,
  currency: string,
): string | null {
  if (card.is_active === false) return "Gift card is inactive";
  if (card.expires_at && new Date(card.expires_at).getTime() <= Date.now()) {
    return "Gift card has expired";
  }
  const cardCurrency = String(card.currency ?? "").trim().toUpperCase();
  const saleCurrency = currency.trim().toUpperCase();
  if (cardCurrency && saleCurrency && cardCurrency !== saleCurrency) {
    return "Gift card currency does not match this sale";
  }
  if (Number(card.balance ?? 0) + 0.001 < amount) return "Insufficient gift card balance";
  return null;
}

/** A gift payment counts only while the redemption is still reserved or captured. */
export function heldSaleGiftAmount(
  giftPaid: number,
  redemptionStatus: string | null | undefined,
): number {
  if (redemptionStatus !== "reserved" && redemptionStatus !== "captured") return 0;
  return roundCurrency(Math.max(0, Number(giftPaid) || 0));
}

/**
 * Card machines collect the sale total minus a gift that is still held
 * and minus card payments that already succeeded.
 */
/** A card charge can close a sale only when it matches the amount still owed. */
export function saleChargeMatchesDue(charge: number, due: number | null): boolean {
  return due != null && Math.abs(Number(charge) - due) <= 0.02;
}

export function saleCardAmountStillDue(
  saleTotal: number,
  giftCardPaid: number,
  cardAlreadyTaken = 0,
): number {
  return roundCurrency(
    Math.max(
      0,
      subtractMoney(subtractMoney(Number(saleTotal), Math.max(0, Number(giftCardPaid) || 0)), Math.max(0, Number(cardAlreadyTaken) || 0)),
    ),
  );
}

export async function sumSaleGiftCardPaid(
  supabase: SupabaseClient,
  saleId: string,
): Promise<number> {
  const bySale = await sumSaleGiftCardPaidBySaleIds(supabase, [saleId]);
  return bySale.get(saleId) ?? 0;
}

export async function sumSaleGiftCardPaidBySaleIds(
  supabase: SupabaseClient,
  saleIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  const ids = [...new Set(saleIds.filter(Boolean))];
  if (ids.length === 0) return totals;
  const { data, error } = await supabase
    .from("sale_payments")
    .select("sale_id, amount")
    .in("sale_id", ids)
    .eq("method", "gift_card");
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ sale_id?: string; amount?: number | string | null }>) {
    const saleId = String(row.sale_id ?? "");
    if (!saleId) continue;
    totals.set(saleId, addMoney(totals.get(saleId) ?? 0, Number(row.amount ?? 0)));
  }
  if (totals.size === 0) return totals;
  const { data: redemptions, error: redemptionError } = await supabase
    .from("gift_card_redemptions")
    .select("sale_id, status")
    .in("sale_id", [...totals.keys()]);
  if (redemptionError) throw new Error(redemptionError.message);
  const statusBySale = new Map<string, string>();
  for (const row of (redemptions ?? []) as Array<{ sale_id?: string; status?: string | null }>) {
    const saleId = String(row.sale_id ?? "");
    if (saleId) statusBySale.set(saleId, String(row.status ?? ""));
  }
  for (const saleId of [...totals.keys()]) {
    const held = heldSaleGiftAmount(totals.get(saleId) ?? 0, statusBySale.get(saleId));
    if (held <= 0.009) totals.delete(saleId);
    else totals.set(saleId, held);
  }
  return totals;
}

/** Successful Yoco and PayCloud charges already taken for these sales, in major units. */
export async function sumSuccessfulSaleCardTakenBySaleIds(
  supabase: SupabaseClient,
  saleIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  const ids = [...new Set(saleIds.filter(Boolean))];
  if (ids.length === 0) return totals;
  const add = (saleId: string, amount: number) => {
    if (!saleId || amount <= 0) return;
    totals.set(saleId, addMoney(totals.get(saleId) ?? 0, amount));
  };
  const { data: yocoRows, error: yocoError } = await supabase
    .from("provider_yoco_payments")
    .select("sale_id, amount, refund_amount, refund_status")
    .in("sale_id", ids)
    .eq("status", "successful");
  if (yocoError) throw new Error(yocoError.message);
  for (const row of (yocoRows ?? []) as Array<{
    sale_id?: string;
    amount?: number | string | null;
    refund_amount?: number | string | null;
    refund_status?: string | null;
  }>) {
    if (String(row.refund_status ?? "") === "fully_refunded") continue;
    const gross = fromMinorUnits(Number(row.amount ?? 0), LAST_RESORT_CURRENCY);
    const refunded = fromMinorUnits(Number(row.refund_amount ?? 0), LAST_RESORT_CURRENCY);
    add(
      String(row.sale_id ?? ""),
      Math.max(0, subtractMoney(gross, Math.max(0, refunded), LAST_RESORT_CURRENCY)),
    );
  }
  const { data: paycloudRows, error: paycloudError } = await supabase
    .from("provider_paycloud_payments")
    .select("sale_id, amount")
    .in("sale_id", ids)
    .eq("status", "successful");
  if (paycloudError) throw new Error(paycloudError.message);
  for (const row of (paycloudRows ?? []) as Array<{ sale_id?: string; amount?: number | string | null }>) {
    add(String(row.sale_id ?? ""), Number(row.amount ?? 0));
  }
  return totals;
}

/**
 * What a card machine may still collect for this sale.
 * Null when the sale is missing or already completed.
 */
export async function saleCardAmountStillDueForSale(
  supabase: SupabaseClient,
  providerId: string,
  saleId: string,
): Promise<number | null> {
  const { data: sale, error } = await supabase
    .from("sales")
    .select("total_amount, payment_status")
    .eq("id", saleId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sale || sale.payment_status === "completed") return null;
  const giftPaid = await sumSaleGiftCardPaid(supabase, saleId);
  const cardTaken =
    (await sumSuccessfulSaleCardTakenBySaleIds(supabase, [saleId])).get(saleId) ?? 0;
  return saleCardAmountStillDue(Number(sale.total_amount ?? 0), giftPaid, cardTaken);
}

async function findGiftCard(
  supabase: SupabaseClient,
  code: string,
): Promise<{ card: GiftCardRow | null; error: string | null }> {
  const normalized = code.trim();
  const { data, error } = await supabase
    .from("gift_cards")
    .select("id, code, balance, currency, is_active, expires_at")
    .ilike("code", normalized);
  if (error) return { card: null, error: error.message };
  const card = ((data ?? []) as GiftCardRow[]).find(
    (row) => String(row.code ?? "").trim().toUpperCase() === normalized.toUpperCase(),
  );
  return { card: card ?? null, error: null };
}

/**
 * Hold a gift card against a till sale.
 * The sale RPC checks `gift_cards.status`, which is not a column. Cards are
 * `is_active` plus `expires_at`, so the hold is done here.
 */
export async function reserveSaleGiftCard(
  supabase: SupabaseClient,
  input: { code: string; amount: number; saleId: string; currency: string; userId: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const amount = roundCurrency(input.amount);
  if (!(amount > 0)) return { ok: false, message: "Gift card amount is invalid" };

  const { data: existing, error: existingError } = await supabase
    .from("gift_card_redemptions")
    .select("id, status")
    .eq("sale_id", input.saleId)
    .maybeSingle();
  if (existingError) return { ok: false, message: existingError.message };
  const existingStatus = String((existing as RedemptionRow | null)?.status ?? "");
  if (existingStatus === "reserved" || existingStatus === "captured") return { ok: true };
  if (existing) return { ok: false, message: "Gift card could not be applied" };

  const found = await findGiftCard(supabase, input.code);
  if (found.error) return { ok: false, message: found.error };
  if (!found.card) return { ok: false, message: "Invalid gift card code" };
  const rejected = saleGiftCardRejectReason(found.card, amount, input.currency);
  if (rejected) return { ok: false, message: rejected };

  const previousBalance = roundCurrency(Number(found.card.balance ?? 0));
  const nextBalance = subtractMoney(previousBalance, amount);
  const { data: held, error: holdError } = await supabase
    .from("gift_cards")
    .update({ balance: nextBalance, updated_at: new Date().toISOString() })
    .eq("id", found.card.id)
    .eq("balance", previousBalance)
    .eq("is_active", true)
    .select("id")
    .maybeSingle();
  if (holdError) return { ok: false, message: holdError.message };
  if (!held) return { ok: false, message: "Gift card balance changed. Try again." };

  const { error: insertError } = await supabase.from("gift_card_redemptions").insert({
    gift_card_id: found.card.id,
    sale_id: input.saleId,
    user_id: input.userId,
    amount,
    currency: input.currency,
    status: "reserved",
    reserved_at: new Date().toISOString(),
  });
  if (insertError) {
    await supabase
      .from("gift_cards")
      .update({ balance: previousBalance, updated_at: new Date().toISOString() })
      .eq("id", found.card.id)
      .eq("balance", nextBalance);
    return { ok: false, message: insertError.message };
  }
  return { ok: true };
}

export async function captureSaleGiftCard(
  supabase: SupabaseClient,
  saleId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: redemption, error } = await supabase
    .from("gift_card_redemptions")
    .select("id, status, amount, gift_card_id")
    .eq("sale_id", saleId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  const row = redemption as RedemptionRow | null;
  if (!row) return { ok: false, message: "Gift card was not held for this sale" };
  if (row.status === "captured") return { ok: true };
  if (row.status !== "reserved") return { ok: false, message: "Gift card was not held for this sale" };

  const { data: card, error: cardError } = await supabase
    .from("gift_cards")
    .select("id, balance, is_active, expires_at")
    .eq("id", row.gift_card_id)
    .maybeSingle();
  if (cardError) return { ok: false, message: cardError.message };
  const giftCard = card as GiftCardRow | null;
  if (!giftCard) return { ok: false, message: "Gift card not found" };
  const expiredOrInactive =
    giftCard.is_active === false ||
    (giftCard.expires_at != null && new Date(giftCard.expires_at).getTime() <= Date.now());
  if (expiredOrInactive) {
    // Leave the redemption reserved. The sale rollback voids it once and
    // puts the held amount back on the card.
    return { ok: false, message: "Gift card is no longer redeemable" };
  }

  const { data: captured, error: captureError } = await supabase
    .from("gift_card_redemptions")
    .update({ status: "captured", captured_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "reserved")
    .select("id")
    .maybeSingle();
  if (captureError) return { ok: false, message: captureError.message };
  if (!captured) return { ok: false, message: "Gift card was not held for this sale" };
  return { ok: true };
}

/**
 * Capture a reserved till-sale gift when the sale is actually paid.
 * No redemption means the sale did not use a gift card.
 * A failed capture is voided so the hold is not left on the card.
 */
export async function settleReservedSaleGiftCard(
  supabase: SupabaseClient,
  saleId: string,
  options?: { cardAmount?: number; cardAmountAlreadyRecorded?: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("gift_card_redemptions")
    .select("status")
    .eq("sale_id", saleId)
    .maybeSingle();
  if (error) {
    const message = error.message ?? "";
    // A database without sale gift redemptions has nothing to capture.
    // Card sales that did not use a gift card must still be able to complete.
    if (/sale_id|schema cache/i.test(message)) return { ok: true };
    return { ok: false, message };
  }
  const status = String((data as { status?: string } | null)?.status ?? "");
  if (!data || status === "captured") return { ok: true };
  if (status === "voided") {
    const cardAmount = Number(options?.cardAmount);
    if (!Number.isFinite(cardAmount)) {
      return { ok: false, message: "Gift card was not held for this sale" };
    }
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .select("total_amount")
      .eq("id", saleId)
      .maybeSingle();
    if (saleError) return { ok: false, message: saleError.message };
    if (!sale) return { ok: false, message: "Sale not found" };
    let recorded = 0;
    try {
      recorded = (await sumSuccessfulSaleCardTakenBySaleIds(supabase, [saleId])).get(saleId) ?? 0;
    } catch (readError) {
      return {
        ok: false,
        message: readError instanceof Error ? readError.message : "Could not read card payments",
      };
    }
    const covered = options?.cardAmountAlreadyRecorded
      ? recorded
      : addMoney(recorded, cardAmount);
    const total = Number((sale as { total_amount?: number | string | null }).total_amount ?? 0);
    if (covered + 0.02 < total) {
      return { ok: false, message: "Gift card was not held for this sale" };
    }
    return { ok: true };
  }
  if (status !== "reserved") return { ok: false, message: "Gift card was not held for this sale" };
  const captured = await captureSaleGiftCard(supabase, saleId);
  if (!captured.ok) {
    await voidSaleGiftCard(supabase, saleId);
    return captured;
  }
  return { ok: true };
}

/**
 * Return a sale gift to the card when the whole sale is reversed.
 * Reserved and captured redemptions are both restored once. Already voided is left as is.
 */
export async function restoreSaleGiftCard(supabase: SupabaseClient, saleId: string): Promise<void> {
  const { data: redemption } = await supabase
    .from("gift_card_redemptions")
    .select("id, status, amount, gift_card_id")
    .eq("sale_id", saleId)
    .maybeSingle();
  const row = redemption as RedemptionRow | null;
  if (!row || (row.status !== "reserved" && row.status !== "captured")) return;

  const { data: card } = await supabase
    .from("gift_cards")
    .select("id, balance")
    .eq("id", row.gift_card_id)
    .maybeSingle();
  const giftCard = card as GiftCardRow | null;
  if (!giftCard) return;
  const currentBalance = roundCurrency(Number(giftCard.balance ?? 0));
  const restored = addMoney(currentBalance, Number(row.amount ?? 0));
  const { data: restoredRow } = await supabase
    .from("gift_cards")
    .update({ balance: restored, updated_at: new Date().toISOString() })
    .eq("id", giftCard.id)
    .eq("balance", currentBalance)
    .select("id")
    .maybeSingle();
  if (!restoredRow) return;
  const { data: voided } = await supabase
    .from("gift_card_redemptions")
    .update({ status: "voided", voided_at: new Date().toISOString() })
    .eq("id", row.id)
    .in("status", ["reserved", "captured"])
    .select("id")
    .maybeSingle();
  if (!voided) {
    await supabase
      .from("gift_cards")
      .update({ balance: currentBalance, updated_at: new Date().toISOString() })
      .eq("id", giftCard.id)
      .eq("balance", restored);
  }
}

/** Put a reserved sale hold back on the card. A captured redemption is left captured. */
export async function voidSaleGiftCard(supabase: SupabaseClient, saleId: string): Promise<void> {
  const { data: redemption } = await supabase
    .from("gift_card_redemptions")
    .select("id, status, amount, gift_card_id")
    .eq("sale_id", saleId)
    .maybeSingle();
  const row = redemption as RedemptionRow | null;
  if (!row || row.status !== "reserved") return;

  const { data: card } = await supabase
    .from("gift_cards")
    .select("id, balance")
    .eq("id", row.gift_card_id)
    .maybeSingle();
  const giftCard = card as GiftCardRow | null;
  if (!giftCard) return;
  const restored = addMoney(Number(giftCard.balance ?? 0), Number(row.amount ?? 0));
  const { data: restoredRow } = await supabase
    .from("gift_cards")
    .update({ balance: restored, updated_at: new Date().toISOString() })
    .eq("id", giftCard.id)
    .eq("balance", roundCurrency(Number(giftCard.balance ?? 0)))
    .select("id")
    .maybeSingle();
  if (!restoredRow) return;
  await supabase
    .from("gift_card_redemptions")
    .update({ status: "voided", voided_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "reserved");
}

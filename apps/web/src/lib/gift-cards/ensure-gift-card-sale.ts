import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Post the gift-card sale once for an order whose cards were already issued.
 * A second delivery does not post another sale.
 */
export async function ensureGiftCardSaleLedger(
  supabase: SupabaseClient,
  input: {
    orderId: string;
    quantity: number;
    totalAmount: number;
    feesMajor: number;
    providerId: string | null;
    tenantId: string | null;
  },
): Promise<{ posted: boolean }> {
  const description = `Platform gift card sale (${input.quantity} card${input.quantity > 1 ? "s" : ""}) - liability until redemption`;

  const { data: tagged, error: taggedError } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("transaction_type", "gift_card_sale")
    .contains("metadata", { gift_card_order_id: input.orderId })
    .limit(1)
    .maybeSingle();
  if (taggedError) {
    console.error("[gift_card_order] sale lookup failed:", taggedError);
    throw taggedError;
  }
  if (tagged) return { posted: false };

  const { data: card, error: cardError } = await supabase
    .from("gift_cards")
    .select("created_at")
    .contains("metadata", { order_id: input.orderId })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (cardError) {
    console.error("[gift_card_order] issued card lookup failed:", cardError);
    throw cardError;
  }
  const issuedAt = (card as { created_at?: string } | null)?.created_at;
  if (issuedAt) {
    const at = new Date(issuedAt).getTime();
    if (Number.isFinite(at)) {
      const { data: legacy, error: legacyError } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("transaction_type", "gift_card_sale")
        .eq("amount", input.totalAmount)
        .eq("description", description)
        .gte("created_at", new Date(at - 120000).toISOString())
        .lte("created_at", new Date(at + 120000).toISOString())
        .limit(1);
      if (legacyError) {
        console.error("[gift_card_order] legacy sale lookup failed:", legacyError);
        throw legacyError;
      }
      if (Array.isArray(legacy) && legacy.length > 0) return { posted: false };
    }
  }

  const { error } = await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: input.providerId,
    tenant_id: input.tenantId,
    transaction_type: "gift_card_sale",
    amount: input.totalAmount,
    fees: input.feesMajor,
    commission: 0,
    net: input.totalAmount,
    description,
    metadata: { gift_card_order_id: input.orderId, quantity: input.quantity },
    created_at: new Date().toISOString(),
  });
  if (error) {
    const code = String((error as { code?: string }).code || "");
    const msg = String((error as { message?: string }).message || "");
    if (code === "23505" || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      return { posted: false };
    }
    console.error("[gift_card_order] gift_card_sale insert failed:", error);
    throw error;
  }
  return { posted: true };
}

/**
 * The payment claim was already saved. When cards for that order are already
 * issued, mark the order paid and post the sale. When no card is issued yet,
 * leave the claim so the issuer can finish.
 */
export async function completeClaimedGiftCardOrder(
  supabase: SupabaseClient,
  input: {
    orderId: string;
    reference: string;
    paymentProvider: string;
    quantity: number;
    totalAmount: number;
    feesMajor: number;
    providerId: string | null;
    tenantId: string | null;
    orderMetadata: Record<string, unknown> | null;
  },
): Promise<{ completed: boolean }> {
  const { data: issued, error: issuedError } = await supabase
    .from("gift_cards")
    .select("id")
    .contains("metadata", { order_id: input.orderId });
  if (issuedError) {
    console.error("[gift_card_order] issued card lookup failed:", issuedError);
    throw issuedError;
  }
  const cards = (issued ?? []) as { id: string }[];
  if (cards.length === 0) return { completed: false };

  const { error: orderError } = await supabase
    .from("gift_card_orders")
    .update({
      status: "paid",
      gift_card_id: cards[0].id,
      updated_at: new Date().toISOString(),
      tenant_id: input.tenantId,
      metadata: {
        ...(input.orderMetadata ?? {}),
        issued_count: cards.length,
        expected_count: input.quantity,
        ...(cards.length === input.quantity ? {} : { partial_issuance: true }),
      },
    })
    .eq("id", input.orderId);
  if (orderError) {
    console.error("[gift_card_order] paid update failed:", orderError);
    throw orderError;
  }

  const { error: paymentError } = await supabase
    .from("payment_transactions")
    .update({
      metadata: {
        kind: "gift_card_order",
        gift_card_order_id: input.orderId,
        gift_card_ids: cards.map((card) => card.id),
        quantity: input.quantity,
        issued_count: cards.length,
      },
    })
    .eq("provider", input.paymentProvider)
    .eq("reference", input.reference);
  if (paymentError) {
    console.error("[gift_card_order] payment metadata update failed:", paymentError);
    throw paymentError;
  }

  await ensureGiftCardSaleLedger(supabase, {
    orderId: input.orderId,
    quantity: input.quantity,
    totalAmount: input.totalAmount,
    feesMajor: input.feesMajor,
    providerId: input.providerId,
    tenantId: input.tenantId,
  });
  return { completed: true };
}

/** Drop a gift-card payment claim when no card was issued, so the same charge can be issued again. */
export async function releaseGiftCardOrderClaim(
  supabase: SupabaseClient,
  provider: string,
  reference: string,
): Promise<void> {
  const { error } = await supabase
    .from("payment_transactions")
    .delete()
    .eq("provider", provider)
    .eq("reference", reference);
  if (error) {
    console.error("[gift_card_order] claim release failed:", error);
    throw error;
  }
}

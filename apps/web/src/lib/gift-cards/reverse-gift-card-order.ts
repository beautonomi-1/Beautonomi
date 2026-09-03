/**
 * Reverse a gift card order on refund (Paystack refund webhook or admin refund).
 *
 * Accounting (migration 880): posts one `gift_card_refund` finance_transactions row
 * per order (DR 2400 Gift card liability / CR 1000 Cash) for the unredeemed value
 * that was refunded, idempotent on the order id.
 *
 * Rules:
 *   • A full refund is refused (`card_spent`) when any card of the order has been
 *     redeemed (balance < initial_balance, or a reserved/captured redemption exists).
 *   • With `allowPartial`, the unspent balance (or less) can still be refunded: card
 *     balances are reduced by the refunded amount and cards reaching zero are voided
 *     (`is_active = false`, `voided_at`).
 *   • Cards that are voided/expired already are never counted twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export type ReverseGiftCardOrderParams = {
  supabase: SupabaseClient;
  /** gift_card_orders.id — either this or `reference` is required. */
  orderId?: string | null;
  /** gift_card_orders.paystack_reference (original charge reference). */
  reference?: string | null;
  /** Refund amount in major units. Defaults to the full unspent balance. */
  refundAmountMajor?: number | null;
  /** Allow refunding only the unspent balance when a card was already redeemed. */
  allowPartial?: boolean;
  reason: "paystack_refund" | "admin_refund" | string;
  actorUserId?: string | null;
  tenantIdHint?: string | null;
};

export type ReverseGiftCardOrderResult =
  | {
      ok: true;
      reversed: true;
      alreadyReversed: false;
      orderId: string;
      refundAmount: number;
      voidedCardIds: string[];
      partial: boolean;
    }
  | {
      ok: true;
      reversed: false;
      alreadyReversed: true;
      orderId: string;
      refundAmount: 0;
      voidedCardIds: [];
      partial: false;
    }
  | {
      ok: false;
      reason: "order_not_found" | "card_spent" | "nothing_to_refund" | "exceeds_unspent" | "invalid_amount";
      orderId: string | null;
      unspentBalance: number;
    };

type GiftCardRow = {
  id: string;
  code?: string | null;
  balance?: number | string | null;
  initial_balance?: number | string | null;
  is_active?: boolean | null;
  voided_at?: string | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OrderRow = {
  id: string;
  provider_id?: string | null;
  tenant_id?: string | null;
  total_amount?: number | string | null;
  amount?: number | string | null;
  quantity?: number | null;
  status?: string | null;
  gift_card_id?: string | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function reverseGiftCardOrder(
  params: ReverseGiftCardOrderParams,
): Promise<ReverseGiftCardOrderResult> {
  const {
    supabase,
    orderId: orderIdInput = null,
    reference = null,
    refundAmountMajor = null,
    allowPartial = false,
    reason,
    actorUserId = null,
    tenantIdHint = null,
  } = params;

  if (refundAmountMajor != null && (!Number.isFinite(refundAmountMajor) || refundAmountMajor <= 0)) {
    return { ok: false, reason: "invalid_amount", orderId: orderIdInput, unspentBalance: 0 };
  }

  // ── Resolve the order ─────────────────────────────────────────────────────
  let orderQuery = supabase
    .from("gift_card_orders")
    .select("id, provider_id, tenant_id, total_amount, amount, quantity, status, gift_card_id, currency, metadata");
  if (orderIdInput) {
    orderQuery = orderQuery.eq("id", orderIdInput);
  } else if (reference) {
    orderQuery = orderQuery.eq("paystack_reference", reference);
  } else {
    return { ok: false, reason: "order_not_found", orderId: null, unspentBalance: 0 };
  }
  const { data: orderData } = await orderQuery.maybeSingle();
  const order = (orderData ?? null) as OrderRow | null;
  if (!order?.id) {
    return { ok: false, reason: "order_not_found", orderId: orderIdInput, unspentBalance: 0 };
  }
  const orderId = order.id;

  // ── Idempotency: one gift_card_refund row per order ───────────────────────
  const { data: existingRefund } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("transaction_type", "gift_card_refund")
    .contains("metadata", { gift_card_order_id: orderId })
    .limit(1);
  if (Array.isArray(existingRefund) && existingRefund.length > 0) {
    return {
      ok: true,
      reversed: false,
      alreadyReversed: true,
      orderId,
      refundAmount: 0,
      voidedCardIds: [],
      partial: false,
    };
  }

  // ── Load every card issued for the order ──────────────────────────────────
  const cardsById = new Map<string, GiftCardRow>();
  const { data: siblingCards } = await supabase
    .from("gift_cards")
    .select("id, code, balance, initial_balance, is_active, voided_at, currency, metadata")
    .eq("metadata->>order_id", orderId);
  for (const c of (siblingCards ?? []) as GiftCardRow[]) {
    if (c?.id) cardsById.set(c.id, c);
  }
  if (order.gift_card_id && !cardsById.has(order.gift_card_id)) {
    const { data: firstCard } = await supabase
      .from("gift_cards")
      .select("id, code, balance, initial_balance, is_active, voided_at, currency, metadata")
      .eq("id", order.gift_card_id)
      .maybeSingle();
    if ((firstCard as GiftCardRow | null)?.id) cardsById.set(order.gift_card_id, firstCard as GiftCardRow);
  }

  const cards = Array.from(cardsById.values());
  const cardIds = cards.map((c) => c.id);

  // ── Spent detection ───────────────────────────────────────────────────────
  let anySpent = false;
  for (const c of cards) {
    const bal = Number(c.balance ?? 0);
    const initial = Number(c.initial_balance ?? bal);
    if (!c.voided_at && bal + 0.005 < initial) anySpent = true;
  }
  if (!anySpent && cardIds.length > 0) {
    const { data: redemptions } = await supabase
      .from("gift_card_redemptions")
      .select("id")
      .in("gift_card_id", cardIds)
      .in("status", ["reserved", "captured"])
      .limit(1);
    if (Array.isArray(redemptions) && redemptions.length > 0) anySpent = true;
  }

  const liveCards = cards.filter((c) => !c.voided_at && c.is_active !== false && Number(c.balance ?? 0) > 0);
  const unspentBalance = round2(liveCards.reduce((s, c) => s + Number(c.balance ?? 0), 0));

  if (anySpent && !allowPartial) {
    return { ok: false, reason: "card_spent", orderId, unspentBalance };
  }
  if (unspentBalance <= 0) {
    return { ok: false, reason: "nothing_to_refund", orderId, unspentBalance };
  }

  const requested = refundAmountMajor != null ? round2(refundAmountMajor) : unspentBalance;
  if (requested > unspentBalance + 0.005) {
    return { ok: false, reason: "exceeds_unspent", orderId, unspentBalance };
  }

  // ── Reduce balances / void cards (largest balance first) ──────────────────
  const nowIso = new Date().toISOString();
  let remaining = requested;
  let reversedTotal = 0;
  const voidedCardIds: string[] = [];
  const touchedCardIds: string[] = [];

  const sorted = [...liveCards].sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
  for (const card of sorted) {
    if (remaining <= 0.005) break;
    const bal = Number(card.balance ?? 0);
    const take = round2(Math.min(bal, remaining));
    if (take <= 0) continue;
    const newBalance = round2(bal - take);
    const voided = newBalance <= 0.005;
    const priorMeta = (card.metadata ?? {}) as Record<string, unknown>;
    const priorReversed = Number(priorMeta.refund_reversed_amount ?? 0);

    // Conditional on the balance we read so a concurrent redemption cannot be overwritten.
    const { data: updated } = await supabase
      .from("gift_cards")
      .update({
        balance: voided ? 0 : newBalance,
        ...(voided ? { is_active: false, voided_at: nowIso } : {}),
        metadata: {
          ...priorMeta,
          refund_reversed_amount: round2(priorReversed + take),
          refund_reason: reason,
          refund_order_id: orderId,
          ...(voided ? { voided_reason: reason } : {}),
        },
        updated_at: nowIso,
      })
      .eq("id", card.id)
      .eq("balance", bal)
      .select("id");

    if (!Array.isArray(updated) || updated.length === 0) {
      // Balance changed underneath us (redemption in flight) — skip this card.
      continue;
    }
    touchedCardIds.push(card.id);
    if (voided) voidedCardIds.push(card.id);
    reversedTotal = round2(reversedTotal + take);
    remaining = round2(remaining - take);
  }

  if (reversedTotal <= 0) {
    return { ok: false, reason: "nothing_to_refund", orderId, unspentBalance };
  }

  // ── Ledger: DR 2400 / CR cash (trigger in 880) ────────────────────────────
  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: tenantIdHint ?? order.tenant_id ?? null,
    provider_id: order.provider_id ?? null,
  });
  const currency = order.currency ?? liveCards[0]?.currency ?? null;

  const { error: ftError } = await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: order.provider_id ?? null,
    tenant_id: financeTenantId,
    transaction_type: "gift_card_refund",
    amount: reversedTotal,
    fees: 0,
    commission: 0,
    net: -reversedTotal,
    ...(currency ? { currency } : {}),
    description: `Gift card order refund (${orderId}) — liability reversed`,
    metadata: {
      gift_card_order_id: orderId,
      reference,
      gift_card_ids: touchedCardIds,
      voided_gift_card_ids: voidedCardIds,
      requested_refund_amount: requested,
      reason,
      actor_user_id: actorUserId,
    },
    created_at: nowIso,
  });
  if (ftError && (ftError as { code?: string }).code !== "23505") {
    console.error("[reverseGiftCardOrder] finance_transactions insert failed:", ftError);
  }

  // ── Order state ───────────────────────────────────────────────────────────
  const orderTotal = Number(order.total_amount ?? Number(order.amount ?? 0) * Number(order.quantity ?? 1));
  const fullyReversed = !anySpent && remaining <= 0.005 && reversedTotal + 0.005 >= orderTotal;
  const partial = !fullyReversed;
  await supabase
    .from("gift_card_orders")
    .update({
      status: fullyReversed ? "refunded" : "partially_refunded",
      refunded_at: nowIso,
      updated_at: nowIso,
      metadata: {
        ...((order.metadata ?? {}) as Record<string, unknown>),
        refund: {
          amount: reversedTotal,
          requested_amount: requested,
          reason,
          reference,
          voided_gift_card_ids: voidedCardIds,
          partial,
          at: nowIso,
        },
      },
    })
    .eq("id", orderId);

  return {
    ok: true,
    reversed: true,
    alreadyReversed: false,
    orderId,
    refundAmount: reversedTotal,
    voidedCardIds,
    partial,
  };
}

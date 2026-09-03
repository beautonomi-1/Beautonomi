import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { bookShippingForOrder } from "./shipping";

// F28: re-export so callers can `import { bookShippingForOrder } from "@/lib/orders/product-order-lifecycle"`.
export { bookShippingForOrder };

export type ProductOrderSideEffectRow = {
  id: string;
  provider_id: string;
  payment_status: string;
  total_amount?: number | string | null;
  customer_id?: string | null;
  currency?: string | null;
  tenant_id?: string | null;
  order_number?: string | null;
  gift_card_amount?: number | string | null;
};

export type ApplyProductOrderCancelRefundOptions = {
  newStatus: "cancelled" | "refunded";
  refundAmount?: number;
  cancellationReason?: string | null;
  refundReason?: string | null;
  /**
   * Portion already returned to the original online tender (gateway refund) by the
   * caller — excluded from the wallet credit so the customer is not refunded twice.
   */
  onlineRefundedAmount?: number;
};

/**
 * Reverse platform-held ledger rows and credit customer wallet when a paid
 * product order is cancelled or refunded. Shared by provider and admin routes.
 */
export async function applyProductOrderCancelRefundSideEffects(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  order: ProductOrderSideEffectRow,
  options: ApplyProductOrderCancelRefundOptions,
): Promise<void> {
  const { newStatus, refundAmount, cancellationReason, refundReason, onlineRefundedAmount } = options;
  const shouldReversePlatformLedger =
    newStatus === "refunded" ||
    (newStatus === "cancelled" && order.payment_status === "paid");
  const ledgerRefundAmount =
    newStatus === "refunded"
      ? (refundAmount ?? Number(order.total_amount ?? 0))
      : Number(order.total_amount ?? 0);

  if (!shouldReversePlatformLedger) return;

  const { data: ledgerRows } = await (admin.from("finance_transactions") as any)
    .select("id, tenant_id")
    .eq("product_order_id", order.id)
    .in("transaction_type", ["payment", "provider_earnings", "platform_fee"])
    .limit(1);
  const isPlatformHeld = Array.isArray(ledgerRows) && ledgerRows.length > 0;
  if (isPlatformHeld) {
    const ledgerTenantId =
      (ledgerRows[0] as { tenant_id?: string | null })?.tenant_id ?? order.tenant_id ?? null;
    const { data: existingRefund } = await (admin.from("finance_transactions") as any)
      .select("id")
      .eq("product_order_id", order.id)
      .eq("transaction_type", "refund")
      .limit(1);
    const alreadyReversed = Array.isArray(existingRefund) && existingRefund.length > 0;
    if (!alreadyReversed) {
      const { data: captureRows } = await (admin.from("finance_transactions") as any)
        .select("transaction_type, amount, net")
        .eq("product_order_id", order.id)
        .in("transaction_type", ["provider_earnings", "platform_fee"]);
      const earningsRow = (captureRows ?? []).find(
        (r: { transaction_type?: string }) => r.transaction_type === "provider_earnings",
      ) as { amount?: number; net?: number } | undefined;
      const feeRow = (captureRows ?? []).find(
        (r: { transaction_type?: string }) => r.transaction_type === "platform_fee",
      ) as { amount?: number; net?: number } | undefined;
      const capturedProviderEarnings = Number(earningsRow?.net ?? earningsRow?.amount ?? 0);
      const capturedPlatformFee = Number(feeRow?.net ?? feeRow?.amount ?? 0);
      const orderTotal = Number(order.total_amount ?? 0);
      const refundRatio =
        orderTotal > 0 ? Math.min(1, Math.max(0, ledgerRefundAmount / orderTotal)) : 1;
      const refundProviderEarnings =
        Math.round(capturedProviderEarnings * refundRatio * 100) / 100;
      const refundPlatformFee = Math.round(capturedPlatformFee * refundRatio * 100) / 100;
      const refundDescription = `Refund for product order ${order.order_number || order.id.slice(0, 8)}${
        refundReason
          ? ` (${refundReason})`
          : cancellationReason
            ? ` (cancelled: ${cancellationReason})`
            : ""
      }`;
      const refundRows: Record<string, unknown>[] = [];
      if (refundProviderEarnings > 0) {
        refundRows.push({
          booking_id: null,
          product_order_id: order.id,
          provider_id: order.provider_id,
          tenant_id: ledgerTenantId,
          transaction_type: "refund",
          refund_component: "provider_earnings",
          amount: refundProviderEarnings,
          fees: 0,
          commission: 0,
          net: -refundProviderEarnings,
          currency: order.currency || LAST_RESORT_CURRENCY,
          description: refundDescription,
          created_at: new Date().toISOString(),
        });
      }
      if (refundPlatformFee > 0) {
        refundRows.push({
          booking_id: null,
          product_order_id: order.id,
          provider_id: order.provider_id,
          tenant_id: ledgerTenantId,
          transaction_type: "refund",
          refund_component: "platform_fee",
          amount: refundPlatformFee,
          fees: 0,
          commission: 0,
          net: -refundPlatformFee,
          currency: order.currency || LAST_RESORT_CURRENCY,
          description: refundDescription,
          created_at: new Date().toISOString(),
        });
      }
      if (refundRows.length === 0 && ledgerRefundAmount > 0) {
        refundRows.push({
          booking_id: null,
          product_order_id: order.id,
          provider_id: order.provider_id,
          tenant_id: ledgerTenantId,
          transaction_type: "refund",
          refund_component: "provider_earnings",
          amount: ledgerRefundAmount,
          fees: 0,
          commission: 0,
          net: -ledgerRefundAmount,
          currency: order.currency || LAST_RESORT_CURRENCY,
          description: refundDescription,
          created_at: new Date().toISOString(),
        });
      }
      if (refundRows.length > 0) {
        await (admin.from("finance_transactions") as any).insert(refundRows);
      }
    }
  }

  if (
    newStatus === "cancelled" &&
    order.payment_status === "paid" &&
    order.customer_id &&
    ledgerRefundAmount > 0
  ) {
    // Gift-card portion goes back onto the card (original tender); the rest to wallet.
    let walletCreditAmount = ledgerRefundAmount;
    const giftPortion = Math.min(ledgerRefundAmount, Math.max(0, Number(order.gift_card_amount ?? 0)));
    if (giftPortion > 0) {
      const { voidProductOrderGiftCard } = await import("@/lib/ecommerce/product-order-gift-card");
      const voided = await voidProductOrderGiftCard(admin, order.id);
      if (voided) walletCreditAmount = Math.round((ledgerRefundAmount - giftPortion) * 100) / 100;
    }
    const alreadyRefundedOnline = Math.max(0, Number(onlineRefundedAmount ?? 0));
    if (alreadyRefundedOnline > 0) {
      walletCreditAmount = Math.max(
        0,
        Math.round((walletCreditAmount - alreadyRefundedOnline) * 100) / 100,
      );
    }
    if (walletCreditAmount > 0) {
      await (admin.rpc as any)("wallet_credit_admin", {
        p_user_id: order.customer_id,
        p_amount: walletCreditAmount,
        p_currency: order.currency || LAST_RESORT_CURRENCY,
        p_description: `Refund for cancelled order ${order.order_number || order.id.slice(0, 8)}`,
        p_reference_id: order.id,
        p_reference_type: "product_order_refund",
        p_tenant_id: order.tenant_id ?? null,
        p_idempotency_key: `product_order_cancel_refund:${order.id}`,
      });
    }
    await (supabase.from("product_orders") as any)
      .update({
        payment_status: "refunded",
        refunded_amount: ledgerRefundAmount,
        refunded_at: new Date().toISOString(),
      })
      .eq("id", order.id);
  }
}

export type RestockMovementType = "cancel" | "return" | "sale_refund";

export type RestockProductOrderOptions = {
  /** stock_movements.movement_type for the audit rows (default `cancel`). */
  movementType?: RestockMovementType;
  actorUserId?: string | null;
  reason?: string | null;
  /** Skip lines already cancelled at line level (partial fulfilment). */
  onlyItemIds?: string[] | null;
};

/**
 * Restore inventory for all line items on a product order (provider cancel / payment abandon /
 * customer self-cancel) and write a `stock_movements` row per line referencing the order.
 */
export async function restockProductOrderLineItems(
  supabase: SupabaseClient,
  orderId: string,
  opts?: RestockProductOrderOptions,
): Promise<void> {
  let itemsQuery = (supabase.from("product_order_items") as any)
    .select("id, product_id, product_variant_id, quantity")
    .eq("order_id", orderId);
  if (opts?.onlyItemIds && opts.onlyItemIds.length > 0) {
    itemsQuery = itemsQuery.in("id", opts.onlyItemIds);
  }
  const { data: items } = await itemsQuery;

  if (!items?.length) return;

  const restocked: Array<{ product_id: string; product_variant_id: string | null; quantity: number }> = [];

  for (const item of items) {
    if (item.product_variant_id) {
      try {
        await (supabase.rpc as any)("increment_product_variant_stock", {
          p_variant_id: item.product_variant_id,
          p_quantity: item.quantity,
        });
      } catch {
        const { data: v } = await (supabase.from("product_variants") as any)
          .select("quantity")
          .eq("id", item.product_variant_id)
          .single();
        if (v) {
          await (supabase.from("product_variants") as any)
            .update({ quantity: (v.quantity ?? 0) + item.quantity })
            .eq("id", item.product_variant_id);
        }
      }
    } else if (item.product_id) {
      try {
        await supabase.rpc("increment_product_stock" as any, {
          p_product_id: item.product_id,
          p_quantity: item.quantity,
        });
      } catch {
        const { data: prod } = await (supabase.from("products") as any)
          .select("quantity")
          .eq("id", item.product_id)
          .single();
        if (prod) {
          await (supabase.from("products") as any)
            .update({ quantity: (prod.quantity ?? 0) + item.quantity })
            .eq("id", item.product_id);
        }
      }
    }
    if (item.product_id) {
      restocked.push({
        product_id: item.product_id,
        product_variant_id: item.product_variant_id ?? null,
        quantity: Number(item.quantity) || 0,
      });
    }
  }

  await logRestockStockMovements(supabase, orderId, restocked, opts);
}

/**
 * Audit trail for restocks (Part I: `stock_movements` on online cancel/refund paths).
 * Best-effort — inventory has already been restored when this runs.
 */
async function logRestockStockMovements(
  supabase: SupabaseClient,
  orderId: string,
  lines: Array<{ product_id: string; product_variant_id: string | null; quantity: number }>,
  opts?: RestockProductOrderOptions,
): Promise<void> {
  if (lines.length === 0) return;
  try {
    const { data: orderRow } = await (supabase.from("product_orders") as any)
      .select("provider_id")
      .eq("id", orderId)
      .maybeSingle();
    const providerId = (orderRow as { provider_id?: string | null } | null)?.provider_id ?? null;
    if (!providerId) return;

    const movementType: RestockMovementType = opts?.movementType ?? "cancel";
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      let qtyAfter = 0;
      if (line.product_variant_id) {
        const { data: v } = await (supabase.from("product_variants") as any)
          .select("quantity")
          .eq("id", line.product_variant_id)
          .maybeSingle();
        qtyAfter = Number((v as { quantity?: number } | null)?.quantity) || 0;
      } else {
        const { data: p } = await (supabase.from("products") as any)
          .select("quantity")
          .eq("id", line.product_id)
          .maybeSingle();
        qtyAfter = Number((p as { quantity?: number } | null)?.quantity) || 0;
      }
      const { error } = await (supabase.from("stock_movements") as any).insert({
        provider_id: providerId,
        product_id: line.product_id,
        product_variant_id: line.product_variant_id,
        movement_type: movementType,
        quantity_delta: line.quantity,
        quantity_after: qtyAfter,
        reason: opts?.reason ?? (movementType === "cancel" ? "Order cancelled" : "Order returned/refunded"),
        reference_type: "product_order",
        reference_id: orderId,
        actor_user_id: opts?.actorUserId ?? null,
      });
      if (error) {
        console.error("[product-order] stock_movements restock log failed:", error.message, { orderId });
      }
    }
  } catch (e) {
    console.error("[product-order] stock_movements restock log threw:", e, { orderId });
  }
}

/**
 * Release a gift card reserved at checkout when an unpaid order is abandoned /
 * cancelled (also re-credits a captured redemption on paid-order cancel/refund).
 * Best-effort; DB trigger (879) backstops the unpaid-cancel path.
 */
export async function voidProductOrderGiftCardIfNeeded(
  supabase: SupabaseClient,
  order: { id: string; gift_card_amount?: number | string | null },
): Promise<void> {
  if (!(Number(order.gift_card_amount ?? 0) > 0)) return;
  const { voidProductOrderGiftCard } = await import("@/lib/ecommerce/product-order-gift-card");
  await voidProductOrderGiftCard(supabase, order.id);
}

export async function clearCustomerCartForProvider(
  supabase: SupabaseClient,
  customerId: string,
  providerId: string,
): Promise<void> {
  await (supabase.from("cart_items") as any)
    .delete()
    .eq("user_id", customerId)
    .eq("provider_id", providerId);
}

type OrderRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  tenant_id?: string | null;
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
  currency?: string | null;
};

/**
 * Reverse wallet debit, restock, and cancel a product order when checkout
 * finalization fails after money was already moved.
 *
 * Never reverses an order that is already `payment_status=paid` — that would
 * leave finance_transactions / payment_transactions out of sync with wallet.
 */
export async function rollbackFailedProductOrderCheckout(
  supabase: SupabaseClient,
  order: OrderRow,
  reason = "Checkout could not be completed",
  opts?: { restock?: boolean },
): Promise<{ rolledBack: boolean; skippedPaid: boolean }> {
  const { data: live } = await (supabase.from("product_orders") as any)
    .select("id, payment_status, status")
    .eq("id", order.id)
    .maybeSingle();

  if (String((live as { payment_status?: string } | null)?.payment_status ?? "") === "paid") {
    console.error(
      "[product-order] Skipping checkout rollback — order already paid (ledger must stay intact)",
      { orderId: order.id, reason },
    );
    return { rolledBack: false, skippedPaid: true };
  }

  await creditWalletForProductOrderIfNeeded(
    supabase,
    order,
    `Wallet refund (${reason})`,
    "product_order_checkout_failed",
  );
  await voidProductOrderGiftCardIfNeeded(supabase, order);
  if (opts?.restock !== false) {
    await restockProductOrderLineItems(supabase, order.id, {
      movementType: "cancel",
      reason: `Checkout rollback: ${reason}`,
    });
  }
  await (supabase.from("product_orders") as any)
    .update({
      status: "cancelled",
      payment_status: "failed",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .neq("payment_status", "paid");

  return { rolledBack: true, skippedPaid: false };
}

export async function creditWalletForProductOrderIfNeeded(
  supabase: SupabaseClient,
  order: OrderRow,
  description: string,
  referenceType: string,
): Promise<void> {
  const w = Number(order.wallet_amount ?? 0);
  if (w <= 0) return;

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: order.tenant_id ?? null,
    provider_id: order.provider_id ?? null,
  });

  // §Wallet-reversal (audit 2026-06): this helper is reachable from both the
  // charge.failed webhook and the stale-order sweep, so two callers could both
  // see wallet_amount > 0 and double-credit. ATOMICALLY claim the reversal by
  // zeroing wallet_amount first (only while it is still > 0); only the winner
  // credits. Restore the amount if the credit fails so a later retry can reverse.
  const { data: claimed, error: claimError } = await (supabase.from("product_orders") as any)
    .update({ wallet_amount: "0.00" })
    .eq("id", order.id)
    .gt("wallet_amount", 0)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("[product-order] Failed to claim wallet reversal:", claimError);
    return;
  }
  if (!claimed) return; // Already reversed by another path.

  const { error: creditError } = await (supabase.rpc as any)("wallet_credit_admin", {
    p_user_id: order.customer_id,
    p_amount: w,
    p_currency: order.currency || "ZAR",
    p_description: description,
    p_reference_id: order.id,
    p_reference_type: referenceType,
    p_tenant_id: financeTenantId,
    // One reversal per order regardless of which path (charge.failed vs stale
    // sweep) triggers it. The atomic wallet_amount claim above already gates
    // this; the key is a hard DB backstop.
    p_idempotency_key: `product_order_wallet_reversal:${order.id}`,
  });

  if (creditError) {
    console.error("[product-order] Wallet reversal credit failed, restoring wallet_amount:", creditError);
    await (supabase.from("product_orders") as any)
      .update({ wallet_amount: w.toFixed(2) })
      .eq("id", order.id);
  }
}

/**
 * Cancel stale online orders for the same checkout so stock is not double-reserved.
 */
export async function cancelStalePendingPaystackProductOrders(
  supabase: SupabaseClient,
  customerId: string,
  providerId: string,
  excludeOrderId?: string,
): Promise<void> {
  let q = (supabase.from("product_orders") as any)
    .select("id, customer_id, provider_id, tenant_id, wallet_amount, gift_card_amount, currency")
    .eq("customer_id", customerId)
    .eq("provider_id", providerId)
    .eq("payment_status", "pending")
    .eq("payment_method", "paystack")
    .eq("status", "pending");

  if (excludeOrderId) {
    q = q.neq("id", excludeOrderId);
  }

  const { data: stale } = await q;

  for (const row of stale ?? []) {
    const o = row as OrderRow;
    // Atomically claim cancellation while still pending (matches expire cron).
    const { data: claimed } = await (supabase.from("product_orders") as any)
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "Replaced by a new checkout",
        payment_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", o.id)
      .eq("payment_status", "pending")
      .eq("status", "pending")
      .select("id");

    if ((claimed?.length ?? 0) === 0) continue;

    await creditWalletForProductOrderIfNeeded(
      supabase,
      o,
      `Wallet refund (checkout restarted) for order`,
      "product_order_superseded",
    );
    await voidProductOrderGiftCardIfNeeded(supabase, o);
    await restockProductOrderLineItems(supabase, o.id, {
      movementType: "cancel",
      reason: "Replaced by a new checkout",
    });
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  computeProductOrderCancelWalletCredit,
  productOrderCancelIncludesGiftInWallet,
  computeProviderCollectedStoreCreditClawback,
  isProviderCollectedProductMethod,
  roundProductOrderMoney,
} from "./product-order-tender";
import { bookShippingForOrder } from "./shipping";
import { subtractMoney, multiplyMoney, roundCurrency, addMoney } from "@beautonomi/utils";

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
  wallet_amount?: number | string | null;
  payment_method?: string | null;
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
  /**
   * Wallet credit already issued by the caller for a `refunded` status
   * (store credit). Used to claw a provider-collected till for that liability.
   */
  walletCreditIssued?: number;
  /** Stable key so a retried store-credit refund does not claw the provider twice. */
  storeCreditClawbackKey?: string;
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
): Promise<{ walletCreditFailed: boolean }> {
  if (order.payment_status === "partially_refunded" && options.newStatus === "cancelled") {
    console.warn(
      "[product-order] refused cancel side effects on partially_refunded order",
      order.id,
    );
    return { walletCreditFailed: false };
  }
  const { newStatus, refundAmount, cancellationReason, refundReason, onlineRefundedAmount } = options;
  const shouldReversePlatformLedger =
    newStatus === "refunded" ||
    (newStatus === "cancelled" && order.payment_status === "paid");
  const ledgerRefundAmount =
    newStatus === "refunded"
      ? (refundAmount ?? Number(order.total_amount ?? 0))
      : Number(order.total_amount ?? 0);

  if (!shouldReversePlatformLedger) return { walletCreditFailed: false };

  const providerCollected = isProviderCollectedProductMethod(order.payment_method);
  const storeCreditClawback = computeProviderCollectedStoreCreditClawback(
    order,
    Number(options.walletCreditIssued ?? 0),
  );
  // Cash/terminal store credit is a new platform liability. Claw that exact
  // amount once. Do not also run the capture-row ratio, which would claw twice.
  const clawStoreCreditInsteadOfRatio =
    newStatus === "refunded" && providerCollected && storeCreditClawback > 0;
  // Handing cash back does not create a new platform liability. The earnings
  // row for the wallet/gift slice is what reimburses the provider for money
  // the platform already took, so a cash refund must not claw it.
  const cashRefundSkipsPlatformRatio =
    newStatus === "refunded" && providerCollected && !clawStoreCreditInsteadOfRatio;

  const { data: ledgerRows } = await (admin.from("finance_transactions") as any)
    .select("id, tenant_id")
    .eq("product_order_id", order.id)
    .in("transaction_type", ["payment", "provider_earnings", "platform_fee", "tax"])
    .limit(1);
  const isPlatformHeld = Array.isArray(ledgerRows) && ledgerRows.length > 0;
  if (clawStoreCreditInsteadOfRatio) {
    const clawKey =
      options.storeCreditClawbackKey ??
      `product_order_store_credit:${order.id}:${storeCreditClawback.toFixed(2)}`;
    const description = `Store credit for provider-collected order ${order.order_number || order.id.slice(0, 8)} (${clawKey})`;
    const { data: existingClaws } = await (admin.from("finance_transactions") as any)
      .select("id, description")
      .eq("product_order_id", order.id)
      .eq("transaction_type", "refund")
      .eq("refund_component", "provider_earnings")
      .limit(20);
    const alreadyClawed = (existingClaws ?? []).some(
      (row: { description?: string | null }) => String(row.description ?? "") === description,
    );
    if (!alreadyClawed) {
      const ledgerTenantId =
        (ledgerRows?.[0] as { tenant_id?: string | null } | undefined)?.tenant_id ??
        order.tenant_id ??
        null;
      await (admin.from("finance_transactions") as any).insert({
        booking_id: null,
        product_order_id: order.id,
        provider_id: order.provider_id,
        tenant_id: ledgerTenantId,
        transaction_type: "refund",
        refund_component: "provider_earnings",
        amount: storeCreditClawback,
        fees: 0,
        commission: 0,
        net: -storeCreditClawback,
        currency: order.currency || LAST_RESORT_CURRENCY,
        description,
        created_at: new Date().toISOString(),
      });
    }
  } else if (isPlatformHeld && !cashRefundSkipsPlatformRatio) {
    const ledgerTenantId =
      (ledgerRows[0] as { tenant_id?: string | null })?.tenant_id ?? order.tenant_id ?? null;
    const { data: captureRows } = await (admin.from("finance_transactions") as any)
      .select("transaction_type, amount, net, metadata")
      .eq("product_order_id", order.id)
      .in("transaction_type", ["provider_earnings", "platform_fee", "tax"]);
    const earningsRow = (captureRows ?? []).find(
      (r: { transaction_type?: string }) => r.transaction_type === "provider_earnings",
    ) as { amount?: number; net?: number } | undefined;
    const feeRow = (captureRows ?? []).find(
      (r: { transaction_type?: string }) => r.transaction_type === "platform_fee",
    ) as { amount?: number; net?: number } | undefined;
    const taxRow = (captureRows ?? []).find(
      (r: { transaction_type?: string }) => r.transaction_type === "tax",
    ) as { amount?: number; metadata?: Record<string, unknown> } | undefined;
    const capturedProviderEarnings = Number(earningsRow?.net ?? earningsRow?.amount ?? 0);
    const capturedPlatformFee = Number(feeRow?.net ?? feeRow?.amount ?? 0);
    const capturedTax = Number(taxRow?.amount ?? 0);
    const taxVatHeldFlag =
      taxRow?.metadata != null &&
      (taxRow.metadata as { vat_held_for_provider?: boolean }).vat_held_for_provider === true;
    const orderTotal = Number(order.total_amount ?? 0);
    const refundRatio =
      orderTotal > 0 ? Math.min(1, Math.max(0, ledgerRefundAmount / orderTotal)) : 1;
    const refundProviderEarnings =
      multiplyMoney(capturedProviderEarnings, refundRatio);
    const refundPlatformFee = multiplyMoney(capturedPlatformFee, refundRatio);
    const refundTax = multiplyMoney(capturedTax, refundRatio);
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
    if (refundTax > 0) {
      const taxRefundRow: Record<string, unknown> = {
        booking_id: null,
        product_order_id: order.id,
        provider_id: order.provider_id,
        tenant_id: ledgerTenantId,
        transaction_type: "refund",
        refund_component: "tax",
        amount: refundTax,
        fees: 0,
        commission: 0,
        net: 0,
        currency: order.currency || LAST_RESORT_CURRENCY,
        description: refundDescription,
        created_at: new Date().toISOString(),
      };
      if (taxVatHeldFlag) {
        taxRefundRow.metadata = { vat_held_for_provider_amount: refundTax };
      }
      refundRows.push(taxRefundRow);
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

  if (
    newStatus === "cancelled" &&
    order.payment_status === "paid" &&
    order.customer_id &&
    ledgerRefundAmount > 0
  ) {
    // Gift card goes back onto the card. Provider-collected cash stays in the
    // till (in-person refund). Gateway failures fall back onto the wallet.
    let walletCreditAmount = computeProductOrderCancelWalletCredit(
      order,
      Number(onlineRefundedAmount ?? 0),
    );
    const giftPortion = Math.min(
      ledgerRefundAmount,
      Math.max(0, Number(order.gift_card_amount ?? 0)),
    );
    if (giftPortion > 0) {
      const { voidProductOrderGiftCard } = await import("@/lib/ecommerce/product-order-gift-card");
      const voided = await voidProductOrderGiftCard(admin, order.id);
      if (productOrderCancelIncludesGiftInWallet(voided)) {
        walletCreditAmount = roundProductOrderMoney(addMoney(walletCreditAmount, giftPortion));
      }
    }
    if (walletCreditAmount > 0) {
      const { error: walletError } = await (admin.rpc as any)("wallet_credit_admin", {
        p_user_id: order.customer_id,
        p_amount: walletCreditAmount,
        p_currency: order.currency || LAST_RESORT_CURRENCY,
        p_description: `Refund for cancelled order ${order.order_number || order.id.slice(0, 8)}`,
        p_reference_id: order.id,
        p_reference_type: "product_order_refund",
        p_tenant_id: order.tenant_id ?? null,
        p_idempotency_key: `product_order_cancel_refund:${order.id}`,
      });
      if (walletError) {
        // Leave payment_status as paid so the order is visibly owed a refund
        // (cancelled + paid) instead of reading "refunded" with no credit issued.
        console.error("[product-order] cancel refund wallet credit failed:", walletError, {
          orderId: order.id,
          walletCreditAmount,
        });
        return { walletCreditFailed: true };
      }
    }
    await (supabase.from("product_orders") as any)
      .update({
        payment_status: "refunded",
        refunded_amount: ledgerRefundAmount,
        refunded_at: new Date().toISOString(),
      })
      .eq("id", order.id);
  }
  return { walletCreditFailed: false };
}

export type RestockMovementType = "cancel" | "return" | "sale_refund";

export type RestockProductOrderOptions = {
  /** stock_movements.movement_type for the audit rows (default `cancel`). */
  movementType?: RestockMovementType;
  actorUserId?: string | null;
  reason?: string | null;
  /** Skip lines already cancelled at line level (partial fulfilment). */
  onlyItemIds?: string[] | null;
  /** Restock fewer units than the line quantity (partial-quantity returns). Key = order_item id. */
  quantityOverrides?: Record<string, number>;
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
    const overrideQty = opts?.quantityOverrides?.[item.id as string];
    const qty =
      overrideQty != null && Number.isFinite(overrideQty) && overrideQty > 0
        ? Math.min(overrideQty, Number(item.quantity) || 0)
        : Number(item.quantity) || 0;
    if (qty <= 0) continue;

    if (item.product_variant_id) {
      try {
        await (supabase.rpc as any)("increment_product_variant_stock", {
          p_variant_id: item.product_variant_id,
          p_quantity: qty,
        });
      } catch {
        const { data: v } = await (supabase.from("product_variants") as any)
          .select("quantity")
          .eq("id", item.product_variant_id)
          .single();
        if (v) {
          await (supabase.from("product_variants") as any)
            .update({ quantity: (v.quantity ?? 0) + qty })
            .eq("id", item.product_variant_id);
        }
      }
    } else if (item.product_id) {
      try {
        await supabase.rpc("increment_product_stock" as any, {
          p_product_id: item.product_id,
          p_quantity: qty,
        });
      } catch {
        const { data: prod } = await (supabase.from("products") as any)
          .select("quantity")
          .eq("id", item.product_id)
          .single();
        if (prod) {
          await (supabase.from("products") as any)
            .update({ quantity: (prod.quantity ?? 0) + qty })
            .eq("id", item.product_id);
        }
      }
    }
    if (item.product_id) {
      restocked.push({
        product_id: item.product_id,
        product_variant_id: item.product_variant_id ?? null,
        quantity: qty,
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
  payment_status?: string | null;
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
): Promise<{ credited: boolean; failed: boolean }> {
  const w = Number(order.wallet_amount ?? 0);
  if (!(w > 0)) return { credited: false, failed: false };

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
    .update({ wallet_amount: 0 })
    .eq("id", order.id)
    .gt("wallet_amount", 0)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("[product-order] Failed to claim wallet reversal:", claimError);
    return { credited: false, failed: true };
  }
  if (!claimed) return { credited: false, failed: false }; // Already reversed by another path.

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
      .update({ wallet_amount: roundCurrency(w, order.currency || LAST_RESORT_CURRENCY) })
      .eq("id", order.id);
    return { credited: false, failed: true };
  }
  return { credited: true, failed: false };
}

/**
 * Return a wallet debit and release a reserved gift card when an order is
 * cancelled before it was paid. Paid orders use the refund side effects instead.
 */
const UNPAID_CARD_GATEWAY_PROVIDERS = new Set(["paystack", "stripe", "flutterwave"]);

/**
 * A card charge can be recorded before the order is paid (the gift was not
 * captured, so the charge did not cover the total). Cancelling that order
 * must return the charge. Provider card machines are not refunded here.
 */
export async function refundUnpaidProductOrderCardCharges(
  supabase: SupabaseClient,
  order: OrderRow,
  reason: string,
): Promise<{ onlineRefunded: number; walletFallback: number; failed: boolean }> {
  const { data, error } = await (supabase.from("payment_transactions") as any)
    .select("id, amount, reference, provider, refund_amount")
    .eq("status", "success")
    .filter("metadata->>product_order_id", "eq", order.id);
  if (error) {
    console.error("[product-order] unpaid card lookup failed:", error.message, { orderId: order.id });
    return { onlineRefunded: 0, walletFallback: 0, failed: true };
  }

  let onlineRefunded = 0;
  let walletFallback = 0;
  let failed = false;
  for (const row of (data ?? []) as Array<{
    id?: string;
    amount?: number | string | null;
    reference?: string | null;
    provider?: string | null;
    refund_amount?: number | string | null;
  }>) {
    const provider = String(row.provider ?? "").toLowerCase();
    if (!UNPAID_CARD_GATEWAY_PROVIDERS.has(provider)) continue;
    const reference = String(row.reference ?? "").trim();
    const amount = roundProductOrderMoney(
      Math.max(0, subtractMoney(Number(row.amount ?? 0), Number(row.refund_amount ?? 0))),
    );
    if (!reference || amount <= 0.009 || !row.id) continue;

    let returned = false;
    try {
      const { refundGatewayCharge } = await import("@/lib/payments/refund-gateway-charge");
      await refundGatewayCharge({
        reference,
        amountMajor: amount,
        currency: order.currency || LAST_RESORT_CURRENCY,
        tenantId: order.tenant_id ?? null,
        reason,
        idempotencyKey: `product_order_unpaid_card:${order.id}:${reference}`,
        fallbackProvider:
          provider === "stripe" ? "stripe" : provider === "flutterwave" ? "flutterwave" : "paystack",
      });
      onlineRefunded = roundProductOrderMoney(addMoney(onlineRefunded, amount));
      returned = true;
    } catch (e) {
      console.error("[product-order] unpaid card refund failed:", e, { orderId: order.id, reference });
      if (order.customer_id) {
        const { error: walletError } = await (supabase.rpc as any)("wallet_credit_admin", {
          p_user_id: order.customer_id,
          p_amount: amount,
          p_currency: order.currency || LAST_RESORT_CURRENCY,
          p_description: reason,
          p_reference_id: order.id,
          p_reference_type: "product_order_unpaid_card_refund",
          p_tenant_id: order.tenant_id ?? null,
          p_idempotency_key: `product_order_unpaid_card_refund:${order.id}:${reference}`,
        });
        if (!walletError) {
          walletFallback = roundProductOrderMoney(addMoney(walletFallback, amount));
          returned = true;
        }
      }
      if (!returned) failed = true;
    }

    if (returned) {
      const { error: markError } = await (supabase.from("payment_transactions") as any)
        .update({
          status: "refunded",
          refund_amount: amount,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (markError) {
        console.error("[product-order] unpaid card refund mark failed:", markError.message, {
          orderId: order.id,
          reference,
        });
      }
    }
  }

  return { onlineRefunded, walletFallback, failed };
}

export async function releaseUnpaidProductOrderHolds(
  supabase: SupabaseClient,
  order: OrderRow,
  description: string,
): Promise<{
  credited: boolean;
  failed: boolean;
  amount: number;
  onlineRefunded: number;
  cardWalletFallback: number;
}> {
  if (order.payment_status === "partially_refunded") {
    console.warn(
      "[product-order] refused unpaid hold release on partially_refunded order",
      order.id,
    );
    return { credited: false, failed: false, amount: 0, onlineRefunded: 0, cardWalletFallback: 0 };
  }
  const amount = Math.max(0, Number(order.wallet_amount ?? 0));
  const wallet = await creditWalletForProductOrderIfNeeded(
    supabase,
    order,
    description,
    "product_order_unpaid_cancel",
  );
  await voidProductOrderGiftCardIfNeeded(supabase, order);
  const card = await refundUnpaidProductOrderCardCharges(supabase, order, description);
  return {
    credited: wallet.credited,
    failed: wallet.failed || card.failed,
    amount: wallet.credited ? amount : 0,
    onlineRefunded: card.onlineRefunded,
    cardWalletFallback: card.walletFallback,
  };
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
    await refundUnpaidProductOrderCardCharges(
      supabase,
      o,
      `Card refund (checkout restarted) for order`,
    );
    await restockProductOrderLineItems(supabase, o.id, {
      movementType: "cancel",
      reason: "Replaced by a new checkout",
    });
  }
}

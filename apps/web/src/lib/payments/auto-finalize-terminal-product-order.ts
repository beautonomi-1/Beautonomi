import type { SupabaseClient } from "@supabase/supabase-js";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";

type SupabaseLike = SupabaseClient;

type AutoFinalizeInput = {
  supabase: SupabaseLike;
  terminalPaymentId: string;
  providerId: string;
  productOrderId: string;
  paidAmount: number;
  gatewayFee: number;
  reference: string;
  currency: string;
  /** Provider owner user id used as the system actor on the allocation row. */
  allocatedByUserId?: string | null;
};

/**
 * Auto-finalize a pending walk-in product order when a Paystack Terminal charge
 * confidently maps to it (exact amount, high-confidence suggestion). This brings
 * Paystack Terminal to parity with PayCloud, which already auto-finalizes walk-in
 * sales on payment instead of leaving them stranded in the manual allocation inbox.
 *
 * All-or-nothing safety:
 *  - Only fires for pending, unpaid walk-in orders (idempotent via
 *    recordProductOrderPayment + payment_transactions unique reference).
 *  - Validates stock before decrementing; if stock is short we bail so the
 *    provider can resolve it in the manual inbox.
 *  - Best-effort: callers must wrap in try/catch — a failure here must never
 *    break the webhook (the payment is already recorded in the inbox).
 */
export async function autoFinalizeTerminalWalkInProductOrder(
  input: AutoFinalizeInput,
): Promise<{ finalized: boolean; reason?: string }> {
  const { supabase, providerId, productOrderId } = input;

  const { data: order } = await (supabase.from("product_orders") as any)
    .select("id, provider_id, order_source, payment_status, status, total_amount")
    .eq("id", productOrderId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (!order) return { finalized: false, reason: "order_not_found" };
  if (String(order.order_source ?? "") !== "walk_in") {
    return { finalized: false, reason: "not_walk_in" };
  }
  if (String(order.payment_status ?? "") === "paid" || String(order.status ?? "") === "delivered") {
    return { finalized: false, reason: "already_paid" };
  }

  const { data: lineItems } = await (supabase.from("product_order_items") as any)
    .select("product_id, product_variant_id, quantity")
    .eq("order_id", productOrderId);

  const posItems = (lineItems ?? []).map((item: any) => ({
    type: "product" as const,
    item_id: item.product_id,
    product_variant_id: item.product_variant_id ?? null,
    quantity: item.quantity,
  }));

  const stockError = await validatePosProductStock(supabase as any, providerId, posItems);
  if (stockError) {
    return { finalized: false, reason: "stock_short" };
  }

  const payResult = await recordProductOrderPayment({
    supabase: supabase as never,
    productOrderId,
    reference: input.reference,
    amountMajor: input.paidAmount,
    feesMajor: input.gatewayFee,
    source: "paystack_virtual_terminal_allocation",
    provider: "paystack",
    platformHeld: true,
  });

  await applyPosProductStockDecrements(supabase as any, posItems);

  try {
    const { logSaleStockMovements } = await import("@/lib/products/stock-movements");
    await logSaleStockMovements(supabase as any, {
      providerId,
      referenceId: productOrderId,
      actorUserId: input.allocatedByUserId ?? undefined,
      lines: (lineItems ?? []).map((i: any) => ({
        productId: i.product_id,
        productVariantId: i.product_variant_id ?? null,
        quantity: i.quantity,
      })),
    });
  } catch (logErr) {
    console.error("[auto-finalize-terminal] stock movement log failed:", logErr);
  }

  await (supabase.from("product_orders") as any)
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", productOrderId)
    .eq("provider_id", providerId);

  try {
    const { notifyProductOrderPaidIfTransitioned } = await import(
      "@/lib/notifications/notify-product-order-paid"
    );
    await notifyProductOrderPaidIfTransitioned(supabase as never, productOrderId, {
      transitionedToPaid: payResult.transitionedToPaid,
    });
  } catch (notifyErr) {
    console.error("[auto-finalize-terminal] notify failed:", notifyErr);
  }

  const now = new Date().toISOString();

  // Record the allocation so the payment leaves the manual inbox with a clear
  // audit trail (mirrors the manual confirm path in the allocation route).
  try {
    await (supabase.from("provider_terminal_payment_allocations") as any).insert({
      terminal_payment_id: input.terminalPaymentId,
      provider_id: providerId,
      entity_type: "product_order",
      entity_id: productOrderId,
      amount: input.paidAmount,
      currency: input.currency,
      status: "confirmed",
      reason: "Auto-allocated: exact amount match on pending walk-in sale",
      allocated_by: input.allocatedByUserId ?? null,
      allocated_at: now,
    });
  } catch (allocErr) {
    console.error("[auto-finalize-terminal] allocation insert failed:", allocErr);
  }

  await (supabase.from("provider_paystack_terminal_payments") as any)
    .update({
      status: "allocated",
      allocation_status: "allocated",
      allocated_amount: input.paidAmount,
      remaining_balance: 0,
      provider_assigned_entity_type: "product_order",
      provider_assigned_entity_id: productOrderId,
      provider_assignment_reason: "auto_exact_match_walk_in",
      provider_assigned_at: now,
      allocated_at: now,
      payout_eligibility_status: "held",
      payout_hold_until: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", input.terminalPaymentId)
    .eq("provider_id", providerId);

  return { finalized: true };
}

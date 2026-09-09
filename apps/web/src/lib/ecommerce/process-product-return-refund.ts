import type { SupabaseClient } from "@supabase/supabase-js";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  applyProductOrderCancelRefundSideEffects,
  restockProductOrderLineItems,
  type ProductOrderSideEffectRow,
} from "@/lib/orders/product-order-lifecycle";

export type ProductReturnRefundMethod = "store_credit" | "cash";

export type ProcessProductReturnRefundInput = {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  returnId: string;
  orderId: string;
  orderItemId: string | null;
  returnQuantity: number;
  refundAmount: number;
  refundMethod: ProductReturnRefundMethod;
  actorUserId: string;
  refundReason?: string | null;
};

export class ProductReturnRefundError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ProductReturnRefundError";
  }
}

/**
 * Credits the customer (store credit), restocks inventory, reverses ledger rows,
 * and updates the parent order's refund totals. Must run *before* the return
 * row is marked `refunded` so a wallet failure never leaves a settled return
 * with no money moved.
 */
export async function processProductReturnRefund(
  input: ProcessProductReturnRefundInput,
): Promise<{ fullyRefunded: boolean; refundAmount: number }> {
  const {
    supabase,
    admin,
    returnId,
    orderId,
    orderItemId,
    returnQuantity,
    refundAmount,
    refundMethod,
    actorUserId,
    refundReason,
  } = input;

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw new ProductReturnRefundError("Refund amount must be greater than 0", "INVALID_REFUND_AMOUNT");
  }

  const { data: order, error: orderError } = await supabase
    .from("product_orders")
    .select(
      "id, provider_id, payment_status, total_amount, customer_id, currency, tenant_id, order_number, refunded_amount, status, gift_card_amount",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    throw new ProductReturnRefundError("Order not found", "NOT_FOUND", 404);
  }

  const orderRow = order as ProductOrderSideEffectRow & {
    status?: string;
    refunded_amount?: number | null;
    gift_card_amount?: number | null;
  };

  if (orderRow.payment_status !== "paid" && orderRow.payment_status !== "partially_refunded") {
    throw new ProductReturnRefundError(
      "Only paid orders can be refunded through a return.",
      "INVALID_REFUND_STATUS",
    );
  }

  const orderTotal = Number(orderRow.total_amount ?? 0);
  const priorRefunded = Number(orderRow.refunded_amount ?? 0);
  const remainingRefundable = orderTotal - priorRefunded;
  if (refundAmount > remainingRefundable + 0.005) {
    throw new ProductReturnRefundError(
      `Refund amount cannot exceed ${Math.max(0, remainingRefundable).toFixed(2)}.`,
      "INVALID_REFUND_AMOUNT",
    );
  }

  if (refundMethod === "store_credit" && !orderRow.customer_id) {
    throw new ProductReturnRefundError(
      "This order has no customer account to credit. Refund in person (cash) instead.",
      "NO_WALLET_CUSTOMER",
    );
  }

  if (refundMethod === "store_credit" && orderRow.customer_id) {
    const { error: walletError } = await (admin.rpc as any)("wallet_credit_admin", {
      p_user_id: orderRow.customer_id,
      p_amount: refundAmount,
      p_currency: orderRow.currency || LAST_RESORT_CURRENCY,
      p_description: `Return refund for order ${orderRow.order_number || orderId.slice(0, 8)}${
        refundReason ? `: ${refundReason}` : ""
      }`,
      p_reference_id: returnId,
      p_reference_type: "product_return_refund",
      p_tenant_id: orderRow.tenant_id ?? null,
      p_idempotency_key: `product_return_refund:${returnId}`,
    });
    if (walletError) {
      throw new ProductReturnRefundError(
        "Could not credit the customer's wallet. The refund was not recorded.",
        "WALLET_CREDIT_FAILED",
        500,
      );
    }
  }

  const restockOpts = {
    movementType: "return" as const,
    actorUserId,
    reason: refundReason ?? "Return refunded",
    onlyItemIds: orderItemId ? [orderItemId] : null,
    quantityOverrides:
      orderItemId && returnQuantity > 0 ? { [orderItemId]: returnQuantity } : undefined,
  };
  await restockProductOrderLineItems(supabase, orderId, restockOpts);

  await applyProductOrderCancelRefundSideEffects(supabase, admin, orderRow, {
    newStatus: "refunded",
    refundAmount,
    refundReason: refundReason ?? undefined,
  });

  const newRefundedTotal = priorRefunded + refundAmount;
  const fullyRefunded = newRefundedTotal >= orderTotal - 0.005;
  const orderUpdate: Record<string, unknown> = {
    refunded_amount: newRefundedTotal,
    refunded_at: new Date().toISOString(),
    refund_method: refundMethod,
  };
  if (fullyRefunded) {
    orderUpdate.payment_status = "refunded";
    orderUpdate.status = "refunded";
  } else {
    orderUpdate.payment_status = "partially_refunded";
  }
  if (refundMethod === "cash" && orderRow.customer_id) {
    orderUpdate.refund_customer_confirmation_required = true;
    orderUpdate.refund_confirmation_deadline_at = new Date(
      Date.now() + 48 * 60 * 60 * 1000,
    ).toISOString();
  }

  const { error: orderUpdateError } = await supabase
    .from("product_orders")
    .update(orderUpdate)
    .eq("id", orderId);

  if (orderUpdateError) {
    const { error: adminRetryError } = await admin
      .from("product_orders")
      .update(orderUpdate)
      .eq("id", orderId);
    if (adminRetryError) {
      throw new ProductReturnRefundError(
        "Refund was credited but the order could not be updated. Contact support.",
        "ORDER_UPDATE_FAILED",
        500,
      );
    }
  }

  return { fullyRefunded, refundAmount };
}

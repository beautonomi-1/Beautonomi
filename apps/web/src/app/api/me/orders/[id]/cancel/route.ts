import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import {
  applyProductOrderCancelRefundSideEffects,
  restockProductOrderLineItems,
} from "@/lib/orders/product-order-lifecycle";
import { refundProductOrderOnlineTender } from "@/lib/ecommerce/refund-product-order-online-tender";
import { notifyProviderTeamUsers } from "@/lib/notifications/notify-provider-team";

const bodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .optional();

/** Statuses a customer may still cancel from (nothing has left the provider yet). */
export const CUSTOMER_CANCELLABLE_STATUSES = new Set(["pending", "confirmed", "processing"]);

export type SelfCancelEligibility =
  | { ok: true }
  | { ok: false; code: "ALREADY_CANCELLED" | "ALREADY_SHIPPED" | "NOT_CANCELLABLE"; message: string };

/** Pure eligibility check shared with tests / UI hints. */
export function getSelfCancelEligibility(order: {
  status?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
}): SelfCancelEligibility {
  const status = String(order.status ?? "");
  if (status === "cancelled" || status === "refunded") {
    return { ok: false, code: "ALREADY_CANCELLED", message: "This order has already been cancelled." };
  }
  if (status === "shipped" || status === "delivered" || order.shipped_at || order.delivered_at) {
    return {
      ok: false,
      code: "ALREADY_SHIPPED",
      message: "This order has already shipped. Please request a return instead.",
    };
  }
  if (!CUSTOMER_CANCELLABLE_STATUSES.has(status)) {
    return {
      ok: false,
      code: "NOT_CANCELLABLE",
      message: "This order can no longer be cancelled. Contact the provider for help.",
    };
  }
  return { ok: true };
}

/**
 * PATCH /api/me/orders/[id]/cancel
 *
 * Customer self-cancel for orders that have not shipped:
 *   1. restock every line + `stock_movements` (type `cancel`, reference = order id)
 *   2. refund the original tender — gift card → card balance, wallet → wallet,
 *      card → gateway refund (falls back to wallet credit if the gateway refuses)
 *   3. reverse platform-held ledger rows (shared lifecycle helper)
 *   4. mark cancelled (cancelled_at / cancellation_reason) and notify the provider team
 *
 * @tenant-hint scoped by customer_id = user.id
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );

    let parsed: { reason?: string } = {};
    try {
      const raw = await request.json();
      parsed = bodySchema.parse(raw) ?? {};
    } catch {
      parsed = {};
    }

    const admin = getSupabaseAdmin();
    const { data: order, error: fetchErr } = await (admin.from("product_orders") as any)
      .select(
        "id, customer_id, provider_id, tenant_id, order_number, status, payment_status, payment_method, payment_reference, total_amount, wallet_amount, gift_card_amount, currency, shipped_at, delivered_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return notFoundResponse("Order not found");
    if (order.customer_id !== user.id && user.role !== "superadmin") {
      return errorResponse("This order is not associated with your account.", "ORDER_OWNERSHIP_MISMATCH", 403);
    }

    const eligibility = getSelfCancelEligibility(order);
    if (eligibility.ok === false) {
      return errorResponse(eligibility.message, eligibility.code, 400);
    }

    const reason = parsed.reason?.trim() || "Cancelled by customer";
    const nowIso = new Date().toISOString();

    // Optimistic transition: only one caller wins the status flip.
    const { data: updated, error: updateErr } = await (admin.from("product_orders") as any)
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        cancellation_reason: reason,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("status", order.status)
      .select("id, order_number, status, payment_status, cancelled_at, cancellation_reason")
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (!updated) {
      return errorResponse("Order changed while cancelling. Please refresh and try again.", "STALE_ORDER", 409);
    }

    // 1. Inventory back + stock_movements audit rows.
    await restockProductOrderLineItems(admin, id, {
      movementType: "cancel",
      actorUserId: user.id,
      reason,
    });

    // 2/3. Refund original tender + ledger reversal (paid orders only).
    let refund: { online_refunded: number; wallet_credited: number; gift_card_restored: number } | null = null;
    if (order.payment_status === "paid") {
      const online = await refundProductOrderOnlineTender(admin, order, {
        reason,
        idempotencyKey: `product_order_self_cancel:${id}`,
      });
      await applyProductOrderCancelRefundSideEffects(admin, admin, order, {
        newStatus: "cancelled",
        cancellationReason: reason,
        onlineRefundedAmount: online.refundedAmount,
      });
      const total = Math.max(0, Number(order.total_amount ?? 0));
      const gift = Math.min(total, Math.max(0, Number(order.gift_card_amount ?? 0)));
      refund = {
        online_refunded: online.refundedAmount,
        wallet_credited: Math.max(0, Math.round((total - gift - online.refundedAmount) * 100) / 100),
        gift_card_restored: gift,
      };
    }

    // 4. Provider team notification.
    try {
      const orderNumber = String(order.order_number ?? id.slice(0, 8));
      const link = `/provider/ecommerce/orders?order=${encodeURIComponent(id)}`;
      await notifyProviderTeamUsers(order.provider_id, {
        type: "product_order_cancelled",
        title: "Order Cancelled by Customer",
        message: `Order ${orderNumber} was cancelled by the customer${parsed.reason ? `: ${parsed.reason}` : ""}. Stock has been restored.`,
        metadata: {
          product_order_id: id,
          order_number: orderNumber,
          cancelled_by: "customer",
          cancellation_reason: reason,
          refund,
        },
        link,
        action_url: link,
      });
    } catch (e) {
      console.warn("[me/orders/cancel] provider notify failed:", e);
    }

    return successResponse({ order: updated, refund });
  } catch (err) {
    return handleApiError(err, "Failed to cancel order");
  }
}

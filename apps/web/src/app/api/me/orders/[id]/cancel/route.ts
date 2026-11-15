import { addMoney } from "@beautonomi/utils";
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
  releaseUnpaidProductOrderHolds,
  ABANDONED_ORDER_REFUND_STILL_DUE,
  productOrderHasStockStillOut,
  restockProductOrderLineItems,
} from "@/lib/orders/product-order-lifecycle";
import { refundProductOrderOnlineTender } from "@/lib/ecommerce/refund-product-order-online-tender";
import {
  computeInPersonProductOrderRefundDue,
  computeProductOrderCancelWalletCredit,
} from "@/lib/orders/product-order-tender";
import { notifyProviderTeamUsers } from "@/lib/notifications/notify-provider-team";
import { cancelCourierShipmentForOrder } from "@/lib/orders/shipping";

const bodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .optional();

/** Statuses a customer may still cancel from (nothing has left the provider yet). */
export const CUSTOMER_CANCELLABLE_STATUSES = new Set(["pending", "confirmed", "processing"]);

export type SelfCancelEligibility =
  | { ok: true }
  | {
      ok: false;
      code:
        | "ALREADY_CANCELLED"
        | "ALREADY_SHIPPED"
        | "NOT_CANCELLABLE"
        | "PARTIALLY_REFUNDED";
      message: string;
    };

/** Pure eligibility check shared with tests / UI hints. */
export function getSelfCancelEligibility(order: {
  status?: string | null;
  payment_status?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
}): SelfCancelEligibility {
  const status = String(order.status ?? "");
  if (order.payment_status === "partially_refunded") {
    return {
      ok: false,
      code: "PARTIALLY_REFUNDED",
      message:
        "This order was partially refunded. Contact the provider to refund the remaining balance.",
    };
  }
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
        "id, customer_id, provider_id, tenant_id, order_number, status, payment_status, payment_method, payment_reference, total_amount, wallet_amount, gift_card_amount, currency, shipped_at, delivered_at, cancellation_reason",
      )
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return notFoundResponse("Order not found");
    if (order.customer_id !== user.id && user.role !== "superadmin") {
      return errorResponse("This order is not associated with your account.", "ORDER_OWNERSHIP_MISMATCH", 403);
    }

    const alreadyCancelled =
      String(order.status ?? "") === "cancelled" || String(order.status ?? "") === "refunded";
    const reason = alreadyCancelled
      ? String(order.cancellation_reason ?? "").trim() || parsed.reason?.trim() || "Cancelled by customer"
      : parsed.reason?.trim() || "Cancelled by customer";

    let updated: {
      id: string;
      order_number?: string | null;
      status?: string | null;
      payment_status?: string | null;
      cancelled_at?: string | null;
      cancellation_reason?: string | null;
    } | null = null;

    if (!alreadyCancelled) {
      const eligibility = getSelfCancelEligibility(order);
      if (eligibility.ok === false) {
        return errorResponse(eligibility.message, eligibility.code, 400);
      }

      const nowIso = new Date().toISOString();
      // Optimistic transition: only one caller wins the status flip.
      const { data: claimed, error: updateErr } = await (admin.from("product_orders") as any)
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
      if (!claimed) {
        return errorResponse("Order changed while cancelling. Please refresh and try again.", "STALE_ORDER", 409);
      }
      updated = claimed;

      await restockProductOrderLineItems(admin, id, {
        movementType: "cancel",
        actorUserId: user.id,
        reason,
      });
    } else {
      const stockStillOut = await productOrderHasStockStillOut(admin, id);
      const paidStillOwed = order.payment_status === "paid";
      if (!stockStillOut && !paidStillOwed) {
        return errorResponse(
          "This order has already been cancelled.",
          "ALREADY_CANCELLED",
          400,
        );
      }
      if (stockStillOut) {
        await restockProductOrderLineItems(admin, id, {
          movementType: "cancel",
          actorUserId: user.id,
          reason,
        });
      }
      if (!paidStillOwed) {
        return successResponse({
          order: { id, status: order.status, payment_status: order.payment_status },
          refund: null,
        });
      }
      updated = {
        id,
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        cancellation_reason: reason,
      };
    }

    // 2/3. Refund original tender + ledger reversal (paid orders only).
    // Unpaid orders already debited wallet / reserved a gift card at checkout.
    let refund: {
      online_refunded: number;
      wallet_credited: number;
      gift_card_restored: number;
      in_person_refund_due: number;
    } | null = null;
    let walletCreditFailed = false;
    let giftRestoreFailed = false;
    if (order.payment_status === "paid") {
      const online = await refundProductOrderOnlineTender(admin, order, {
        reason,
        idempotencyKey: `product_order_self_cancel:${id}`,
      });
      const onlineRefundFailed = Boolean(online.attempted && online.error);
      if (onlineRefundFailed) {
        console.warn(
          `[product-order cancel] gateway refund failed for ${id}; crediting wallet fallback`,
          online.error,
        );
      }
      const sideEffects = await applyProductOrderCancelRefundSideEffects(admin, admin, order, {
        newStatus: "cancelled",
        cancellationReason: reason,
        onlineRefundedAmount: online.refundedAmount,
      });
      walletCreditFailed = sideEffects.walletCreditFailed;
      giftRestoreFailed = sideEffects.giftRestoreFailed;
      const total = Math.max(0, Number(order.total_amount ?? 0));
      const gift = Math.min(total, Math.max(0, Number(order.gift_card_amount ?? 0)));
      const giftInWallet = sideEffects.giftDisposition === "wallet" ? gift : 0;
      refund = {
        online_refunded: online.refundedAmount,
        wallet_credited: sideEffects.walletCreditFailed
          ? 0
          : addMoney(
              computeProductOrderCancelWalletCredit(order, online.refundedAmount),
              giftInWallet,
            ),
        gift_card_restored: sideEffects.giftDisposition === "restored" ? gift : 0,
        in_person_refund_due: computeInPersonProductOrderRefundDue(order),
      };
    } else {
      const released = await releaseUnpaidProductOrderHolds(
        admin,
        order,
        `Wallet refund (order cancelled before payment) ${order.order_number || id.slice(0, 8)}`,
      );
      walletCreditFailed = released.failed;
      giftRestoreFailed = released.giftRestoreFailed;
      if (released.failed || released.giftRestoreFailed) {
        await (admin.from("product_orders") as any)
          .update({
            cancellation_reason: ABANDONED_ORDER_REFUND_STILL_DUE,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
      }
      const gift = Math.max(0, Number(order.gift_card_amount ?? 0));
      refund = {
        online_refunded: released.onlineRefunded ?? 0,
        wallet_credited: addMoney(released.amount, released.cardWalletFallback ?? 0),
        gift_card_restored: released.giftDisposition === "restored" ? gift : 0,
        in_person_refund_due: 0,
      };
    }

    try {
      const courierCancel = await cancelCourierShipmentForOrder(admin, id);
      if (!courierCancel.ok && !courierCancel.skipped) {
        console.warn("[me/orders/cancel] courier cancel refused:", courierCancel.error);
      }
    } catch (e) {
      console.warn("[me/orders/cancel] courier cancel failed:", e);
    }

    // 4. Provider team notification.
    try {
      const orderNumber = String(order.order_number ?? id.slice(0, 8));
      const link = `/provider/ecommerce/orders?order=${encodeURIComponent(id)}`;
      let stockBack = false;
      try {
        stockBack = !(await productOrderHasStockStillOut(admin, id));
      } catch (stockErr) {
        console.warn("[me/orders/cancel] stock check failed:", stockErr);
      }
      const stockSentence = stockBack
        ? "Stock has been restored."
        : "Stock is still being put back.";
      await notifyProviderTeamUsers(order.provider_id, {
        type: "product_order_cancelled",
        title: "Order Cancelled by Customer",
        message: `Order ${orderNumber} was cancelled by the customer${parsed.reason ? `: ${parsed.reason}` : ""}. ${stockSentence}`,
        metadata: {
          product_order_id: id,
          order_number: orderNumber,
          cancelled_by: "customer",
          cancellation_reason: reason,
          refund,
          ...(walletCreditFailed ? { refund_pending: true } : {}),
        },
        link,
        action_url: link,
      });
    } catch (e) {
      console.warn("[me/orders/cancel] provider notify failed:", e);
    }

    if (giftRestoreFailed) {
      return errorResponse(
        order.payment_status === "paid"
          ? "Your order was cancelled, but the gift card was not returned yet. Cancel again to finish the return."
          : "Your order was cancelled, but the gift card was not returned yet. The next check returns it.",
        "GIFT_CARD_NOT_RETURNED",
        502,
      );
    }
    if (walletCreditFailed) {
      return errorResponse(
        order.payment_status === "paid"
          ? "Your order was cancelled, but we could not add the refund to your wallet yet. Cancel again to finish the return."
          : "Your order was cancelled, but the refund was not finished yet. The next check returns it.",
        "REFUND_PENDING",
        502,
      );
    }

    return successResponse({ order: updated, refund });
  } catch (err) {
    return handleApiError(err, "Failed to cancel order");
  }
}

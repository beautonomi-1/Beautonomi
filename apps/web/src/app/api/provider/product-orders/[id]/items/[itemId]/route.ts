import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  deriveOrderStatusFromLines,
  isValidLineTransition,
  LINE_FULFILMENT_STATUSES,
  normalizeLineStatus,
  shouldNotifyPartiallyShipped,
  summarizeLineFulfilment,
  type FulfilmentLine,
} from "@/lib/ecommerce/product-order-line-fulfilment";
import { restockProductOrderLineItems } from "@/lib/orders/product-order-lifecycle";
import {
  dispatchProductOrderStatusNotification,
  type ProductOrderNotifyStatus,
} from "@/lib/notifications/notify-product-order-status";
import { dispatchTemplateNotification } from "@/lib/notifications/dispatch-template-notification";

const bodySchema = z.object({
  fulfilment_status: z.enum(LINE_FULFILMENT_STATUSES),
  /** Units shipped/delivered for this line; defaults to the full line quantity. */
  fulfilled_qty: z.number().int().min(0).optional(),
  tracking_number: z.string().trim().max(100).optional(),
  carrier: z.string().trim().max(100).optional(),
});

const ORDER_NOTIFY_STATUSES = new Set<ProductOrderNotifyStatus>([
  "shipped",
  "ready_for_collection",
  "delivered",
]);

/**
 * PATCH /api/provider/product-orders/[id]/items/[itemId]
 *
 * Update one line's fulfilment state. Order-level status is derived from all lines;
 * when some (not all) lines are shipped the customer gets a one-time
 * `product_order_partially_shipped` notice.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await params;
    const permissionCheck = await requirePermission("view_sales", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const parsed = bodySchema.parse(await request.json());

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: order, error: orderErr } = await (supabase.from("product_orders") as any)
      .select(
        "id, provider_id, customer_id, tenant_id, order_number, status, fulfillment_type, collection_location_id, tracking_number, carrier, partially_shipped_notified_at",
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) return notFoundResponse("Order not found");
    if (order.status === "cancelled" || order.status === "refunded") {
      return errorResponse(`Cannot update lines on a ${order.status} order.`, "INVALID_TRANSITION", 400);
    }

    const { data: lines, error: linesErr } = await (supabase.from("product_order_items") as any)
      .select("id, product_name, quantity, fulfilment_status, fulfilled_qty")
      .eq("order_id", id);
    if (linesErr) throw linesErr;
    const allLines = (lines ?? []) as Array<FulfilmentLine & { product_name?: string | null }>;
    const target = allLines.find((l) => l.id === itemId);
    if (!target) return notFoundResponse("Order line not found");

    const from = normalizeLineStatus(target.fulfilment_status);
    const to = parsed.fulfilment_status;
    if (!isValidLineTransition(from, to)) {
      return errorResponse(
        `Cannot move line from ${from} to ${to}.`,
        "INVALID_LINE_TRANSITION",
        400,
      );
    }

    const lineQty = Math.max(0, Number(target.quantity) || 0);
    let fulfilledQty = Number(target.fulfilled_qty ?? 0);
    if (to === "shipped" || to === "delivered") {
      fulfilledQty = parsed.fulfilled_qty != null ? Math.min(parsed.fulfilled_qty, lineQty) : lineQty;
    } else if (to === "cancelled") {
      fulfilledQty = 0;
    } else if (parsed.fulfilled_qty != null) {
      fulfilledQty = Math.min(parsed.fulfilled_qty, lineQty);
    }

    const nowIso = new Date().toISOString();
    const { data: updatedLine, error: updErr } = await (supabase.from("product_order_items") as any)
      .update({ fulfilment_status: to, fulfilled_qty: fulfilledQty, fulfilment_updated_at: nowIso })
      .eq("id", itemId)
      .eq("order_id", id)
      .select("id, product_name, quantity, fulfilment_status, fulfilled_qty, fulfilment_updated_at")
      .single();
    if (updErr) throw updErr;

    // Cancelling a single line puts its units back into inventory (with a stock_movements row).
    if (to === "cancelled" && from !== "cancelled") {
      await restockProductOrderLineItems(supabase, id, {
        movementType: "cancel",
        actorUserId: user.id,
        reason: `Line cancelled: ${target.product_name ?? itemId}`,
        onlyItemIds: [itemId],
      });
    }

    const nextLines: FulfilmentLine[] = allLines.map((l) =>
      l.id === itemId ? { ...l, fulfilment_status: to, fulfilled_qty: fulfilledQty } : l,
    );
    const summary = summarizeLineFulfilment(nextLines);
    const derivedStatus = deriveOrderStatusFromLines({
      lines: nextLines,
      currentStatus: String(order.status ?? "pending"),
      fulfillmentType: order.fulfillment_type,
    });

    const orderPatch: Record<string, unknown> = { updated_at: nowIso };
    if (parsed.tracking_number) orderPatch.tracking_number = parsed.tracking_number;
    if (parsed.carrier) orderPatch.carrier = parsed.carrier;
    if (derivedStatus) {
      orderPatch.status = derivedStatus;
      if (derivedStatus === "shipped") orderPatch.shipped_at = nowIso;
      if (derivedStatus === "delivered") orderPatch.delivered_at = nowIso;
    }

    const notifyPartial = shouldNotifyPartiallyShipped({
      summary,
      partiallyShippedNotifiedAt: order.partially_shipped_notified_at,
    });
    if (notifyPartial) orderPatch.partially_shipped_notified_at = nowIso;

    if (Object.keys(orderPatch).length > 1) {
      const { error: orderUpdErr } = await (supabase.from("product_orders") as any)
        .update(orderPatch)
        .eq("id", id);
      if (orderUpdErr) throw orderUpdErr;
    }

    const trackingNumber = parsed.tracking_number ?? order.tracking_number ?? "";
    const carrier = parsed.carrier ?? order.carrier ?? "";

    if (order.customer_id) {
      if (notifyPartial) {
        const shippedItems = nextLines
          .filter((l) => {
            const st = normalizeLineStatus(l.fulfilment_status);
            return st === "shipped" || st === "delivered";
          })
          .map((l) => (l as { product_name?: string | null }).product_name ?? "Item")
          .join(", ");
        try {
          await dispatchTemplateNotification(
            "product_order_partially_shipped",
            [order.customer_id],
            {
              order_number: String(order.order_number ?? id.slice(0, 8)),
              order_id: id,
              shipped_count: String(summary.dispatched),
              total_count: String(summary.active),
              shipped_items: shippedItems,
              tracking_number: trackingNumber,
              carrier,
              tracking_info: trackingNumber
                ? `Tracking: ${trackingNumber}${carrier ? ` (${carrier})` : ""}`
                : "",
            },
            ["push", "email"],
            { appType: "customer", tenantId: order.tenant_id ?? undefined },
          );
        } catch (e) {
          console.warn("[product-orders/items] partially shipped notify failed:", e);
        }
      }

      if (
        derivedStatus &&
        derivedStatus !== order.status &&
        ORDER_NOTIFY_STATUSES.has(derivedStatus as ProductOrderNotifyStatus)
      ) {
        await dispatchProductOrderStatusNotification({
          supabase,
          customerId: order.customer_id,
          status: derivedStatus as ProductOrderNotifyStatus,
          orderId: id,
          orderNumber: String(order.order_number ?? id.slice(0, 8)),
          tenantId: order.tenant_id ?? null,
          providerId,
          collectionLocationId: order.collection_location_id,
          trackingNumber: trackingNumber || null,
          carrier: carrier || null,
        });
      }
    }

    // Admin client for the read-back so deactivated products don't hide lines via RLS.
    const { data: refreshed } = await (getSupabaseAdmin().from("product_orders") as any)
      .select(
        "id, status, shipped_at, delivered_at, partially_shipped_notified_at, items:product_order_items(id, product_name, quantity, fulfilment_status, fulfilled_qty, fulfilment_updated_at)",
      )
      .eq("id", id)
      .maybeSingle();

    return successResponse({
      item: updatedLine,
      order: refreshed ?? { id, status: derivedStatus ?? order.status },
      summary,
      order_status: derivedStatus ?? order.status,
      partially_shipped_notified: notifyPartial,
    });
  } catch (err) {
    return handleApiError(err, "Failed to update order line");
  }
}

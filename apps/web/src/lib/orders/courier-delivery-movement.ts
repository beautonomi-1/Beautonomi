import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrackingUpdate } from "@beautonomi/shipping";
import { syncProductOrderLinesToOrderStatus } from "@/lib/ecommerce/product-order-line-fulfilment";
import { dispatchProductOrderStatusNotification } from "@/lib/notifications/notify-product-order-status";

const TERMINAL_ORDER = new Set(["cancelled", "refunded"]);
const SHIPPABLE_ORDER = new Set(["pending", "confirmed", "processing"]);

const TRACKING_RANK: Record<TrackingUpdate["status"], number> = {
  pending: 0,
  exception: 1,
  returned: 1,
  in_transit: 2,
  out_for_delivery: 2,
  delivered: 3,
};

export type CourierOrderMovement = "shipped" | "delivered" | "exception";

/**
 * The furthest courier scan wins. A later "pending" event must not undo
 * "delivered", and a return or exception must not be treated as delivery.
 */
export function strongestCourierMovement(events: TrackingUpdate[]): {
  movement: CourierOrderMovement | null;
  detail: string | null;
} {
  if (events.length === 0) return { movement: null, detail: null };
  let best = events[0];
  for (const event of events.slice(1)) {
    const rank = TRACKING_RANK[event.status] ?? 0;
    const bestRank = TRACKING_RANK[best.status] ?? 0;
    if (rank > bestRank || (rank === bestRank && event.occurredAt > best.occurredAt)) {
      best = event;
    }
  }
  const detail = best.message?.trim() || null;
  if (best.status === "delivered") return { movement: "delivered", detail };
  if (best.status === "in_transit" || best.status === "out_for_delivery") {
    return { movement: "shipped", detail };
  }
  if (best.status === "exception" || best.status === "returned") {
    return { movement: "exception", detail };
  }
  return { movement: null, detail: null };
}

/**
 * Move a delivery order to match a courier scan. Collection orders are left
 * alone. Shipped only advances orders still being prepared. Delivered advances
 * any open delivery order. Exceptions are recorded without changing the order
 * status, so the provider can rebook or mark it by hand.
 */
export async function applyCourierMovementToDeliveryOrder(
  admin: SupabaseClient,
  orderId: string,
  movement: CourierOrderMovement,
  opts?: {
    detail?: string | null;
    eta?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
  },
): Promise<void> {
  const { data: order } = await (admin.from("product_orders") as any)
    .select(
      "id, provider_id, customer_id, tenant_id, order_number, status, fulfillment_type, tracking_number, tracking_url, carrier, collection_location_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const fulfillmentType = String((order as { fulfillment_type?: string | null }).fulfillment_type ?? "");
  const orderStatus = String((order as { status?: string }).status ?? "");
  if (fulfillmentType !== "delivery" || TERMINAL_ORDER.has(orderStatus)) return;

  if (movement === "exception") {
    const detail = opts?.detail?.trim();
    if (!detail) return;
    await (admin.from("product_orders") as any)
      .update({ shipping_booking_detail: detail.slice(0, 500) })
      .eq("id", orderId);
    return;
  }

  const trackingNumber = opts?.trackingNumber ?? (order as { tracking_number?: string | null }).tracking_number;
  const trackingUrl = opts?.trackingUrl ?? (order as { tracking_url?: string | null }).tracking_url;
  const customerId = (order as { customer_id?: string | null }).customer_id;
  const notifyBase = {
    supabase: admin,
    customerId: customerId ?? "",
    orderId,
    orderNumber: String((order as { order_number?: string }).order_number ?? orderId.slice(0, 8)),
    tenantId: (order as { tenant_id?: string | null }).tenant_id ?? null,
    providerId: (order as { provider_id?: string }).provider_id,
    collectionLocationId: (order as { collection_location_id?: string | null }).collection_location_id,
    trackingNumber,
    trackingUrl,
  };

  if (movement === "shipped" && SHIPPABLE_ORDER.has(orderStatus)) {
    const now = new Date().toISOString();
    await (admin.from("product_orders") as any)
      .update({
        status: "shipped",
        shipped_at: now,
        ...(opts?.eta ? { estimated_delivery_date: opts.eta } : {}),
      })
      .eq("id", orderId);
    await syncProductOrderLinesToOrderStatus(admin, orderId, "shipped");
    if (customerId) {
      await dispatchProductOrderStatusNotification({
        ...notifyBase,
        status: "shipped",
        estimatedDelivery: opts?.eta ?? undefined,
      });
    }
    return;
  }

  if (movement === "delivered" && orderStatus !== "delivered") {
    const now = new Date().toISOString();
    await (admin.from("product_orders") as any)
      .update({ status: "delivered", delivered_at: now })
      .eq("id", orderId);
    await syncProductOrderLinesToOrderStatus(admin, orderId, "delivered");
    if (customerId) {
      await dispatchProductOrderStatusNotification({
        ...notifyBase,
        status: "delivered",
      });
    }
  }
}

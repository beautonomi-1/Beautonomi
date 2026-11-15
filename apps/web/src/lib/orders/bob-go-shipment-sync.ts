import type { SupabaseClient } from "@supabase/supabase-js";
import type { BobGoShipmentSnapshot } from "@beautonomi/shipping";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cancelCourierShipmentForOrder } from "@/lib/orders/shipping";
import { applyCourierMovementToDeliveryOrder } from "@/lib/orders/courier-delivery-movement";

const TERMINAL_ORDER = new Set(["cancelled", "refunded"]);

function bobGoCourierMovementStatus(raw: string): "shipped" | "delivered" | "exception" | null {
  const s = raw.trim().toLowerCase();
  if (s === "delivered" || s === "finalised") return "delivered";
  if (s === "collected" || s === "in-transit" || s === "out-for-delivery") return "shipped";
  if (
    s === "returned-to-sender" ||
    s.includes("exception") ||
    s === "failed-collection" ||
    s === "failed-delivery" ||
    s === "cancelled" ||
    s === "cancelled-by-courier"
  ) {
    return "exception";
  }
  return null;
}

export async function applyBobGoShipmentSnapshotToOrder(
  admin: SupabaseClient,
  orderId: string,
  snapshot: BobGoShipmentSnapshot,
  opts?: { trackingPayload?: unknown },
): Promise<void> {
  const { data: order } = await (admin.from("product_orders") as any)
    .select(
      "id, provider_id, customer_id, tenant_id, order_number, status, fulfillment_type, tracking_number, tracking_url, carrier, collection_location_id, shipping_booking_status",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const patch: Record<string, unknown> = {};
  const submission = snapshot.submissionStatus.toLowerCase();
  let clearedFailedShipment = false;

  if (submission === "success") {
    patch.shipping_booking_status = "booked";
    patch.shipping_booking_detail = null;
  } else if (submission === "no-rates" || submission === "failed-indefinitely") {
    patch.shipping_booking_status = "failed";
    patch.shipping_booking_detail = (snapshot.failedReason ?? submission).slice(0, 500);
    if (snapshot.trackingReference) {
      const cancelResult = await cancelCourierShipmentForOrder(admin, orderId, {
        markBookingCancelled: false,
      });
      if (cancelResult.ok) {
        clearedFailedShipment = true;
        patch.tracking_number = null;
        patch.courier_shipment_id = null;
        patch.tracking_url = null;
      }
    }
  } else if (
    submission === "pending-rates" ||
    submission === "pending-submission" ||
    submission === "failed-will-retry"
  ) {
    patch.shipping_booking_status = "submitting";
  }

  if (!clearedFailedShipment) {
    if (snapshot.trackingReference) {
      patch.tracking_number = snapshot.trackingReference;
      patch.carrier = "bob-go";
    }
    if (snapshot.id != null) patch.courier_shipment_id = String(snapshot.id);
    if (snapshot.trackingUrl) patch.tracking_url = snapshot.trackingUrl;
  }
  if (snapshot.chargedAmount != null) patch.courier_charged_amount = snapshot.chargedAmount;
  if (snapshot.chargedWeightKg != null) patch.courier_charged_weight_kg = snapshot.chargedWeightKg;

  patch.courier_label_url = null;

  const movement = bobGoCourierMovementStatus(snapshot.status);
  const orderStatus = String((order as { status?: string }).status ?? "");
  if (!TERMINAL_ORDER.has(orderStatus) && movement === "exception" && snapshot.failedReason) {
    patch.shipping_booking_detail = snapshot.failedReason.slice(0, 500);
  }

  if (Object.keys(patch).length > 0) {
    await (admin.from("product_orders") as any).update(patch).eq("id", orderId);
  }

  if (!movement) return;

  const trackingRoot = opts?.trackingPayload ? asTrackingRoot(opts.trackingPayload) : null;
  const eta =
    strField(trackingRoot?.shipment_estimated_delivery_date_to) ??
    strField(trackingRoot?.shipment_estimated_delivery_date_from);

  await applyCourierMovementToDeliveryOrder(admin, orderId, movement, {
    detail: movement === "exception" ? (snapshot.failedReason ?? null) : null,
    eta,
    trackingNumber: snapshot.trackingReference,
    trackingUrl: snapshot.trackingUrl ?? (order as { tracking_url?: string | null }).tracking_url,
  });
}

export async function findProductOrderIdByBobGoTracking(
  admin: SupabaseClient,
  trackingReference: string,
): Promise<string | null> {
  const ref = trackingReference.trim();
  if (!ref) return null;
  const { data } = await (admin.from("product_orders") as any)
    .select("id")
    .eq("tracking_number", ref)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

function asTrackingRoot(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload)) {
    const first = payload[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return payload as Record<string, unknown>;
}

function strField(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

export function getSupabaseAdminForBobGoSync(): SupabaseClient {
  return getSupabaseAdmin();
}

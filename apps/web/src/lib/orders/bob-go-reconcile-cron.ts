import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBobGoShipment } from "@beautonomi/shipping";
import { applyBobGoShipmentSnapshotToOrder } from "@/lib/orders/bob-go-shipment-sync";
import { bookShippingForOrder, BOB_GO_PROBE_RATES_TIMEOUT_MS } from "@/lib/orders/shipping";
import { resolveProviderOwnedCredentials } from "@/lib/orders/shipping-runtime";

export async function reconcileBobGoShipments(admin: SupabaseClient): Promise<{
  polled: number;
  retriedRates: number;
  errors: number;
}> {
  let polled = 0;
  let retriedRates = 0;
  let errors = 0;

  const { data: openOrders } = await (admin.from("product_orders") as any)
    .select("id, provider_id, tracking_number, courier_shipment_id, shipping_booking_status, status")
    .eq("carrier", "bob-go")
    .in("shipping_booking_status", ["submitting", "booked"])
    .not("status", "in", '("cancelled","refunded","delivered")');

  for (const row of openOrders ?? []) {
    const order = row as {
      id: string;
      provider_id: string;
      tracking_number?: string | null;
      courier_shipment_id?: string | null;
    };
    if (!order.tracking_number && !order.courier_shipment_id) continue;
    polled += 1;
    try {
      const creds = await resolveProviderOwnedCredentials(admin, order.provider_id, "bob-go");
      if (!creds?.["bob-go"]) continue;
      const snapshot = await fetchBobGoShipment(creds["bob-go"], {
        trackingReference: order.tracking_number,
        shipmentId: order.courier_shipment_id,
      });
      if (!snapshot) continue;
      await applyBobGoShipmentSnapshotToOrder(admin, order.id, snapshot);
    } catch (e) {
      errors += 1;
      console.warn("[reconcile-bob-go]", order.id, e);
    }
  }

  const { data: pendingRateOrders } = await (admin.from("product_orders") as any)
    .select("id")
    .eq("fulfillment_type", "delivery")
    .eq("payment_status", "paid")
    .eq("shipping_booking_status", "skipped")
    .eq("shipping_booking_detail", "rates_pending")
    .is("tracking_number", null);

  for (const row of pendingRateOrders ?? []) {
    retriedRates += 1;
    try {
      await bookShippingForOrder(admin, (row as { id: string }).id, {
        bobGoRatesTimeoutMs: BOB_GO_PROBE_RATES_TIMEOUT_MS,
      });
    } catch (e) {
      errors += 1;
      console.warn("[reconcile-bob-go] rates retry", row, e);
    }
  }

  return { polled, retriedRates, errors };
}

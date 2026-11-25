import type { CompletionBlocker } from "@beautonomi/provider-booking";
import { fetcher } from "@/lib/http/fetcher";
import type { CompletionHandoverActionId } from "@/components/provider/booking/view/BookingCompleteConfirmDialog";

export async function runCompletionHandoverAction(
  bookingId: string,
  blocker: CompletionBlocker,
  actionId: CompletionHandoverActionId,
): Promise<void> {
  if (actionId === "prepare_order") {
    await fetcher.patch(`/api/provider/bookings/${bookingId}`, { sync_product_order: true });
    return;
  }
  if (!blocker.orderId && actionId !== "view_charges") {
    return;
  }
  const orderId = blocker.orderId;
  if (actionId === "mark_collected" && orderId) {
    await fetcher.patch(`/api/provider/product-orders/${orderId}`, { status: "delivered" });
    return;
  }
  if (actionId === "set_pickup" && orderId) {
    await fetcher.patch(`/api/provider/product-orders/${orderId}`, { fulfillment_type: "collection" });
    return;
  }
  if (actionId === "set_delivery" && orderId) {
    await fetcher.patch(`/api/provider/product-orders/${orderId}`, { fulfillment_type: "delivery" });
    return;
  }
}
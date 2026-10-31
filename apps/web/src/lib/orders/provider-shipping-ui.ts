export type ProviderShippingBookingDisplay = {
  statusLabel: string;
  detailLabel: string | null;
  showBookCourier: boolean;
  showPrintWaybill: boolean;
};

export function providerShippingBookingDisplay(order: {
  fulfillment_type?: string | null;
  payment_status?: string | null;
  status?: string | null;
  tracking_number?: string | null;
  courier_label_url?: string | null;
  carrier?: string | null;
  shipping_booking_status?: string | null;
  shipping_booking_detail?: string | null;
}): ProviderShippingBookingDisplay | null {
  if (order.fulfillment_type !== "delivery") return null;

  const status = String(order.shipping_booking_status ?? "").toLowerCase();
  const detail = order.shipping_booking_detail?.trim() || null;
  const tracking = order.tracking_number?.trim() || null;
  const carrier = String(order.carrier ?? "").toLowerCase();
  const isBobGo = carrier === "bob-go";

  let statusLabel = status || "—";
  if (status === "submitting") statusLabel = "Waiting for Bob Go";
  else if (status === "booked") statusLabel = "Booked with courier";
  else if (status === "booking") statusLabel = "Booking in progress";
  else if (status === "failed") statusLabel = "Courier booking failed";
  else if (status === "skipped" && detail === "rates_pending") statusLabel = "Couriers still quoting";
  else if (status === "skipped") statusLabel = "Courier booking skipped";
  else if (status === "cancelled") statusLabel = "Courier shipment cancelled";

  let detailLabel = detail;
  if (detail === "rates_pending") detailLabel = "Bob Go is still collecting rates. Try Book courier again in a moment.";

  const paid =
    order.payment_status === "paid" &&
    order.status !== "cancelled" &&
    order.status !== "refunded";

  const showBookCourier =
    paid &&
    (!tracking || status === "failed" || status === "skipped");

  const showPrintWaybill =
    Boolean(tracking || order.courier_label_url) &&
    (!isBobGo || status === "booked" || status === "cancelled");

  return { statusLabel, detailLabel, showBookCourier, showPrintWaybill };
}

export function interpretBookShipmentResponse(data: unknown): {
  ok: boolean;
  message: string;
  variant: "success" | "error" | "info";
} {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const nested =
    root?.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const result =
    nested && "result" in nested
      ? (nested.result as BookShipmentResultLike | undefined)
      : undefined;

  const r = result as BookShipmentResultLike | undefined;
  if (!r) {
    return { ok: false, message: "Unexpected booking response", variant: "error" };
  }
  if (r.ok === false) {
    return { ok: false, message: r.error ?? "Courier booking failed", variant: "error" };
  }
  if (r.skipped === "already_booked" || r.skipped === "booking_in_progress") {
    return {
      ok: true,
      message:
        r.skipped === "booking_in_progress"
          ? "A booking is already in progress."
          : "This order already has a courier shipment.",
      variant: "info",
    };
  }
  if (r.skipped === "rates_pending") {
    return {
      ok: true,
      message: "Couriers are still quoting. Try again in a moment.",
      variant: "info",
    };
  }
  if (r.skipped) {
    return { ok: true, message: String(r.skipped), variant: "info" };
  }
  return { ok: true, message: "Courier shipment booked.", variant: "success" };
}

type BookShipmentResultLike = {
  ok?: boolean;
  error?: string;
  skipped?: string;
  trackingNumber?: string;
};

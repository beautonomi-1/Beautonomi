import type { getSupabaseAdmin } from "@/lib/supabase/admin";

const RECORDED_BOOKING_PAYMENT = new Set([
  "paid",
  "partially_paid",
  "refunded",
  "partially_refunded",
]);

export function clientStatusForBookingPayment(
  paymentStatus: string | null | undefined,
): "success" | "pending" {
  return RECORDED_BOOKING_PAYMENT.has(String(paymentStatus ?? "").toLowerCase())
    ? "success"
    : "pending";
}

export function isGuestSharePayment(meta: Record<string, unknown> | null | undefined): boolean {
  const paymentType = String(meta?.payment_type ?? "");
  return paymentType === "group_participant" || paymentType === "group_participant_share";
}

export async function bookingPaymentAfterCharge(
  admin: ReturnType<typeof getSupabaseAdmin>,
  reference: string,
  meta: Record<string, unknown> | null | undefined,
): Promise<{ bookingId: string | null; payment_status: string | null }> {
  const fromMeta =
    (typeof meta?.booking_id === "string" && meta.booking_id.trim()) ||
    (typeof meta?.bookingId === "string" && meta.bookingId.trim()) ||
    "";
  if (!fromMeta) {
    const { data } = await admin
      .from("bookings")
      .select("id, payment_status")
      .eq("payment_reference", reference)
      .maybeSingle();
    const row = data as { id?: string; payment_status?: string | null } | null;
    if (!row?.id) return { bookingId: null, payment_status: null };
    return { bookingId: row.id, payment_status: row.payment_status ?? "pending" };
  }
  const { data } = await admin.from("bookings").select("payment_status").eq("id", fromMeta).maybeSingle();
  return {
    bookingId: fromMeta,
    payment_status: String((data as { payment_status?: string | null } | null)?.payment_status ?? "pending"),
  };
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** A saved row, not the gateway, decides whether checkout can say paid. */
export function statusFromRecordedRow(
  kind:
    | "product_order"
    | "ads"
    | "subscription"
    | "membership"
    | "gift_card"
    | "custom_offer"
    | "invoice"
    | "terminal"
    | "guest_share"
    | "booking",
  row: Record<string, unknown> | null,
): "success" | "pending" {
  if (!row) return "pending";
  if (kind === "ads" || kind === "subscription" || kind === "membership" || kind === "gift_card" || kind === "invoice") {
    return String(row.status ?? "").toLowerCase() === "paid" ? "success" : "pending";
  }
  if (kind === "terminal") {
    return String(row.invoice_status ?? "").toLowerCase() === "paid" ? "success" : "pending";
  }
  if (kind === "custom_offer") {
    const status = String(row.status ?? "").toLowerCase();
    const bookingId = typeof row.booking_id === "string" ? row.booking_id.trim() : "";
    const collected = status === "paid" || status === "accepted";
    return collected && bookingId ? "success" : "pending";
  }
  if (kind === "guest_share") {
    if (String(row.participant_payment_status ?? "").toLowerCase() === "paid") return "success";
    const due = Number(row.amount_due ?? 0);
    const paid = Number(row.amount_paid ?? 0);
    return due > 0 && paid + 0.01 >= due ? "success" : "pending";
  }
  const paymentStatus = String(row.payment_status ?? row.status ?? "");
  return clientStatusForBookingPayment(paymentStatus);
}

/**
 * Re-read the row this charge belongs to.
 * Returns null when the charge is not a booking, order, ad, or subscription.
 */
export async function recordedChargeClientStatus(
  admin: ReturnType<typeof getSupabaseAdmin>,
  meta: Record<string, unknown> | null | undefined,
  reference: string,
): Promise<"success" | "pending" | null> {
  const productOrderId = metaString(meta, "product_order_id");
  if (productOrderId) {
    const { data } = await admin
      .from("product_orders")
      .select("payment_status")
      .eq("id", productOrderId)
      .maybeSingle();
    return statusFromRecordedRow("product_order", data as Record<string, unknown> | null);
  }
  const adsId = metaString(meta, "ads_budget_order_id");
  if (adsId) {
    const { data } = await admin.from("ads_budget_orders").select("status").eq("id", adsId).maybeSingle();
    return statusFromRecordedRow("ads", data as Record<string, unknown> | null);
  }
  const membershipId = metaString(meta, "membership_order_id");
  if (membershipId) {
    const { data } = await admin.from("membership_orders").select("status").eq("id", membershipId).maybeSingle();
    return statusFromRecordedRow("membership", data as Record<string, unknown> | null);
  }
  const giftCardOrderId = metaString(meta, "gift_card_order_id");
  if (giftCardOrderId) {
    const { data } = await admin.from("gift_card_orders").select("status").eq("id", giftCardOrderId).maybeSingle();
    return statusFromRecordedRow("gift_card", data as Record<string, unknown> | null);
  }
  const customOfferId = metaString(meta, "custom_offer_id");
  if (customOfferId) {
    const { data } = await admin
      .from("custom_offers")
      .select("status, booking_id")
      .eq("id", customOfferId)
      .maybeSingle();
    return statusFromRecordedRow("custom_offer", data as Record<string, unknown> | null);
  }
  const invoiceId = metaString(meta, "provider_invoice_id");
  if (invoiceId) {
    const { data } = await admin.from("provider_invoices").select("status").eq("id", invoiceId).maybeSingle();
    return statusFromRecordedRow("invoice", data as Record<string, unknown> | null);
  }
  const terminalOrderId = metaString(meta, "terminal_order_id");
  if (terminalOrderId) {
    const { data } = await admin
      .from("terminal_orders")
      .select("invoice_status")
      .eq("id", terminalOrderId)
      .maybeSingle();
    return statusFromRecordedRow("terminal", data as Record<string, unknown> | null);
  }
  const subscriptionId = metaString(meta, "provider_subscription_order_id");
  if (subscriptionId) {
    const { data } = await admin
      .from("provider_subscription_orders")
      .select("status")
      .eq("id", subscriptionId)
      .maybeSingle();
    return statusFromRecordedRow("subscription", data as Record<string, unknown> | null);
  }
  if (isGuestSharePayment(meta)) {
    const participantId =
      metaString(meta, "group_participant_id") || metaString(meta, "booking_participant_id");
    if (!participantId) return "pending";
    const { data } = await admin
      .from("booking_participants")
      .select("participant_payment_status, amount_due, amount_paid")
      .eq("id", participantId)
      .maybeSingle();
    return statusFromRecordedRow("guest_share", data as Record<string, unknown> | null);
  }
  const bookingId = metaString(meta, "booking_id") || metaString(meta, "bookingId");
  if (bookingId || reference) {
    const capture = await bookingPaymentAfterCharge(admin, reference, meta);
    if (!capture.bookingId) return bookingId ? "pending" : null;
    return clientStatusForBookingPayment(capture.payment_status);
  }
  return null;
}

/** A custom offer booking id is only safe to open once the offer itself is recorded paid. */
export function bookingIdForClientStatus(
  metadata: Record<string, unknown> | null | undefined,
  status: string,
  bookingId: string | null,
): string | null {
  if (metaString(metadata, "custom_offer_id") && status !== "success") return null;
  return bookingId;
}

/** Gateway paid is not enough when the charge belongs to a booking, order, ad, or subscription. */
export async function resolveSettledChargeClientStatus(input: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  reference: string;
  gatewayPaid: boolean;
  bookingId: string | null;
  paymentStatus: string | null;
  metadata?: Record<string, unknown> | null;
  unpaidStatus?: "pending" | "error";
}): Promise<"success" | "pending" | "error"> {
  if (!input.gatewayPaid) return input.unpaidStatus ?? "pending";
  const recorded = await recordedChargeClientStatus(input.admin, input.metadata, input.reference);
  if (recorded) return recorded;
  if (input.bookingId) return clientStatusForBookingPayment(input.paymentStatus);
  return "success";
}

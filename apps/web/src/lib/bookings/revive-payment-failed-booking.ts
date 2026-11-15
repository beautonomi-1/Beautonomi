import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateBookingSlotBeforePayment } from "@/lib/bookings/revalidate-booking-slot-before-payment";
import {
  deductBookingRetailStock,
  undoUnsavedBookingStock,
} from "@/lib/bookings/deduct-booking-retail-stock";

export const PAYMENT_FAILED_CANCEL_REASON = "Payment failed";

export type RevivePaymentFailedBookingResult =
  | { ok: true; revived: true }
  | { ok: false; reason: string };

/**
 * Reopen a booking cancelled only as "Payment failed" so a later capture can settle.
 * Returns ok:false when the booking must stay terminal (caller should auto-refund).
 */
export async function revivePaymentFailedBooking(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    reference: string;
    amountMajor: number;
    paymentProvider: string;
  },
): Promise<RevivePaymentFailedBookingResult> {
  const { bookingId, reference, amountMajor, paymentProvider } = params;

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, status, cancellation_reason, cancelled_at, total_amount, wallet_amount, gift_card_amount, customer_package_entitlement_id, rescheduled_from_booking_id, payment_status",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { ok: false, reason: "booking_not_found" };
  }

  const row = booking as {
    status?: string | null;
    cancellation_reason?: string | null;
    total_amount?: number | null;
    wallet_amount?: number | null;
    gift_card_amount?: number | null;
    customer_package_entitlement_id?: string | null;
    rescheduled_from_booking_id?: string | null;
  };

  if (String(row.status ?? "").toLowerCase() !== "cancelled") {
    return { ok: false, reason: "not_cancelled" };
  }
  if (String(row.cancellation_reason ?? "") !== PAYMENT_FAILED_CANCEL_REASON) {
    return { ok: false, reason: "wrong_cancel_reason" };
  }
  if (row.rescheduled_from_booking_id) {
    return { ok: false, reason: "reschedule_copy" };
  }
  // A prepaid package session was already returned when the visit was cancelled.
  if (row.customer_package_entitlement_id) {
    return { ok: false, reason: "package_booking" };
  }

  const total = Number(row.total_amount ?? 0);
  // Full card capture only — wallet/gift/package were reversed on the old cancel path.
  if (!(total > 0) || Math.abs(amountMajor - total) > 0.01) {
    return { ok: false, reason: "amount_not_full_card" };
  }
  if (Number(row.wallet_amount ?? 0) > 0.009 || Number(row.gift_card_amount ?? 0) > 0.009) {
    return { ok: false, reason: "split_tender_still_present" };
  }

  const { data: txRow } = await supabase
    .from("payment_transactions")
    .select("id, status")
    .eq("provider", paymentProvider)
    .eq("reference", reference)
    .maybeSingle();
  if (txRow && String((txRow as { status?: string }).status ?? "") === "refunded") {
    return { ok: false, reason: "already_refunded" };
  }

  // Checkout metadata: wallet, gift card, package, or reschedule credit on this
  // checkout means the capture was not the whole card-only price.
  const { data: checkoutRow } = await supabase
    .from("online_payment_checkouts")
    .select("metadata")
    .eq("reference", reference)
    .maybeSingle();
  const checkoutMeta =
    (checkoutRow as { metadata?: Record<string, unknown> | null } | null)?.metadata ?? {};
  if (
    Number(checkoutMeta.wallet_amount_applied ?? 0) > 0.009 ||
    Number(checkoutMeta.gift_card_amount_applied ?? 0) > 0.009 ||
    checkoutMeta.customer_package_entitlement_id ||
    checkoutMeta.package_entitlement_id
  ) {
    return { ok: false, reason: "split_tender_in_checkout" };
  }

  const slotOk = await revalidateBookingSlotBeforePayment(supabase, bookingId);
  if (slotOk.ok === false) {
    return { ok: false, reason: slotOk.code || "slot_unavailable" };
  }

  let takenStock: Awaited<ReturnType<typeof deductBookingRetailStock>> = [];
  try {
    takenStock = await deductBookingRetailStock(supabase, bookingId);
  } catch (stockErr) {
    console.error("[revivePaymentFailedBooking] stock deduct failed", bookingId, stockErr);
    return { ok: false, reason: "stock_unavailable" };
  }

  const { data: claimed } = await supabase
    .from("bookings")
    .update({
      status: "pending_payment",
      payment_status: "pending",
      cancelled_at: null,
      cancelled_by: null,
      cancellation_reason: null,
      payment_reference: reference,
      payment_provider: paymentProvider,
    })
    .eq("id", bookingId)
    .eq("status", "cancelled")
    .eq("cancellation_reason", PAYMENT_FAILED_CANCEL_REASON)
    .select("id");

  if ((claimed?.length ?? 0) === 0) {
    // Another caller reopened (or changed) the booking first. Put back only
    // the stock this call took.
    if (takenStock.length > 0) {
      try {
        await undoUnsavedBookingStock(supabase, takenStock, []);
      } catch (undoErr) {
        console.error("[revivePaymentFailedBooking] could not undo stock", bookingId, undoErr);
      }
    }
    return { ok: false, reason: "claim_lost" };
  }

  await supabase
    .from("payment_transactions")
    .delete()
    .eq("provider", paymentProvider)
    .eq("reference", reference)
    .eq("status", "failed");

  await supabase
    .from("payments")
    .update({
      status: "pending",
      failed_at: null,
      failure_reason: null,
      payment_provider: paymentProvider,
      payment_provider_transaction_id: reference,
    })
    .eq("booking_id", bookingId)
    .eq("payment_provider_transaction_id", reference);

  return { ok: true, revived: true };
}

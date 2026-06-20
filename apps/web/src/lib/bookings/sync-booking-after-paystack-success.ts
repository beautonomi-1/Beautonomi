import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppointmentSettingsFromDB } from "@/lib/provider-portal/appointment-settings";

export type SyncBookingAfterPaystackResult = {
  ok: boolean;
  skippedReason?: "cancelled" | "not_found";
};

/**
 * After a successful Paystack charge is recorded in `booking_payments`, the trigger
 * `update_booking_payment_status` updates `payment_status`, `total_paid`, etc.
 * This function aligns `status`, `confirmed_at`, `payment_date`, and `paid_at` with
 * provider appointment rules — matching `processPayment` when gift card/wallet covers
 * the charge (`!requireConfirmationForBookings` → auto-confirm).
 *
 * - **Deposit (partially_paid)**: same rules; if provider requires manual confirmation,
 *   booking stays `pending` until staff confirms.
 * - **Cancelled bookings**: does not change lifecycle (payment rows may still exist for refunds).
 */
export async function syncBookingAfterPaystackSuccess(
  admin: SupabaseClient,
  bookingId: string,
  options?: {
    /** Latest Paystack reference (customer-facing transaction ref) */
    paymentReference?: string;
    /** Set when known (e.g. paystack, wallet) */
    paymentProvider?: string;
  },
): Promise<SyncBookingAfterPaystackResult> {
  const { data: row, error } = await admin
    .from("bookings")
    .select(
      "id, status, provider_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, payment_date, paid_at, confirmed_at, cancelled_at",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, skippedReason: "not_found" };
  }

  if (row.cancelled_at != null || row.status === "cancelled") {
    return { ok: true, skippedReason: "cancelled" };
  }

  // §Payment-truth 2026-06: a booking sitting at `pending_payment` was created via
  // the card-redirect path, where provider/customer confirmation notifications are
  // intentionally deferred (see post-booking.ts). The first successful charge that
  // moves it OUT of `pending_payment` is the moment to fire them. Subsequent syncs
  // (deposit balance, remaining balance) see a non-`pending_payment` status, so
  // this never double-notifies for the same booking.
  const wasPendingPayment = row.status === "pending_payment";

  const settings = await getAppointmentSettingsFromDB(admin, row.provider_id as string);
  const shouldAutoConfirm = !settings.requireConfirmationForBookings;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};

  if (options?.paymentReference) {
    updates.payment_reference = options.paymentReference;
  }
  if (options?.paymentProvider) {
    updates.payment_provider = options.paymentProvider;
  }

  const ps = (row.payment_status as string) || "pending";
  // Post-582/589, total_paid is expected to include synthetic wallet/gift rows.
  // Use the same coverage invariant as booking display/mark-paid to avoid
  // double-counting those fields while still handling legacy rows.
  const totalPaid = Number((row as Record<string, unknown>).total_paid ?? 0);
  const totalRefunded = Number((row as Record<string, unknown>).total_refunded ?? 0);
  const walletAmount = Number((row as Record<string, unknown>).wallet_amount ?? 0);
  const giftCardAmount = Number((row as Record<string, unknown>).gift_card_amount ?? 0);
  const totalAmount = Number((row as Record<string, unknown>).total_amount ?? 0);
  const effectivePaid = Math.max(0, totalPaid - totalRefunded);
  const walletGiftCoverage = walletAmount + giftCardAmount;
  const coverage = Math.max(effectivePaid, walletGiftCoverage);
  const isFullyCovered = totalAmount > 0 && coverage >= totalAmount - 0.01; // 1-cent tolerance for rounding

  const hasCoverage = coverage > 0.005;
  const hasRecordedPayment = hasCoverage || ps === "partially_paid" || isFullyCovered;

  if (!hasRecordedPayment) {
    if (Object.keys(updates).length > 0) {
      await admin.from("bookings").update(updates).eq("id", bookingId);
    }
    return { ok: true };
  }

  if (!row.payment_date) {
    updates.payment_date = now;
  }
  if (!row.paid_at) {
    updates.paid_at = now;
  }

  // If the booking is fully covered but the DB status is stale, repair it here.
  // Refund-aware statuses are owned by the booking_refunds trigger; do not flatten them.
  if (ps === "refunded" || ps === "partially_refunded") {
    // keep trigger-derived refund state
  } else if (isFullyCovered && ps !== "paid" && totalRefunded <= 0.005) {
    updates.payment_status = "paid";
  } else if (!isFullyCovered && ps === "paid" && hasCoverage) {
    updates.payment_status = "partially_paid";
  }

  // Target lifecycle status after this successful charge.
  let targetStatus: "confirmed" | "pending" | null = null;
  if (shouldAutoConfirm) {
    if (row.status !== "confirmed" && row.status !== "completed") {
      targetStatus = "confirmed";
      if (!row.confirmed_at) {
        updates.confirmed_at = now;
      }
    }
  } else if (row.status === "pending_payment") {
    targetStatus = "pending";
  }
  // When requireConfirmationForBookings is true, leave status as pending until provider confirms.

  // Did THIS invocation perform the pending_payment → (confirmed|pending) transition?
  // Used to fire the deferred confirmation notifications exactly once, even when the
  // Paystack webhook and the client-side `/api/paystack/verify` both land for the
  // same charge (both funnel through `processSuccessfulPayment` → here).
  let claimedPendingPaymentTransition = false;

  if (wasPendingPayment && targetStatus) {
    // Atomic claim: only the first writer flips a row still at `pending_payment`.
    // The loser's `.eq("status", "pending_payment")` no longer matches, so it
    // returns zero rows and skips the notifications.
    const { data: claimedRows, error: claimError } = await admin
      .from("bookings")
      .update({ ...updates, status: targetStatus })
      .eq("id", bookingId)
      .eq("status", "pending_payment")
      .select("id");
    claimedPendingPaymentTransition = !claimError && (claimedRows?.length ?? 0) > 0;

    // If another writer already transitioned the booking, still persist any
    // payment-field updates (payment_date/paid_at/reference) that we computed.
    if (!claimedPendingPaymentTransition && Object.keys(updates).length > 0) {
      await admin.from("bookings").update(updates).eq("id", bookingId);
    }
  } else {
    if (targetStatus) {
      updates.status = targetStatus;
    }
    if (Object.keys(updates).length > 0) {
      await admin.from("bookings").update(updates).eq("id", bookingId);
    }
  }

  // Deferred confirmation notifications: now that the card payment is confirmed
  // and this call won the `pending_payment` transition, notify the provider of the
  // new booking and the customer that it is confirmed. Best-effort — never block or
  // throw out of the payment-success path.
  if (claimedPendingPaymentTransition) {
    try {
      const { notifyProviderNewBooking, notifyBookingConfirmed } = await import(
        "@/lib/notifications/notification-service"
      );
      await Promise.allSettled([
        notifyProviderNewBooking(bookingId, ["push"]),
        notifyBookingConfirmed(bookingId, ["push", "email"]),
      ]);
    } catch (notifyErr) {
      console.warn(
        "[syncBookingAfterPaystackSuccess] deferred confirmation notifications failed",
        bookingId,
        notifyErr,
      );
    }
  }

  return { ok: true };
}

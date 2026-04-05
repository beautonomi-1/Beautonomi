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
      "id, status, provider_id, total_amount, total_paid, payment_status, payment_date, paid_at, confirmed_at, cancelled_at",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, skippedReason: "not_found" };
  }

  if (row.cancelled_at != null || row.status === "cancelled") {
    return { ok: true, skippedReason: "cancelled" };
  }

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
  const hasRecordedPayment = ps === "paid" || ps === "partially_paid";

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

  if (shouldAutoConfirm) {
    if (row.status !== "confirmed" && row.status !== "completed") {
      updates.status = "confirmed";
      if (!row.confirmed_at) {
        updates.confirmed_at = now;
      }
    }
  }
  // When requireConfirmationForBookings is true, leave status as pending until provider confirms.

  if (Object.keys(updates).length > 0) {
    await admin.from("bookings").update(updates).eq("id", bookingId);
  }

  return { ok: true };
}

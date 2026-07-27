import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingLevelItemsAlreadyPosted,
  sumPostedPositiveLegs,
} from "./resolve-commission-base-for-booking-payment";

export type BookingCommissionContextInput = {
  /** Funds applied by the charge being posted (card + wallet + gift card). */
  chargeAmount: number;
  /**
   * booking_payments.payment_provider_id for this charge, when known. Callers may run
   * before or after the payment row is inserted, so the row is excluded from the prior
   * sum and re-added via chargeAmount. This keeps cumulativePaid identical either way
   * and safe against webhook retries that re-enter with the row already persisted.
   */
  excludeReference?: string | null;
  /** booking_payments.id for this charge, when the caller already inserted it. */
  excludePaymentId?: string | null;
};

export async function fetchBookingCommissionContext(
  supabase: SupabaseClient,
  bookingId: string,
  input: BookingCommissionContextInput,
): Promise<{
  cumulativePaid: number;
  postedLegsSum: number;
  bookingLevelItemsAlreadyPosted: boolean;
  /** Existing tip/tax/travel/platform_fee/service_fee types on this booking. */
  existingBookingLevelTypes: Set<string>;
}> {
  const [{ data: payments }, { data: ledgerRows }] = await Promise.all([
    supabase
      .from("booking_payments")
      .select("id, amount, status, payment_provider_id")
      .eq("booking_id", bookingId),
    supabase
      .from("finance_transactions")
      .select("transaction_type, net")
      .eq("booking_id", bookingId),
  ]);

  const excludeReference = input.excludeReference ?? null;
  const excludePaymentId = input.excludePaymentId ?? null;

  const priorPaid = (payments ?? [])
    .filter((row) => {
      const typed = row as { id?: string; status?: string; payment_provider_id?: string | null };
      const status = String(typed.status ?? "");
      if (status !== "completed" && status !== "partially_refunded") return false;
      if (excludePaymentId && String(typed.id ?? "") === excludePaymentId) return false;
      if (excludeReference && String(typed.payment_provider_id ?? "") === excludeReference) return false;
      return true;
    })
    .reduce((sum, row) => sum + Number((row as { amount?: number }).amount ?? 0), 0);

  const rows = (ledgerRows ?? []) as Array<{ transaction_type?: string | null; net?: number | null }>;
  const existingBookingLevelTypes = new Set(
    rows
      .map((r) => String(r.transaction_type ?? ""))
      .filter((t) =>
        ["tip", "tax", "travel_fee", "platform_fee", "service_fee"].includes(t),
      ),
  );

  return {
    cumulativePaid: priorPaid + Math.max(0, Number(input.chargeAmount || 0)),
    postedLegsSum: sumPostedPositiveLegs(rows),
    bookingLevelItemsAlreadyPosted: bookingLevelItemsAlreadyPosted(rows),
    existingBookingLevelTypes,
  };
}

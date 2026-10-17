import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCancellationPolicy } from "@/lib/bookings/cancellation-policy";
import {
  fetchBookingPaymentsForRefundCap,
  fetchCompletedInPersonRefundsTotal,
} from "@/lib/bookings/booking-refund-limits";
import { splitCollectedByRail } from "@/lib/bookings/payment-collected-classifier";
import {
  resolveCancellationOutcome,
  type CancelActor,
  outcomeToPreviewPayload,
} from "@/lib/bookings/resolve-cancellation-outcome";

/**
 * Reads with the service-role client so payment rows are never hidden by RLS (a hidden payment
 * would understate platform-collected money and the refund). Callers must authorize access to
 * the returned booking (customer_id / provider_id / portal token) before acting on it.
 */
export async function loadCancellationOutcomeForBooking(
  _callerClient: SupabaseClient,
  bookingId: string,
  actor: CancelActor,
  opts?: { explicitCancellationFee?: number | null; now?: Date },
) {
  const supabase = getSupabaseAdmin();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, provider_id, location_id, location_type, scheduled_at, created_at, status, customer_id, total_amount, tip_amount, total_paid, total_refunded, currency, current_stage, cancellation_policy_snapshot, provider_rescheduled_at",
    )
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    return { booking: null, outcome: null, error: "NOT_FOUND" as const };
  }

  const { data: providerRow } = await supabase
    .from("providers")
    .select("no_show_fee_enabled, no_show_fee_amount")
    .eq("id", booking.provider_id)
    .maybeSingle();

  const policy = await getCancellationPolicy(
    supabase,
    booking.provider_id,
    booking.location_type as "at_salon" | "at_home",
  );

  const payments = await fetchBookingPaymentsForRefundCap(supabase, bookingId);
  const inPersonRefunded = await fetchCompletedInPersonRefundsTotal(supabase, bookingId);

  const outcome = resolveCancellationOutcome({
    booking: booking as Parameters<typeof resolveCancellationOutcome>[0]["booking"],
    payments,
    currentPolicy: policy,
    providerNoShow: {
      enabled: Boolean(providerRow?.no_show_fee_enabled),
      amount: Number(providerRow?.no_show_fee_amount ?? 0),
    },
    actor,
    now: opts?.now,
    explicitCancellationFee: opts?.explicitCancellationFee,
    inPersonRefunded,
  });

  return { booking, outcome, preview: outcomeToPreviewPayload(outcome) };
}

export async function computePlatformCollectedForBooking(
  _callerClient: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const payments = await fetchBookingPaymentsForRefundCap(supabase, bookingId);
  const inPersonRefunded = await fetchCompletedInPersonRefundsTotal(supabase, bookingId);
  return splitCollectedByRail(payments, 0, inPersonRefunded).platformCollected;
}

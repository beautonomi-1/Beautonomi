import { addMoney } from "@beautonomi/utils";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { loadCancellationOutcomeForBooking } from "@/lib/bookings/load-cancellation-outcome";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hasPendingRescheduleReplacement,
  RESCHEDULE_IN_PROGRESS_MESSAGE,
} from "@/lib/bookings/reschedule-carry-over";

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "no_show"]);

/**
 * Cancelling the lead booking cancels the whole group (see the cancel route), so
 * preview the other group bookings with the same per-booking outcome
 * cancelGroupBooking settles them with.
 */
async function loadGroupCancelPreview(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  leadBookingId: string,
  customerId: string,
) {
  const admin = getSupabaseAdmin();
  const { data: groupRow } = await admin
    .from("group_bookings")
    .select("id, ref_number")
    .eq("primary_contact_booking_id", leadBookingId)
    .maybeSingle();
  const group = groupRow as { id: string; ref_number?: string | null } | null;
  if (!group) return null;

  const [{ data: childRows }, { data: guestRows }] = await Promise.all([
    admin.from("bookings").select("id, status, customer_id").eq("group_booking_id", group.id),
    admin
      .from("booking_participants")
      .select("id")
      .eq("group_booking_id", group.id)
      .eq("is_primary_contact", false),
  ]);
  const others = ((childRows ?? []) as Array<{ id: string; status?: string | null; customer_id?: string | null }>)
    .filter((b) => b.id !== leadBookingId && !TERMINAL_STATUSES.has(String(b.status ?? "")));

  let walletRefund = 0;
  let fee = 0;
  let inPersonRefundDue = 0;
  for (const other of others) {
    if (other.customer_id !== customerId) continue;
    const { outcome } = await loadCancellationOutcomeForBooking(supabase, other.id, "customer");
    if (!outcome) continue;
    walletRefund = addMoney(walletRefund, outcome.leadWalletRefund ?? outcome.walletRefund);
    fee = addMoney(fee, outcome.leadFeeRetained ?? outcome.feeRetained);
    inPersonRefundDue = addMoney(inPersonRefundDue, outcome.inPersonRefundDue);
  }
  return {
    group_booking_id: group.id,
    ref_number: group.ref_number ?? null,
    guest_count: (guestRows ?? []).length,
    other_bookings_cancelled: others.length,
    other_bookings_wallet_refund: roundCurrency2(walletRefund),
    other_bookings_cancellation_fee: roundCurrency2(fee),
    other_bookings_in_person_refund_due: roundCurrency2(inPersonRefundDue),
  };
}

/**
 * GET /api/me/bookings/[id]/cancel-preview
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: bookingId } = await params;
    const supabase = await getSupabaseServer(request);

    const { booking, outcome, error } = await loadCancellationOutcomeForBooking(
      supabase,
      bookingId,
      "customer",
    );

    if (error || !booking || !outcome) {
      return handleApiError(new Error("Booking not found"), "Booking not found", "NOT_FOUND", 404);
    }

    if (booking.customer_id !== user.id) {
      return handleApiError(new Error("Unauthorized"), "You can only access your own booking", "UNAUTHORIZED", 403);
    }

    const bookingTotal = Number(booking.total_amount ?? 0);
    const replacementPending = await hasPendingRescheduleReplacement(getSupabaseAdmin(), bookingId);
    // Split-pay guests get their own shares back on their cards, so the lead's
    // wallet refund and fee exclude them (same amounts the cancel route settles).
    const walletRefund = outcome.leadWalletRefund ?? outcome.walletRefund;
    const feeRetained = outcome.leadFeeRetained ?? outcome.feeRetained;
    const group = await loadGroupCancelPreview(supabase, bookingId, user.id);

    return successResponse({
      allowed: replacementPending ? false : outcome.allowed,
      reason: replacementPending ? RESCHEDULE_IN_PROGRESS_MESSAGE : outcome.blockReason,
      block_code: replacementPending ? "RESCHEDULE_IN_PROGRESS" : outcome.blockCode,
      is_late_cancellation: outcome.isLate,
      currency: booking.currency ?? LAST_RESORT_CURRENCY,
      booking_total: roundCurrency2(bookingTotal),
      expected_cancellation_fee: feeRetained,
      expected_wallet_refund: walletRefund,
      guest_shares_refunded: roundCurrency2(outcome.guestSharesHeld ?? 0),
      group,
      in_person_refund_due: outcome.inPersonRefundDue,
      penalty_waived_reason: outcome.penaltyWaivedReason,
      platform_collected: outcome.platformCollected,
      no_show_available_at: outcome.noShowAvailableAt,
      refund_capped_by_paid_amount: walletRefund < bookingTotal,
      policy: {
        hours_before_cutoff: outcome.policy.hours_before_cutoff,
        grace_window_minutes: outcome.policy.grace_window_minutes,
        late_cancellation_type: outcome.policy.late_cancellation_type,
        refund_percentage:
          outcome.policy.refund_percentage != null
            ? Number(outcome.policy.refund_percentage)
            : null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to preview cancellation");
  }
}

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { loadCancellationOutcomeForBooking } from "@/lib/bookings/load-cancellation-outcome";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

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

    return successResponse({
      allowed: outcome.allowed,
      reason: outcome.blockReason,
      block_code: outcome.blockCode,
      is_late_cancellation: outcome.isLate,
      currency: booking.currency ?? LAST_RESORT_CURRENCY,
      booking_total: roundCurrency2(bookingTotal),
      expected_cancellation_fee: outcome.feeRetained,
      expected_wallet_refund: outcome.walletRefund,
      in_person_refund_due: outcome.inPersonRefundDue,
      penalty_waived_reason: outcome.penaltyWaivedReason,
      platform_collected: outcome.platformCollected,
      no_show_available_at: outcome.noShowAvailableAt,
      refund_capped_by_paid_amount: outcome.walletRefund < bookingTotal,
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

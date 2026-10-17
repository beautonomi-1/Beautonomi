import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { loadCancellationOutcomeForBooking } from "@/lib/bookings/load-cancellation-outcome";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/portal/booking/cancel-preview?token=
 *
 * Preview cancellation fee and wallet refund for guest portal bookings.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return handleApiError(
        new Error("Token required"),
        "Access token is required",
        "TOKEN_REQUIRED",
        400,
      );
    }

    const supabase = await getSupabaseServer();
    const validation = await validatePortalToken(supabase, token);
    if (!validation.isValid || !validation.bookingId) {
      return handleApiError(
        new Error(validation.reason || "Invalid token"),
        validation.reason || "Invalid or expired access token",
        "INVALID_TOKEN",
        401,
      );
    }

    const { booking, outcome, error } = await loadCancellationOutcomeForBooking(
      supabase,
      validation.bookingId,
      "portal",
    );

    if (error || !booking || !outcome) {
      return handleApiError(new Error("Booking not found"), "Booking not found", "NOT_FOUND", 404);
    }

    if (!outcome.allowed) {
      return successResponse({
        allowed: false,
        reason: outcome.blockReason,
        block_code: outcome.blockCode,
      });
    }

    const bookingTotal = Number(booking.total_amount ?? 0);

    return successResponse({
      allowed: true,
      is_late_cancellation: outcome.isLate,
      currency: booking.currency ?? LAST_RESORT_CURRENCY,
      booking_total: roundCurrency2(bookingTotal),
      expected_cancellation_fee: outcome.feeRetained,
      expected_wallet_refund: outcome.walletRefund,
      in_person_refund_due: outcome.inPersonRefundDue,
      penalty_waived_reason: outcome.penaltyWaivedReason,
      platform_collected: outcome.platformCollected,
      refund_capped_by_paid_amount: outcome.walletRefund < bookingTotal,
    });
  } catch (error) {
    return handleApiError(error, "Failed to preview cancellation");
  }
}

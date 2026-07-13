import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { computeReconciledCancellationAmounts } from "@/lib/bookings/settle-booking-cancellation";
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

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        "id, provider_id, location_type, scheduled_at, created_at, status, total_amount, total_paid, total_refunded, currency, wallet_amount, gift_card_amount",
      )
      .eq("id", validation.bookingId)
      .single();

    if (error || !booking) {
      return handleApiError(new Error("Booking not found"), "Booking not found", "NOT_FOUND", 404);
    }

    const noSelfServeCancel = new Set(["cancelled", "completed", "no_show", "in_progress", "started"]);
    if (noSelfServeCancel.has(String(booking.status))) {
      return successResponse({
        allowed: false,
        reason:
          booking.status === "cancelled"
            ? "This booking has already been cancelled."
            : "This booking can no longer be cancelled online. Please contact your provider.",
      });
    }

    const policy = await getCancellationPolicy(
      supabase,
      booking.provider_id as string,
      (booking.location_type as "at_salon" | "at_home") || "at_salon",
    );

    const check = canCancelBooking(
      {
        id: booking.id as string,
        created_at: booking.created_at as string,
        scheduled_at: booking.scheduled_at as string,
        location_type: (booking.location_type as "at_salon" | "at_home") || "at_salon",
      },
      policy,
      new Date(),
      { forbidLateSelfService: false },
    );

    if (!check.allowed) {
      return successResponse({ allowed: false, reason: check.reason ?? "Cancellation not allowed" });
    }

    const bookingTotal = Number(booking.total_amount ?? 0);
    const isLate = check.isLateCancellation === true;
    const { cancellationFeeApplied, walletRefundAmount } = computeReconciledCancellationAmounts({
      booking: {
        id: booking.id as string,
        provider_id: booking.provider_id as string,
        total_amount: bookingTotal,
        total_paid: booking.total_paid as number | null,
        total_refunded: booking.total_refunded as number | null,
        wallet_amount: booking.wallet_amount as number | null,
        gift_card_amount: booking.gift_card_amount as number | null,
      },
      cancelledBy: "portal",
      currency: (booking.currency as string) || LAST_RESORT_CURRENCY,
      policy,
      isLateCancellation: isLate,
      refundBookingTotal: bookingTotal,
    });

    return successResponse({
      allowed: true,
      is_late_cancellation: isLate,
      currency: booking.currency ?? LAST_RESORT_CURRENCY,
      expected_cancellation_fee: cancellationFeeApplied,
      expected_wallet_refund: walletRefundAmount,
      refund_capped_by_paid_amount: walletRefundAmount < bookingTotal,
    });
  } catch (error) {
    return handleApiError(error, "Failed to preview cancellation");
  }
}

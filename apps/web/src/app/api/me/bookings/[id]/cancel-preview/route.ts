import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";
import { computeReconciledCancellationAmounts } from "@/lib/bookings/settle-booking-cancellation";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/me/bookings/[id]/cancel-preview
 *
 * Return a customer-facing preview of cancellation impact:
 * - whether cancellation is currently allowed
 * - expected cancellation fee
 * - expected wallet refund (capped by collected payment)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: bookingId } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        "id, provider_id, location_type, scheduled_at, created_at, status, customer_id, total_amount, total_paid, total_refunded, currency, wallet_amount, wallet_balance_used, gift_card_amount"
      )
      .eq("id", bookingId)
      .single();

    if (error || !booking) {
      return handleApiError(new Error("Booking not found"), "Booking not found", "NOT_FOUND", 404);
    }
    if (booking.customer_id !== user.id) {
      return handleApiError(new Error("Unauthorized"), "You can only access your own booking", "UNAUTHORIZED", 403);
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
      booking.location_type as "at_salon" | "at_home"
    );

    const check = canCancelBooking(
      {
        id: booking.id as string,
        created_at: booking.created_at as string,
        scheduled_at: booking.scheduled_at as string,
        location_type: booking.location_type as "at_salon" | "at_home",
      },
      policy,
      new Date(),
      { forbidLateSelfService: false }
    );

    if (!check.allowed) {
      return successResponse({ allowed: false, reason: check.reason ?? "Cancellation not allowed" });
    }

    const bookingTotal = Number(booking.total_amount ?? 0);
    const totalPaid = roundCurrency2(Math.max(0, Number(booking.total_paid ?? 0)));
    const walletCollected = roundCurrency2(
      Math.max(0, Number((booking as any).wallet_amount ?? (booking as any).wallet_balance_used ?? 0))
    );
    const giftCardCollected = roundCurrency2(
      Math.max(0, Number((booking as any).gift_card_amount ?? 0))
    );
    const effectiveCollectedAmount = roundCurrency2(
      Math.max(0, Math.max(totalPaid, walletCollected + giftCardCollected) - Number((booking as any).total_refunded ?? 0))
    );
    const isLate = check.isLateCancellation === true;
    const { cancellationFeeApplied, walletRefundAmount } = computeReconciledCancellationAmounts({
      booking: {
        id: booking.id as string,
        provider_id: booking.provider_id as string,
        total_amount: bookingTotal,
        total_paid: booking.total_paid as number | null,
        total_refunded: (booking as { total_refunded?: number | null }).total_refunded,
        wallet_amount: (booking as { wallet_amount?: number | null }).wallet_amount,
        gift_card_amount: (booking as { gift_card_amount?: number | null }).gift_card_amount,
      },
      cancelledBy: "customer",
      currency: (booking.currency as string) || LAST_RESORT_CURRENCY,
      policy,
      isLateCancellation: isLate,
      refundBookingTotal: bookingTotal,
    });

    return successResponse({
      allowed: true,
      is_late_cancellation: isLate,
      currency: booking.currency ?? LAST_RESORT_CURRENCY,
      booking_total: roundCurrency2(bookingTotal),
      total_paid: totalPaid,
      expected_cancellation_fee: cancellationFeeApplied,
      expected_wallet_refund: walletRefundAmount,
      refund_capped_by_paid_amount: walletRefundAmount < bookingTotal,
      policy: {
        hours_before_cutoff: policy.hours_before_cutoff,
        grace_window_minutes: policy.grace_window_minutes,
        late_cancellation_type: policy.late_cancellation_type,
        refund_percentage:
          policy.refund_percentage != null ? Number(policy.refund_percentage) : null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to preview cancellation");
  }
}


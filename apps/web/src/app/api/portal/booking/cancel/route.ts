import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { loadCancellationOutcomeForBooking } from "@/lib/bookings/load-cancellation-outcome";
import {
  assertCancellationAllowed,
  describeRefundFromOutcome,
  settleParamsFromCancellationOutcome,
} from "@/lib/bookings/cancellation-outcome-bridge";
import {
  settleBookingCancellation,
  type BookingFinancialSnapshot,
} from "@/lib/bookings/settle-booking-cancellation";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * POST /api/portal/booking/cancel
 *
 * Cancel booking via portal token (passwordless access)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return handleApiError(
        new Error("Token required"),
        "Access token is required",
        "TOKEN_REQUIRED",
        400
      );
    }

    const supabase = await getSupabaseServer();
    const adminSupabase = getSupabaseAdmin();

    const validation = await validatePortalToken(supabase, token);
    if (!validation.isValid || !validation.bookingId) {
      return handleApiError(
        new Error(validation.reason || "Invalid token"),
        validation.reason || "Invalid or expired access token",
        "INVALID_TOKEN",
        401
      );
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        "id, provider_id, tenant_id, customer_id, location_type, scheduled_at, created_at, status, booking_number, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned"
      )
      .eq("id", validation.bookingId)
      .single();

    if (bookingError || !booking) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404
      );
    }

    const { outcome, error: outcomeError } = await loadCancellationOutcomeForBooking(
      supabase,
      validation.bookingId,
      "portal",
    );
    if (outcomeError || !outcome) {
      return handleApiError(new Error("Booking not found"), "Booking not found", "NOT_FOUND", 404);
    }
    const gate = assertCancellationAllowed(outcome);
    if (!gate.ok) {
      return handleApiError(
        new Error(gate.message),
        gate.message,
        gate.code,
        gate.httpStatus,
      );
    }
    const policy = outcome.policy;

    type FinancialBooking = {
      subtotal?: number | null;
      discount_amount?: number | null;
      tax_amount?: number | null;
      service_fee_amount?: number | null;
      travel_fee?: number | null;
      tip_amount?: number | null;
      total_amount?: number | null;
      currency?: string | null;
    };
    const bFin = booking as FinancialBooking;
    const { data: provForCurrency } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", booking.provider_id)
      .maybeSingle();
    const tenantRegionForCancel = provForCurrency?.tenant_id
      ? await getTenantRegionConfig(provForCurrency.tenant_id)
      : null;
    const cancelCurrency =
      (bFin.currency as string) || tenantRegionForCancel?.defaultCurrency || LAST_RESORT_CURRENCY;
    const bookingTotal = Number(bFin.total_amount ?? 0);
    const isLate = outcome.isLate;
    const cancellationFeeApplied = outcome.feeRetained;
    const walletRefundAmount = outcome.walletRefund;

    const financialSnapshot: BookingFinancialSnapshot = {
      id: validation.bookingId,
      provider_id: booking.provider_id,
      customer_id: booking.customer_id,
      booking_number: (booking as { booking_number?: string | null }).booking_number,
      tenant_id:
        (booking as { tenant_id?: string | null }).tenant_id ??
        provForCurrency?.tenant_id ??
        null,
      subtotal: bFin.subtotal,
      discount_amount: bFin.discount_amount,
      tax_amount: bFin.tax_amount,
      service_fee_amount: bFin.service_fee_amount,
      travel_fee: bFin.travel_fee,
      tip_amount: bFin.tip_amount,
      total_amount: bookingTotal,
      total_paid: (booking as { total_paid?: number | null }).total_paid,
      total_refunded: (booking as { total_refunded?: number | null }).total_refunded,
      wallet_amount: (booking as { wallet_amount?: number | null }).wallet_amount,
      gift_card_amount: (booking as { gift_card_amount?: number | null }).gift_card_amount,
      loyalty_points_used: (booking as { loyalty_points_used?: number | null }).loyalty_points_used,
      loyalty_points_redeemed: (booking as { loyalty_points_redeemed?: number | null })
        .loyalty_points_redeemed,
      loyalty_points_earned: (booking as { loyalty_points_earned?: number | null }).loyalty_points_earned,
    };

    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "Customer cancellation via portal",
        cancellation_fee: cancellationFeeApplied,
        updated_at: new Date().toISOString(),
      })
      .eq("id", validation.bookingId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    await adminSupabase.from("booking_events").insert({
      booking_id: validation.bookingId,
      event_type: "cancelled",
      event_data: {
        cancelled_via: "portal",
        policy_applied: policy.id,
        is_late_cancellation: isLate,
        cancellation_fee_applied: cancellationFeeApplied,
        wallet_refund_amount: walletRefundAmount,
        penalty_waived_reason: outcome.penaltyWaivedReason ?? null,
      },
    });

    try {
      await settleBookingCancellation(
        settleParamsFromCancellationOutcome(outcome, "portal", {
          booking: financialSnapshot,
          currency: cancelCurrency,
          refundBookingTotal: bookingTotal,
        }),
      );
    } catch (settleErr) {
      console.error("Error processing portal cancellation settlement:", settleErr);
    }

    const { sendCancellationNotification } = await import("@/lib/bookings/notifications");
    const refundInfo = describeRefundFromOutcome(outcome, bookingTotal, cancelCurrency);

    await sendCancellationNotification(validation.bookingId, {
      cancelledBy: "customer",
      refundInfo,
    });

    try {
      const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
      await matchWaitlistOnCancellation(supabase, validation.bookingId);
    } catch (waitlistErr) {
      console.error("[portal cancel] waitlist matching failed:", waitlistErr);
    }

    return successResponse({
      booking: updatedBooking,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to cancel booking");
  }
}

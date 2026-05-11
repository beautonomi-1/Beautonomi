import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import {
  computeCancellationRefundAmount,
  describeCancellationRefund,
  roundCurrency2,
} from "@/lib/bookings/refund-processing";
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
        "id, provider_id, location_type, scheduled_at, created_at, status, booking_number, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency"
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

    if (booking.status === "cancelled") {
      return handleApiError(
        new Error("Booking already cancelled"),
        "This booking has already been cancelled",
        "ALREADY_CANCELLED",
        400
      );
    }

    const noSelfServeCancel = new Set([
      "completed",
      "no_show",
      "in_progress",
      "started",
    ]);
    if (noSelfServeCancel.has(booking.status as string)) {
      return handleApiError(
        new Error("Booking cannot be cancelled online"),
        "This booking can no longer be cancelled online. Please contact your provider.",
        "CANCELLATION_BLOCKED",
        403
      );
    }

    const policy = await getCancellationPolicy(
      supabase,
      booking.provider_id,
      booking.location_type as "at_salon" | "at_home"
    );

    const checkResult = canCancelBooking(
      {
        id: booking.id,
        created_at: booking.created_at,
        scheduled_at: booking.scheduled_at,
        location_type: booking.location_type as "at_salon" | "at_home",
      },
      policy,
      new Date(),
      { forbidLateSelfService: false }
    );

    if (!checkResult.allowed) {
      return handleApiError(
        new Error(checkResult.reason || "Cancellation not allowed"),
        checkResult.reason || "Cancellation not allowed",
        "CANCELLATION_BLOCKED",
        403
      );
    }

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
    const isLate = checkResult.isLateCancellation === true;
    const policyRefundAmount = computeCancellationRefundAmount(bookingTotal, policy, isLate);
    const totalPaid = roundCurrency2(
      Math.max(0, Number((booking as { total_paid?: number | null }).total_paid ?? 0))
    );
    const walletCollected = roundCurrency2(
      Math.max(0, Number((booking as { wallet_amount?: number | null }).wallet_amount ?? 0))
    );
    const giftCardCollected = roundCurrency2(
      Math.max(0, Number((booking as { gift_card_amount?: number | null }).gift_card_amount ?? 0))
    );
    const effectiveCollectedAmount = roundCurrency2(
      Math.max(
        0,
        Math.max(totalPaid, walletCollected + giftCardCollected) -
          Number((booking as { total_refunded?: number | null }).total_refunded ?? 0),
      )
    );
    const walletRefundAmount = roundCurrency2(Math.min(policyRefundAmount, effectiveCollectedAmount));
    const cancellationFeeApplied = roundCurrency2(Math.max(0, bookingTotal - policyRefundAmount));
    const newTotalAmount = roundCurrency2(
      Number(bFin.subtotal ?? 0) -
        Number(bFin.discount_amount ?? 0) +
        Number(bFin.tax_amount ?? 0) +
        Number(bFin.service_fee_amount ?? 0) +
        Number(bFin.travel_fee ?? 0) +
        Number(bFin.tip_amount ?? 0) -
        cancellationFeeApplied
    );

    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "Customer cancellation via portal",
        cancellation_fee: cancellationFeeApplied,
        total_amount: newTotalAmount,
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
      },
    });

    if (checkResult.allowed) {
      try {
        const { processBookingRefund } = await import("@/lib/bookings/refund-processing");
        await processBookingRefund(
          validation.bookingId,
          bookingTotal,
          cancelCurrency,
          policy,
          { isLateCancellation: isLate, maxWalletCredit: effectiveCollectedAmount }
        );
      } catch (refundErr) {
        console.error("Error processing refund during portal cancellation:", refundErr);
      }
    }

    // Record cancellation fee in the finance ledger (provider-retained income)
    if (cancellationFeeApplied > 0) {
      try {
        const { resolveTenantIdForFinanceLedger } = await import("@/lib/finance/resolve-tenant-id-for-ledger");
        const cancelFeeTenantId = await resolveTenantIdForFinanceLedger(adminSupabase, {
          tenant_id: provForCurrency?.tenant_id ?? null,
          provider_id: booking.provider_id,
        });
        const bookingRef = (booking as { booking_number?: string }).booking_number || validation.bookingId.slice(0, 8);
        // Idempotent: only insert if no existing cancellation_fee row for this booking
        const { data: existingRow } = await adminSupabase
          .from("finance_transactions")
          .select("id")
          .eq("booking_id", validation.bookingId)
          .eq("transaction_type", "cancellation_fee")
          .maybeSingle();
        if (!existingRow) {
          await adminSupabase.from("finance_transactions").insert({
            tenant_id: cancelFeeTenantId,
            booking_id: validation.bookingId,
            provider_id: booking.provider_id,
            transaction_type: "cancellation_fee",
            amount: cancellationFeeApplied,
            fees: 0,
            commission: 0,
            net: cancellationFeeApplied,
            description: `Cancellation fee for booking ${bookingRef} — provider-retained (portal cancellation)`,
            created_at: new Date().toISOString(),
          });
        }
      } catch (feeErr) {
        console.error("[portal cancel] cancellation_fee ledger insert failed:", feeErr);
      }
    }

    const { sendCancellationNotification } = await import("@/lib/bookings/notifications");
    const refundInfo = describeCancellationRefund(
      policy,
      isLate,
      walletRefundAmount,
      bookingTotal,
      cancelCurrency
    );

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

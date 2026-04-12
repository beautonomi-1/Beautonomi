import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import {
  computeCancellationRefundAmount,
  describeCancellationRefund,
  roundCurrency2,
} from "@/lib/bookings/refund-processing";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_BOOKING_CANCELLED } from "@/lib/analytics/amplitude/types";

/**
 * POST /api/me/bookings/[id]/cancel
 * 
 * Cancel a booking (subject to cancellation policy)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: bookingId } = await params;

    const supabase = await getSupabaseServer(request);
    const adminSupabase = getSupabaseAdmin();

    // Load booking (include version + pricing for cancellation fee / total validation trigger)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, provider_id, location_type, scheduled_at, created_at, status, customer_id, version, booking_number, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, currency, cancellation_fee, customer_package_entitlement_id'
      )
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404
      );
    }

    // Verify user owns the booking
    if (booking.customer_id !== user.id) {
      return handleApiError(
        new Error("Unauthorized"),
        "You can only cancel your own bookings",
        "UNAUTHORIZED",
        403
      );
    }

    // Terminal / in-service states: no self-serve cancel (matches customer app)
    const noSelfServeCancel = new Set([
      "cancelled",
      "completed",
      "no_show",
      "in_progress",
      "started",
    ]);
    if (noSelfServeCancel.has(booking.status as string)) {
      return handleApiError(
        new Error("Booking cannot be cancelled online"),
        booking.status === "cancelled"
          ? "This booking has already been cancelled"
          : "This booking can no longer be cancelled online. Please contact your provider.",
        booking.status === "cancelled" ? "ALREADY_CANCELLED" : "CANCELLATION_BLOCKED",
        booking.status === "cancelled" ? 400 : 403
      );
    }

    // Load cancellation policy
    const policy = await getCancellationPolicy(
      supabase,
      booking.provider_id,
      booking.location_type as 'at_salon' | 'at_home'
    );

    if (!policy) {
      return handleApiError(
        new Error("Cancellation policy not found"),
        "Cancellation policy not configured",
        "POLICY_NOT_FOUND",
        500
      );
    }

    // Late window: allow cancel here (wallet refund follows policy); reschedule routes keep forbidLateSelfService default
    const checkResult = canCancelBooking(
      {
        id: booking.id,
        created_at: booking.created_at,
        scheduled_at: booking.scheduled_at,
        location_type: booking.location_type as 'at_salon' | 'at_home',
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

    // Get request body for optional fields
    let body: { reason?: string; version?: number } = {};
    try {
      body = await request.json().catch(() => ({}));
    } catch {
      // Body is optional
    }

    type BookingRow = { version?: number };
    if (body.version !== undefined && (booking as BookingRow).version !== body.version) {
      return handleApiError(
        new Error("Booking was modified by another user"),
        "This booking was modified by another user. Please refresh and try again.",
        "CONFLICT",
        409
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
    const totalPaid = roundCurrency2(Math.max(0, Number((booking as { total_paid?: number | null }).total_paid ?? 0)));
    const isLate = checkResult.isLateCancellation === true;
    const policyRefundAmount = computeCancellationRefundAmount(bookingTotal, policy, isLate);
    /** Wallet credit must not exceed money actually collected (e.g. pending / unpaid bookings). */
    const walletRefundAmount = roundCurrency2(Math.min(policyRefundAmount, totalPaid));
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

    const currentVersion = (booking as BookingRow).version ?? 0;
    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        cancellation_reason: body.reason || 'Customer cancellation',
        cancellation_fee: cancellationFeeApplied,
        total_amount: newTotalAmount,
        version: currentVersion + 1, // Increment version
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    const entitlementId = (booking as { customer_package_entitlement_id?: string | null })
      .customer_package_entitlement_id;
    if (entitlementId) {
      try {
        await adminSupabase.rpc("restore_customer_package_entitlement", {
          p_entitlement_id: entitlementId,
          p_customer_id: user.id,
        });
      } catch (restoreErr) {
        console.error("[cancel booking] restore_customer_package_entitlement", restoreErr);
      }
    }

    // Create booking event
    await adminSupabase.from('booking_events').insert({
      booking_id: bookingId,
      event_type: 'cancelled',
      event_data: {
        cancelled_by: user.id,
        policy_applied: policy.id,
        grace_window_used: checkResult.allowed && new Date(booking.created_at).getTime() + policy.grace_window_minutes * 60000 >= new Date().getTime(),
        is_late_cancellation: isLate,
        cancellation_fee_applied: cancellationFeeApplied,
        wallet_refund_amount: walletRefundAmount,
      },
      created_by: user.id,
    });

    // Create audit log entry
    try {
      const { data: userData } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", user.id)
        .single();

      await adminSupabase
        .from("booking_audit_log")
        .insert({
          booking_id: bookingId,
          event_type: "cancelled",
          event_data: {
            previous_status: booking.status,
            new_status: "cancelled",
            field: "status",
            old_value: booking.status,
            new_value: "cancelled",
            cancelled_by: "customer",
            cancellation_reason: body.reason || 'Customer cancellation',
            policy_applied: policy.id,
            is_late_cancellation: isLate,
            cancellation_fee_applied: cancellationFeeApplied,
          },
          created_by: user.id,
          created_by_name: userData?.full_name || userData?.email || "Customer",
        });
    } catch (auditError) {
      // Log but don't fail the request if audit logging fails
      console.error("Failed to create audit log entry:", auditError);
    }

    // Check if this is a group booking
    const { data: groupBookingData } = await supabase
      .from('group_bookings')
      .select('id, status')
      .eq('primary_contact_booking_id', bookingId)
      .single();

    const isGroupBooking = !!groupBookingData;

    // Send cancellation notification
    const { sendCancellationNotification } = await import('@/lib/bookings/notifications');
    const refundInfo = describeCancellationRefund(
      policy,
      isLate,
      walletRefundAmount,
      bookingTotal,
      cancelCurrency
    );
    
    await sendCancellationNotification(bookingId, {
      cancelledBy: 'customer',
      refundInfo,
    });

    // If group booking, cancel entire group and notify all participants
    if (isGroupBooking && groupBookingData) {
      try {
        const { cancelGroupBooking, getGroupBookingParticipantsForCancellation } = await import('@/lib/bookings/group-booking-cancellation');
        await cancelGroupBooking(supabase, groupBookingData.id, user.id, body.reason || 'Customer cancellation');

        // Notify all participants
        const participants = await getGroupBookingParticipantsForCancellation(supabase, groupBookingData.id);
        for (const participant of participants) {
          if (participant.participant_email) {
            // Send cancellation email to participant
            await fetch('/api/notifications/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: participant.participant_email,
                subject: `Group Booking Cancelled - ${booking.booking_number || bookingId}`,
                body: `Hi ${participant.participant_name}, the group booking ${booking.booking_number || bookingId} has been cancelled. ${refundInfo}`,
                type: 'group_booking_cancellation',
              }),
            }).catch(() => {});
          }
        }
      } catch (groupError) {
        console.error('Error handling group booking cancellation:', groupError);
        // Don't fail the cancellation if group handling fails
      }
    }

    // Invalidate availability cache for the cancelled booking
    try {
      const { invalidateAvailabilityCache } = await import('@/lib/availability/cache-invalidation');
      const { data: bookingServices } = await supabase
        .from('booking_services')
        .select('staff_id, scheduled_start_at')
        .eq('booking_id', bookingId)
        .limit(1);
      
      if (bookingServices && bookingServices.length > 0) {
        const service = bookingServices[0];
        const cancelledDate = new Date(service.scheduled_start_at).toISOString().split('T')[0];
        if (service.staff_id) {
          await invalidateAvailabilityCache(supabase, service.staff_id, cancelledDate);
        }
      }
    } catch (cacheError) {
      console.error('Error invalidating availability cache:', cacheError);
    }

    // Match waitlist entries for the cancelled slot
    try {
      const { matchWaitlistOnCancellation } = await import('@/lib/waitlist/matching');
      await matchWaitlistOnCancellation(supabase, bookingId);
    } catch (waitlistError) {
      // Don't fail cancellation if waitlist matching fails
      console.error('Error matching waitlist on cancellation:', waitlistError);
    }

    // Wallet credit (uses pre-adjustment total so percentages match what the customer paid)
    if (checkResult.allowed) {
      try {
        const { processBookingRefund } = await import("@/lib/bookings/refund-processing");
        const refundResult = await processBookingRefund(
          bookingId,
          bookingTotal,
          cancelCurrency,
          policy,
          { isLateCancellation: isLate, maxWalletCredit: totalPaid }
        );

        if (refundResult.success && refundResult.amount && refundResult.amount > 0) {
          console.log(`Refund processed: ${refundResult.amount} ${bFin.currency}`);
        }
      } catch (refundError) {
        console.error("Error processing refund during cancellation:", refundError);
      }
    }

    // Record cancellation fee as a dedicated finance_transaction (provider-retained income).
    // Convention: amount = absolute fee (positive), net = positive (provider keeps it).
    if (cancellationFeeApplied > 0) {
      try {
        const { resolveTenantIdForFinanceLedger } = await import("@/lib/finance/resolve-tenant-id-for-ledger");
        const cancelFeeTenantId = await resolveTenantIdForFinanceLedger(adminSupabase, {
          tenant_id: provForCurrency?.tenant_id ?? null,
          provider_id: booking.provider_id,
        });
        const bookingRef = (booking as { booking_number?: string }).booking_number || bookingId.slice(0, 8);
        await adminSupabase.from("finance_transactions").insert({
          tenant_id: cancelFeeTenantId,
          booking_id: bookingId,
          provider_id: booking.provider_id,
          transaction_type: "cancellation_fee",
          amount: cancellationFeeApplied,
          fees: 0,
          commission: 0,
          net: cancellationFeeApplied,
          description: `Cancellation fee for booking ${bookingRef} — provider-retained (${isLate ? "late cancellation" : "early cancellation"})`,
          created_at: new Date().toISOString(),
        });
      } catch (feeErr) {
        console.error("[cancel] failed to record cancellation_fee finance_transaction:", feeErr);
      }
    }

    // Track Amplitude event
    try {
      await trackServer(EVENT_BOOKING_CANCELLED, {
        portal: "client",
        provider_id: booking.provider_id,
        booking_id: bookingId,
        cancellation_reason: body.reason || "user_requested",
      }, user.id);
    } catch (amplitudeError) {
      console.error("[Amplitude] Failed to track booking cancellation:", amplitudeError);
    }

    return successResponse({
      booking: updatedBooking,
      policy_applied: policy,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to cancel booking");
  }
}

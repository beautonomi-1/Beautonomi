import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { describeCancellationRefund } from "@/lib/bookings/refund-processing";
import {
  computeCancellationFeeForSettlement,
  computeEffectiveCollectedAmount,
  settleBookingCancellation,
  type BookingFinancialSnapshot,
} from "@/lib/bookings/settle-booking-cancellation";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";
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

    // Load booking (include version + pricing for cancellation fee / total validation trigger).
    // group_booking_id is included so we can recalculate the group total when a
    // non-primary participant cancels their own booking.
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, provider_id, tenant_id, location_type, scheduled_at, created_at, status, customer_id, version, booking_number, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, cancellation_fee, customer_package_entitlement_id, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned, group_booking_id'
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
    const isLate = checkResult.isLateCancellation === true;

    const financialSnapshot: BookingFinancialSnapshot = {
      id: bookingId,
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

    const { cancellationFeeApplied, policyRefundAmount } = computeCancellationFeeForSettlement({
      booking: financialSnapshot,
      cancelledBy: "customer",
      currency: cancelCurrency,
      policy,
      isLateCancellation: isLate,
      refundBookingTotal: bookingTotal,
    });
    const walletRefundAmount = roundCurrency2(
      Math.min(policyRefundAmount, computeEffectiveCollectedAmount(financialSnapshot)),
    );

    const currentVersion = (booking as BookingRow).version ?? 0;
    const { data: updatedRows, error: updateError } = await adminSupabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        cancellation_reason: body.reason || 'Customer cancellation',
        cancellation_fee: cancellationFeeApplied,
        version: currentVersion + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('version', currentVersion)
      .select();

    if (updateError) {
      throw updateError;
    }

    if (!updatedRows || updatedRows.length === 0) {
      return handleApiError(
        new Error("Booking was modified concurrently"),
        "This booking was updated by someone else. Please refresh and try again.",
        "CONFLICT",
        409
      );
    }

    const updatedBooking = updatedRows[0];

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

    // Check if this is the primary-contact booking for a group.
    // Use maybeSingle() so a missing row returns null instead of an error
    // (single() throws PGRST116 "0 rows" when no group exists for this booking).
    const { data: groupBookingData } = await supabase
      .from('group_bookings')
      .select('id, status')
      .eq('primary_contact_booking_id', bookingId)
      .maybeSingle();

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

    // §Group-booking-qa 2026-05: when a non-primary participant cancels their
    // individual booking the group continues but its total_price becomes stale
    // (it still included the cancelled participant's service price). Recalculate
    // best-effort using the admin client (RLS would block participant reads).
    const nonPrimaryGroupId =
      !isGroupBooking && (booking as { group_booking_id?: string | null }).group_booking_id
        ? (booking as { group_booking_id: string }).group_booking_id
        : null;
    if (nonPrimaryGroupId) {
      try {
        const { tryRecalculateGroupBookingTotal } = await import(
          '@/lib/bookings/recalculate-group-total'
        );
        await tryRecalculateGroupBookingTotal(adminSupabase, nonPrimaryGroupId);
      } catch (recalcErr) {
        console.warn('[cancel] non-primary group total recalculation failed:', recalcErr);
      }
    }

    // If group booking, cancel entire group and notify all participants
    if (isGroupBooking && groupBookingData) {
      try {
        const { cancelGroupBooking, getGroupBookingParticipantsForCancellation } = await import('@/lib/bookings/group-booking-cancellation');
        await cancelGroupBooking(supabase, groupBookingData.id, user.id, body.reason || 'Customer cancellation', {
          settleFinance: true,
          financeActor: "customer",
        });

        // Notify all participants directly via OneSignal. Previously this used a
        // server-side fetch('/api/notifications/send-email') which is unsafe in a
        // Route Handler (relative URL has no origin) and required an admin role.
        const { sendToUser } = await import('@/lib/notifications/onesignal');
        const participants = await getGroupBookingParticipantsForCancellation(supabase, groupBookingData.id);
        for (const participant of participants) {
          if (!participant.participant_email) continue;
          const { data: participantUser } = await adminSupabase
            .from('users')
            .select('id')
            .eq('email', participant.participant_email)
            .maybeSingle();
          if (!participantUser?.id) {
            console.warn(`[cancel] group participant ${participant.participant_email} has no user record — skipping notification`);
            continue;
          }
          try {
            await sendToUser(
              participantUser.id,
              {
                title: `Group Booking Cancelled - ${booking.booking_number || bookingId}`,
                message: `Hi ${participant.participant_name}, the group booking ${booking.booking_number || bookingId} has been cancelled. ${refundInfo}`,
                type: 'group_booking_cancellation',
              },
              ['email'],
            );
          } catch (notifyErr) {
            console.error('[cancel] group participant notify failed:', notifyErr);
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

    // Finance settlement: wallet refund, ledger clawbacks, cancellation fee, loyalty, gift card.
    // Skip for group primaries: cancelGroupBooking(settleFinance: true) above already settled
    // every participant booking (including this one); settling again would re-run
    // processBookingRefund against a stale snapshot and double-credit the wallet.
    if (checkResult.allowed && !isGroupBooking) {
      try {
        const settlement = await settleBookingCancellation({
          booking: financialSnapshot,
          cancelledBy: "customer",
          currency: cancelCurrency,
          policy,
          isLateCancellation: isLate,
          refundBookingTotal: bookingTotal,
        });
        if (settlement.refundResult.success && settlement.refundResult.amount) {
          console.log(
            `Refund processed: ${settlement.refundResult.amount} ${bFin.currency}`,
          );
        }
      } catch (settleErr) {
        console.error("Error processing cancellation settlement:", settleErr);
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

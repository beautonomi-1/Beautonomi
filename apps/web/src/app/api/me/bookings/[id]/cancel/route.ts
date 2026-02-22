import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
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

    const supabase = await getSupabaseServer();
    const adminSupabase = getSupabaseAdmin();

    // Load booking (include version for conflict detection)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, provider_id, location_type, scheduled_at, created_at, status, customer_id, version, booking_number')
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

    // Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      return handleApiError(
        new Error("Booking already cancelled"),
        "This booking has already been cancelled",
        "ALREADY_CANCELLED",
        400
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

    // Check if cancellation is allowed
    const checkResult = canCancelBooking(
      {
        id: booking.id,
        created_at: booking.created_at,
        scheduled_at: booking.scheduled_at,
        location_type: booking.location_type as 'at_salon' | 'at_home',
      },
      policy
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

    // Check for conflicts if version is provided in request body
    if (body.version !== undefined && (booking as any).version !== body.version) {
      return handleApiError(
        new Error("Booking was modified by another user"),
        "This booking was modified by another user. Please refresh and try again.",
        "CONFLICT",
        409
      );
    }

    // Cancel the booking (increment version for conflict detection)
    const currentVersion = (booking as any).version || 0;
    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        cancellation_reason: body.reason || 'Customer cancellation',
        version: currentVersion + 1, // Increment version
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Create booking event
    await adminSupabase.from('booking_events').insert({
      booking_id: bookingId,
      event_type: 'cancelled',
      event_data: {
        cancelled_by: user.id,
        policy_applied: policy.id,
        grace_window_used: checkResult.allowed && new Date(booking.created_at).getTime() + policy.grace_window_minutes * 60000 >= new Date().getTime(),
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
    const refundInfo = policy.late_cancellation_type === 'full_refund' 
      ? 'Full refund will be processed'
      : policy.late_cancellation_type === 'partial_refund'
      ? 'Partial refund will be processed'
      : 'No refund applicable per cancellation policy';
    
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

    // Process refunds if applicable (based on late_cancellation_type)
    if (checkResult.allowed && policy.late_cancellation_type !== 'no_refund') {
      try {
        const { processBookingRefund } = await import('@/lib/bookings/refund-processing');
        const { data: bookingForRefund } = await supabase
          .from('bookings')
          .select('total_amount, currency')
          .eq('id', bookingId)
          .single();

        if (bookingForRefund) {
          const refundResult = await processBookingRefund(
            bookingId,
            bookingForRefund.total_amount,
            bookingForRefund.currency || 'ZAR',
            policy
          );

          if (refundResult.success && refundResult.amount && refundResult.amount > 0) {
            // Refund processed successfully
            console.log(`Refund processed: ${refundResult.amount} ${bookingForRefund.currency}`);
          }
        }
      } catch (refundError) {
        // Log but don't fail cancellation if refund fails
        console.error('Error processing refund during cancellation:', refundError);
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

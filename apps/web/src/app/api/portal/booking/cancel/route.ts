import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";

/**
 * POST /api/portal/booking/cancel
 * 
 * Cancel booking via portal token (passwordless access)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

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

    // Validate token
    const validation = await validatePortalToken(supabase, token);
    if (!validation.isValid || !validation.bookingId) {
      return handleApiError(
        new Error(validation.reason || "Invalid token"),
        validation.reason || "Invalid or expired access token",
        "INVALID_TOKEN",
        401
      );
    }

    // Load booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, provider_id, location_type, scheduled_at, created_at, status')
      .eq('id', validation.bookingId)
      .single();

    if (bookingError || !booking) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404
      );
    }

    // Check if already cancelled
    if (booking.status === 'cancelled') {
      return handleApiError(
        new Error("Booking already cancelled"),
        "This booking has already been cancelled",
        "ALREADY_CANCELLED",
        400
      );
    }

    // Check cancellation policy
    const policy = await getCancellationPolicy(
      supabase,
      booking.provider_id,
      booking.location_type as 'at_salon' | 'at_home'
    );

    const checkResult = policy
      ? canCancelBooking(
          {
            id: booking.id,
            created_at: booking.created_at,
            scheduled_at: booking.scheduled_at,
            location_type: booking.location_type as 'at_salon' | 'at_home',
          },
          policy
        )
      : { allowed: true as const };

    if (!checkResult.allowed) {
      return handleApiError(
        new Error(checkResult.reason || "Cancellation not allowed"),
        checkResult.reason || "Cancellation not allowed",
        "CANCELLATION_BLOCKED",
        403
      );
    }

    // Cancel booking
    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'Customer cancellation via portal',
      })
      .eq('id', validation.bookingId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Create booking event
    await adminSupabase.from('booking_events').insert({
      booking_id: validation.bookingId,
      event_type: 'cancelled',
      event_data: {
        cancelled_via: 'portal',
        policy_applied: policy?.id,
      },
    });

    // Process refunds if applicable (same logic as /api/me/bookings/[id]/cancel)
    if (policy && checkResult.allowed && policy.late_cancellation_type !== 'no_refund') {
      try {
        const { processBookingRefund } = await import('@/lib/bookings/refund-processing');
        const { data: bookingForRefund } = await supabase
          .from('bookings')
          .select('total_amount, currency')
          .eq('id', validation.bookingId)
          .single();
        if (bookingForRefund) {
          await processBookingRefund(
            validation.bookingId,
            bookingForRefund.total_amount,
            bookingForRefund.currency || 'ZAR',
            policy
          );
        }
      } catch (refundErr) {
        console.error('Error processing refund during portal cancellation:', refundErr);
      }
    }

    // Send cancellation notification
    const { sendCancellationNotification } = await import('@/lib/bookings/notifications');
    const refundInfo = policy?.late_cancellation_type === 'full_refund'
      ? 'Full refund will be processed'
      : policy?.late_cancellation_type === 'partial_refund'
        ? 'Partial refund will be processed'
        : 'No refund applicable per cancellation policy';

    await sendCancellationNotification(validation.bookingId, {
      cancelledBy: 'customer',
      refundInfo,
    });

    return successResponse({
      booking: updatedBooking,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to cancel booking");
  }
}

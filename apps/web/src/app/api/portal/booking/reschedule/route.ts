import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { z } from "zod";

const rescheduleSchema = z.object({
  new_datetime: z.string().datetime("Invalid datetime format"),
});

/**
 * POST /api/portal/booking/reschedule
 * 
 * Reschedule booking via portal token (passwordless access)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const body = await request.json();

    if (!token) {
      return handleApiError(
        new Error("Token required"),
        "Access token is required",
        "TOKEN_REQUIRED",
        400
      );
    }

    // Validate input
    const validated = rescheduleSchema.parse(body);
    const newDatetime = new Date(validated.new_datetime);

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

    // Load booking with services
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        provider_id,
        location_type,
        scheduled_at,
        created_at,
        status,
        booking_services (
          id,
          offering_id,
          staff_id,
          scheduled_start_at,
          scheduled_end_at,
          duration_minutes,
          offerings!inner (
            buffer_minutes,
            duration_minutes
          )
        )
      `)
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

    // Check if booking can be rescheduled (same policy as cancellation)
    const policy = await getCancellationPolicy(
      supabase,
      booking.provider_id,
      booking.location_type as 'at_salon' | 'at_home'
    );

    if (policy) {
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
          new Error(checkResult.reason || "Rescheduling not allowed"),
          checkResult.reason || "Rescheduling not allowed",
          "RESCHEDULE_BLOCKED",
          403
        );
      }
    }

    // Check if new time slot is available
    const bookingServices = booking.booking_services as any[];
    if (bookingServices.length === 0) {
      return handleApiError(
        new Error("Booking has no services"),
        "Booking has no services",
        "VALIDATION_ERROR",
        400
      );
    }

    const firstService = bookingServices[0];
    const staffId = firstService.staff_id;

    if (!staffId) {
      return handleApiError(
        new Error("Booking has no assigned staff"),
        "Booking has no assigned staff",
        "VALIDATION_ERROR",
        400
      );
    }

    // Calculate total duration
    let totalDuration = 0;
    bookingServices.forEach((bs: any) => {
      totalDuration += bs.duration_minutes || bs.offerings?.duration_minutes || 0;
    });

    // Load availability constraints for new date
    const newDate = newDatetime.toISOString().split('T')[0];
    const constraints = await loadAvailabilityConstraints(supabase, staffId, newDate);

    // Check if new slot is available
    const slots = calculateAvailableSlots(
      constraints,
      totalDuration,
      newDate,
      {
        slotInterval: 15,
        travelBuffer: booking.location_type === 'at_home' ? 30 : 0,
      }
    );

    const requestedTime = newDatetime.toTimeString().substring(0, 5); // HH:MM
    const isAvailable = slots.some((slot) => slot.time === requestedTime && slot.available);

    if (!isAvailable) {
      return handleApiError(
        new Error("Selected time slot is not available"),
        "Selected time slot is not available. Please choose another time.",
        "SLOT_UNAVAILABLE",
        409
      );
    }

    // Update booking scheduled_at
    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from('bookings')
      .update({
        scheduled_at: newDatetime.toISOString(),
      })
      .eq('id', validation.bookingId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Update all booking_services with new times
    let cursor = newDatetime;
    const updatePromises = bookingServices.map(async (bs: any) => {
      const start = new Date(cursor);
      const duration = bs.duration_minutes || bs.offerings?.duration_minutes || 60;
      const end = new Date(start.getTime() + duration * 60000);
      const buffer = bs.offerings?.buffer_minutes || 15;

      const { error } = await adminSupabase
        .from('booking_services')
        .update({
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        })
        .eq('id', bs.id);

      if (error) {
        throw error;
      }

      // Advance cursor by duration + buffer
      cursor = new Date(end.getTime() + buffer * 60000);
    });

    await Promise.all(updatePromises);

    // Create booking event
    await adminSupabase.from('booking_events').insert({
      booking_id: validation.bookingId,
      event_type: 'rescheduled',
      event_data: {
        old_datetime: booking.scheduled_at,
        new_datetime: newDatetime.toISOString(),
        rescheduled_via: 'portal',
      },
    });

    // Send reschedule notification
    const { sendRescheduleNotification } = await import('@/lib/bookings/notifications');
    await sendRescheduleNotification(
      validation.bookingId,
      new Date(booking.scheduled_at),
      newDatetime
    );

    return successResponse({
      booking: updatedBooking,
      message: "Booking rescheduled successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to reschedule booking");
  }
}

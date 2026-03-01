import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { z } from "zod";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_BOOKING_RESCHEDULED } from "@/lib/analytics/amplitude/types";

const rescheduleSchema = z.object({
  new_datetime: z.string().datetime("Invalid datetime format"),
});

/**
 * POST /api/me/bookings/[id]/reschedule
 * 
 * Reschedule a booking (subject to cancellation policy and availability)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: bookingId } = await params;
    const body = await request.json();

    // Validate input
    const validated = rescheduleSchema.parse(body);
    const newDatetime = new Date(validated.new_datetime);

    const supabase = await getSupabaseServer();
    const adminSupabase = getSupabaseAdmin();

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
        customer_id,
        booking_services (
          id,
          offering_id,
          staff_id,
          scheduled_start_at,
          scheduled_end_at,
          duration_minutes,
          offerings:offerings!booking_services_offering_id_fkey!inner(buffer_minutes, duration_minutes)
        )
      `)
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
        "You can only reschedule your own bookings",
        "UNAUTHORIZED",
        403
      );
    }

    // Check if booking is part of a group booking
    const { data: participant } = await supabase
      .from('booking_participants')
      .select('group_booking_id, is_primary_contact')
      .eq('booking_id', bookingId)
      .single();

    if (participant?.group_booking_id) {
      // If part of group, only primary contact can reschedule
      if (!participant.is_primary_contact) {
        // Get primary contact info
        const { data: groupBooking } = await supabase
          .from('group_bookings')
          .select('primary_contact_booking_id, bookings!primary_contact_booking_id(customer_id, users!inner(email))')
          .eq('id', participant.group_booking_id)
          .single();

        const primaryContactEmail = (groupBooking as any)?.bookings?.users?.email || 'the primary contact';

        return handleApiError(
          new Error("Only the primary contact can reschedule group bookings"),
          `Only the primary contact can reschedule group bookings. Please contact ${primaryContactEmail}.`,
          "GROUP_BOOKING_RESTRICTION",
          403
        );
      }
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

    // Total blocked span = sum(durations) + sum(buffers) to match book flow
    let totalDuration = 0;
    bookingServices.forEach((bs: any) => {
      const dur = bs.duration_minutes ?? bs.offerings?.duration_minutes ?? 60;
      const buf = bs.offerings?.buffer_minutes ?? 15;
      totalDuration += dur + buf;
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
      .eq('id', bookingId)
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
      booking_id: bookingId,
      event_type: 'rescheduled',
      event_data: {
        old_datetime: booking.scheduled_at,
        new_datetime: newDatetime.toISOString(),
        rescheduled_by: user.id,
      },
      created_by: user.id,
    });

    // Send reschedule notification
    const { sendRescheduleNotification } = await import('@/lib/bookings/notifications');
    await sendRescheduleNotification(
      bookingId,
      new Date(booking.scheduled_at),
      newDatetime
    );

    // Track Amplitude event
    try {
      await trackServer(EVENT_BOOKING_RESCHEDULED, {
        portal: "client",
        provider_id: booking.provider_id,
        booking_id: bookingId,
        old_scheduled_at: booking.scheduled_at,
        new_scheduled_at: newDatetime.toISOString(),
      }, user.id);
    } catch (amplitudeError) {
      console.error("[Amplitude] Failed to track booking reschedule:", amplitudeError);
    }

    return successResponse({
      booking: updatedBooking,
      message: "Booking rescheduled successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: any) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to reschedule booking");
  }
}

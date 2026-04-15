import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
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

    const supabase = await getSupabaseServer(request);
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

    const nonReschedulableStatuses = ["completed", "cancelled", "no_show"];
    if (nonReschedulableStatuses.includes(booking.status)) {
      return handleApiError(
        new Error("Cannot reschedule a booking that is " + booking.status),
        `Cannot reschedule a ${booking.status} booking`,
        "INVALID_STATUS",
        400
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

    const allStaffIds = [...new Set(bookingServices.map((bs: { staff_id?: string }) => bs.staff_id).filter((sid): sid is string => !!sid))];
    const staffId = allStaffIds[0];

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
    type BsRow = { duration_minutes?: number; offerings?: { duration_minutes?: number; buffer_minutes?: number } };
    bookingServices.forEach((bs: BsRow) => {
      const dur = bs.duration_minutes ?? bs.offerings?.duration_minutes ?? 60;
      const buf = bs.offerings?.buffer_minutes ?? 15;
      totalDuration += dur + buf;
    });

    // Load availability constraints for new date.
    // Pass publicCalendarParity so staff_days_off / staff_time_off / availability_blocks
    // block the same windows here that customers see in the booking flow.
    const newDate = newDatetime.toISOString().split('T')[0];
    const constraints = await loadAvailabilityConstraints(
      supabase,
      staffId,
      newDate,
      booking.provider_id,
      {
        excludeBookingId: bookingId,
        publicCalendarParity: {
          providerId: booking.provider_id,
          date: newDate,
          locationId: undefined,
          slotStaffId: staffId,
          staffIdsForTimeOff: allStaffIds,
        },
      }
    );

    const slots = calculateAvailableSlots(
      constraints,
      totalDuration,
      newDate,
      {
        slotInterval: 15,
        travelBuffer: booking.location_type === 'at_home' ? HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_BUFFER_MINUTES : 0,
      }
    );

    const pad2 = (n: number) => String(n).padStart(2, "0");
    const requestedTime = `${pad2(newDatetime.getUTCHours())}:${pad2(newDatetime.getUTCMinutes())}`;
    const offsetMs = newDatetime.getTimezoneOffset() * 60000;
    const localDt = new Date(newDatetime.getTime() - offsetMs);
    const requestedTimeLocal = `${pad2(localDt.getUTCHours())}:${pad2(localDt.getUTCMinutes())}`;
    const isAvailable = slots.some((slot) => (slot.time === requestedTime || slot.time === requestedTimeLocal) && slot.available);

    if (!isAvailable) {
      return handleApiError(
        new Error("Selected time slot is not available"),
        "Selected time slot is not available. Please choose another time.",
        "SLOT_UNAVAILABLE",
        409
      );
    }

    // Optimistic lock: prevent concurrent reschedules from overwriting each other.
    const { data: currentRow } = await adminSupabase
      .from('bookings')
      .select('version')
      .eq('id', bookingId)
      .single();
    const currentVersion = (currentRow as any)?.version ?? 0;

    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from('bookings')
      .update({
        scheduled_at: newDatetime.toISOString(),
        version: currentVersion + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('version', currentVersion)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    if (!updatedBooking) {
      return handleApiError(
        new Error("Booking was modified concurrently"),
        "This booking was updated by someone else. Please try again.",
        "CONFLICT",
        409
      );
    }

    // Update all booking_services with new times
    let cursor = newDatetime;
    type BsUpdateRow = BsRow & { id: string };
    const updatePromises = bookingServices.map(async (bs: BsUpdateRow) => {
      const start = new Date(cursor);
      const duration = bs.duration_minutes ?? bs.offerings?.duration_minutes ?? 60;
      const end = new Date(start.getTime() + duration * 60000);
      const buffer = bs.offerings?.buffer_minutes ?? 15;

      const { error } = await adminSupabase
        .from("booking_services")
        .update({
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        })
        .eq("id", bs.id);

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
        new Error(error.issues.map((e: { message: string }) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to reschedule booking");
  }
}

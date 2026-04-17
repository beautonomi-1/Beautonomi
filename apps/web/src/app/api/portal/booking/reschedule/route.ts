import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { formatInTimeZone } from "date-fns-tz";
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

    const nonReschedulableStatuses = ["completed", "cancelled", "no_show"];
    if (nonReschedulableStatuses.includes(booking.status)) {
      return handleApiError(
        new Error("Cannot reschedule a booking that is " + booking.status),
        `Cannot reschedule a ${booking.status} booking`,
        "INVALID_STATUS",
        400
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
    bookingServices.forEach((bs: any) => {
      const dur = bs.duration_minutes ?? bs.offerings?.duration_minutes ?? 60;
      const buf = bs.offerings?.buffer_minutes ?? 15;
      totalDuration += dur + buf;
    });

    // Resolve provider timezone so the new slot is validated in the provider's
    // business clock, not Node's local time or UTC.
    const { data: portalProviderRow } = await supabase
      .from('providers')
      .select('timezone')
      .eq('id', booking.provider_id)
      .maybeSingle();
    const portalProviderTz =
      ((portalProviderRow as { timezone?: string | null } | null)?.timezone?.trim() ||
        DEFAULT_BOOKING_DISPLAY_TIMEZONE);

    const newDate = formatInTimeZone(newDatetime, portalProviderTz, "yyyy-MM-dd");
    const requestedTime = formatInTimeZone(newDatetime, portalProviderTz, "HH:mm");

    const constraints = await loadAvailabilityConstraints(
      supabase,
      staffId,
      newDate,
      booking.provider_id,
      {
        excludeBookingId: validation.bookingId,
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

    const isAvailable = slots.some((slot) => slot.time === requestedTime && slot.available);

    if (!isAvailable) {
      return handleApiError(
        new Error("Selected time slot is not available"),
        "Selected time slot is not available. Please choose another time.",
        "SLOT_UNAVAILABLE",
        409
      );
    }

    // B5: DB-level lock against cross-booking contention on (staff, slot).
    try {
      const { data: conflictRow, error: conflictErr } = await (
        adminSupabase.rpc as any
      )("check_reschedule_slot_conflict", {
        p_booking_id: validation.bookingId,
        p_staff_id: staffId,
        p_provider_id: booking.provider_id,
        p_new_start: newDatetime.toISOString(),
        p_total_minutes: totalDuration,
      });
      if (!conflictErr) {
        const c = Array.isArray(conflictRow) ? conflictRow[0] : conflictRow;
        if (c && (c as { conflict?: boolean }).conflict) {
          return handleApiError(
            new Error("Slot locked by concurrent booking"),
            "That time just became unavailable. Please pick another slot.",
            "SLOT_CONTENDED",
            409,
          );
        }
      }
    } catch (err) {
      console.warn("[portal reschedule] slot conflict RPC missing", err);
    }

    // Optimistic lock: read current version, then update with eq('version', ...) to
    // prevent concurrent reschedules from overwriting each other.
    const { data: currentRow } = await adminSupabase
      .from('bookings')
      .select('version')
      .eq('id', validation.bookingId)
      .single();
    const currentVersion = (currentRow as any)?.version ?? 0;

    const { data: updatedBooking, error: updateError } = await adminSupabase
      .from('bookings')
      .update({
        scheduled_at: newDatetime.toISOString(),
        version: currentVersion + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validation.bookingId)
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

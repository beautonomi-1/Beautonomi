import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { rescheduleGroupBooking, isPrimaryContact, getGroupBooking } from "@/lib/bookings/group-booking";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { z } from "zod";

const rescheduleSchema = z.object({
  new_datetime: z.string().datetime("Invalid datetime format"),
});

/**
 * POST /api/me/group-bookings/[id]/reschedule
 * 
 * Reschedule an entire group booking (only primary contact can do this)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: groupBookingId } = await params;
    const body = await request.json();

    // Validate input
    const validated = rescheduleSchema.parse(body);
    const newDatetime = new Date(validated.new_datetime);

    const supabase = await getSupabaseServer();
    const adminSupabase = getSupabaseAdmin();

    // Load group booking
    const groupBooking = await getGroupBooking(supabase, groupBookingId);
    if (!groupBooking) {
      return handleApiError(
        new Error("Group booking not found"),
        "Group booking not found",
        "NOT_FOUND",
        404
      );
    }

    // Verify user is primary contact
    const isPrimary = await isPrimaryContact(supabase, user.id, groupBookingId);
    if (!isPrimary) {
      return handleApiError(
        new Error("Unauthorized"),
        "Only the primary contact can reschedule group bookings",
        "UNAUTHORIZED",
        403
      );
    }

    // Check availability for all bookings in the group
    // For simplicity, we'll check if the new time works for all bookings
    // In a more sophisticated implementation, we'd check each booking's staff availability
    const bookings = groupBooking.bookings || [];
    
    // Calculate time offset
    const originalScheduledAt = new Date(groupBooking.scheduled_at);
    const _timeOffset = newDatetime.getTime() - originalScheduledAt.getTime();

    // Check availability for each booking (simplified - checks first booking's staff)
    if (bookings.length > 0) {
      const firstBooking = bookings[0];
      // Get staff from first booking service
      const { data: firstService } = await supabase
        .from('booking_services')
        .select('staff_id, duration_minutes')
        .eq('booking_id', firstBooking.id)
        .limit(1)
        .single();

      if (firstService?.staff_id) {
        const newDate = newDatetime.toISOString().split('T')[0];
        const constraints = await loadAvailabilityConstraints(supabase, firstService.staff_id, newDate);
        
        // Total blocked span = sum(durations) + sum(buffers) across all group booking services
        let totalDuration = 0;
        for (const booking of bookings) {
          const { data: services } = await supabase
            .from('booking_services')
            .select('duration_minutes, offerings(buffer_minutes)')
            .eq('booking_id', booking.id);
          services?.forEach((s: any) => {
            const dur = s.duration_minutes ?? 60;
            const buf = s.offerings?.buffer_minutes ?? 15;
            totalDuration += dur + buf;
          });
        }

        const slots = calculateAvailableSlots(
          constraints,
          totalDuration,
          newDate,
          {
            slotInterval: 15,
            travelBuffer: 0, // Could be enhanced for at-home bookings
          }
        );

        const requestedTime = newDatetime.toTimeString().substring(0, 5); // HH:MM
        const isAvailable = slots.some((slot) => slot.time === requestedTime && slot.available);

        if (!isAvailable) {
          return handleApiError(
            new Error("Selected time slot is not available for all bookings"),
            "Selected time slot is not available. Please choose another time.",
            "SLOT_UNAVAILABLE",
            409
          );
        }
      }
    }

    // Reschedule the group booking
    await rescheduleGroupBooking(adminSupabase, groupBookingId, newDatetime);

    // Create booking events for all bookings
    for (const booking of bookings) {
      await adminSupabase.from('booking_events').insert({
        booking_id: booking.id,
        event_type: 'rescheduled',
        event_data: {
          old_datetime: groupBooking.scheduled_at,
          new_datetime: newDatetime.toISOString(),
          rescheduled_by: user.id,
          group_booking_id: groupBookingId,
        },
        created_by: user.id,
      });
    }

    // Send reschedule notifications
    const { sendRescheduleNotification } = await import('@/lib/bookings/notifications');
    for (const booking of bookings) {
      await sendRescheduleNotification(
        booking.id,
        originalScheduledAt,
        newDatetime
      );
    }

    return successResponse({
      message: "Group booking rescheduled successfully",
      group_booking_id: groupBookingId,
      new_scheduled_at: newDatetime.toISOString(),
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
    return handleApiError(error, "Failed to reschedule group booking");
  }
}

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { rescheduleGroupBooking, isPrimaryContact, getGroupBooking } from "@/lib/bookings/group-booking";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";
import { formatInTimeZone } from "date-fns-tz";
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

    const supabase = await getSupabaseServer(request);
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
        // Resolve provider_id so publicCalendarParity can block day-offs / time-off.
        const { data: staffProviderRow } = await supabase
          .from('provider_staff')
          .select('provider_id, providers:provider_id(timezone)')
          .eq('id', firstService.staff_id)
          .maybeSingle();
        const groupProviderIdForParity = staffProviderRow?.provider_id as string | undefined;
        // §Launch-audit 2026-04-18: normalise offset-style zones (see
        // supabase migration 511) so Intl doesn't throw a RangeError.
        const rawGroupProviderTz =
          ((staffProviderRow as unknown as { providers?: { timezone?: string | null } | null })?.providers
            ?.timezone ?? null) as string | null;
        const groupProviderTz =
          normalizeProviderTimezone(rawGroupProviderTz) ??
          DEFAULT_BOOKING_DISPLAY_TIMEZONE;
        if (rawGroupProviderTz && !normalizeProviderTimezone(rawGroupProviderTz)) {
          console.warn(
            `[group-reschedule] provider ${groupProviderIdForParity ?? "(unknown)"} has unparseable timezone "${rawGroupProviderTz}" — falling back to ${DEFAULT_BOOKING_DISPLAY_TIMEZONE}`,
          );
        }

        // B5: compute date + HH:mm in the provider's business timezone, not UTC.
        const newDate = formatInTimeZone(newDatetime, groupProviderTz, "yyyy-MM-dd");
        const requestedTime = formatInTimeZone(newDatetime, groupProviderTz, "HH:mm");

        const constraints = await loadAvailabilityConstraints(
          supabase,
          firstService.staff_id,
          newDate,
          groupProviderIdForParity,
          groupProviderIdForParity
            ? {
                publicCalendarParity: {
                  providerId: groupProviderIdForParity,
                  date: newDate,
                  locationId: undefined,
                  slotStaffId: firstService.staff_id,
                  staffIdsForTimeOff: [firstService.staff_id],
                },
              }
            : undefined
        );
        
        // Total blocked span = sum(durations) + sum(buffers) across all group booking services
        let totalDuration = 0;
        for (const booking of bookings) {
          const { data: services } = await supabase
            .from('booking_services')
            .select('duration_minutes, offerings(buffer_minutes)')
            .eq('booking_id', booking.id);
          type ServiceRow = { duration_minutes?: number; offerings?: { buffer_minutes?: number } | { buffer_minutes?: number }[] };
          (services ?? []).forEach((s: ServiceRow) => {
            const dur = s.duration_minutes ?? 60;
            const off = Array.isArray(s.offerings) ? s.offerings[0] : s.offerings;
            const buf = off?.buffer_minutes ?? 15;
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
            // Wave 1.3 (audit 2026-04 final 100/100): match the single-
            // booking surfaces so group reschedule sees the same slot
            // truth in the provider's wall clock.
            timezone: groupProviderTz,
          }
        );

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

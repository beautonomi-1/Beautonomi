import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { rescheduleGroupBooking, isPrimaryContact, getGroupBooking } from "@/lib/bookings/group-booking";
import { evaluateProviderSlotAgainstGrid } from "@/lib/provider-booking/compute-provider-slot-grid";
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

    const bookings = groupBooking.bookings || [];
    const originalScheduledAt = new Date(groupBooking.scheduled_at);

    // §Cross-app audit 2026-04: route through the shared engine that the
    // provider new-booking / single-booking reschedule surfaces already use.
    // This way a customer reschedule respects the SAME rules as a provider
    // reschedule — resources, blocks, holds, staff days-off, travel buffer.
    if (bookings.length > 0) {
      const providerIdForGroup = (groupBooking as { provider_id?: string }).provider_id;
      if (!providerIdForGroup) {
        return handleApiError(
          new Error("Group booking missing provider_id"),
          "Unable to verify availability for this group booking.",
          "UNAVAILABLE",
          409,
        );
      }

      // Preserve each booking's original offset inside the group so the
      // check runs per-booking at the shifted time.
      const timeOffsetMs = newDatetime.getTime() - originalScheduledAt.getTime();

      for (const booking of bookings) {
        const bookingScheduled = new Date(
          (booking as { scheduled_at?: string }).scheduled_at ?? originalScheduledAt.toISOString(),
        );
        const shifted = new Date(bookingScheduled.getTime() + timeOffsetMs);

        const { data: services } = await supabase
          .from("booking_services")
          .select("staff_id, duration_minutes, offering_id, offerings(buffer_minutes)")
          .eq("booking_id", (booking as { id: string }).id);

        type ServiceRow = {
          staff_id?: string | null;
          duration_minutes?: number | null;
          offering_id?: string | null;
          offerings?: { buffer_minutes?: number } | { buffer_minutes?: number }[];
        };
        const rows = (services as ServiceRow[] | null) ?? [];
        let totalDuration = 0;
        for (const r of rows) {
          const dur = r.duration_minutes ?? 60;
          const off = Array.isArray(r.offerings) ? r.offerings[0] : r.offerings;
          const buf = off?.buffer_minutes ?? 0;
          totalDuration += dur + buf;
        }
        if (totalDuration <= 0) totalDuration = 60;

        const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean) as string[])];
        const offeringIds = [
          ...new Set(rows.map((r) => r.offering_id).filter(Boolean) as string[]),
        ];
        const locationType = (booking as { location_type?: string | null }).location_type ?? null;
        const locationId = (booking as { location_id?: string | null }).location_id ?? null;
        const atHome = locationType === "at_home" || locationType === "customer_address";

        const check = await evaluateProviderSlotAgainstGrid(adminSupabase, {
          providerId: providerIdForGroup,
          scheduledAt: shifted,
          durationMinutes: totalDuration,
          staffIdsCsv: staffIds.length > 0 ? staffIds.join(",") : null,
          locationId: !atHome && locationId ? locationId : null,
          excludeBookingId: (booking as { id: string }).id,
          excludeGroupBookingId: groupBookingId,
          mode: atHome ? "mobile" : "salon",
          travelBufferRaw: atHome ? null : "0",
          minNoticeMinutes: 0,
          maxAdvanceDays: 365,
          resourceOfferingIds: offeringIds,
        });

        if (!check.ok) {
          return handleApiError(
            new Error("Selected time slot is not available for all bookings"),
            check.conflicts.join("; ") ||
              "Selected time slot is not available. Please choose another time.",
            "SLOT_NOT_AVAILABLE",
            409,
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

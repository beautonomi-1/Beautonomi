import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const quickBookSchema = z.object({
  date: z.string().date(),
  time: z.string().regex(/^\d{2}:\d{2}$/), // HH:MM format
  staff_id: z.string().uuid().optional(),
});

/**
 * POST /api/provider/waitlist/[id]/quick-book
 * 
 * Convert waitlist entry to booking (quick booking)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission('create_appointments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id: waitlistEntryId } = await params;
    const body = await request.json();

    const validationResult = quickBookSchema.safeParse(body);
    if (!validationResult.success) {
      return handleApiError(
        new Error(validationResult.error.issues.map((e: any) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const { date, time, staff_id } = validationResult.data;
    const supabase = await getSupabaseServer(request);
    const adminSupabase = getSupabaseAdmin();

    // Load waitlist entry
    const { data: entry, error: entryError } = await supabase
      .from('waitlist_entries')
      .select('*, providers!inner(id, user_id)')
      .eq('id', waitlistEntryId)
      .single();

    if (entryError || !entry) {
      return handleApiError(
        new Error("Waitlist entry not found"),
        "Waitlist entry not found",
        "NOT_FOUND",
        404
      );
    }

    // Verify user owns the provider
    if (entry.providers.user_id !== user.id) {
      return handleApiError(
        new Error("Unauthorized"),
        "You can only book waitlist entries for your own provider",
        "UNAUTHORIZED",
        403
      );
    }

    if (entry.status !== 'waiting' && entry.status !== 'contacted') {
      return handleApiError(
        new Error("Waitlist entry is not available for booking"),
        "This waitlist entry cannot be booked",
        "INVALID_STATUS",
        400
      );
    }

    const { data: providerTenantRow } = await adminSupabase
      .from("providers")
      .select("tenant_id")
      .eq("id", entry.provider_id)
      .maybeSingle();
    const bookingTenantId =
      (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const effectiveTenantId =
      bookingTenantId ?? (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Get service details
    let serviceDuration = 60;
    let servicePrice = 0;
    if (entry.service_id) {
      const { data: service } = await supabase
        .from('offerings')
        .select('duration_minutes, price')
        .eq('id', entry.service_id)
        .single();
      
      if (service) {
        serviceDuration = service.duration_minutes || 60;
        servicePrice = service.price || 0;
      }
    }

    // `date` is "YYYY-MM-DD" and `time` is "HH:MM" — both in UTC.
    // Construct the timestamp explicitly to avoid timezone drift.
    const bookingDatetime = new Date(`${date}T${time}:00Z`);

    const bookingEnd = new Date(bookingDatetime.getTime() + serviceDuration * 60000);

    // Validate conflicts before creating the booking
    const effectiveStaffId = staff_id || entry.staff_id;
    if (effectiveStaffId) {
      const { checkBookingConflict } = await import("@/lib/bookings/conflict-check");
      const conflictResult = await checkBookingConflict(
        adminSupabase,
        effectiveStaffId,
        bookingDatetime,
        bookingEnd,
        0
      );
      if (conflictResult.hasConflict) {
        return handleApiError(
          new Error("Time slot conflict"),
          "This time slot conflicts with an existing booking. Please choose a different time.",
          "BOOKING_CONFLICT",
          409
        );
      }
    }

    // Create booking
    const { data: booking, error: bookingError } = await adminSupabase
      .from('bookings')
      .insert({
        provider_id: entry.provider_id,
        customer_id: entry.customer_id,
        tenant_id: bookingTenantId,
        scheduled_at: bookingDatetime.toISOString(),
        location_type: 'at_salon', // Default, could be configurable
        status: 'confirmed',
        price: servicePrice,
        currency: lastResortCurrency,
        guest_name: entry.customer_name,
      })
      .select()
      .single();

    if (bookingError) {
      throw bookingError;
    }

    // Create booking service if service_id exists
    if (entry.service_id) {
      const { error: serviceError } = await adminSupabase
        .from('booking_services')
        .insert({
          booking_id: booking.id,
          offering_id: entry.service_id,
          staff_id: staff_id || entry.staff_id || null,
          scheduled_start_at: bookingDatetime.toISOString(),
          scheduled_end_at: bookingEnd.toISOString(),
          duration_minutes: serviceDuration,
          price: servicePrice,
          currency: lastResortCurrency,
        });

      if (serviceError) {
        throw serviceError;
      }
    }

    // Update waitlist entry status to 'booked'
    const { error: updateError } = await adminSupabase
      .from('waitlist_entries')
      .update({
        status: 'booked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', waitlistEntryId);

    if (updateError) {
      throw updateError;
    }

    // Create booking event
    await adminSupabase.from('booking_events').insert({
      booking_id: booking.id,
      event_type: 'created',
      event_data: {
        source: 'waitlist',
        waitlist_entry_id: waitlistEntryId,
      },
      created_by: user.id,
    });

    // Send booking confirmation notification
    const { sendBookingConfirmationNotification } = await import('@/lib/bookings/notifications');
    await sendBookingConfirmationNotification(booking.id);

    return successResponse({
      booking,
      message: "Booking created from waitlist successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to create booking from waitlist");
  }
}

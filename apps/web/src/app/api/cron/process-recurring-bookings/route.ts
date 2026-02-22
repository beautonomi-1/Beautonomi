import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * GET /api/cron/process-recurring-bookings
 * 
 * Cron job to create bookings from active recurring appointments
 * Should be called daily
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron request (secret + Vercel origin)
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Get active recurring appointments
    const { data: recurring, error } = await supabaseAdmin
      .from("recurring_appointments")
      .select("*")
      .eq("is_active", true)
      .lte("start_date", todayStr)
      .or(`end_date.is.null,end_date.gte.${todayStr}`);

    if (error) {
      throw error;
    }

    if (!recurring || recurring.length === 0) {
      return successResponse({
        message: "No recurring bookings to process",
        processed: 0,
      });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const appointment of recurring) {
      try {
        // Calculate next booking date based on frequency
        const lastBookingDate = appointment.last_booking_date 
          ? new Date(appointment.last_booking_date)
          : new Date(appointment.start_date);

        const daysToAdd = appointment.frequency === "weekly" 
          ? 7
          : appointment.frequency === "biweekly"
          ? 14
          : 30; // monthly

        const nextBookingDate = new Date(lastBookingDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        const nextBookingDateStr = nextBookingDate.toISOString().split("T")[0];

        // Check if booking should be created today
        if (nextBookingDateStr === todayStr) {
          // Create booking
          const [hours, minutes] = appointment.preferred_time.split(":");
          const scheduledAt = new Date(nextBookingDate);
          scheduledAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          const services = appointment.metadata?.services || [];
          if (services.length === 0) {
            continue;
          }

          // Create booking (simplified - would need full booking creation logic)
          const { error: bookingError } = await supabaseAdmin
            .from("bookings")
            .insert({
              customer_id: appointment.customer_id,
              provider_id: appointment.provider_id,
              status: "confirmed",
              location_type: appointment.location_type,
              location_id: appointment.location_id,
              scheduled_at: scheduledAt.toISOString(),
              // Other booking fields would be set here
            });

          if (bookingError) {
            errors.push(`Failed to create booking for recurring ${appointment.id}: ${bookingError.message}`);
            continue;
          }

          // Update last_booking_date
          await supabaseAdmin
            .from("recurring_appointments")
            .update({ last_booking_date: nextBookingDateStr })
            .eq("id", appointment.id);

          processed++;
        }
      } catch (err: any) {
        errors.push(`Error processing recurring ${appointment.id}: ${err.message}`);
      }
    }

    return successResponse({
      message: "Recurring bookings processed",
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return handleApiError(error, "Failed to process recurring bookings");
  }
}

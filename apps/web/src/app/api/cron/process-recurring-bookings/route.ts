import { NextRequest } from "next/server";
import { format } from "date-fns";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { nextRecurringOccurrenceDate, isDateOnOrBeforeEnd } from "@/lib/recurring/next-due-date";
import { createBookingFromRecurringSeries } from "@/lib/recurring/create-booking-from-series";

/**
 * GET /api/cron/process-recurring-bookings
 *
 * Daily cron: create the next due booking for each active series (does not charge cards).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const todayStr = format(new Date(), "yyyy-MM-dd");

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
        const occurrenceLimit = Number(appointment.occurrences ?? 0);
        if (Number.isFinite(occurrenceLimit) && occurrenceLimit > 0) {
          const { count: generatedCount, error: countError } = await supabaseAdmin
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("recurring_series_id", appointment.id);

          if (countError) {
            errors.push(`${appointment.id}: generated count failed: ${countError.message}`);
            continue;
          }
          if ((generatedCount ?? 0) >= occurrenceLimit) {
            const generatedThrough =
              typeof appointment.last_booking_date === "string" ? appointment.last_booking_date : null;
            if (generatedThrough && generatedThrough <= todayStr) {
              await supabaseAdmin
                .from("recurring_appointments")
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq("id", appointment.id);
            }
            continue;
          }
        }

        const lastRaw = appointment.last_booking_date;
        const lastBookingDate =
          typeof lastRaw === "string" && lastRaw
            ? lastRaw
            : lastRaw instanceof Date
              ? format(lastRaw, "yyyy-MM-dd")
              : null;

        const nextDue = nextRecurringOccurrenceDate({
          startDate: appointment.start_date,
          lastBookingDate,
          frequency: appointment.frequency,
          recurrenceRule: appointment.recurrence_rule,
        });

        if (!nextDue || !isDateOnOrBeforeEnd(nextDue, appointment.end_date)) {
          continue;
        }

        if (nextDue > todayStr) {
          continue;
        }

        const created = await createBookingFromRecurringSeries(supabaseAdmin, appointment, nextDue);

        if ("error" in created) {
          errors.push(`${appointment.id}: ${created.error}`);
          continue;
        }

        const { error: updErr } = await supabaseAdmin
          .from("recurring_appointments")
          .update({ last_booking_date: nextDue, updated_at: new Date().toISOString() })
          .eq("id", appointment.id);

        if (updErr) {
          errors.push(`${appointment.id}: last_booking_date update failed: ${updErr.message}`);
          continue;
        }

        processed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${appointment.id}: ${msg}`);
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

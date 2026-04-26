import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

/**
 * GET /api/recurring-bookings/[id]
 *
 * Returns the recurring series row plus all bookings linked via `bookings.recurring_series_id`
 * (cron-generated visits and the checkout “source” visit when created via Paystack metadata).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: recurring, error: recErr } = await supabase
      .from("recurring_appointments")
      .select(
        `
        *,
        provider:providers!inner(
          id,
          business_name,
          slug
        )
      `
      )
      .eq("id", id)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (recErr) {
      throw recErr;
    }
    if (!recurring) {
      return notFoundResponse("Recurring booking not found");
    }

    const { data: seriesBookings, error: bErr } = await supabase
      .from("bookings")
      .select("id, scheduled_at, status, payment_status, total_amount, currency, booking_number")
      .eq("recurring_series_id", id)
      .order("scheduled_at", { ascending: true });

    if (bErr) {
      throw bErr;
    }

    return successResponse({
      recurring,
      series_bookings: seriesBookings ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load recurring booking");
  }
}

const updateRecurringSchema = z.object({
  is_active: z.boolean().optional(),
  end_date: z.string().date().optional().nullable(),
  preferred_time: z.string().min(1).optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
});

function preferredTimeToHhMmSs(preferred: string): string {
  const t = preferred.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return "10:00:00";
}

/**
 * PATCH /api/recurring-bookings/[id]
 * 
 * Update a recurring booking (pause/resume/cancel)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const validated = updateRecurringSchema.parse(body);

    // Verify ownership
    const { data: existing } = await supabase
      .from("recurring_appointments")
      .select("id")
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (!existing) {
      return notFoundResponse("Recurring booking not found");
    }

    // Update
    const updateData: Record<string, unknown> = {};
    if (validated.is_active !== undefined) updateData.is_active = validated.is_active;
    if (validated.end_date !== undefined) updateData.end_date = validated.end_date;
    if (validated.preferred_time !== undefined) {
      updateData.preferred_time = validated.preferred_time;
      updateData.start_time = preferredTimeToHhMmSs(validated.preferred_time);
    }
    if (validated.frequency !== undefined) {
      updateData.frequency = validated.frequency;
      if (validated.frequency === "weekly") updateData.recurrence_rule = "FREQ=WEEKLY;INTERVAL=1";
      else if (validated.frequency === "biweekly") updateData.recurrence_rule = "FREQ=WEEKLY;INTERVAL=2";
      else updateData.recurrence_rule = "FREQ=MONTHLY;INTERVAL=1";
    }
    updateData.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("recurring_appointments")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      recurring: updated,
      message: "Recurring booking updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to update recurring booking");
  }
}

/**
 * DELETE /api/recurring-bookings/[id]
 * 
 * Cancel a recurring booking
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Verify ownership
    const { data: existing } = await supabase
      .from("recurring_appointments")
      .select("id")
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (!existing) {
      return notFoundResponse("Recurring booking not found");
    }

    // Soft-cancel: stop cron from picking this row (`is_active` + `end_date` window in process-recurring-bookings).
    const todayYmd = new Date().toISOString().split("T")[0];
    const { data: prevRow } = await supabase
      .from("recurring_appointments")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();
    const prevMeta =
      prevRow?.metadata && typeof prevRow.metadata === "object" && !Array.isArray(prevRow.metadata)
        ? (prevRow.metadata as Record<string, unknown>)
        : {};
    const { error } = await supabase
      .from("recurring_appointments")
      .update({
        is_active: false,
        end_date: todayYmd,
        metadata: { ...prevMeta, cancelled_by_customer_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({
      message: "Recurring booking cancelled successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to cancel recurring booking");
  }
}

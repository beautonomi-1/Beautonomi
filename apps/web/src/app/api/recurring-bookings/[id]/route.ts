import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

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

    // Deactivate instead of delete
    const { error } = await supabase
      .from("recurring_appointments")
      .update({ is_active: false, end_date: new Date().toISOString().split("T")[0] })
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

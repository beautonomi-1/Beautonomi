import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateRecurringSchema = z.object({
  is_active: z.boolean().optional(),
  end_date: z.string().date().optional().nullable(),
});

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
    const supabase = await getSupabaseServer();
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
    const updateData: any = {};
    if (validated.is_active !== undefined) updateData.is_active = validated.is_active;
    if (validated.end_date !== undefined) updateData.end_date = validated.end_date;

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
    const supabase = await getSupabaseServer();
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

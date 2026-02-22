import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateShiftSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().optional(),
  is_recurring: z.boolean().optional(),
  recurring_pattern: z.any().optional(),
});

/**
 * GET /api/provider/shifts/[id]
 * 
 * Get a specific shift
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: shift, error } = await supabase
      .from("staff_shifts")
      .select(`
        id,
        staff_id,
        date,
        start_time,
        end_time,
        notes,
        is_recurring,
        recurring_pattern,
        provider_staff:staff_id(id, name:users(full_name))
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !shift) {
      return notFoundResponse("Shift not found");
    }

    const transformedShift = {
      id: shift.id,
      team_member_id: shift.staff_id,
      team_member_name: (shift as any).provider_staff?.name?.full_name || "Staff",
      date: shift.date,
      start_time: shift.start_time.substring(0, 5),
      end_time: shift.end_time.substring(0, 5),
      notes: shift.notes,
      is_recurring: shift.is_recurring,
      recurring_pattern: shift.recurring_pattern,
    };

    return successResponse(transformedShift);
  } catch (error) {
    return handleApiError(error, "Failed to fetch shift");
  }
}

/**
 * PATCH /api/provider/shifts/[id]
 * 
 * Update a shift
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updateShiftSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify shift belongs to provider
    const { data: existingShift } = await supabase
      .from("staff_shifts")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingShift) {
      return notFoundResponse("Shift not found");
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (validationResult.data.date !== undefined) updateData.date = validationResult.data.date;
    if (validationResult.data.start_time !== undefined) updateData.start_time = validationResult.data.start_time;
    if (validationResult.data.end_time !== undefined) updateData.end_time = validationResult.data.end_time;
    if (validationResult.data.notes !== undefined) updateData.notes = validationResult.data.notes;
    if (validationResult.data.is_recurring !== undefined) updateData.is_recurring = validationResult.data.is_recurring;
    if (validationResult.data.recurring_pattern !== undefined) updateData.recurring_pattern = validationResult.data.recurring_pattern;

    // Update shift
    const { data: updatedShift, error: updateError } = await (supabase
      .from("staff_shifts") as any)
      .update(updateData)
      .eq("id", id)
      .select(`
        id,
        staff_id,
        date,
        start_time,
        end_time,
        notes,
        is_recurring,
        recurring_pattern
      `)
      .single();

    if (updateError || !updatedShift) {
      throw updateError || new Error("Failed to update shift");
    }

    const transformedShift = {
      id: updatedShift.id,
      team_member_id: updatedShift.staff_id,
      date: updatedShift.date,
      start_time: updatedShift.start_time.substring(0, 5),
      end_time: updatedShift.end_time.substring(0, 5),
      notes: updatedShift.notes,
      is_recurring: updatedShift.is_recurring,
      recurring_pattern: updatedShift.recurring_pattern,
    };

    return successResponse(transformedShift);
  } catch (error) {
    return handleApiError(error, "Failed to update shift");
  }
}

/**
 * DELETE /api/provider/shifts/[id]
 * 
 * Delete a shift
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify shift belongs to provider
    const { data: existingShift } = await supabase
      .from("staff_shifts")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingShift) {
      return notFoundResponse("Shift not found");
    }

    // Delete shift
    const { error: deleteError } = await supabase
      .from("staff_shifts")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete shift");
  }
}

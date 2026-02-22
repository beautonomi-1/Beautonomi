import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateTimeCardSchema = z.object({
  clock_in_time: z.string().datetime().optional(),
  clock_out_time: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/provider/staff/[id]/time-clock/[timeCardId]
 * 
 * Get a specific time card
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; timeCardId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id, timeCardId } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff belongs to provider
    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id, name")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Get time card
    const { data: timeCard, error } = await supabase
      .from("staff_time_cards")
      .select("*")
      .eq("id", timeCardId)
      .eq("staff_id", id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return notFoundResponse("Time card not found");
      }
      if (error.code === '42P01') {
        return successResponse(null);
      }
      throw error;
    }

    return successResponse({
      id: timeCard.id,
      staff_id: id,
      team_member_name: staff.name,
      date: timeCard.date,
      clock_in_time: timeCard.clock_in_time,
      clock_out_time: timeCard.clock_out_time,
      total_hours: timeCard.total_hours,
      notes: timeCard.notes,
      status: timeCard.clock_out_time ? "clocked_out" : "clocked_in",
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch time card");
  }
}

/**
 * PUT /api/provider/staff/[id]/time-clock/[timeCardId]
 * 
 * Update a time card
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; timeCardId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id, timeCardId } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updateTimeCardSchema.safeParse(body);
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

    // Verify staff belongs to provider
    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id, name")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Verify time card exists and belongs to staff
    const { data: existingCard } = await supabase
      .from("staff_time_cards")
      .select("id")
      .eq("id", timeCardId)
      .eq("staff_id", id)
      .single();

    if (!existingCard) {
      if (existingCard === null) {
        return notFoundResponse("Time card not found");
      }
      // Table might not exist
      const error: any = { code: '42P01' };
      throw error;
    }

    // Build update data
    const updateData: any = {};
    if (validationResult.data.clock_in_time !== undefined) {
      updateData.clock_in_time = new Date(validationResult.data.clock_in_time).toISOString();
    }
    if (validationResult.data.clock_out_time !== undefined) {
      updateData.clock_out_time = validationResult.data.clock_out_time 
        ? new Date(validationResult.data.clock_out_time).toISOString() 
        : null;
    }
    if (validationResult.data.notes !== undefined) {
      updateData.notes = validationResult.data.notes;
    }

    // Note: total_hours will be automatically calculated by database trigger
    // when clock_out_time is set

    // Update time card
    const { data: updatedCard, error: updateError } = await supabase
      .from("staff_time_cards")
      .update(updateData)
      .eq("id", timeCardId)
      .eq("staff_id", id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === '42P01') {
        return successResponse({ success: true });
      }
      throw updateError;
    }

    return successResponse({
      id: updatedCard.id,
      staff_id: id,
      team_member_name: staff.name,
      date: updatedCard.date,
      clock_in_time: updatedCard.clock_in_time,
      clock_out_time: updatedCard.clock_out_time,
      total_hours: updatedCard.total_hours,
      notes: updatedCard.notes,
      status: updatedCard.clock_out_time ? "clocked_out" : "clocked_in",
    });
  } catch (error) {
    return handleApiError(error, "Failed to update time card");
  }
}

/**
 * DELETE /api/provider/staff/[id]/time-clock/[timeCardId]
 * 
 * Delete a time card
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; timeCardId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id, timeCardId } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff belongs to provider
    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Delete time card
    const { error: deleteError } = await supabase
      .from("staff_time_cards")
      .delete()
      .eq("id", timeCardId)
      .eq("staff_id", id);

    if (deleteError) {
      if (deleteError.code === '42P01') {
        return successResponse({ success: true });
      }
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete time card");
  }
}

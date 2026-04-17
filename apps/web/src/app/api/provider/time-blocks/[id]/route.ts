import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateTimeBlockSchema = z.object({
  staff_id: z.string().uuid().nullable().optional(),
  blocked_time_type_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  is_recurring: z.boolean().optional(),
  recurring_pattern: z.any().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().optional(),
});

function normalizeRecurringPattern(
  raw: any,
  anchorDate: string,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  let frequency: string = raw.frequency ?? raw.pattern ?? "weekly";
  if (frequency === "biweekly") frequency = "weekly";
  const anchor = new Date(anchorDate + "T12:00:00");
  const dow = anchor.getDay();
  let days: number[] | undefined = raw.days ?? raw.days_of_week;
  if (!days && frequency === "weekly") days = [dow];
  const endDate: string | undefined = raw.end_date || undefined;
  return { frequency, days, end_date: endDate };
}

/**
 * GET /api/provider/time-blocks/[id]
 * 
 * Get a specific time block
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

    const { data: block, error } = await supabase
      .from("time_blocks")
      .select(`
        id,
        staff_id,
        blocked_time_type_id,
        name,
        date,
        start_time,
        end_time,
        is_recurring,
        recurring_pattern,
        is_active,
        notes,
        provider_staff:staff_id(id, name:users(full_name)),
        blocked_time_types:blocked_time_type_id(id, name, color)
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !block) {
      return notFoundResponse("Time block not found");
    }

    const transformedBlock = {
      id: block.id,
      team_member_id: block.staff_id,
      team_member_name: (block as any).provider_staff?.name?.full_name || null,
      blocked_time_type_id: block.blocked_time_type_id,
      blocked_time_type_name: (block as any).blocked_time_types?.name || null,
      blocked_time_type_color: (block as any).blocked_time_types?.color || null,
      name: block.name,
      date: block.date,
      start_time: block.start_time.substring(0, 5),
      end_time: block.end_time.substring(0, 5),
      is_recurring: block.is_recurring,
      recurring_pattern: block.recurring_pattern,
      is_active: block.is_active,
      notes: block.notes,
    };

    return successResponse(transformedBlock);
  } catch (error) {
    return handleApiError(error, "Failed to fetch time block");
  }
}

/**
 * PATCH /api/provider/time-blocks/[id]
 * 
 * Update a time block
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requireAnyPermission(["edit_settings", "edit_appointments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updateTimeBlockSchema.safeParse(body);
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

    const { data: existingBlock } = await supabase
      .from("time_blocks")
      .select("id, date")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingBlock) {
      return notFoundResponse("Time block not found");
    }

    const data = validationResult.data;
    const updateData: Record<string, any> = {};
    if (data.staff_id !== undefined) updateData.staff_id = data.staff_id;
    if (data.blocked_time_type_id !== undefined) updateData.blocked_time_type_id = data.blocked_time_type_id;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.start_time !== undefined) updateData.start_time = data.start_time;
    if (data.end_time !== undefined) updateData.end_time = data.end_time;
    if (data.is_recurring !== undefined) updateData.is_recurring = data.is_recurring;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.notes !== undefined) updateData.notes = data.notes;

    if (data.recurring_pattern !== undefined || data.is_recurring !== undefined) {
      const anchorDate = data.date ?? (existingBlock as any).date ?? new Date().toISOString().split("T")[0];
      const isRec = data.is_recurring ?? false;
      updateData.recurring_pattern = isRec
        ? normalizeRecurringPattern(data.recurring_pattern, anchorDate)
        : null;
    }

    // Update block
    const { data: updatedBlock, error: updateError } = await (supabase
      .from("time_blocks") as any)
      .update(updateData)
      .eq("id", id)
      .select(`
        id,
        staff_id,
        blocked_time_type_id,
        name,
        date,
        start_time,
        end_time,
        is_recurring,
        recurring_pattern,
        is_active,
        notes
      `)
      .single();

    if (updateError || !updatedBlock) {
      throw updateError || new Error("Failed to update time block");
    }

    const transformedBlock = {
      id: updatedBlock.id,
      team_member_id: updatedBlock.staff_id,
      blocked_time_type_id: updatedBlock.blocked_time_type_id,
      name: updatedBlock.name,
      date: updatedBlock.date,
      start_time: updatedBlock.start_time.substring(0, 5),
      end_time: updatedBlock.end_time.substring(0, 5),
      is_recurring: updatedBlock.is_recurring,
      recurring_pattern: updatedBlock.recurring_pattern,
      is_active: updatedBlock.is_active,
      notes: updatedBlock.notes,
    };

    return successResponse(transformedBlock);
  } catch (error) {
    return handleApiError(error, "Failed to update time block");
  }
}

/**
 * DELETE /api/provider/time-blocks/[id]
 * 
 * Delete a time block
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requireAnyPermission(["edit_settings", "edit_appointments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify block belongs to provider
    const { data: existingBlock } = await supabase
      .from("time_blocks")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingBlock) {
      return notFoundResponse("Time block not found");
    }

    // Delete block
    const { error: deleteError } = await supabase
      .from("time_blocks")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete time block");
  }
}

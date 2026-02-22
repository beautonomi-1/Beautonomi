import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/blocked-time-types/[id]
 * 
 * Get a specific blocked time type
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

    const { data: type, error } = await supabase
      .from("blocked_time_types")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !type) {
      return notFoundResponse("Blocked time type not found");
    }

    return successResponse(type);
  } catch (error) {
    return handleApiError(error, "Failed to fetch blocked time type");
  }
}

/**
 * PATCH /api/provider/blocked-time-types/[id]
 * 
 * Update a blocked time type
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
    const validationResult = updateTypeSchema.safeParse(body);
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

    // Verify type belongs to provider
    const { data: existingType } = await supabase
      .from("blocked_time_types")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingType) {
      return notFoundResponse("Blocked time type not found");
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    const data = validationResult.data;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    // Update type
    const { data: updatedType, error: updateError } = await (supabase
      .from("blocked_time_types") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedType) {
      throw updateError || new Error("Failed to update blocked time type");
    }

    return successResponse(updatedType);
  } catch (error) {
    return handleApiError(error, "Failed to update blocked time type");
  }
}

/**
 * DELETE /api/provider/blocked-time-types/[id]
 * 
 * Delete a blocked time type
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

    // Verify type belongs to provider
    const { data: existingType } = await supabase
      .from("blocked_time_types")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingType) {
      return notFoundResponse("Blocked time type not found");
    }

    // Delete type
    const { error: deleteError } = await supabase
      .from("blocked_time_types")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete blocked time type");
  }
}

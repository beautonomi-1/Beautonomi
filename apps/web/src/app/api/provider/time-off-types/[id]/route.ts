import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  is_paid: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/provider/time-off-types/[id]
 * Update a time off type
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = updateSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // Verify time off type belongs to provider
    const { data: existing } = await supabase
      .from("time_off_types")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Time off type not found");
    }

    const updateData: any = {};
    if (validationResult.data.name !== undefined) {
      updateData.name = validationResult.data.name;
    }
    if (validationResult.data.description !== undefined) {
      updateData.description = validationResult.data.description || null;
    }
    if (validationResult.data.is_paid !== undefined) {
      updateData.is_paid = validationResult.data.is_paid;
    }
    if (validationResult.data.is_active !== undefined) {
      updateData.is_active = validationResult.data.is_active;
    }

    const { data, error } = await supabase
      .from("time_off_types")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update time off type");
  }
}

/**
 * DELETE /api/provider/time-off-types/[id]
 * Delete a time off type
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify time off type belongs to provider
    const { data: existing } = await supabase
      .from("time_off_types")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Time off type not found");
    }

    const { error } = await supabase.from("time_off_types").delete().eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete time off type");
  }
}

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
  permissions: z.record(z.string(), z.boolean()).optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/provider/roles/[id]
 * Update a role
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
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

    // Verify role belongs to provider
    const { data: existing } = await supabase
      .from("provider_roles")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Role not found");
    }

    const updateData: any = {};
    if (validationResult.data.name !== undefined) {
      updateData.name = validationResult.data.name;
    }
    if (validationResult.data.description !== undefined) {
      updateData.description = validationResult.data.description || null;
    }
    if (validationResult.data.permissions !== undefined) {
      updateData.permissions = validationResult.data.permissions;
    }
    if (validationResult.data.is_active !== undefined) {
      updateData.is_active = validationResult.data.is_active;
    }

    const { data, error } = await supabase
      .from("provider_roles")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      ...data,
      permissions:
        data.permissions && typeof data.permissions === "string"
          ? JSON.parse(data.permissions)
          : data.permissions || {},
    });
  } catch (error) {
    return handleApiError(error, "Failed to update role");
  }
}

/**
 * DELETE /api/provider/roles/[id]
 * Delete a role
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify role belongs to provider
    const { data: existing } = await supabase
      .from("provider_roles")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Role not found");
    }

    const { error } = await supabase.from("provider_roles").delete().eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete role");
  }
}

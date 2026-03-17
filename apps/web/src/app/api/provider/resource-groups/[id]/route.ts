import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  is_active: z.boolean().optional(),
  resource_ids: z.array(z.string().uuid()).optional(),
});

/**
 * GET /api/provider/resource-groups/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: group, error } = await supabase
      .from("resource_groups")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !group) {
      return notFoundResponse("Resource group not found");
    }

    return successResponse(group);
  } catch (error) {
    return handleApiError(error, "Failed to fetch resource group");
  }
}

/**
 * PATCH /api/provider/resource-groups/[id]
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

    const validationResult = updateGroupSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify group belongs to provider
    const { data: existingGroup } = await supabase
      .from("resource_groups")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingGroup) {
      return notFoundResponse("Resource group not found");
    }

    const { resource_ids: resourceIds, ...groupFields } = validationResult.data;

    const updatePayload: Record<string, unknown> = {};
    if (groupFields.name !== undefined) updatePayload.name = groupFields.name;
    if (groupFields.description !== undefined) updatePayload.description = groupFields.description;
    if (groupFields.color !== undefined) updatePayload.color = groupFields.color;
    if (groupFields.is_active !== undefined) updatePayload.is_active = groupFields.is_active;
    updatePayload.updated_at = new Date().toISOString();

    const { data: updatedGroup, error: updateError } = await (supabase
      .from("resource_groups") as any)
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedGroup) {
      throw updateError || new Error("Failed to update resource group");
    }

    // If resource_ids provided: assign those resources to this group; unassign others that were in this group
    if (resourceIds !== undefined) {
      const idsSet = new Set(resourceIds || []);
      const { data: currentInGroup } = await supabase
        .from("resources")
        .select("id")
        .eq("provider_id", providerId)
        .eq("group_id", id);
      const currentIds = (currentInGroup || []).map((r: { id: string }) => r.id);
      const toAssign = resourceIds || [];
      const toUnassign = currentIds.filter((rid) => !idsSet.has(rid));
      if (toUnassign.length > 0) {
        await supabase.from("resources").update({ group_id: null, updated_at: new Date().toISOString() }).eq("provider_id", providerId).in("id", toUnassign);
      }
      if (toAssign.length > 0) {
        await supabase.from("resources").update({ group_id: id, updated_at: new Date().toISOString() }).eq("provider_id", providerId).in("id", toAssign);
      }
    }

    return successResponse(updatedGroup);
  } catch (error) {
    return handleApiError(error, "Failed to update resource group");
  }
}

/**
 * DELETE /api/provider/resource-groups/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify group belongs to provider
    const { data: existingGroup } = await supabase
      .from("resource_groups")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingGroup) {
      return notFoundResponse("Resource group not found");
    }

    const { error: deleteError } = await supabase
      .from("resource_groups")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete resource group");
  }
}

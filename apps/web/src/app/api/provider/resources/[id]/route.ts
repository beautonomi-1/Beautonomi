import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateResourceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  group_id: z.string().uuid().nullable().optional(),
  capacity: z.number().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/resources/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // For superadmin, allow viewing any resource; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the resource itself
      const { data: resourceCheck } = await supabase
        .from("resources")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (resourceCheck) {
        providerId = resourceCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    let query = supabase
      .from("resources")
      .select(`
        *,
        resource_groups(id, name, color)
      `)
      .eq("id", id);

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: resource, error } = await query.single();

    if (error || !resource) {
      return notFoundResponse("Resource not found");
    }

    // Transform response to match UI expectations
    const group = Array.isArray((resource as any).resource_groups)
      ? (resource as any).resource_groups[0]
      : (resource as any).resource_groups;
    
    const transformedResource = {
      id: resource.id,
      name: resource.name,
      description: resource.description || null,
      capacity: resource.capacity || null,
      is_active: resource.is_active ?? true,
      group_name: group?.name || null,
      group_color: group?.color || null,
      group_id: resource.group_id || null,
      provider_id: resource.provider_id,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
    };

    return successResponse(transformedResource);
  } catch (error) {
    return handleApiError(error, "Failed to fetch resource");
  }
}

/**
 * PATCH /api/provider/resources/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateResourceSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // For superadmin, allow updating any resource; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the resource itself
      const { data: resourceCheck } = await supabase
        .from("resources")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (resourceCheck) {
        providerId = resourceCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify resource exists
    let verifyQuery = supabase
      .from("resources")
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existingResource } = await verifyQuery.single();

    if (!existingResource) {
      return notFoundResponse("Resource not found");
    }

    // Prepare update data
    const updateData: any = {};
    if (validationResult.data.name !== undefined) {
      updateData.name = validationResult.data.name.trim();
    }
    if (validationResult.data.description !== undefined) {
      updateData.description = validationResult.data.description?.trim() || null;
    }
    if (validationResult.data.capacity !== undefined) {
      updateData.capacity = validationResult.data.capacity || 1;
    }
    if (validationResult.data.is_active !== undefined) {
      updateData.is_active = validationResult.data.is_active;
    }
    if (validationResult.data.group_id !== undefined) {
      updateData.group_id = validationResult.data.group_id || null;
    }
    updateData.updated_at = new Date().toISOString();

    // Update resource
    const { data: updatedResource, error: updateError } = await (supabase
      .from("resources") as any)
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        resource_groups(id, name, color)
      `)
      .single();

    if (updateError || !updatedResource) {
      throw updateError || new Error("Failed to update resource");
    }

    // Transform response to match UI expectations
    const group = Array.isArray((updatedResource as any).resource_groups)
      ? (updatedResource as any).resource_groups[0]
      : (updatedResource as any).resource_groups;
    
    const transformedResource = {
      id: updatedResource.id,
      name: updatedResource.name,
      description: updatedResource.description || null,
      capacity: updatedResource.capacity || null,
      is_active: updatedResource.is_active ?? true,
      group_name: group?.name || null,
      group_color: group?.color || null,
      group_id: updatedResource.group_id || null,
      provider_id: updatedResource.provider_id,
      created_at: updatedResource.created_at,
      updated_at: updatedResource.updated_at,
    };

    return successResponse(transformedResource);
  } catch (error) {
    return handleApiError(error, "Failed to update resource");
  }
}

/**
 * DELETE /api/provider/resources/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // For superadmin, allow deleting any resource; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the resource itself
      const { data: resourceCheck } = await supabase
        .from("resources")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (resourceCheck) {
        providerId = resourceCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify resource exists
    let verifyQuery = supabase
      .from("resources")
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existingResource } = await verifyQuery.single();

    if (!existingResource) {
      return notFoundResponse("Resource not found");
    }

    const { error: deleteError } = await supabase
      .from("resources")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete resource");
  }
}

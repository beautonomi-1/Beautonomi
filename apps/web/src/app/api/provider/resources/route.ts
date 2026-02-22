import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const createResourceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  group_id: z.string().uuid().nullable().optional(),
  capacity: z.number().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/resources
 * 
 * Get provider's resources
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id"); // For superadmin to view specific provider

    // For superadmin, allow viewing any provider's resources
    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      // For providers, get their own provider ID
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Query resources
    let query = supabase
      .from("resources")
      .select(`
        *,
        resource_groups(id, name, color)
      `)
      .order("name", { ascending: true });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: resources, error } = await query;

    if (error) {
      throw error;
    }

    // Transform data to match UI expectations
    const transformedResources = (resources || []).map((resource: any) => {
      // Handle both array and object formats for resource_groups
      const group = Array.isArray(resource.resource_groups) 
        ? resource.resource_groups[0] 
        : resource.resource_groups;
      
      return {
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
    });

    return successResponse(transformedResources);
  } catch (error) {
    return handleApiError(error, "Failed to fetch resources");
  }
}

/**
 * POST /api/provider/resources
 * 
 * Create a new resource
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = createResourceSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const data = validationResult.data;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Create resource
    const insertData: any = {
      provider_id: providerId,
      name: data.name.trim(),
      capacity: data.capacity || 1,
      is_active: data.is_active ?? true,
    };

    if (data.description !== undefined && data.description !== null) {
      insertData.description = data.description.trim() || null;
    }

    if (data.group_id !== undefined) {
      insertData.group_id = data.group_id || null;
    }

    const { data: newResource, error: insertError } = await (supabase
      .from("resources") as any)
      .insert(insertData)
      .select(`
        *,
        resource_groups(id, name, color)
      `)
      .single();

    if (insertError || !newResource) {
      throw insertError || new Error("Failed to create resource");
    }

    // Transform response to match UI expectations
    const group = Array.isArray((newResource as any).resource_groups)
      ? (newResource as any).resource_groups[0]
      : (newResource as any).resource_groups;
    
    const transformedResource = {
      id: newResource.id,
      name: newResource.name,
      description: newResource.description || null,
      capacity: newResource.capacity || null,
      is_active: newResource.is_active ?? true,
      group_name: group?.name || null,
      group_color: group?.color || null,
      group_id: newResource.group_id || null,
      provider_id: newResource.provider_id,
      created_at: newResource.created_at,
      updated_at: newResource.updated_at,
    };

    return successResponse(transformedResource);
  } catch (error) {
    return handleApiError(error, "Failed to create resource");
  }
}

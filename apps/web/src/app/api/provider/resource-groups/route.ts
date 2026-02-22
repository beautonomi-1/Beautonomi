import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/resource-groups
 * 
 * Get provider's resource groups
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: groups, error } = await supabase
      .from("resource_groups")
      .select("*")
      .eq("provider_id", providerId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return successResponse(groups || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch resource groups");
  }
}

/**
 * POST /api/provider/resource-groups
 * 
 * Create a new resource group
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = createGroupSchema.safeParse(body);
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

    // Create group
    const { data: newGroup, error: insertError } = await (supabase
      .from("resource_groups") as any)
      .insert({
        provider_id: providerId,
        name: data.name,
        description: data.description,
        color: data.color || '#FF0077',
        is_active: data.is_active ?? true,
      })
      .select()
      .single();

    if (insertError || !newGroup) {
      throw insertError || new Error("Failed to create resource group");
    }

    return successResponse(newGroup);
  } catch (error) {
    return handleApiError(error, "Failed to create resource group");
  }
}

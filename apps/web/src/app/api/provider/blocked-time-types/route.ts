import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/blocked-time-types
 * 
 * Get provider's blocked time types
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

    const { data: types, error } = await supabase
      .from("blocked_time_types")
      .select("*")
      .eq("provider_id", providerId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return successResponse(types || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch blocked time types");
  }
}

/**
 * POST /api/provider/blocked-time-types
 * 
 * Create a new blocked time type
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = createTypeSchema.safeParse(body);
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

    // Create type
    const { data: newType, error: insertError } = await (supabase
      .from("blocked_time_types") as any)
      .insert({
        provider_id: providerId,
        name: data.name,
        description: data.description,
        color: data.color || "#FF0077",
        is_active: data.is_active ?? true,
      })
      .select()
      .single();

    if (insertError || !newType) {
      throw insertError || new Error("Failed to create blocked time type");
    }

    return successResponse(newType);
  } catch (error) {
    return handleApiError(error, "Failed to create blocked time type");
  }
}

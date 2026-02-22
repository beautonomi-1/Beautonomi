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

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  is_paid: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/time-off-types
 * Get all time off types for provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data, error } = await supabase
      .from("time_off_types")
      .select("*")
      .eq("provider_id", providerId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to load time off types");
  }
}

/**
 * POST /api/provider/time-off-types
 * Create a new time off type
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = createSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { data, error } = await supabase
      .from("time_off_types")
      .insert({
        provider_id: providerId,
        name: validationResult.data.name,
        description: validationResult.data.description || null,
        is_paid: validationResult.data.is_paid ?? false,
        is_active: validationResult.data.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to create time off type");
  }
}

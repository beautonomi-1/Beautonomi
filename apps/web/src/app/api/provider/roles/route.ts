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
  permissions: z.record(z.string(), z.boolean()).optional(),
  is_active: z.boolean().optional(),
});

const _updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/roles
 * Get all roles for provider
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
      .from("provider_roles")
      .select("*")
      .eq("provider_id", providerId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    // Parse permissions JSON if it's a string
    const roles = (data || []).map((role: any) => ({
      ...role,
      permissions:
        role.permissions && typeof role.permissions === "string"
          ? JSON.parse(role.permissions)
          : role.permissions || {},
    }));

    return successResponse(roles);
  } catch (error) {
    return handleApiError(error, "Failed to load roles");
  }
}

/**
 * POST /api/provider/roles
 * Create a new role
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
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
      .from("provider_roles")
      .insert({
        provider_id: providerId,
        name: validationResult.data.name,
        description: validationResult.data.description || null,
        permissions: validationResult.data.permissions || {},
        is_active: validationResult.data.is_active ?? true,
      })
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
    return handleApiError(error, "Failed to create role");
  }
}

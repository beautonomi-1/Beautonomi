import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import { getPlatformSalesDefaults } from "@/lib/platform-sales-settings";

const patchSchema = z.object({
  upselling_enabled: z.boolean(),
});

/**
 * GET /api/provider/settings/sales/upselling
 * Get upselling settings
 * Uses platform defaults if provider hasn't set a custom value.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    // Get platform defaults
    const platformDefaults = await getPlatformSalesDefaults();

    if (!providerId) {
      return successResponse({
        enabled: platformDefaults.upselling_enabled ?? false,
        isUsingPlatformDefault: true,
      });
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select("upselling_enabled")
      .eq("id", providerId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    const providerEnabled = provider?.upselling_enabled;
    const isUsingPlatformDefault = providerEnabled === null || providerEnabled === undefined;
    const enabled = isUsingPlatformDefault 
      ? (platformDefaults.upselling_enabled ?? false)
      : providerEnabled;

    return successResponse({
      enabled: enabled ?? false,
      isUsingPlatformDefault,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load upselling settings");
  }
}

/**
 * PATCH /api/provider/settings/sales/upselling
 * Update upselling settings
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const body = patchSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("providers")
      .update({
        upselling_enabled: body.upselling_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", providerId)
      .select("upselling_enabled")
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      enabled: data?.upselling_enabled ?? false,
      isUsingPlatformDefault: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request data", "VALIDATION_ERROR", 400, error.issues);
    }
    return handleApiError(error, "Failed to update upselling settings");
  }
}

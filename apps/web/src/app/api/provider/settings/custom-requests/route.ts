import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const patchSchema = z.object({
  acceptsCustomRequests: z.boolean(),
});

/**
 * GET /api/provider/settings/custom-requests
 * Whether this provider accepts inbound custom service requests from customers.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider not found", "NOT_FOUND", 404);
    }

    const { data: row, error } = await supabase
      .from("providers")
      .select("accepts_custom_requests")
      .eq("id", providerId)
      .single();

    if (error) throw error;

    const raw = (row as { accepts_custom_requests?: boolean | null } | null)?.accepts_custom_requests;
    const acceptsCustomRequests = raw !== false;

    return successResponse({ acceptsCustomRequests });
  } catch (error) {
    return handleApiError(error, "Failed to load custom request settings");
  }
}

/**
 * PATCH /api/provider/settings/custom-requests
 */
export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider not found", "NOT_FOUND", 404);
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return handleApiError(new Error("Invalid body"), "Validation failed", "VALIDATION_ERROR", 400);
    }

    const { error } = await supabase
      .from("providers")
      .update({ accepts_custom_requests: parsed.data.acceptsCustomRequests })
      .eq("id", providerId);

    if (error) throw error;

    return successResponse({ acceptsCustomRequests: parsed.data.acceptsCustomRequests });
  } catch (error) {
    return handleApiError(error, "Failed to update custom request settings");
  }
}

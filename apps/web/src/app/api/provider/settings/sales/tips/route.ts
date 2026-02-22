import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

const patchSchema = z.object({
  tips_enabled: z.boolean(),
});

/**
 * GET/PATCH /api/provider/settings/sales/tips
 * Provider tip configuration (stored on providers.tips_enabled).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return successResponse({ tips_enabled: true });

    const { data, error } = await supabase
      .from("providers")
      .select("tips_enabled")
      .eq("id", providerId)
      .single();
    if (error) throw error;
    return successResponse({ tips_enabled: Boolean((data as any)?.tips_enabled ?? true) });
  } catch (error) {
    return handleApiError(error, "Failed to load tip settings");
  }
}

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
    if (!providerId) throw new Error("Provider profile not found");

    const body = patchSchema.parse(await request.json());

    const { data, error } = await (supabase.from("providers") as any)
      .update({ tips_enabled: body.tips_enabled, updated_at: new Date().toISOString() })
      .eq("id", providerId)
      .select("tips_enabled")
      .single();
    if (error) throw error;

    return successResponse({ tips_enabled: Boolean((data as any)?.tips_enabled ?? true) });
  } catch (error) {
    return handleApiError(error, "Failed to update tip settings");
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/account-status
 * 
 * Get current user's account status (suspended, deactivated, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    if (!user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getSupabaseServer(request);

    // Check if user is deactivated
    const { data: userData } = await supabase
      .from("users")
      .select("deactivated_at, deactivated_by, role")
      .eq("id", user.id)
      .single();

    if (userData?.deactivated_at) {
      return successResponse({
        is_deactivated: true,
        deactivated_at: userData.deactivated_at,
        deactivated_by: userData.deactivated_by || null,
      });
    }

    // Provider suspension is on providers.status (org-wide). Resolve provider id for both
    // owners (providers.user_id) and staff (provider_staff.user_id → provider_id).
    if (userData?.role === "provider_owner" || userData?.role === "provider_staff") {
      const providerId = await getProviderIdForUser(user.id, supabase);
      if (providerId) {
        const { data: provider } = await supabase
          .from("providers")
          .select("id, status, status_reason, updated_at")
          .eq("id", providerId)
          .maybeSingle();

        if (provider && provider.status === "suspended") {
          return successResponse({
            is_suspended: true,
            suspension_reason:
              provider.status_reason ||
              "Your account has been suspended. Please contact support for more information.",
            suspended_at: provider.updated_at,
            provider_id: provider.id,
          });
        }
      }
    }

    return successResponse({
      is_suspended: false,
      is_deactivated: false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get account status");
  }
}

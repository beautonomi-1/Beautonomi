import { NextRequest } from "next/server";
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
 * Get current user's account status (suspended, deactivated, pending deletion, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    if (!user) {
      return Response.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getSupabaseServer(request);

    const { data: userData } = await supabase
      .from("users")
      .select(
        "deactivated_at, deactivated_by, role, account_deletion_purge_after_at, account_deletion_requested_at",
      )
      .eq("id", user.id)
      .single();

    const isPendingDeletion = userData?.deactivated_by === "pending_deletion";

    if (userData?.deactivated_at) {
      return successResponse({
        is_deactivated: true,
        deactivated_at: userData.deactivated_at,
        deactivated_by: userData.deactivated_by || null,
        is_pending_deletion: isPendingDeletion,
        purge_after_at: isPendingDeletion
          ? (userData.account_deletion_purge_after_at as string | null)
          : null,
        account_deletion_requested_at: userData.account_deletion_requested_at ?? null,
      });
    }

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
      is_pending_deletion: false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get account status");
  }
}

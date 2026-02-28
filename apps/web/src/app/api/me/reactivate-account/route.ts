import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/reactivate-account
 *
 * Reactivate the current user's account if they self-deactivated (deactivated_by = 'user').
 * Does nothing if deactivated by admin (must contact support).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer();

    const { data: row } = await supabase
      .from("users")
      .select("deactivated_at, deactivated_by")
      .eq("id", user.id)
      .single();

    if (!row?.deactivated_at) {
      return successResponse({ reactivated: false, message: "Account is not deactivated" });
    }

    if (row.deactivated_by !== "user") {
      return successResponse({
        reactivated: false,
        message: "Account was deactivated by support. Contact support to reactivate.",
      });
    }

    const { error } = await supabase
      .from("users")
      .update({
        deactivated_at: null,
        deactivation_reason: null,
        deactivated_by: null,
        is_active: true,
      })
      .eq("id", user.id);

    if (error) throw error;

    return successResponse({ reactivated: true, message: "Account reactivated" });
  } catch (error) {
    return handleApiError(error, "Failed to reactivate account");
  }
}

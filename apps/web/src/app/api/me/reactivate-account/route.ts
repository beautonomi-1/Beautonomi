import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/reactivate-account
 *
 * Reactivate if deactivated_by is 'user' (self-service) or 'inactive_retention' (lapsed inactivity policy).
 * Admin-deactivated accounts must contact support.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const { data: row } = await supabase
      .from("users")
      .select("deactivated_at, deactivated_by")
      .eq("id", user.id)
      .single();

    if (!row?.deactivated_at) {
      return successResponse({ reactivated: false, message: "Account is not deactivated" });
    }

    const selfServe =
      row.deactivated_by === "user" || row.deactivated_by === "inactive_retention";
    if (!selfServe) {
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

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/membership/cancel
 *
 * Cancel the current user's active membership (sets status to cancelled, auto_renew to false).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer();

    const { data: active, error: findError } = await supabase
      .from("customer_memberships")
      .select("id")
      .eq("customer_id", user.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError || !active) {
      return successResponse({ cancelled: false, message: "No active membership found" });
    }

    const { error: updateError } = await supabase
      .from("customer_memberships")
      .update({
        status: "cancelled",
        auto_renew: false,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id)
      .eq("customer_id", user.id);

    if (updateError) {
      return handleApiError(updateError, "Failed to cancel membership");
    }

    return successResponse({ cancelled: true });
  } catch (error) {
    return handleApiError(error, "Failed to cancel membership");
  }
}

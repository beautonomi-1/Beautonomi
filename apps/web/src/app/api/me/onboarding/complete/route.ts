import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/onboarding/complete
 *
 * Marks the customer onboarding wizard as complete by setting
 * users.customer_onboarding_completed_at. Idempotent — calling it
 * a second time is harmless (timestamp stays as originally set).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer"], request);
    const supabase = await getSupabaseServer(request);

    const { data: existing } = await supabase
      .from("users")
      .select("customer_onboarding_completed_at")
      .eq("id", user.id)
      .single();

    // Only set if not already set (idempotent)
    if (!existing?.customer_onboarding_completed_at) {
      const { error } = await supabase
        .from("users")
        .update({ customer_onboarding_completed_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
    }

    return successResponse({ completed: true });
  } catch (error) {
    return handleApiError(error, "Failed to mark onboarding complete");
  }
}

/**
 * GET /api/me/onboarding/complete
 *
 * Returns whether onboarding has been completed. Used by guards on
 * page load to skip the flow if already done.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer"], request);
    const supabase = await getSupabaseServer(request);

    const { data } = await supabase
      .from("users")
      .select("customer_onboarding_completed_at")
      .eq("id", user.id)
      .single();

    return successResponse({
      completed: !!data?.customer_onboarding_completed_at,
      completed_at: data?.customer_onboarding_completed_at ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check onboarding status");
  }
}

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { bootstrapPreferredHomeTenantForAuthedUser } from "@/lib/tenant/assign-preferred-home-tenant-from-host";

/**
 * POST /api/me/onboarding/complete
 *
 * Marks the customer onboarding wizard as complete by setting
 * users.customer_onboarding_completed_at. Idempotent — calling it
 * a second time is harmless (timestamp stays as originally set).
 *
 * §Graceful cross-role entry (2026-04-17): the customer app now lets
 * provider-role users in (they may want to book services). The customer
 * onboarding wizard doesn't apply to them, so we treat non-customer roles
 * as "already complete" and short-circuit — the gate advances and the user
 * lands on the home feed without being pushed through an address wizard.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      [
        "customer",
        "provider_onboarding",
        "provider_owner",
        "provider_staff",
        "superadmin",
      ],
      request,
    );

    await bootstrapPreferredHomeTenantForAuthedUser(user.id, request);

    if (user.role !== "customer") {
      return successResponse({ completed: true, portal: user.role });
    }

    const supabase = await getSupabaseServer(request);

    const { data: existing } = await supabase
      .from("users")
      .select("customer_onboarding_completed_at")
      .eq("id", user.id)
      .single();

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
    const { user } = await requireRoleInApi(
      [
        "customer",
        "provider_onboarding",
        "provider_owner",
        "provider_staff",
        "superadmin",
      ],
      request,
    );

    await bootstrapPreferredHomeTenantForAuthedUser(user.id, request);

    if (user.role !== "customer") {
      // §Graceful cross-role entry (2026-04-17): a non-customer user (provider
      // or onboarding) is now welcome in the customer app. The customer
      // onboarding wizard (addresses / preferences) does not apply to them —
      // report "completed" so the root gate advances straight to home.
      return successResponse({ completed: true, completed_at: null, portal: user.role });
    }

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

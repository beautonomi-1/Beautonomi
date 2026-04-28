import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

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
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json().catch(() => ({}));
    const providerMembershipId =
      typeof body?.provider_membership_id === "string" ? body.provider_membership_id : null;

    if (providerMembershipId) {
      const { data: activeSalon, error: salonFindError } = await (supabase
        .from("user_memberships") as any)
        .select("id, user_id, provider:providers(id, tenant_id)")
        .eq("id", providerMembershipId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      const provider = Array.isArray(activeSalon?.provider)
        ? activeSalon?.provider[0]
        : activeSalon?.provider;
      if (salonFindError || !activeSalon || provider?.tenant_id !== tenantId) {
        return successResponse({ cancelled: false, message: "No active salon membership found" });
      }

      const { error: salonUpdateError } = await (supabase.from("user_memberships") as any)
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", providerMembershipId)
        .eq("user_id", user.id);

      if (salonUpdateError) {
        return handleApiError(salonUpdateError, "Failed to cancel salon membership");
      }

      return successResponse({ cancelled: true, type: "salon" });
    }

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

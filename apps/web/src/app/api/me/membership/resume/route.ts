import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * POST /api/me/membership/resume
 * Resume a paused membership (restores active status; does not re-enable auto-renew).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json().catch(() => ({}));
    const membershipId =
      typeof body?.provider_membership_id === "string" ? body.provider_membership_id : null;
    if (!membershipId) {
      return errorResponse("provider_membership_id is required", "VALIDATION_ERROR", 400);
    }

    const { data: membership, error: findErr } = await supabase
      .from("user_memberships")
      .select("id, expires_at, provider:providers(id, tenant_id)")
      .eq("id", membershipId)
      .eq("user_id", user.id)
      .eq("status", "paused")
      .maybeSingle();

    if (findErr) throw findErr;
    const provider = Array.isArray((membership as { provider?: unknown })?.provider)
      ? (membership as { provider?: Array<{ tenant_id?: string }> }).provider?.[0]
      : (membership as { provider?: { tenant_id?: string } | null })?.provider;

    if (!membership || provider?.tenant_id !== tenantId) {
      return successResponse({ resumed: false, message: "No paused membership found" });
    }

    const expiresAt = (membership as { expires_at?: string | null }).expires_at;
    const termEnded = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
    const nowIso = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("user_memberships")
      .update({
        status: termEnded ? "expired" : "active",
        paused_until: null,
        updated_at: nowIso,
      })
      .eq("id", membershipId)
      .eq("user_id", user.id);

    if (updateErr) return handleApiError(updateErr, "Failed to resume membership");

    return successResponse({ resumed: !termEnded, status: termEnded ? "expired" : "active" });
  } catch (err) {
    return handleApiError(err, "Failed to resume membership");
  }
}

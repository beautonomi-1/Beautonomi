import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";

/**
 * GET /api/admin/users/[id]/security
 * Summary of MFA, trusted devices, and recent security events for admin user detail.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();

    const accessible = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, id);
    if (!accessible) {
      return handleApiError(new Error("User not found"), "User not found");
    }

    const [{ data: state }, { count: trustedDeviceCount }, { data: recentEvents }] = await Promise.all([
      admin.from("user_security_state").select("*").eq("user_id", id).maybeSingle(),
      admin
        .from("user_trusted_devices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", id)
        .is("revoked_at", null),
      admin
        .from("user_security_events")
        .select("id, event_type, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    let mfaFactors: Array<{ id: string; factor_type: string; status: string }> = [];
    try {
      const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: id });
      mfaFactors =
        factors?.factors?.map((f) => ({
          id: f.id,
          factor_type: f.factor_type,
          status: f.status,
        })) ?? [];
    } catch {
      mfaFactors = [];
    }

    return successResponse({
      user_id: id,
      has_verified_totp: Boolean(state?.has_verified_totp),
      totp_factor_count: state?.totp_factor_count ?? 0,
      trusted_device_count: trustedDeviceCount ?? 0,
      mfa_factors: mfaFactors,
      recent_events: recentEvents ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load user security summary");
  }
}

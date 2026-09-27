import { requireAdminSection, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function requireBrandDeskAccess(request: Request) {
  const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  if (scope === "global" && String(user.role).toLowerCase() !== "superadmin") {
    throw new Error("Pick a market");
  }
  if (scope === "global") {
    return { user, tenantId: null as string | null, globalScope: true };
  }

  const tenantId = await resolveAdminApiTenantId(request);
  const role = String(user.role ?? "").toLowerCase();
  if (role !== "superadmin") {
    const admin = getSupabaseAdmin();
    const { data: membership } = await admin
      .from("user_tenant_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership) {
      throw Object.assign(new Error("No access to this market"), { statusCode: 403 });
    }
  }

  const enabled = await isBrandDeskEnabledForTenant(tenantId, role === "superadmin");
  if (!enabled) {
    throw Object.assign(new Error("Brand desk is off in this market"), { statusCode: 403 });
  }

  return { user, tenantId, globalScope: false };
}

async function isBrandDeskEnabledForTenant(tenantId: string, isSuperadmin: boolean): Promise<boolean> {
  if (isSuperadmin) return true;
  const admin = getSupabaseAdmin();
  const { data } = await admin.rpc("is_feature_enabled", {
    feature_key_param: "brand_desk",
    tenant_id_param: tenantId,
  });
  return Boolean(data);
}

export function brandAccessErrorResponse(err: unknown) {
  if (err instanceof Error) {
    const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
    if (err.message === "Pick a market") {
      return errorResponse("Pick a market to view brand desk data.", "TENANT_REQUIRED", 400);
    }
    if (status === 403) {
      return errorResponse(err.message, "FORBIDDEN", 403);
    }
  }
  return null;
}

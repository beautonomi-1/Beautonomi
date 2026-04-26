import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/provider-subscriptions
 * Get provider subscriptions (admin finance).
 * - Superadmin: all tenants by default; optional `tenant_id` filters to that tenant's providers.
 * - Other admin roles: restricted to providers whose `tenant_id` matches the current admin host tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");
    const status = searchParams.get("status");
    const tenantFilterParam = searchParams.get("tenant_id");

    const role = String(user.role ?? "").toLowerCase();
    const isSuperadmin = role === "superadmin";
    const isPlatformConfig = role === "admin_platform_config";
    const canSeeAllTenants = isSuperadmin || isPlatformConfig;
    const currentHostTenantId = await resolveAdminApiTenantId(request);

    let query = supabase
      .from("provider_subscriptions")
      .select(
        `
        *,
        providers!inner(
          id,
          business_name,
          slug,
          status,
          tenant_id
        ),
        subscription_plans:plan_id (
          id,
          name,
          price_monthly,
          price_yearly
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (!canSeeAllTenants) {
      query = query.eq("providers.tenant_id", currentHostTenantId);
    } else if (tenantFilterParam) {
      query = query.eq("providers.tenant_id", tenantFilterParam);
    }

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      return handleApiError(error, "Failed to fetch provider subscriptions");
    }

    return successResponse({
      subscriptions: subscriptions || [],
      meta: {
        scope: canSeeAllTenants ? (tenantFilterParam ? "tenant_filter" : "all_tenants") : "current_host_tenant",
        tenant_id: canSeeAllTenants ? tenantFilterParam ?? null : currentHostTenantId,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider subscriptions");
  }
}

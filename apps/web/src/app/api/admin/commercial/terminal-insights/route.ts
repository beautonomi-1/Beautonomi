/**
 * GET /api/admin/commercial/terminal-insights
 *
 * Returns paginated, filterable provider terminal profile data for
 * Superadmin Commercial Operations → Terminal Insights.
 *
 * Query params:
 *   page, per_page, terminal_ownership_status, terminal_provider,
 *   interested_in_platform_terminal, has_payment_terminal, search
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);

    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, parseInt(searchParams.get("per_page") || "25", 10));
    const offset = (page - 1) * perPage;

    const ownershipFilter = searchParams.get("terminal_ownership_status");
    const providerFilter = searchParams.get("terminal_provider");
    const interestFilter = searchParams.get("interested_in_platform_terminal");
    const hasTerminalFilter = searchParams.get("has_payment_terminal");
    const search = searchParams.get("search");

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("provider_payment_terminal_profile")
      .select(
        `
        id,
        provider_id,
        has_payment_terminal,
        terminal_ownership_status,
        terminal_provider,
        terminal_provider_other,
        terminal_count_range,
        terminal_active_usage_status,
        interested_in_platform_terminal,
        interested_in_terminal_subscription,
        source,
        captured_at,
        updated_at,
        providers!inner(
          id,
          business_name,
          slug,
          status,
          tenant_id,
          provider_subscriptions(plan_id, status, subscription_plans(name, slug))
        )
        `,
        { count: "exact" },
      )
      .eq("providers.tenant_id", tenantId)
      .range(offset, offset + perPage - 1)
      .order("updated_at", { ascending: false });

    if (ownershipFilter) {
      query = query.eq("terminal_ownership_status", ownershipFilter);
    }
    if (providerFilter) {
      query = query.eq("terminal_provider", providerFilter);
    }
    if (interestFilter) {
      query = query.eq("interested_in_platform_terminal", interestFilter);
    }
    if (hasTerminalFilter !== null) {
      query = query.eq("has_payment_terminal", hasTerminalFilter === "true");
    }
    if (search) {
      query = query.ilike("providers.business_name", `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      return errorResponse("Failed to load terminal insights", "LOAD_ERROR", 500, error);
    }

    return successResponse({
      items: data ?? [],
      total: count ?? 0,
      page,
      per_page: perPage,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal insights");
  }
}

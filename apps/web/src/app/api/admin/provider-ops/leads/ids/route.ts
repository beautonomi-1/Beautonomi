import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  applyProviderLeadListFilters,
  parseLeadListFilters,
  resolveLeadListFilterContext,
} from "@/lib/provider-ops/lead-list-filters";

const MAX_IDS = 500;

/**
 * GET /api/admin/provider-ops/leads/ids
 * Returns lead ids matching the same filters as the list endpoint (for select-all bulk).
 */
export async function GET(request: NextRequest) {
  try {
    await requireProviderOpsSales(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const params = parseLeadListFilters(searchParams);
    const { categoryLeadIds, slaBreachedLeadIds } = await resolveLeadListFilterContext(
      supabase,
      tenantId,
      params,
    );

    let countQuery = supabase
      .from("provider_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    countQuery = applyProviderLeadListFilters(
      countQuery,
      params,
      categoryLeadIds,
      slaBreachedLeadIds,
    );
    const { count, error: countErr } = await countQuery;
    if (countErr) throw countErr;
    const total = count ?? 0;

    let idQuery = supabase
      .from("provider_leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(MAX_IDS);
    idQuery = applyProviderLeadListFilters(idQuery, params, categoryLeadIds, slaBreachedLeadIds);
    const { data, error } = await idQuery;
    if (error) throw error;

    const ids = (data ?? []).map((r: { id: string }) => r.id);
    return successResponse({
      ids,
      total,
      capped: total > MAX_IDS,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch lead ids");
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSlaBreachedLeadIds } from "@/lib/provider-ops/lead-sla";
import {
  applyActiveLeadFilter,
  applyAssignedToFilter,
  applyContactFilter,
  escapeLike,
  parseCategoryIds,
  parseContactFilter,
  parseDeletedFilter,
  type LeadContactFilter,
} from "@/lib/provider-ops/lead-query-filters";

export const EMPTY_LEAD_FILTER_SENTINEL = "00000000-0000-0000-0000-000000000000";

export type LeadListFilterParams = {
  stage: string | null;
  source: string | null;
  search: string | null;
  assignedTo: string | null;
  country: string | null;
  province: string | null;
  categoryIds: string[];
  deletedMode: "active" | "deleted" | "all";
  contactFilter: LeadContactFilter;
  slaBreached: boolean;
};

export function parseLeadListFilters(searchParams: URLSearchParams): LeadListFilterParams {
  return {
    stage: searchParams.get("stage"),
    source: searchParams.get("source"),
    search: searchParams.get("search")?.trim() || null,
    assignedTo: searchParams.get("assigned_to"),
    country: searchParams.get("country"),
    province: searchParams.get("province")?.trim() || null,
    categoryIds: parseCategoryIds(searchParams),
    deletedMode: parseDeletedFilter(searchParams),
    contactFilter: parseContactFilter(searchParams),
    slaBreached: searchParams.get("sla_breached") === "1",
  };
}

export async function resolveCategoryLeadIds(
  supabase: SupabaseClient,
  categoryIds: string[],
): Promise<string[] | null> {
  if (categoryIds.length === 0) return null;
  const { data: catRows } = await supabase
    .from("provider_lead_categories")
    .select("lead_id")
    .in("global_category_id", categoryIds);
  const ids = [...new Set((catRows ?? []).map((r: { lead_id: string }) => r.lead_id))];
  if (ids.length === 0) return [EMPTY_LEAD_FILTER_SENTINEL];
  return ids;
}

export async function resolveSlaBreachedLeadIdsForFilter(
  supabase: SupabaseClient,
  tenantId: string,
  slaBreached: boolean,
): Promise<string[] | null> {
  if (!slaBreached) return null;
  const ids = await fetchSlaBreachedLeadIds(supabase, tenantId);
  if (ids.length === 0) return [EMPTY_LEAD_FILTER_SENTINEL];
  return ids;
}

export type ApplyLeadListFiltersOptions = {
  /** When true, ignore stage tab (used for stage_counts while a stage filter is active). */
  omitStage?: boolean;
};

/** Apply list/export/count filters to a provider_leads PostgREST query builder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyProviderLeadListFilters(
  query: any,
  params: LeadListFilterParams,
  categoryLeadIds: string[] | null,
  slaBreachedLeadIds: string[] | null,
  options?: ApplyLeadListFiltersOptions,
): any {
  let q = applyActiveLeadFilter(query, params.deletedMode);

  if (!options?.omitStage && params.stage && params.stage !== "all") {
    q = q.eq("commercial_stage", params.stage);
  }
  if (params.source && params.source !== "all") {
    q = q.eq("source", params.source);
  }
  q = applyAssignedToFilter(q, params.assignedTo);
  if (params.country) {
    q = q.eq("country", params.country);
  }
  if (params.categoryIds.length > 0 && categoryLeadIds) {
    q = q.in("id", categoryLeadIds);
  }
  if (params.province) {
    const safeProvince = escapeLike(params.province);
    q = q.or(
      `resolved_location->>province.ilike.%${safeProvince}%,resolved_location->>state.ilike.%${safeProvince}%,resolved_location->>region.ilike.%${safeProvince}%,suggested_location_text.ilike.%${safeProvince}%`,
    );
  }
  if (params.search) {
    const safe = escapeLike(params.search);
    q = q.or(
      `business_name.ilike.%${safe}%,contact_person_name.ilike.%${safe}%,email.ilike.%${safe}%,phone_e164.ilike.%${safe}%`,
    );
  }
  q = applyContactFilter(q, params.contactFilter);
  if (slaBreachedLeadIds) {
    q = q.in("id", slaBreachedLeadIds);
  }
  return q;
}

export async function resolveLeadListFilterContext(
  supabase: SupabaseClient,
  tenantId: string,
  params: LeadListFilterParams,
): Promise<{ categoryLeadIds: string[] | null; slaBreachedLeadIds: string[] | null }> {
  const [categoryLeadIds, slaBreachedLeadIds] = await Promise.all([
    resolveCategoryLeadIds(supabase, params.categoryIds),
    resolveSlaBreachedLeadIdsForFilter(supabase, tenantId, params.slaBreached),
  ]);
  return { categoryLeadIds, slaBreachedLeadIds };
}

import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  errorResponse,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { slackNotifyLeadCreated } from "@/lib/integrations/slack/lead-triggers";
import { ensureProviderOpsCase, syncLeadOwnerFromSalesCase } from "@/lib/provider-ops/ops-case";
import { emitHighValueLeadSlackIfNeeded } from "@/lib/provider-ops/lead-sla";
import { LEADS_ASSIGNED_USER_EMBED } from "@/lib/provider-ops/lead-query-filters";
import {
  applyProviderLeadListFilters,
  parseLeadListFilters,
  resolveLeadListFilterContext,
} from "@/lib/provider-ops/lead-list-filters";
import { PROVIDER_LEAD_PIPELINE_STAGES } from "@/lib/provider-ops/lead-pipeline-stages";

const VALID_STAGES = PROVIDER_LEAD_PIPELINE_STAGES;

const VALID_SOURCES = [
  "manual",
  "import",
  "referral",
  "campaign",
  "outbound",
  "api",
  "form",
] as const;

function coerceRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** PostgREST embed for `provider_leads.assigned_to` → `users`. */
const LEADS_LIST_SELECT = `
        *,
        ${LEADS_ASSIGNED_USER_EMBED},
        provider_lead_categories (
          global_category_id,
          global_service_categories:global_category_id (id, name, slug, icon)
        )
      `;

function getProvinceFromLeadRow(row: {
  resolved_location?: unknown;
  suggested_location_text?: string | null;
}): string | null {
  const resolved = coerceRecord(row.resolved_location);
  const candidates = [
    resolved?.province,
    resolved?.state,
    resolved?.region,
    resolved?.administrative_area_level_1,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  const text = typeof row.suggested_location_text === "string" ? row.suggested_location_text.trim() : "";
  if (!text) return null;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 2] || null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireProviderOpsSales(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);

    const listFilters = parseLeadListFilters(searchParams);
    const { categoryLeadIds, slaBreachedLeadIds } = await resolveLeadListFilterContext(
      supabase,
      tenantId,
      listFilters,
    );
    // Typed as any after the base builder to avoid TS2589 on deep PostgREST generics.
    let query: any = supabase
      .from("provider_leads")
      .select(LEADS_LIST_SELECT, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    query = applyProviderLeadListFilters(
      query,
      listFilters,
      categoryLeadIds,
      slaBreachedLeadIds,
    );

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    const total = count || 0;

    // Fetch accurate stage counts using individual head:true count queries (avoids PostgREST row limit)
    const buildBaseCountQuery = () => {
      let q: any = supabase
        .from("provider_leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      return applyProviderLeadListFilters(
        q,
        listFilters,
        categoryLeadIds,
        slaBreachedLeadIds,
        { omitStage: true },
      );
    };

    const countResults = await Promise.all(
      VALID_STAGES.map(async (s) => {
        const { count: c } = await buildBaseCountQuery().eq("commercial_stage", s);
        return [s, c ?? 0] as const;
      })
    );
    const stageCounts: Record<string, number> = {};
    let allCount = 0;
    for (const [s, c] of countResults) {
      stageCounts[s] = c;
      allCount += c;
    }
    stageCounts.all = allCount;

    // Facet counts use the same filters as the list (incl. SLA, country, province, categories, contact).
    let optionsQuery = supabase
      .from("provider_leads")
      .select("id,country,suggested_location_text,resolved_location,assigned_to")
      .eq("tenant_id", tenantId);
    optionsQuery = applyProviderLeadListFilters(
      optionsQuery,
      listFilters,
      categoryLeadIds,
      slaBreachedLeadIds,
    );
    optionsQuery = optionsQuery.limit(5000);
    const { data: optionLeadRows } = await optionsQuery;
    const optionRows = (optionLeadRows ?? []) as Array<{
      id: string;
      country?: string | null;
      suggested_location_text?: string | null;
      resolved_location?: unknown;
      assigned_to?: string | null;
    }>;
    const countryCounts = new Map<string, number>();
    const provinceCounts = new Map<string, { count: number; country: string | null }>();
    for (const row of optionRows) {
      const countryValue = typeof row.country === "string" ? row.country.trim() : "";
      if (countryValue) {
        countryCounts.set(countryValue, (countryCounts.get(countryValue) ?? 0) + 1);
      }
      const provinceValue = getProvinceFromLeadRow(row);
      if (provinceValue) {
        const prev = provinceCounts.get(provinceValue);
        provinceCounts.set(provinceValue, {
          count: (prev?.count ?? 0) + 1,
          country: countryValue || prev?.country || null,
        });
      }
    }

    const leadIdsForOptions = optionRows.map((row) => row.id).filter(Boolean);
    const categoryCounts = new Map<string, { id: string; name: string; slug?: string | null; icon?: string | null; count: number; seen: Set<string> }>();
    const { data: globalCategories } = await supabase
      .from("global_service_categories")
      .select("id, name, slug, icon, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    for (const cat of (globalCategories ?? []) as Array<{
      id?: string;
      name?: string;
      slug?: string | null;
      icon?: string | null;
    }>) {
      if (!cat.id || !cat.name) continue;
      categoryCounts.set(cat.id, {
        id: cat.id,
        name: cat.name,
        slug: cat.slug ?? null,
        icon: cat.icon ?? null,
        count: 0,
        seen: new Set(),
      });
    }
    if (leadIdsForOptions.length > 0) {
      const { data: categoryRows } = await supabase
        .from("provider_lead_categories")
        .select("lead_id, global_category_id, global_service_categories:global_category_id(id,name,slug,icon)")
        .in("lead_id", leadIdsForOptions);
      for (const row of (categoryRows ?? []) as Array<{
        lead_id?: string;
        global_category_id?: string;
        global_service_categories?: { id?: string; name?: string; slug?: string | null; icon?: string | null } | null;
      }>) {
        const leadId = typeof row.lead_id === "string" ? row.lead_id : "";
        const categoryIdValue =
          typeof row.global_category_id === "string"
            ? row.global_category_id
            : typeof row.global_service_categories?.id === "string"
              ? row.global_service_categories.id
              : "";
        const categoryName = typeof row.global_service_categories?.name === "string"
          ? row.global_service_categories.name
          : "";
        if (!leadId || !categoryIdValue || !categoryName) continue;
        const existing = categoryCounts.get(categoryIdValue);
        if (!existing) {
          categoryCounts.set(categoryIdValue, {
            id: categoryIdValue,
            name: categoryName,
            slug: row.global_service_categories?.slug ?? null,
            icon: row.global_service_categories?.icon ?? null,
            count: 1,
            seen: new Set([leadId]),
          });
          continue;
        }
        if (!existing.seen.has(leadId)) {
          existing.seen.add(leadId);
          existing.count += 1;
        }
      }
    }

    const assigneeIdCounts = new Map<string, number>();
    for (const row of optionRows) {
      const aid = typeof row.assigned_to === "string" ? row.assigned_to : "";
      if (!aid) continue;
      assigneeIdCounts.set(aid, (assigneeIdCounts.get(aid) ?? 0) + 1);
    }
    const assigneeIds = [...assigneeIdCounts.keys()];
    const assigneeLabels = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const { data: userRows } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", assigneeIds);
      for (const u of userRows ?? []) {
        const id = typeof u.id === "string" ? u.id : "";
        const name = typeof u.full_name === "string" ? u.full_name.trim() : "";
        const email = typeof u.email === "string" ? u.email.trim() : "";
        assigneeLabels.set(id, name || email || id);
      }
    }
    const assigneesFacets = [...assigneeIdCounts.entries()]
      .map(([value, count]) => ({
        value,
        label: assigneeLabels.get(value) ?? value,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const leadIds = (data ?? []).map((row) => (row as { id: string }).id);
    const overdueByLead = new Map<string, number>();
    if (leadIds.length > 0) {
      const nowIso = new Date().toISOString();
      const { data: overdueTasks } = await supabase
        .from("provider_lead_tasks")
        .select("lead_id")
        .in("lead_id", leadIds)
        .is("completed_at", null)
        .lt("due_at", nowIso);
      for (const row of overdueTasks ?? []) {
        const lid = (row as { lead_id: string }).lead_id;
        overdueByLead.set(lid, (overdueByLead.get(lid) ?? 0) + 1);
      }
    }

    const enrichedData = (data ?? []).map((row) => ({
      ...row,
      overdue_task_count: overdueByLead.get((row as { id: string }).id) ?? 0,
    }));

    return successResponse({
      data: enrichedData,
      meta: { page, limit, total, has_more: total > page * limit },
      stage_counts: stageCounts,
      filter_options: {
        countries: [...countryCounts.entries()]
          .map(([value, count]) => ({ value, label: value, count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
        provinces: [...provinceCounts.entries()]
          .map(([value, data]) => ({ value, label: value, count: data.count, country: data.country }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
        categories: [...categoryCounts.values()]
          .map(({ seen: _seen, ...rest }) => rest)
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        assignees: assigneesFacets,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch leads");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireProviderOpsSales(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    if (!body.business_name && !body.contact_person_name) {
      return errorResponse("business_name or contact_person_name is required", "VALIDATION_ERROR", 400);
    }

    const source = body.source || "manual";
    if (!VALID_SOURCES.includes(source)) {
      return errorResponse(`Invalid source: ${source}`, "VALIDATION_ERROR", 400);
    }

    const stage = body.commercial_stage || "new";
    if (!VALID_STAGES.includes(stage)) {
      return errorResponse(`Invalid stage: ${stage}`, "VALIDATION_ERROR", 400);
    }

    const leadData: Record<string, unknown> = {
      tenant_id: tenantId,
      lead_name: body.lead_name || null,
      business_name: body.business_name || null,
      contact_person_name: body.contact_person_name || null,
      email: body.email?.toLowerCase()?.trim() || null,
      phone_country_code: body.phone_country_code || null,
      phone_national: body.phone_national || null,
      phone_e164: body.phone_e164 || null,
      suggested_location_text: body.suggested_location_text || null,
      resolved_location: body.resolved_location || null,
      location_confidence: body.location_confidence || null,
      country: body.country || null,
      description: body.description || null,
      notes: body.notes || null,
      commercial_stage: stage,
      source,
      source_detail: body.source_detail || null,
      campaign_id: body.campaign_id || null,
      referrer_user_id: body.referrer_user_id || null,
      referrer_provider_id: body.referrer_provider_id || null,
      assigned_to: body.assigned_to || null,
      tags: body.tags || [],
      created_by: user.id,
    };

    if (body.onboarding_data && typeof body.onboarding_data === "object") {
      leadData.onboarding_data = body.onboarding_data;
    }

    const { data: lead, error } = await supabase
      .from("provider_leads")
      .insert(leadData)
      .select()
      .single();

    if (error) throw error;

    await ensureProviderOpsCase(supabase, {
      tenantId,
      leadId: lead.id as string,
      currentDesk: "sales",
      salesOwnerId: (lead.assigned_to as string | null) ?? null,
      dealValue: body.deal_value ?? null,
      tryAutoAssign: true,
      actorUserId: user.id,
    });

    const syncedOwner = await syncLeadOwnerFromSalesCase(supabase, tenantId, lead.id as string);
    if (syncedOwner && !lead.assigned_to) {
      (lead as { assigned_to?: string | null }).assigned_to = syncedOwner;
    }

    if (body.category_ids?.length > 0) {
      const categoryRows = body.category_ids.map((catId: string) => ({
        lead_id: lead.id,
        global_category_id: catId,
      }));
      await supabase.from("provider_lead_categories").insert(categoryRows);
    }

    await supabase.from("provider_lead_activities").insert({
      lead_id: lead.id,
      activity_type: "lead_created",
      description: `Lead created via ${source}`,
      metadata: { source, created_by_name: user.full_name || user.email },
      performed_by: user.id,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.create",
      entity_type: "provider_lead",
      entity_id: lead.id,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      metadata: { source, business_name: leadData.business_name },
      ...extractRequestMeta(request),
    });

    void slackNotifyLeadCreated(request, {
      id: lead.id as string,
      business_name: lead.business_name as string | null,
      assigned_to: lead.assigned_to as string | null,
    });

    void emitHighValueLeadSlackIfNeeded(supabase, tenantId, {
      id: lead.id as string,
      business_name: lead.business_name as string | null,
      deal_value: (lead as { deal_value?: number | null }).deal_value ?? body.deal_value ?? null,
      assigned_to: lead.assigned_to as string | null,
    });

    return successResponse(lead);
  } catch (error) {
    return handleApiError(error, "Failed to create lead");
  }
}

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const VALID_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
  "nurture",
  "matched",
] as const;

const VALID_SOURCES = [
  "manual",
  "import",
  "referral",
  "campaign",
  "outbound",
  "api",
  "form",
] as const;

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "");
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);

    const stage = searchParams.get("stage");
    const source = searchParams.get("source");
    const search = searchParams.get("search")?.trim();
    const assignedTo = searchParams.get("assigned_to");
    const country = searchParams.get("country");
    const categoryId = searchParams.get("category_id");
    const province = searchParams.get("province")?.trim();

    // Pre-resolve lead IDs for category filter (join through provider_lead_categories)
    let categoryLeadIds: string[] | null = null;
    if (categoryId) {
      const { data: catRows } = await supabase
        .from("provider_lead_categories")
        .select("lead_id")
        .eq("global_category_id", categoryId);
      categoryLeadIds = (catRows ?? []).map((r: { lead_id: string }) => r.lead_id);
      if (categoryLeadIds.length === 0) {
        return successResponse({
          data: [],
          meta: { page, limit, total: 0, has_more: false },
          stage_counts: { all: 0 },
        });
      }
    }

    let query = supabase
      .from("provider_leads")
      .select(
        `
        *,
        provider_lead_categories (
          global_category_id,
          global_service_categories:global_category_id (id, name, slug, icon)
        )
      `,
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (stage && stage !== "all") {
      query = query.eq("commercial_stage", stage);
    }
    if (source && source !== "all") {
      query = query.eq("source", source);
    }
    if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }
    if (country) {
      query = query.eq("country", country);
    }
    if (categoryId && categoryLeadIds) {
      query = query.in("id", categoryLeadIds);
    }
    if (province) {
      const safeProvince = escapeLike(province);
      query = query.or(
        `resolved_location->>province.ilike.%${safeProvince}%,resolved_location->>state.ilike.%${safeProvince}%,resolved_location->>region.ilike.%${safeProvince}%,suggested_location_text.ilike.%${safeProvince}%`
      );
    }
    if (search) {
      const safe = escapeLike(search);
      query = query.or(
        `business_name.ilike.%${safe}%,contact_person_name.ilike.%${safe}%,email.ilike.%${safe}%,phone_e164.ilike.%${safe}%`
      );
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    const total = count || 0;

    // Fetch accurate stage counts using individual head:true count queries (avoids PostgREST row limit)
    const buildBaseCountQuery = () => {
      let q = supabase
        .from("provider_leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if (source && source !== "all") q = q.eq("source", source);
      if (assignedTo) q = q.eq("assigned_to", assignedTo);
      if (country) q = q.eq("country", country);
      if (province) {
        const safeProvince = escapeLike(province);
        q = q.or(
          `resolved_location->>province.ilike.%${safeProvince}%,resolved_location->>state.ilike.%${safeProvince}%,resolved_location->>region.ilike.%${safeProvince}%,suggested_location_text.ilike.%${safeProvince}%`
        );
      }
      if (categoryId) {
        q = q.in("id", categoryLeadIds!);
      }
      if (search) {
        const safe = escapeLike(search);
        q = q.or(
          `business_name.ilike.%${safe}%,contact_person_name.ilike.%${safe}%,email.ilike.%${safe}%,phone_e164.ilike.%${safe}%`
        );
      }
      return q;
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

    // Dynamic filters for UI faceting based on current search/source/stage scope.
    // Country/province are intentionally not applied here, so operators can pivot quickly.
    let optionsQuery = supabase
      .from("provider_leads")
      .select("id,country,suggested_location_text,resolved_location")
      .eq("tenant_id", tenantId);
    if (stage && stage !== "all") optionsQuery = optionsQuery.eq("commercial_stage", stage);
    if (source && source !== "all") optionsQuery = optionsQuery.eq("source", source);
    if (assignedTo) optionsQuery = optionsQuery.eq("assigned_to", assignedTo);
    if (categoryId && categoryLeadIds) optionsQuery = optionsQuery.in("id", categoryLeadIds);
    if (search) {
      const safe = escapeLike(search);
      optionsQuery = optionsQuery.or(
        `business_name.ilike.%${safe}%,contact_person_name.ilike.%${safe}%,email.ilike.%${safe}%,phone_e164.ilike.%${safe}%`
      );
    }
    optionsQuery = optionsQuery.limit(5000);
    const { data: optionLeadRows } = await optionsQuery;
    const optionRows = (optionLeadRows ?? []) as Array<{
      id: string;
      country?: string | null;
      suggested_location_text?: string | null;
      resolved_location?: unknown;
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
    const categoryCounts = new Map<string, { id: string; name: string; count: number; seen: Set<string> }>();
    if (leadIdsForOptions.length > 0) {
      const { data: categoryRows } = await supabase
        .from("provider_lead_categories")
        .select("lead_id, global_category_id, global_service_categories:global_category_id(id,name)")
        .in("lead_id", leadIdsForOptions);
      for (const row of (categoryRows ?? []) as Array<{
        lead_id?: string;
        global_category_id?: string;
        global_service_categories?: { id?: string; name?: string } | null;
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

    return successResponse({
      data: data || [],
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
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch leads");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
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

    return successResponse(lead);
  } catch (error) {
    return handleApiError(error, "Failed to create lead");
  }
}

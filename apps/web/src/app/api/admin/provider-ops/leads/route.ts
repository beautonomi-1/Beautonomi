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
    if (search) {
      const safe = search.replace(/[%_]/g, "");
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
      if (categoryId) {
        q = q.in("id", categoryLeadIds!);
      }
      if (search) {
        const safe = search.replace(/[%_]/g, "");
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

    return successResponse({
      data: data || [],
      meta: { page, limit, total, has_more: total > page * limit },
      stage_counts: stageCounts,
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

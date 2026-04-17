import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { page, limit, offset } = getPaginationParams(request);

    const { data: lead } = await supabase
      .from("provider_leads")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!lead) return notFoundResponse("Lead not found");

    const { data, error, count } = await supabase
      .from("provider_lead_activities")
      .select("*", { count: "exact" })
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const total = count || 0;
    return successResponse({
      data: data || [],
      meta: { page, limit, total, has_more: total > page * limit },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch activities");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    if (!body.activity_type) {
      return errorResponse("activity_type is required", "VALIDATION_ERROR", 400);
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const { data: lead } = await supabase
      .from("provider_leads")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!lead) return notFoundResponse("Lead not found");

    const { data, error } = await supabase
      .from("provider_lead_activities")
      .insert({
        lead_id: id,
        activity_type: body.activity_type,
        description: body.description || null,
        metadata: body.metadata || {},
        performed_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.activity_add",
      entity_type: "provider_lead_activity",
      entity_id: data.id,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { lead_id: id, activity_type: body.activity_type },
      ...extractRequestMeta(request),
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to create activity");
  }
}

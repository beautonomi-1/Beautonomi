import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch templates");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    if (!body.name?.trim()) return errorResponse("Name is required", "VALIDATION_ERROR", 400);
    if (!body.body?.trim()) return errorResponse("Template body is required", "VALIDATION_ERROR", 400);

    const validCategories = ["cold_intro", "follow_up", "hot_lead", "pricing_info", "re_engagement", "custom"];
    const category = validCategories.includes(body.category) ? body.category : "custom";

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .insert({
        tenant_id: tenantId,
        name: body.name.trim(),
        category,
        body: body.body.trim(),
        sort_order: Number(body.sort_order) || 0,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.whatsapp.template.created",
      entity_type: "whatsapp_template",
      entity_id: data.id,
      module: "whatsapp",
      risk_level: "low",
      metadata: { name: body.name, category },
      ...extractRequestMeta(request),
    });

    return successResponse(data, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create template");
  }
}

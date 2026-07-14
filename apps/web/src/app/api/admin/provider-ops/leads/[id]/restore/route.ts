import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/admin/provider-ops/leads/[id]/restore
 * Restores a soft-deleted lead.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: lead } = await supabase
      .from("provider_leads")
      .select("id, deleted_at")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!lead) return notFoundResponse("Lead not found");
    if (!lead.deleted_at) {
      return errorResponse("Lead is not deleted", "NOT_DELETED", 400);
    }

    const { error } = await supabase
      .from("provider_leads")
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw error;

    await supabase.from("provider_lead_activities").insert({
      lead_id: id,
      activity_type: "lead_restored",
      description: "Lead restored from trash",
      metadata: { soft_delete: true },
      performed_by: user.id,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.restore",
      entity_type: "provider_lead",
      entity_id: id,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      ...extractRequestMeta(request),
    });

    return successResponse({ restored: true, id });
  } catch (error) {
    return handleApiError(error, "Failed to restore lead");
  }
}

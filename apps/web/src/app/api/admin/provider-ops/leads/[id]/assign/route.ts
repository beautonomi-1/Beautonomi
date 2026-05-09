import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { slackNotifyLeadReassigned } from "@/lib/integrations/slack/lead-triggers";
import { PROVIDER_OPS_ASSIGNABLE_ROLES } from "@/lib/provider-ops/assignable-admin-roles";

function displayNameForUser(row: { full_name?: string | null; email?: string | null }): string {
  const n = typeof row.full_name === "string" ? row.full_name.trim() : "";
  const e = typeof row.email === "string" ? row.email.trim() : "";
  return n || e || "user";
}

export async function PATCH(
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
    const tenantId = await resolveAdminApiTenantId(request);
    const { expected_updated_at } = body;

    const { data: beforeAssign } = await supabase
      .from("provider_leads")
      .select("updated_at, assigned_to, business_name")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (
      expected_updated_at != null &&
      typeof expected_updated_at === "string" &&
      beforeAssign &&
      typeof beforeAssign.updated_at === "string" &&
      beforeAssign.updated_at !== expected_updated_at
    ) {
      return errorResponse(
        "This lead was updated by another teammate. Refresh and try again.",
        "CONCURRENT_UPDATE",
        409
      );
    }

    let assignedTo: string | null =
      typeof body.assigned_to === "string" && body.assigned_to.trim() === ""
        ? null
        : typeof body.assigned_to === "string"
          ? body.assigned_to.trim()
          : body.assigned_to || null;

    let resolvedAssigneeLabel: string | null = null;
    if (assignedTo) {
      const { data: assignee, error: assigneeErr } = await supabase
        .from("users")
        .select("id, full_name, email, role, deactivated_at")
        .eq("id", assignedTo)
        .maybeSingle();
      if (assigneeErr) throw assigneeErr;
      if (
        !assignee ||
        assignee.deactivated_at != null ||
        !PROVIDER_OPS_ASSIGNABLE_ROLES.includes(assignee.role as (typeof PROVIDER_OPS_ASSIGNABLE_ROLES)[number])
      ) {
        return errorResponse("Invalid or inactive assignee for provider leads", "INVALID_ASSIGNEE", 400);
      }
      resolvedAssigneeLabel = displayNameForUser(assignee);
    }

    const activityAssigneeLabel =
      typeof body.assigned_to_name === "string" && body.assigned_to_name.trim()
        ? body.assigned_to_name.trim()
        : resolvedAssigneeLabel;

    const { error } = await supabase
      .from("provider_leads")
      .update({ assigned_to: assignedTo })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw error;

    const { error: actErr } = await supabase.from("provider_lead_activities").insert({
      lead_id: id,
      activity_type: "assignment_changed",
      description: assignedTo
        ? `Assigned to ${activityAssigneeLabel || assignedTo}`
        : "Unassigned",
      metadata: { assigned_to: assignedTo },
      performed_by: user.id,
    });
    if (actErr) throw actErr;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.assign",
      entity_type: "provider_lead",
      entity_id: id,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { assigned_to: assignedTo },
      ...extractRequestMeta(request),
    });

    void slackNotifyLeadReassigned(
      request,
      { id, business_name: beforeAssign?.business_name as string | null | undefined },
      assignedTo,
      (beforeAssign?.assigned_to as string | null) ?? null
    );

    return successResponse({ id, assigned_to: assignedTo });
  } catch (error) {
    return handleApiError(error, "Failed to assign lead");
  }
}

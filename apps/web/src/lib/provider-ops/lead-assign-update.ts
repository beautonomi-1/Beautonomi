import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { slackNotifyLeadReassigned } from "@/lib/integrations/slack/lead-triggers";
import { PROVIDER_OPS_ASSIGNABLE_ROLES } from "@/lib/provider-ops/assignable-admin-roles";

function displayNameForUser(row: { full_name?: string | null; email?: string | null }): string {
  const n = typeof row.full_name === "string" ? row.full_name.trim() : "";
  const e = typeof row.email === "string" ? row.email.trim() : "";
  return n || e || "user";
}

export type AssignLeadBody = {
  assigned_to: string | null;
  assigned_to_name?: string;
  expected_updated_at?: string;
};

export type AssignLeadResult =
  | { ok: true; id: string; assigned_to: string | null }
  | {
      ok: false;
      code: "NOT_FOUND" | "CONCURRENT_UPDATE" | "INVALID_ASSIGNEE";
      message: string;
    };

export async function assignProviderLead(
  supabase: SupabaseClient,
  tenantId: string,
  leadId: string,
  body: AssignLeadBody,
  actor: { id: string; role?: string | null },
  request?: NextRequest,
): Promise<AssignLeadResult> {
  const { data: beforeAssign } = await supabase
    .from("provider_leads")
    .select("updated_at, assigned_to, business_name")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!beforeAssign) {
    return { ok: false, code: "NOT_FOUND", message: "Lead not found" };
  }

  if (
    body.expected_updated_at != null &&
    typeof body.expected_updated_at === "string" &&
    typeof beforeAssign.updated_at === "string" &&
    beforeAssign.updated_at !== body.expected_updated_at
  ) {
    return {
      ok: false,
      code: "CONCURRENT_UPDATE",
      message: "This lead was updated by another teammate. Refresh and try again.",
    };
  }

  let assignedTo: string | null =
    typeof body.assigned_to === "string" && body.assigned_to.trim() === ""
      ? null
      : typeof body.assigned_to === "string"
        ? body.assigned_to.trim()
        : body.assigned_to ?? null;

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
      return {
        ok: false,
        code: "INVALID_ASSIGNEE",
        message: "Invalid or inactive assignee for provider leads",
      };
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
    .eq("id", leadId)
    .eq("tenant_id", tenantId);
  if (error) throw error;

  const { error: actErr } = await supabase.from("provider_lead_activities").insert({
    lead_id: leadId,
    activity_type: "assignment_changed",
    description: assignedTo
      ? `Assigned to ${activityAssigneeLabel || assignedTo}`
      : "Unassigned",
    metadata: { assigned_to: assignedTo },
    performed_by: actor.id,
  });
  if (actErr) throw actErr;

  if (request) {
    void writeAuditLog({
      actor_user_id: actor.id,
      actor_role: actor.role ?? undefined,
      action: "admin.lead.assign",
      entity_type: "provider_lead",
      entity_id: leadId,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { assigned_to: assignedTo },
      ...extractRequestMeta(request),
    });

    void slackNotifyLeadReassigned(
      request,
      { id: leadId, business_name: beforeAssign.business_name as string | null | undefined },
      assignedTo,
      (beforeAssign.assigned_to as string | null) ?? null,
    );
  }

  return { ok: true, id: leadId, assigned_to: assignedTo };
}

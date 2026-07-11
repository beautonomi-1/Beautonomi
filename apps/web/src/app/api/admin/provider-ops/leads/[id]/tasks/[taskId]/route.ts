import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id, taskId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const body = (await request.json()) as { completed?: boolean };

    const supabase = getSupabaseAdmin();

    const { data: task } = await supabase
      .from("provider_lead_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("lead_id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!task) return notFoundResponse("Task not found");

    const completed = body.completed === true;
    const { data: updated, error } = await supabase
      .from("provider_lead_tasks")
      .update({
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", taskId)
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("provider_lead_activities").insert({
      lead_id: id,
      activity_type: completed ? "task_completed" : "task_reopened",
      description: completed
        ? `Task completed: ${task.title}`
        : `Task reopened: ${task.title}`,
      metadata: { task_id: taskId },
      performed_by: user.id,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: completed ? "admin.lead.task_complete" : "admin.lead.task_reopen",
      entity_type: "provider_lead_task",
      entity_id: taskId,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { lead_id: id },
      ...extractRequestMeta(request),
    });

    return successResponse({ task: updated });
  } catch (error) {
    return handleApiError(error, "Failed to update lead task");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id, taskId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: task } = await supabase
      .from("provider_lead_tasks")
      .select("id, title")
      .eq("id", taskId)
      .eq("lead_id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!task) return notFoundResponse("Task not found");

    const { error } = await supabase
      .from("provider_lead_tasks")
      .delete()
      .eq("id", taskId);

    if (error) throw error;

    await supabase.from("provider_lead_activities").insert({
      lead_id: id,
      activity_type: "task_deleted",
      description: `Task deleted: ${task.title}`,
      metadata: { task_id: taskId },
      performed_by: user.id,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.task_delete",
      entity_type: "provider_lead_task",
      entity_id: taskId,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { lead_id: id },
      ...extractRequestMeta(request),
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete lead task");
  }
}

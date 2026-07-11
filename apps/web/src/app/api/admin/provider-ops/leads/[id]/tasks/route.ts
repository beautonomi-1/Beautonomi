import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { PROVIDER_OPS_ASSIGNABLE_ROLES } from "@/lib/provider-ops/assignable-admin-roles";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: lead } = await supabase
      .from("provider_leads")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!lead) return notFoundResponse("Lead not found");

    const { data, error } = await supabase
      .from("provider_lead_tasks")
      .select(
        `
        *,
        assignee:users!provider_lead_tasks_assigned_to_fkey(id, full_name, email)
        `,
      )
      .eq("lead_id", id)
      .eq("tenant_id", tenantId)
      .order("due_at", { ascending: true, nullsFirst: false });

    if (error) throw error;

    return successResponse({ tasks: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch lead tasks");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      due_at?: string | null;
      assigned_to?: string | null;
      task_type?: string;
    };

    const title = body.title?.trim();
    if (!title) {
      return errorResponse("title is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: lead } = await supabase
      .from("provider_leads")
      .select("id, business_name")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!lead) return notFoundResponse("Lead not found");

    if (body.assigned_to) {
      const { data: assignee } = await supabase
        .from("users")
        .select("id, role, deactivated_at")
        .eq("id", body.assigned_to)
        .maybeSingle();
      if (
        !assignee ||
        assignee.deactivated_at != null ||
        !PROVIDER_OPS_ASSIGNABLE_ROLES.includes(
          assignee.role as (typeof PROVIDER_OPS_ASSIGNABLE_ROLES)[number],
        )
      ) {
        return errorResponse("Invalid assignee", "INVALID_ASSIGNEE", 400);
      }
    }

    const { data: task, error } = await supabase
      .from("provider_lead_tasks")
      .insert({
        tenant_id: tenantId,
        lead_id: id,
        title,
        description: body.description?.trim() || null,
        due_at: body.due_at || null,
        assigned_to: body.assigned_to || null,
        task_type: body.task_type?.trim() || "follow_up",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("provider_lead_activities").insert({
      lead_id: id,
      activity_type: "task_created",
      description: `Follow-up task created: ${title}`,
      metadata: { task_id: task.id, due_at: body.due_at ?? null },
      performed_by: user.id,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.task_create",
      entity_type: "provider_lead_task",
      entity_id: task.id,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { lead_id: id, title },
      ...extractRequestMeta(request),
    });

    return successResponse({ task });
  } catch (error) {
    return handleApiError(error, "Failed to create lead task");
  }
}

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  TERMINAL_UPSELL_PIPELINE_STATUSES,
  type TerminalUpsellPipelineStatus,
} from "@/lib/terminal/terminal-upsell-segment";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const body = (await request.json()) as {
      status?: string;
      assigned_to?: string | null;
      notes?: string | null;
      lost_reason?: string | null;
      note?: string;
    };

    const supabase = getSupabaseAdmin();

    const { data: before } = await supabase
      .from("terminal_upsell_leads")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!before) return notFoundResponse("Upsell lead not found");

    const updates: Record<string, unknown> = {};

    if (body.status != null) {
      if (
        !(TERMINAL_UPSELL_PIPELINE_STATUSES as readonly string[]).includes(body.status)
      ) {
        return errorResponse("Invalid pipeline status", "VALIDATION_ERROR", 400);
      }
      updates.status = body.status as TerminalUpsellPipelineStatus;
      if (body.status === "lost" && body.lost_reason) {
        updates.lost_reason = body.lost_reason;
      }
    }

    if (body.assigned_to !== undefined) {
      updates.assigned_to =
        typeof body.assigned_to === "string" && body.assigned_to.trim() === ""
          ? null
          : body.assigned_to;
    }

    if (body.notes !== undefined) {
      updates.notes = body.notes;
    }

    if (Object.keys(updates).length === 0 && !body.note?.trim()) {
      return errorResponse("No updates provided", "VALIDATION_ERROR", 400);
    }

    let lead = before;
    if (Object.keys(updates).length > 0) {
      const { data: updated, error } = await supabase
        .from("terminal_upsell_leads")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      lead = updated;
    }

    if (body.status && body.status !== before.status) {
      await supabase.from("terminal_upsell_lead_activities").insert({
        lead_id: id,
        activity_type: "status_changed",
        description: `Status changed from ${before.status} to ${body.status}`,
        metadata: {
          old_status: before.status,
          new_status: body.status,
          lost_reason: body.lost_reason ?? null,
        },
        performed_by: user.id,
      });

      void writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role,
        action: "admin.terminal_upsell_lead.status_change",
        entity_type: "terminal_upsell_lead",
        entity_id: id,
        module: "commercial",
        risk_level: "low",
        retention_tier: "routine",
        metadata: { from_status: before.status, to_status: body.status },
        ...extractRequestMeta(request),
      });
    }

    if (body.assigned_to !== undefined && body.assigned_to !== before.assigned_to) {
      await supabase.from("terminal_upsell_lead_activities").insert({
        lead_id: id,
        activity_type: "assigned",
        description: body.assigned_to
          ? `Assigned to ${body.assigned_to}`
          : "Unassigned",
        metadata: { assigned_to: body.assigned_to },
        performed_by: user.id,
      });

      void writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role,
        action: "admin.terminal_upsell_lead.assign",
        entity_type: "terminal_upsell_lead",
        entity_id: id,
        module: "commercial",
        risk_level: "low",
        retention_tier: "routine",
        metadata: { assigned_to: body.assigned_to },
        ...extractRequestMeta(request),
      });
    }

    if (body.note?.trim()) {
      await supabase.from("terminal_upsell_lead_activities").insert({
        lead_id: id,
        activity_type: "note",
        description: body.note.trim(),
        metadata: {},
        performed_by: user.id,
      });
    }

    return successResponse({ lead });
  } catch (error) {
    return handleApiError(error, "Failed to update terminal upsell lead");
  }
}

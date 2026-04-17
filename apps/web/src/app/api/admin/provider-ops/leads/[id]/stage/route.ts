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

    const newStage = body.stage;
    if (!newStage || !VALID_STAGES.includes(newStage)) {
      return errorResponse(`Invalid stage: ${newStage}`, "VALIDATION_ERROR", 400);
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const { data: lead, error: fetchErr } = await supabase
      .from("provider_leads")
      .select("id, commercial_stage, reopen_count")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();
    if (fetchErr) throw fetchErr;
    if (!lead) {
      return notFoundResponse("Lead not found");
    }

    const oldStage = lead.commercial_stage;
    const updates: Record<string, unknown> = { commercial_stage: newStage };

    if (newStage === "matched" && body.matched_provider_id) {
      updates.matched_provider_id = body.matched_provider_id;
      updates.match_confidence =
        typeof body.match_confidence === "number" ? body.match_confidence : 0.95;
      updates.matched_at = new Date().toISOString();
    }

    if (newStage === "lost") {
      updates.lost_reason = body.lost_reason || null;
    }
    if (newStage === "nurture") {
      updates.is_dormant = true;
    }
    if (
      (oldStage === "lost" || oldStage === "nurture") &&
      newStage !== "lost" &&
      newStage !== "nurture"
    ) {
      updates.is_dormant = false;
      updates.reopen_count = (lead.reopen_count || 0) + 1;
    }

    const { error: updateErr } = await supabase
      .from("provider_leads")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (updateErr) throw updateErr;

    const { error: actErr } = await supabase.from("provider_lead_activities").insert({
      lead_id: id,
      activity_type: "stage_changed",
      description: `Stage changed from ${oldStage} to ${newStage}`,
      metadata: {
        old_stage: oldStage,
        new_stage: newStage,
        lost_reason: body.lost_reason || null,
      },
      performed_by: user.id,
    });
    if (actErr) throw actErr;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.stage_change",
      entity_type: "provider_lead",
      entity_id: id,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      metadata: { from_stage: oldStage, to_stage: newStage },
      ...extractRequestMeta(request),
    });

    return successResponse({ id, stage: newStage, previous_stage: oldStage });
  } catch (error) {
    return handleApiError(error, "Failed to change stage");
  }
}

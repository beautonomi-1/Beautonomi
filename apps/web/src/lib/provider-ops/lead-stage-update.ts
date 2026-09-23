import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { slackNotifyLeadMilestone } from "@/lib/integrations/slack/lead-triggers";
import { syncCaseMilestonesForLeadStage } from "@/lib/provider-ops/ops-case";
import { PROVIDER_LEAD_PIPELINE_STAGES } from "@/lib/provider-ops/lead-pipeline-stages";

export const VALID_LEAD_STAGES = PROVIDER_LEAD_PIPELINE_STAGES;

export type ChangeLeadStageBody = {
  stage: string;
  expected_updated_at?: string;
  matched_provider_id?: string;
  match_confidence?: number;
  lost_reason?: string | null;
};

export type ChangeLeadStageResult =
  | { ok: true; id: string; stage: string; previous_stage: string }
  | {
      ok: false;
      code: "NOT_FOUND" | "CONCURRENT_UPDATE" | "VALIDATION_ERROR";
      message: string;
    };

export async function changeProviderLeadStage(
  supabase: SupabaseClient,
  tenantId: string,
  leadId: string,
  body: ChangeLeadStageBody,
  actor: { id: string; role?: string | null },
  request?: NextRequest,
): Promise<ChangeLeadStageResult> {
  const newStage = body.stage;
  if (!newStage || !VALID_LEAD_STAGES.includes(newStage as (typeof VALID_LEAD_STAGES)[number])) {
    return { ok: false, code: "VALIDATION_ERROR", message: `Invalid stage: ${newStage}` };
  }

  if (newStage === "matched" && !body.matched_provider_id) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "matched_provider_id is required to move a lead to matched",
    };
  }

  const { data: lead, error: fetchErr } = await supabase
    .from("provider_leads")
    .select("id, business_name, commercial_stage, reopen_count, updated_at")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .single();
  if (fetchErr) throw fetchErr;
  if (!lead) {
    return { ok: false, code: "NOT_FOUND", message: "Lead not found" };
  }

  if (
    body.expected_updated_at != null &&
    typeof body.expected_updated_at === "string" &&
    typeof lead.updated_at === "string" &&
    lead.updated_at !== body.expected_updated_at
  ) {
    return {
      ok: false,
      code: "CONCURRENT_UPDATE",
      message: "This lead was updated by another teammate. Refresh and try again.",
    };
  }

  const oldStage = lead.commercial_stage as string;
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
    .eq("id", leadId)
    .eq("tenant_id", tenantId);
  if (updateErr) throw updateErr;

  await syncCaseMilestonesForLeadStage(supabase, tenantId, leadId, newStage);

  const { error: actErr } = await supabase.from("provider_lead_activities").insert({
    lead_id: leadId,
    activity_type: "stage_changed",
    description: `Stage changed from ${oldStage} to ${newStage}`,
    metadata: {
      old_stage: oldStage,
      new_stage: newStage,
      lost_reason: body.lost_reason || null,
    },
    performed_by: actor.id,
  });
  if (actErr) throw actErr;

  if (request) {
    void writeAuditLog({
      actor_user_id: actor.id,
      actor_role: actor.role ?? undefined,
      action: "admin.lead.stage_change",
      entity_type: "provider_lead",
      entity_id: leadId,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      metadata: { from_stage: oldStage, to_stage: newStage },
      ...extractRequestMeta(request),
    });

    void slackNotifyLeadMilestone(
      request,
      { id: leadId, business_name: (lead as { business_name?: string | null }).business_name ?? null },
      newStage,
      oldStage,
    );
  }

  return { ok: true, id: leadId, stage: newStage, previous_stage: oldStage };
}

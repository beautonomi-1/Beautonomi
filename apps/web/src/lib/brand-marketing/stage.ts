import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandCampaignStage } from "./types";
import { loadBrandSettings } from "./settings";
import { computeCampaignReadiness } from "./readiness";
import { formatBlockersMessage, isAdjacentMove, stageMoveReasonRequired } from "./stage-gates";
import { createBrandApproval, hashContent, decideBrandApproval } from "./approvals";
import { validateSecondApprover } from "./approvers";

export function exceedsGoLiveBudgetThreshold(envelope: number, threshold: number): boolean {
  return envelope > threshold;
}

export type StageChangeResult =
  | { ok: true; stage: BrandCampaignStage; previous_stage: BrandCampaignStage; pending_go_live?: boolean; approval_id?: string }
  | {
      ok: false;
      code: "NOT_FOUND" | "CONCURRENT_UPDATE" | "VALIDATION_ERROR";
      message: string;
      blockers?: unknown[];
    };

export async function changeBrandCampaignStage(
  supabase: SupabaseClient,
  tenantId: string,
  campaignId: string,
  input: {
    stage: BrandCampaignStage;
    expected_updated_at?: string;
    closeout?: { worked?: string; did_not?: string; run_again?: string };
    second_approver_id?: string;
    reason?: string;
    actorId: string;
    actorRole: string;
    skipGoLiveApprovalCheck?: boolean;
  },
): Promise<StageChangeResult> {
  const { data: row, error } = await supabase
    .from("brand_campaigns")
    .select("id, stage, updated_at, budget_envelope, go_live_pending_approval_id")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !row) return { ok: false, code: "NOT_FOUND", message: "Campaign not found" };

  if (
    input.expected_updated_at &&
    new Date(row.updated_at).toISOString() !== new Date(input.expected_updated_at).toISOString()
  ) {
    return { ok: false, code: "CONCURRENT_UPDATE", message: "Campaign was updated elsewhere" };
  }

  const previous = row.stage as BrandCampaignStage;
  if (input.stage === previous) {
    return { ok: true, stage: previous, previous_stage: previous };
  }

  if (!isAdjacentMove(previous, input.stage)) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Move one stage at a time" };
  }

  if (stageMoveReasonRequired(previous, input.stage) && !input.reason?.trim()) {
    return { ok: false, code: "VALIDATION_ERROR", message: "A reason is required to move backward" };
  }

  const readiness = await computeCampaignReadiness(supabase, tenantId, campaignId, input.stage);
  if (!readiness?.ready && readiness && readiness.blockers.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: formatBlockersMessage(readiness.blockers),
      blockers: readiness.blockers,
    };
  }

  if (input.stage === "live" && !input.skipGoLiveApprovalCheck) {
    const settings = await loadBrandSettings(supabase, tenantId);
    const envelope = Number(row.budget_envelope ?? 0);
    const role = input.actorRole.toLowerCase();
    const isSuper = role === "superadmin";
    const needsSecond = !isSuper && exceedsGoLiveBudgetThreshold(envelope, settings.go_live_budget_threshold);

    if (needsSecond) {
      const { data: approved } = await supabase
        .from("brand_approvals")
        .select("id, approver_id")
        .eq("tenant_id", tenantId)
        .eq("subject_type", "go_live")
        .eq("subject_id", campaignId)
        .eq("status", "approved")
        .order("decided_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!approved) {
        if (!input.second_approver_id || input.second_approver_id === input.actorId) {
          return {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "Budget above threshold: assign a second marketing admin to confirm go-live",
          };
        }
        const valid = await validateSecondApprover(supabase, tenantId, input.second_approver_id);
        if (valid.ok === false) return { ok: false, code: "VALIDATION_ERROR", message: valid.message };

        const versionHash = hashContent({ campaignId, envelope, stage: "live" });
        const { id: approvalId } = await createBrandApproval(supabase, {
          tenantId,
          subjectType: "go_live",
          subjectId: campaignId,
          versionHash,
          requestedBy: input.actorId,
          approverId: input.second_approver_id,
          dueAt: new Date(Date.now() + settings.approval_sla_hours * 3600 * 1000),
        });

        await supabase
          .from("brand_campaigns")
          .update({ go_live_pending_approval_id: approvalId, updated_at: new Date().toISOString() })
          .eq("id", campaignId);

        await supabase.from("brand_activity").insert({
          tenant_id: tenantId,
          campaign_id: campaignId,
          actor_id: input.actorId,
          kind: "go_live_requested",
          body: "Go-live sent for second approval",
          meta: { approval_id: approvalId, approver_id: input.second_approver_id },
        });

        return {
          ok: true,
          stage: previous,
          previous_stage: previous,
          pending_go_live: true,
          approval_id: approvalId,
        };
      }
    }
  }

  const patch: Record<string, unknown> = {
    stage: input.stage,
    updated_at: new Date().toISOString(),
    go_live_pending_approval_id: input.stage === "live" ? null : undefined,
  };

  if (input.stage === "live") {
    const { data: lastApproved } = await supabase
      .from("brand_approvals")
      .select("approver_id")
      .eq("tenant_id", tenantId)
      .eq("subject_type", "go_live")
      .eq("subject_id", campaignId)
      .eq("status", "approved")
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastApproved?.approver_id) {
      patch.live_confirmed_by = lastApproved.approver_id;
      patch.live_confirmed_at = new Date().toISOString();
    }
  }

  if (input.stage === "closed" && input.closeout) {
    patch.closeout_worked = input.closeout.worked ?? null;
    patch.closeout_did_not = input.closeout.did_not ?? null;
    patch.closeout_run_again = input.closeout.run_again ?? null;
  }

  const { error: updErr } = await supabase.from("brand_campaigns").update(patch).eq("id", campaignId);
  if (updErr) return { ok: false, code: "VALIDATION_ERROR", message: updErr.message };

  await supabase.from("brand_activity").insert({
    tenant_id: tenantId,
    campaign_id: campaignId,
    actor_id: input.actorId,
    kind: "stage_change",
    body: `Stage → ${input.stage}`,
    meta: { previous_stage: previous, reason: input.reason ?? null },
  });

  return { ok: true, stage: input.stage, previous_stage: previous };
}

export async function completeGoLiveAfterApproval(
  supabase: SupabaseClient,
  tenantId: string,
  approvalId: string,
  actorId: string,
  actorRole: string,
): Promise<StageChangeResult> {
  const { data: approval } = await supabase
    .from("brand_approvals")
    .select("subject_id, status, approver_id")
    .eq("id", approvalId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!approval || approval.status !== "approved") {
    return { ok: false, code: "VALIDATION_ERROR", message: "Go-live approval not complete" };
  }
  if (approval.approver_id !== actorId && actorRole.toLowerCase() !== "superadmin") {
    return { ok: false, code: "VALIDATION_ERROR", message: "Only the approver can finalize go-live" };
  }

  const { data: camp } = await supabase
    .from("brand_campaigns")
    .select("updated_at")
    .eq("id", approval.subject_id)
    .single();

  return changeBrandCampaignStage(supabase, tenantId, approval.subject_id, {
    stage: "live",
    expected_updated_at: camp?.updated_at,
    actorId,
    actorRole,
    skipGoLiveApprovalCheck: true,
  });
}

export async function approveGoLiveRequest(
  supabase: SupabaseClient,
  tenantId: string,
  approvalId: string,
  actorId: string,
  actorRole: string,
  comment?: string,
): Promise<StageChangeResult> {
  const decided = await decideBrandApproval(supabase, {
    tenantId,
    approvalId,
    actorId,
    decision: "approved",
    comment,
  });
  if (decided.ok === false) return { ok: false, code: "VALIDATION_ERROR", message: decided.message };

  const { data: approval } = await supabase
    .from("brand_approvals")
    .select("subject_id")
    .eq("id", approvalId)
    .single();

  const { data: camp } = await supabase
    .from("brand_campaigns")
    .select("updated_at")
    .eq("id", approval!.subject_id)
    .single();

  return changeBrandCampaignStage(supabase, tenantId, approval!.subject_id, {
    stage: "live",
    expected_updated_at: camp?.updated_at,
    actorId,
    actorRole,
    skipGoLiveApprovalCheck: true,
  });
}


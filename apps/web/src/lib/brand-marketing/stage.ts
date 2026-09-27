import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandCampaignStage } from "./types";
import { UNATTRIBUTABLE_CHANNELS } from "./types";
import { loadBrandSettings } from "./settings";

export function exceedsGoLiveBudgetThreshold(envelope: number, threshold: number): boolean {
  return envelope > threshold;
}

export async function changeBrandCampaignStage(
  supabase: SupabaseClient,
  tenantId: string,
  campaignId: string,
  input: {
    stage: BrandCampaignStage;
    expected_updated_at?: string;
    closeout?: { worked?: string; did_not?: string; run_again?: string };
    second_approver_id?: string;
    actorId: string;
    actorRole: string;
  },
): Promise<
  | { ok: true; stage: BrandCampaignStage; previous_stage: BrandCampaignStage }
  | { ok: false; code: "NOT_FOUND" | "CONCURRENT_UPDATE" | "VALIDATION_ERROR"; message: string }
> {
  const { data: row, error } = await supabase
    .from("brand_campaigns")
    .select("id, stage, updated_at, budget_envelope")
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

  if (input.stage === "live") {
    const gate = await validateGoLive(supabase, tenantId, campaignId);
    if ("message" in gate) return { ok: false, code: "VALIDATION_ERROR", message: gate.message };

    const settings = await loadBrandSettings(supabase, tenantId);
    const envelope = Number(row.budget_envelope ?? 0);
    if (exceedsGoLiveBudgetThreshold(envelope, settings.go_live_budget_threshold)) {
      const role = input.actorRole.toLowerCase();
      const isSuper = role === "superadmin";
      if (!isSuper) {
        if (!input.second_approver_id || input.second_approver_id === input.actorId) {
          return {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "Budget above threshold: a second marketing admin must confirm go-live",
          };
        }
        const { data: approver } = await supabase
          .from("users")
          .select("role")
          .eq("id", input.second_approver_id)
          .maybeSingle();
        const approverRole = String(approver?.role ?? "").toLowerCase();
        if (approverRole !== "admin_marketing" && approverRole !== "superadmin") {
          return { ok: false, code: "VALIDATION_ERROR", message: "Second approver must be a marketing admin" };
        }
        if (approverRole === "admin_marketing") {
          const { data: membership } = await supabase
            .from("user_tenant_roles")
            .select("id")
            .eq("user_id", input.second_approver_id)
            .eq("tenant_id", tenantId)
            .eq("is_active", true)
            .maybeSingle();
          if (!membership) {
            return {
              ok: false,
              code: "VALIDATION_ERROR",
              message: "Second approver must be a marketing admin in this market",
            };
          }
        }
      }
    }
  }

  const patch: Record<string, unknown> = {
    stage: input.stage,
    updated_at: new Date().toISOString(),
  };
  if (input.stage === "live" && input.second_approver_id) {
    patch.live_confirmed_by = input.second_approver_id;
    patch.live_confirmed_at = new Date().toISOString();
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
    meta: { previous_stage: row.stage },
  });

  return { ok: true, stage: input.stage, previous_stage: row.stage as BrandCampaignStage };
}

async function validateGoLive(
  supabase: SupabaseClient,
  tenantId: string,
  campaignId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: placements } = await supabase
    .from("brand_placements")
    .select("id, channel_key, owner_id, flight_start, flight_end, budget, tracking_code, payload")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  for (const p of placements ?? []) {
    if (!p.owner_id || !p.flight_start || !p.flight_end || p.budget == null) {
      return { ok: false, message: "Every placement needs owner, dates, and budget before go-live" };
    }
    const unattributable = UNATTRIBUTABLE_CHANNELS.has(p.channel_key);
    const reason = (p.payload as { unattributable_reason?: string })?.unattributable_reason;
    if (!unattributable && !p.tracking_code) {
      return { ok: false, message: "Placements that can carry a code must have one before go-live" };
    }
    if (unattributable && !reason) {
      return { ok: false, message: "Unattributable channels need a reason before go-live" };
    }
  }
  return { ok: true };
}

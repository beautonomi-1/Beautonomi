import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandCampaignStage } from "./types";
import { UNATTRIBUTABLE_CHANNELS } from "./types";
import { lineTypeForChannelKey } from "./channels";
import { nextStage } from "./stage-gates";
import type { StageBlocker } from "./stage-gates";
export type ReadinessResult = {
  current_stage: BrandCampaignStage;
  target_stage: BrandCampaignStage;
  ready: boolean;
  blockers: StageBlocker[];
  score: { done: number; total: number };
};

type PlacementRow = {
  id: string;
  name: string | null;
  channel_key: string;
  owner_id: string | null;
  flight_start: string | null;
  flight_end: string | null;
  budget: number | null;
  tracking_code: string | null;
  payload: Record<string, unknown>;
};

type CampaignRow = {
  id: string;
  stage: BrandCampaignStage;
  budget_envelope: number | null;
  flight_start: string | null;
  flight_end: string | null;
  plan_id: string | null;
  closeout_worked: string | null;
  closeout_did_not: string | null;
  closeout_run_again: string | null;
};

export async function computeCampaignReadiness(
  supabase: SupabaseClient,
  tenantId: string,
  campaignId: string,
  targetStage?: BrandCampaignStage,
): Promise<ReadinessResult | null> {
  const { data: campaign, error } = await supabase
    .from("brand_campaigns")
    .select(
      "id, stage, budget_envelope, flight_start, flight_end, plan_id, closeout_worked, closeout_did_not, closeout_run_again",
    )
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !campaign) return null;

  const current = campaign.stage as BrandCampaignStage;
  const target = targetStage ?? nextStage(current) ?? current;

  const { data: placements } = await supabase
    .from("brand_placements")
    .select("id, name, channel_key, owner_id, flight_start, flight_end, budget, tracking_code, payload")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  const blockers = await blockersForTarget(
    supabase,
    tenantId,
    campaign as CampaignRow,
    (placements ?? []) as PlacementRow[],
    target,
  );

  const total = Math.max(blockers.length + 1, 1);
  const done = blockers.length === 0 ? total : 0;

  return {
    current_stage: current,
    target_stage: target,
    ready: blockers.length === 0,
    blockers,
    score: { done: blockers.length === 0 ? total : Math.max(0, total - blockers.length), total },
  };
}

async function blockersForTarget(
  supabase: SupabaseClient,
  tenantId: string,
  campaign: CampaignRow,
  placements: PlacementRow[],
  target: BrandCampaignStage,
): Promise<StageBlocker[]> {
  const blockers: StageBlocker[] = [];
  const current = campaign.stage;

  if (target === current) return blockers;

  const targetIdx = ["planning", "creative", "live", "measuring", "closed"].indexOf(target);
  const currentIdx = ["planning", "creative", "live", "measuring", "closed"].indexOf(current);

  if (targetIdx > currentIdx + 1) {
    blockers.push({
      kind: "campaign",
      field: "stage",
      message: "Move one stage at a time",
    });
    return blockers;
  }

  if (target === "creative" || targetIdx >= ["planning", "creative", "live", "measuring", "closed"].indexOf("live")) {
    const { count: planCount } = await supabase
      .from("brand_plans")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if ((planCount ?? 0) > 0 && !campaign.plan_id) {
      blockers.push({
        kind: "campaign",
        field: "plan_id",
        message: "Link campaign to a quarterly plan before leaving planning",
        href: "overview",
      });
    }
    for (const p of placements) {
      const missing: string[] = [];
      if (!p.owner_id) missing.push("owner");
      if (!p.flight_start) missing.push("flight_start");
      if (!p.flight_end) missing.push("flight_end");
      if (p.budget == null) missing.push("budget");
      if (missing.length) {
        blockers.push({
          kind: "placement",
          placement_id: p.id,
          name: p.name ?? p.channel_key,
          missing,
          href: "placements",
        });
      }
    }
    const allocated = placements.reduce((s, p) => s + Number(p.budget ?? 0), 0);
    const envelope = Number(campaign.budget_envelope ?? 0);
    if (envelope > 0 && allocated > envelope) {
      blockers.push({
        kind: "campaign",
        field: "budget_envelope",
        message: `Placement budgets (${allocated}) exceed envelope (${envelope})`,
        href: "placements",
      });
    }
  }

  if (target === "live" || targetIdx >= ["planning", "creative", "live", "measuring", "closed"].indexOf("live")) {
    for (const p of placements) {
      const unattributable = UNATTRIBUTABLE_CHANNELS.has(p.channel_key);
      const reason = (p.payload as { unattributable_reason?: string })?.unattributable_reason;
      if (!unattributable && !p.tracking_code) {
        blockers.push({
          kind: "placement",
          placement_id: p.id,
          name: p.name ?? p.channel_key,
          missing: ["tracking_code"],
          href: "placements",
        });
      }
      if (unattributable && !reason) {
        blockers.push({
          kind: "placement",
          placement_id: p.id,
          name: p.name ?? p.channel_key,
          missing: ["unattributable_reason"],
          href: "placements",
        });
      }
    }

    const { data: openChecklists } = await supabase
      .from("brand_checklist_instances")
      .select("id, label, completed")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaign.id)
      .eq("stage", "creative")
      .eq("completed", false);

    for (const item of openChecklists ?? []) {
      blockers.push({
        kind: "checklist",
        item_id: item.id,
        message: `Compliance: ${item.label}`,
      });
    }
  }

  if (target === "measuring") {
    const end = campaign.flight_end ? new Date(campaign.flight_end) : null;
    if (end && end > new Date()) {
      blockers.push({
        kind: "campaign",
        field: "flight_end",
        message: "Flight end has not passed yet (or record an override with reason)",
      });
    }
  }

  if (target === "closed") {
    if (!campaign.closeout_worked?.trim()) {
      blockers.push({ kind: "campaign", field: "closeout_worked", message: "Close-out: what worked" });
    }
    if (!campaign.closeout_did_not?.trim()) {
      blockers.push({ kind: "campaign", field: "closeout_did_not", message: "Close-out: what did not" });
    }
    if (!campaign.closeout_run_again?.trim()) {
      blockers.push({ kind: "campaign", field: "closeout_run_again", message: "Close-out: run again?" });
    }
  }

  return blockers;
}

export function placementDefaultBudget(channelKey: string): number {
  const line = lineTypeForChannelKey(channelKey);
  if (line === "owned") return 0;
  return 0;
}

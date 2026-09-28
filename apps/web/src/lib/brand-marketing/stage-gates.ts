import type { BrandCampaignStage } from "./types";
import { BRAND_CAMPAIGN_STAGES } from "./types";

export type StageBlocker =
  | { kind: "placement"; placement_id: string; name: string; missing: string[]; href?: string }
  | { kind: "campaign"; field: string; message: string; href?: string }
  | { kind: "approval"; approval_id?: string; message: string }
  | { kind: "checklist"; item_id?: string; message: string };

export function nextStage(stage: BrandCampaignStage): BrandCampaignStage | null {
  const i = BRAND_CAMPAIGN_STAGES.indexOf(stage);
  if (i < 0 || i >= BRAND_CAMPAIGN_STAGES.length - 1) return null;
  return BRAND_CAMPAIGN_STAGES[i + 1]!;
}

export function prevStage(stage: BrandCampaignStage): BrandCampaignStage | null {
  const i = BRAND_CAMPAIGN_STAGES.indexOf(stage);
  if (i <= 0) return null;
  return BRAND_CAMPAIGN_STAGES[i - 1]!;
}

export function isAdjacentMove(from: BrandCampaignStage, to: BrandCampaignStage): boolean {
  if (from === to) return true;
  return nextStage(from) === to || prevStage(from) === to;
}

export function stageMoveReasonRequired(from: BrandCampaignStage, to: BrandCampaignStage): boolean {
  const fromIdx = BRAND_CAMPAIGN_STAGES.indexOf(from);
  const toIdx = BRAND_CAMPAIGN_STAGES.indexOf(to);
  return toIdx < fromIdx;
}

export function formatBlockersMessage(blockers: StageBlocker[]): string {
  if (blockers.length === 0) return "Cannot change stage";
  const first = blockers[0]!;
  if (first.kind === "placement") {
    const missing = first.missing.join(", ");
    return `${first.name}: missing ${missing}`;
  }
  return first.message;
}

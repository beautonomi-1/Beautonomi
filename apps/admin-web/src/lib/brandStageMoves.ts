import type { BrandCampaignStage } from "@/routes/brand/brandTypes";

const ORDER: BrandCampaignStage[] = ["planning", "creative", "live", "measuring", "closed"];

export function nextStage(stage: BrandCampaignStage): BrandCampaignStage | null {
  const i = ORDER.indexOf(stage);
  if (i < 0 || i >= ORDER.length - 1) return null;
  return ORDER[i + 1]!;
}

export function prevStage(stage: BrandCampaignStage): BrandCampaignStage | null {
  const i = ORDER.indexOf(stage);
  if (i <= 0) return null;
  return ORDER[i - 1]!;
}

export function allowedStageTargets(from: BrandCampaignStage): BrandCampaignStage[] {
  const out: BrandCampaignStage[] = [from];
  const n = nextStage(from);
  const p = prevStage(from);
  if (n) out.push(n);
  if (p) out.push(p);
  return out;
}

export function canMoveCampaignToStage(
  from: BrandCampaignStage,
  target: BrandCampaignStage,
): { allowed: boolean; reason?: string } {
  if (from === target) return { allowed: true };
  const n = nextStage(from);
  const p = prevStage(from);
  if (n === target || p === target) return { allowed: true };
  return { allowed: false, reason: "Move one stage at a time" };
}

import type { ModelTier } from "@beautonomi/agent-model-router";

/** Maps subscription entitlement model_tier to router tier. */
export function entitlementTierToRouterTier(modelTier: string | null | undefined): ModelTier {
  const t = (modelTier ?? "cheap").trim().toLowerCase();
  if (t === "standard" || t === "flash") return "flash";
  if (t === "pro" || t === "premium") return "pro";
  return "lite";
}

const TIER_RANK: Record<ModelTier, number> = { lite: 0, flash: 1, pro: 2 };

/** True when `candidate` is equal or cheaper than `target`. */
export function isTierEqualOrCheaper(candidate: ModelTier, target: ModelTier): boolean {
  return TIER_RANK[candidate] <= TIER_RANK[target];
}

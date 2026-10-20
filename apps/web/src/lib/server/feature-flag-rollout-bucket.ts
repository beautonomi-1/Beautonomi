import { createHash } from "node:crypto";

/** Stable 0–99 bucket for partial feature-flag rollout (public config bundle and server checks). */
export function featureFlagRolloutBucket(userId: string, featureKey: string): number {
  const h = createHash("sha256").update(`${userId}:${featureKey}`).digest("hex");
  const n = parseInt(h.slice(0, 8), 16);
  return n % 100;
}

/** True when the user is in the rollout cohort for the given percent (0–100). */
export function userPassesFeatureRolloutPercent(
  userId: string,
  featureKey: string,
  rolloutPercent: number,
): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  return featureFlagRolloutBucket(userId, featureKey) < rolloutPercent;
}

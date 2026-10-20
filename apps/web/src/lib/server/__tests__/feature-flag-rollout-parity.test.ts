import { describe, expect, it } from "vitest";
import {
  featureFlagRolloutBucket,
  userPassesFeatureRolloutPercent,
} from "@/lib/server/feature-flag-rollout-bucket";
import { resolveFlagsForUser } from "@/lib/config";

describe("featureFlagRolloutBucket", () => {
  it("is stable and in 0..99", () => {
    const a = featureFlagRolloutBucket("user-1", "support.ai_assistant.customer");
    expect(featureFlagRolloutBucket("user-1", "support.ai_assistant.customer")).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });

  it("passes only when bucket is below the percent", () => {
    const userId = "rollout-test-user";
    const key = "test.flag";
    const bucket = featureFlagRolloutBucket(userId, key);
    expect(userPassesFeatureRolloutPercent(userId, key, bucket + 1)).toBe(true);
    expect(userPassesFeatureRolloutPercent(userId, key, bucket)).toBe(false);
    expect(userPassesFeatureRolloutPercent(userId, key, 100)).toBe(true);
    expect(userPassesFeatureRolloutPercent(userId, key, 0)).toBe(false);
  });
});

describe("feature flag rollout parity", () => {
  it("bundle resolver and server bucket agree for many users", () => {
    const key = "support.ai_assistant.customer";
    const percent = 42;
    for (let i = 0; i < 200; i++) {
      const userId = `user-${i}`;
      const flags = resolveFlagsForUser({
        platform: "customer",
        environment: "production",
        userId,
        flags: [
          {
            feature_key: key,
            enabled: true,
            rollout_percent: percent,
            platforms_allowed: null,
            roles_allowed: null,
            min_app_version: null,
            environments_allowed: null,
          },
        ],
      });
      expect(flags[key]?.enabled).toBe(userPassesFeatureRolloutPercent(userId, key, percent));
    }
  });
});

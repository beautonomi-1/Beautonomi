import { describe, it, expect } from "vitest";
import { resolveFlagsForUser } from "@/lib/config";

/** Shape of global `explore.enabled` from migration 979 (enabled true, no platform/env restrictions). */
const EXPLORE_ENABLED_ROW = {
  feature_key: "explore.enabled",
  enabled: true,
  rollout_percent: 100,
  platforms_allowed: null as string[] | null,
  roles_allowed: null as string[] | null,
  min_app_version: null as string | null,
  environments_allowed: null as string[] | null,
};

describe("explore.enabled flag parity (web vs customer platform)", () => {
  for (const platform of ["web", "customer"] as const) {
    it(`resolves enabled for ${platform} production without user_id`, () => {
      const flags = resolveFlagsForUser({
        flags: [EXPLORE_ENABLED_ROW],
        userId: null,
        role: null,
        platform,
        appVersion: null,
        environment: "production",
      });
      expect(flags["explore.enabled"]?.enabled).toBe(true);
    });

    it(`resolves enabled for ${platform} development (dev client builds)`, () => {
      const flags = resolveFlagsForUser({
        flags: [EXPLORE_ENABLED_ROW],
        userId: null,
        role: null,
        platform,
        appVersion: null,
        environment: "development",
      });
      expect(flags["explore.enabled"]?.enabled).toBe(true);
    });
  }
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_ROSTER_SEED, AGENT_ROSTER_SEED_KEYS } from "@/lib/agents/default-roster-seed";

const JSON_ROSTER = JSON.parse(
  readFileSync(join(process.cwd(), "../../scripts/agent-roster-seed.json"), "utf8"),
) as Array<{ key: string; task_default: string; vision_enabled: boolean }>;

describe("AGENT_ROSTER_SEED", () => {
  it("covers all 11 workforce agents with default routing", () => {
    expect(AGENT_ROSTER_SEED).toHaveLength(11);
    expect(AGENT_ROSTER_SEED_KEYS).toEqual([
      "ops-sentinel",
      "support-triage",
      "support-lead",
      "payout-review",
      "reconciliation-investigator",
      "refund-specialist",
      "provider-success",
      "membership-shepherd",
      "trust-monitor",
      "content-moderator",
      "admin-copilot",
    ]);
    for (const row of AGENT_ROSTER_SEED) {
      expect(row.preferred_model_id).toBeNull();
      expect(row.fallback_model_id).toBeNull();
      expect(row.operational_state).toBe("active");
      expect(row.vision_enabled).toBe(true);
    }
  });

  it("matches AI Platform roster task defaults", () => {
    const byKey = Object.fromEntries(AGENT_ROSTER_SEED.map((r) => [r.key, r.task_default]));
    expect(byKey["support-lead"]).toBe("drafting");
    expect(byKey["admin-copilot"]).toBe("copilot");
    expect(byKey["ops-sentinel"]).toBe("classification");
  });

  it("stays in sync with scripts/agent-roster-seed.json", () => {
    expect(JSON_ROSTER.map((r) => r.key)).toEqual(AGENT_ROSTER_SEED_KEYS);
    for (const row of AGENT_ROSTER_SEED) {
      const json = JSON_ROSTER.find((r) => r.key === row.key);
      expect(json?.task_default).toBe(row.task_default);
      expect(json?.vision_enabled).toBe(row.vision_enabled);
    }
  });
});

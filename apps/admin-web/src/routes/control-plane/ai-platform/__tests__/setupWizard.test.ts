import { describe, expect, it } from "vitest";
import { shouldShowSetupWizard } from "../FirstVisitSetupWizard";
import type { AiPlatformPayload } from "../types";

function payload(gatewayKeySet: boolean): AiPlatformPayload {
  return {
    runtime: { gateway_key_set: gatewayKeySet, runtime: "vercel_gateway", enabled: false },
    workforce: {
      module: { master_enabled: false, shadow_mode: true, global_daily_spend_cap_usd: null, default_routing_policy_id: null },
      emergency: {
        stop_new_runs: false,
        stop_all_tool_calls: false,
        block_approved_execution: false,
        freeze_pending_proposals: false,
      },
      gate_status: { active_agents: 0, pending_approvals: 0, missing_agent_keys: [] },
      agents: [],
      cron_schedules: [],
      spend: {
        platform_today_usd: 0,
        platform_month_usd: 0,
        agent_month_usd: 0,
        provider_ai_month_usd: 0,
        monthly_budget_usd: null,
        agent_daily_cap_usd: null,
      },
    },
  } as AiPlatformPayload;
}

describe("shouldShowSetupWizard", () => {
  it("shows when gateway key is not set", () => {
    expect(shouldShowSetupWizard(payload(false), "production")).toBe(true);
  });

  it("hides when gateway key is set", () => {
    expect(shouldShowSetupWizard(payload(true), "production")).toBe(false);
  });

  it("hides when payload is null", () => {
    expect(shouldShowSetupWizard(null, "production")).toBe(false);
  });
});

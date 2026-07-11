import { describe, expect, it } from "vitest";
import {
  enrichTerminalInsightRow,
  isTerminalUpsellOpportunity,
  planFeaturesIncludeTerminalBundle,
  providerHasTerminalBundlePlan,
  rowMatchesSegment,
} from "@/lib/terminal/terminal-upsell-segment";

describe("terminal-upsell-segment", () => {
  const context = {
    bundlePlanIds: new Set(["plan-bundle"]),
    hardwareProviderIds: new Set(["provider-with-hardware"]),
  };

  it("detects terminal_bundle in plan features", () => {
    expect(
      planFeaturesIncludeTerminalBundle({
        terminal_bundle: { enabled: true, included_terminal_count: 1 },
      }),
    ).toBe(true);
    expect(planFeaturesIncludeTerminalBundle({ terminal_bundle: { enabled: false } })).toBe(false);
  });

  it("flags upsell opportunity when no terminal, no bundle, no hardware", () => {
    expect(
      isTerminalUpsellOpportunity({
        terminalOwnershipStatus: "no_terminal",
        hasBundlePlan: false,
        hasTerminalHardware: false,
      }),
    ).toBe(true);
    expect(
      isTerminalUpsellOpportunity({
        terminalOwnershipStatus: "no_terminal",
        hasBundlePlan: true,
        hasTerminalHardware: false,
      }),
    ).toBe(false);
    expect(
      isTerminalUpsellOpportunity({
        terminalOwnershipStatus: "no_terminal",
        hasBundlePlan: false,
        hasTerminalHardware: true,
      }),
    ).toBe(false);
  });

  it("enriches rows with plan and upsell flags", () => {
    const enriched = enrichTerminalInsightRow(
      {
        provider_id: "p1",
        terminal_ownership_status: "no_terminal",
        interested_in_platform_terminal: "yes",
        providers: {
          provider_subscriptions: [
            {
              plan_id: "plan-free",
              status: "active",
              subscription_plans: {
                name: "Starter",
                slug: "free-tier-default",
                features: { terminal_bundle: { enabled: false } },
              },
            },
          ],
        },
      },
      context,
    );

    expect(enriched.plan_name).toBe("Starter");
    expect(enriched.plan_includes_terminal).toBe(false);
    expect(enriched.is_upsell_opportunity).toBe(true);
    expect(rowMatchesSegment(enriched, "upsell_opportunities")).toBe(true);
    expect(rowMatchesSegment(enriched, "interested")).toBe(true);
  });

  it("detects bundle plan from entitled subscription", () => {
    expect(
      providerHasTerminalBundlePlan(
        [
          {
            plan_id: "plan-bundle",
            status: "active",
            subscription_plans: { features: { terminal_bundle: { enabled: true } } },
          },
        ],
        context.bundlePlanIds,
      ),
    ).toBe(true);
  });
});

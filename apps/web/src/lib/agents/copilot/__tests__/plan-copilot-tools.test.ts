import { describe, expect, it, vi } from "vitest";
import { planToolsForIntent } from "../plan-copilot-tools";
import type { CopilotResolvedEntities } from "../copilot-types";

vi.mock("../canonicalize-entity", () => ({
  canonicalizeProviderId: vi.fn(async (_t: string, id: string) => ({ id })),
}));

const providerEntities: CopilotResolvedEntities = {
  provider: { entityType: "provider", entityId: "11111111-1111-4111-8111-111111111111", label: "Glow" },
};

describe("planToolsForIntent", () => {
  it("gates finance.readProviderSummary on finance section for earnings", async () => {
    const withoutFinance = await planToolsForIntent({
      intent: "provider.earnings",
      question: "How much did they earn?",
      environment: "production",
      allowedSections: ["providers_operations"],
      tenantId: "t1",
      resolvedEntities: providerEntities,
    });
    expect(withoutFinance.some((c) => c.name === "finance.readProviderSummary")).toBe(false);
    expect(withoutFinance.some((c) => c.name === "provider.readProfileSummary")).toBe(true);

    const withFinance = await planToolsForIntent({
      intent: "provider.earnings",
      question: "How much did they earn?",
      environment: "production",
      allowedSections: ["providers_operations", "finance"],
      tenantId: "t1",
      resolvedEntities: providerEntities,
    });
    expect(withFinance.some((c) => c.name === "finance.readProviderSummary")).toBe(true);
  });

  it("plans onboarding tool only with provider_ops", async () => {
    const opsOnly = await planToolsForIntent({
      intent: "provider.onboarding",
      question: "Onboarding status?",
      environment: "production",
      allowedSections: ["providers_operations"],
      tenantId: "t1",
      resolvedEntities: providerEntities,
    });
    expect(opsOnly.some((c) => c.name === "provider.readOnboardingProgress")).toBe(false);
    expect(opsOnly.some((c) => c.name === "provider.readProfileSummary")).toBe(true);

    const withProviderOps = await planToolsForIntent({
      intent: "provider.onboarding",
      question: "Onboarding status?",
      environment: "production",
      allowedSections: ["provider_ops"],
      tenantId: "t1",
      resolvedEntities: providerEntities,
    });
    expect(withProviderOps.some((c) => c.name === "provider.readOnboardingProgress")).toBe(true);
  });

  it("does not plan ops.readSystemHealth unless operations section allowed", async () => {
    const noOps = await planToolsForIntent({
      intent: "ops.health",
      question: "Is the platform healthy?",
      environment: "production",
      allowedSections: ["overview"],
      tenantId: "t1",
      resolvedEntities: {},
    });
    expect(noOps.some((c) => c.name === "ops.readSystemHealth")).toBe(false);

    const withOps = await planToolsForIntent({
      intent: "ops.health",
      question: "Is the platform healthy?",
      environment: "production",
      allowedSections: ["operations"],
      tenantId: "t1",
      resolvedEntities: {},
    });
    expect(withOps).toEqual([{ name: "ops.readSystemHealth", input: { environment: "production" } }]);
  });
});

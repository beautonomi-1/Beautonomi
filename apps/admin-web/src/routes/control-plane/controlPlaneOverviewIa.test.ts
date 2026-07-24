import { describe, expect, it } from "vitest";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { CONTROL_PLANE_OVERVIEW_GROUPS } from "./controlPlaneOverviewGroups";

const PROVIDER_AI_TABS = [
  "/admin/control-plane/modules/ai",
  "/admin/control-plane/modules/ai/templates",
  "/admin/control-plane/modules/ai/usage",
  "/admin/control-plane/modules/ai/entitlements",
] as const;

describe("control plane overview IA", () => {
  it("exposes exactly five top-level groups with the expected labels", () => {
    expect(CONTROL_PLANE_OVERVIEW_GROUPS.map((g) => g.label)).toEqual([
      "Feature flags",
      "Identity & trust",
      "Marketplace modules",
      "AI & agents",
      "Operations & audit",
    ]);
  });

  it("keeps AI & agents to three peer cards (no usage/templates/entitlements peers)", () => {
    const ai = CONTROL_PLANE_OVERVIEW_GROUPS.find((g) => g.label === "AI & agents")!;
    expect(ai.items.map((i) => i.title)).toEqual([
      "Provider AI",
      "Gemini credentials",
      "Agentic console",
    ]);
    const allTos = CONTROL_PLANE_OVERVIEW_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(allTos).not.toContain("/admin/control-plane/modules/ai/usage");
    expect(allTos).not.toContain("/admin/control-plane/modules/ai/entitlements");
    expect(allTos).not.toContain("/admin/control-plane/modules/ai/templates");
  });

  it("does not list ranking scores as an overview peer", () => {
    const allTos = CONTROL_PLANE_OVERVIEW_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(allTos).not.toContain("/admin/control-plane/modules/ranking/scores");
    expect(allTos).toContain("/admin/control-plane/modules/ranking");
  });

  it("keeps Gemini under AI & agents, not Identity & trust", () => {
    const identity = CONTROL_PLANE_OVERVIEW_GROUPS.find((g) => g.label === "Identity & trust")!;
    const ai = CONTROL_PLANE_OVERVIEW_GROUPS.find((g) => g.label === "AI & agents")!;
    expect(identity.items.map((i) => i.to)).not.toContain("/admin/control-plane/integrations/gemini");
    expect(ai.items.map((i) => i.to)).toContain("/admin/control-plane/integrations/gemini");
  });

  it("does not label flags as Experiments", () => {
    const flags = CONTROL_PLANE_OVERVIEW_GROUPS.find((g) => g.label === "Feature flags")!;
    expect(flags.description.toLowerCase()).not.toContain("experiment");
    expect(CONTROL_PLANE_OVERVIEW_GROUPS.some((g) => /experiment/i.test(g.label))).toBe(false);
  });

  it("maps every overview card through adminSpaTo to a valid SPA path", () => {
    for (const group of CONTROL_PLANE_OVERVIEW_GROUPS) {
      for (const item of group.items) {
        const spa = adminSpaTo(item.to);
        expect(spa.startsWith("/")).toBe(true);
        expect(spa).not.toMatch(/^\/admin(\/|$)/);
      }
    }
  });

  it("maps Provider AI subnav tabs to nested SPA paths under modules/ai", () => {
    expect(PROVIDER_AI_TABS.map((t) => adminSpaTo(t))).toEqual([
      "/control-plane/modules/ai",
      "/control-plane/modules/ai/templates",
      "/control-plane/modules/ai/usage",
      "/control-plane/modules/ai/entitlements",
    ]);
  });
});

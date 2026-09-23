import { describe, expect, it, vi } from "vitest";
import { publicLearnUrl } from "./learning";
import {
  firstContinueSlug,
  parseKnowledgeBaseTab,
} from "./knowledgeBaseTraining";
import type { KbTrainingPathStep } from "./learning";

vi.mock("@/config/publicEnv", () => ({
  publicSiteOrigin: () => "https://beautonomi.com",
}));

describe("publicLearnUrl", () => {
  it("builds customer/provider-facing learn URLs on the public site, not admin", () => {
    expect(publicLearnUrl("provider-commissions-payroll")).toBe(
      "https://beautonomi.com/learn/article/provider-commissions-payroll",
    );
  });
});

describe("parseKnowledgeBaseTab", () => {
  it("defaults to paths unless tab=browse", () => {
    expect(parseKnowledgeBaseTab(null)).toBe("paths");
    expect(parseKnowledgeBaseTab("paths")).toBe("paths");
    expect(parseKnowledgeBaseTab("browse")).toBe("browse");
  });
});

describe("firstContinueSlug", () => {
  const steps: KbTrainingPathStep[] = [
    { step: 1, slug: "a", status: "published", title: "A" },
    { step: 2, slug: "b", status: "draft", title: "B" },
    { step: 3, slug: "c", status: "published", title: "C" },
  ];

  it("skips non-published and already signed steps", () => {
    expect(firstContinueSlug(steps, ["a"])).toBe("c");
    expect(firstContinueSlug(steps, ["a", "c"])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { computeBriefQualityScore, resolveBriefSchema } from "../brief-schema";

describe("resolveBriefSchema", () => {
  it("adds influencer disclosure when influencer channel selected", () => {
    const sections = resolveBriefSchema({
      campaign_type: "influencer",
      channels_requested: ["influencer"],
      budget_envelope: 1000,
    });
    const channelSection = sections.find((s) => s.key === "channels");
    expect(channelSection?.fields.some((f) => f.key === "influencer_disclosure")).toBe(true);
  });

  it("adds podcast attribution fields when podcast channel selected", () => {
    const sections = resolveBriefSchema({
      campaign_type: "brand_awareness",
      channels_requested: ["podcast"],
    });
    const channelSection = sections.find((s) => s.key === "channels");
    expect(channelSection?.fields.some((f) => f.key === "podcast_show")).toBe(true);
    expect(channelSection?.fields.some((f) => f.key === "podcast_measurement")).toBe(true);
  });

  it("quality score counts required fields", () => {
    const schema = resolveBriefSchema({
      campaign_type: "brand_awareness",
      channels_requested: [],
    });
    const score = computeBriefQualityScore({ name: "X", business_problem: "Y" }, schema);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("includes pillar_id and plan_id in quality when present", () => {
    const schema = resolveBriefSchema({
      campaign_type: "brand_awareness",
      channels_requested: [],
    });
    const partial = computeBriefQualityScore(
      { name: "X", business_problem: "Y", objective: "Z", proposition: "P", pillar_id: "a", plan_id: "b" },
      schema,
    );
    const withoutPlan = computeBriefQualityScore(
      { name: "X", business_problem: "Y", objective: "Z", proposition: "P", pillar_id: "a" },
      schema,
    );
    expect(partial).toBeGreaterThan(withoutPlan);
  });
});

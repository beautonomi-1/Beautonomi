import { describe, expect, it } from "vitest";
import { BRAND_CAMPAIGN_STAGES, STAGE_META } from "./brandTypes";
import { parseBrandCampaignDetailTab } from "./brandCampaignUrl";

describe("brand campaign URL helpers", () => {
  it("maps legacy performance tabs to performance", () => {
    expect(parseBrandCampaignDetailTab("results")).toBe("performance");
    expect(parseBrandCampaignDetailTab("funnel")).toBe("performance");
    expect(parseBrandCampaignDetailTab("metrics")).toBe("performance");
  });

  it("defaults unknown tabs to overview", () => {
    expect(parseBrandCampaignDetailTab("activity")).toBe("overview");
    expect(parseBrandCampaignDetailTab(null)).toBe("overview");
  });

  it("defines stage meta for every stage", () => {
    for (const stage of BRAND_CAMPAIGN_STAGES) {
      expect(STAGE_META[stage].label.length).toBeGreaterThan(0);
      expect(STAGE_META[stage].barClass).toMatch(/^bg-/);
    }
  });
});

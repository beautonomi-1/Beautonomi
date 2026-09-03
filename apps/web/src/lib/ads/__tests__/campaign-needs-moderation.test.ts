import { describe, it, expect } from "vitest";
import { campaignNeedsModeration } from "@/lib/ads/campaign-needs-moderation";

describe("campaignNeedsModeration", () => {
  it("returns false for default pack targeting", () => {
    expect(campaignNeedsModeration({ global_category_ids: ["x"] }, {})).toBe(false);
  });

  it("returns true when custom headline is set", () => {
    expect(campaignNeedsModeration({ custom_headline: "Summer special" }, {})).toBe(true);
  });
});

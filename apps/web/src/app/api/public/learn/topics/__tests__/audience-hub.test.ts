import { describe, expect, it } from "vitest";
import {
  isLearnAudienceHubSlug,
  LEARN_AUDIENCE_HUB_SLUGS,
} from "../[slug]/route";

describe("isLearnAudienceHubSlug", () => {
  it("accepts audience hub slugs only", () => {
    for (const slug of LEARN_AUDIENCE_HUB_SLUGS) {
      expect(isLearnAudienceHubSlug(slug)).toBe(true);
    }
    expect(isLearnAudienceHubSlug("policies")).toBe(false);
    expect(isLearnAudienceHubSlug("customer-extra")).toBe(false);
  });
});
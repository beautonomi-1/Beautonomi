import { describe, expect, it } from "@jest/globals";
import {
  explorePostReturnToPath,
  parseExplorePostIdFromUrl,
  parseExplorePostReturnToFromAppPath,
} from "@/lib/explore-deep-link";

const SAMPLE_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

describe("parseExplorePostIdFromUrl", () => {
  it("parses customer scheme links", () => {
    expect(parseExplorePostIdFromUrl(`customer://explore-post?id=${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it("parses marketing-site universal links", () => {
    expect(parseExplorePostIdFromUrl(`https://www.beautonomi.com/explore/${SAMPLE_ID}`)).toBe(SAMPLE_ID);
    expect(parseExplorePostIdFromUrl(`https://beautonomi.co.za/explore/${SAMPLE_ID}?utm=share`)).toBe(
      SAMPLE_ID,
    );
  });

  it("ignores non-explore paths", () => {
    expect(parseExplorePostIdFromUrl("https://www.beautonomi.com/partner-profile?slug=foo")).toBeNull();
    expect(parseExplorePostIdFromUrl("customer://bookings")).toBeNull();
  });

  it("builds post-login return_to from universal-link pathname", () => {
    expect(parseExplorePostReturnToFromAppPath(`/explore/${SAMPLE_ID}`)).toBe(
      explorePostReturnToPath(SAMPLE_ID),
    );
    expect(parseExplorePostReturnToFromAppPath("/explore/not-a-uuid")).toBeNull();
  });
});

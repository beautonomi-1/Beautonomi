import { shouldShowExploreNav } from "@/lib/explore/explore-visibility";

describe("shouldShowExploreNav", () => {
  it("hides when feature flag is off", () => {
    expect(
      shouldShowExploreNav({
        flagEnabled: false,
        signedIn: true,
        hideSocialFeed: false,
        ageBand: "18_plus",
      }),
    ).toBe(false);
  });

  it("shows for guests when flag is on", () => {
    expect(
      shouldShowExploreNav({
        flagEnabled: true,
        signedIn: false,
        hideSocialFeed: true,
        ageBand: "unknown",
      }),
    ).toBe(true);
  });

  it("hides for signed-in user with hide_social_feed", () => {
    expect(
      shouldShowExploreNav({
        flagEnabled: true,
        signedIn: true,
        hideSocialFeed: true,
        ageBand: "18_plus",
      }),
    ).toBe(false);
  });

  it("hides for under_13", () => {
    expect(
      shouldShowExploreNav({
        flagEnabled: true,
        signedIn: true,
        hideSocialFeed: false,
        ageBand: "under_13",
      }),
    ).toBe(false);
  });

  it("shows for 18_plus signed-in with hide off", () => {
    expect(
      shouldShowExploreNav({
        flagEnabled: true,
        signedIn: true,
        hideSocialFeed: false,
        ageBand: "18_plus",
      }),
    ).toBe(true);
  });
});

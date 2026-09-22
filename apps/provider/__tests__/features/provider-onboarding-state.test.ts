import { effectiveZoneSuggestStatus, stepIsVisible, wizardStepIdForKey } from "@/features/provider-onboarding/state";

describe("provider onboarding state", () => {
  it("hides zones step when suggest status is matched", () => {
    expect(
      stepIsVisible(9, {
        business_type: "mobile",
        zone_suggest_status: "matched",
        selected_zone_ids: ["z1"],
      }),
    ).toBe(false);
    expect(
      stepIsVisible(9, {
        business_type: "mobile",
        zone_suggest_status: "none",
      }),
    ).toBe(true);
  });

  it("maps travel_fees to step 10 on mobile", () => {
    expect(wizardStepIdForKey("travel_fees")).toBe(10);
  });

  it("legacy drafts with zone ids skip zones step", () => {
    expect(
      stepIsVisible(9, {
        business_type: "both",
        selected_zone_ids: ["z"],
      }),
    ).toBe(false);
    expect(effectiveZoneSuggestStatus({ selected_zone_ids: ["z"] })).toBe("matched");
  });
});

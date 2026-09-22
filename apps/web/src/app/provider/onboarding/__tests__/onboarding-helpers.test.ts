import { describe, expect, it } from "vitest";
import {
  ensureHttpsUrl,
  effectiveZoneSuggestStatus,
  zonesStepVisible,
  wizardStepIdForKey,
  zoneSuggestInvalidationPatch,
} from "../onboarding-helpers";

describe("onboarding-helpers", () => {
  it("ensureHttpsUrl prefixes bare domains", () => {
    expect(ensureHttpsUrl("instagram.com/x")).toBe("https://instagram.com/x");
    expect(ensureHttpsUrl("https://x.com/a")).toBe("https://x.com/a");
  });

  it("wizardStepIdForKey maps travel_fees to categories on web", () => {
    expect(wizardStepIdForKey("travel_fees", "web")).toBe(10);
    expect(wizardStepIdForKey("travel_fees", "mobile")).toBe(10);
    expect(wizardStepIdForKey("categories", "web")).toBe(10);
    expect(wizardStepIdForKey("categories", "mobile")).toBe(11);
  });

  it("zonesStepVisible hides when matched", () => {
    expect(
      zonesStepVisible({
        business_type: "mobile",
        zone_suggest_status: "matched",
        selected_zone_ids: ["z1"],
      }),
    ).toBe(false);
    expect(
      zonesStepVisible({
        business_type: "mobile",
        zone_suggest_status: "none",
      }),
    ).toBe(true);
  });

  it("effectiveZoneSuggestStatus treats legacy selected zones as matched", () => {
    expect(effectiveZoneSuggestStatus({ selected_zone_ids: ["a"] })).toBe("matched");
  });

  it("zoneSuggestInvalidationPatch clears match when coordinates change", () => {
    expect(
      zoneSuggestInvalidationPatch(-26.1, 28.0, -26.2, 28.1),
    ).toEqual({ zone_suggest_status: undefined, selected_zone_ids: [] });
    expect(zoneSuggestInvalidationPatch(-26.1, 28.0, -26.1, 28.0)).toBeNull();
  });
});

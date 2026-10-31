import { describe, expect, it, vi } from "vitest";
import { effectiveSafetySettings } from "../safety-settings";
import { resolveAgeAssurancePolicy } from "../age-policy";

vi.mock("../age-policy", () => ({
  resolveAgeAssurancePolicy: vi.fn(async () => ({
    socialAgeGateMode: "off",
    restrictedModeDefaults: {},
  })),
}));

const mockedResolveAgeAssurancePolicy = vi.mocked(resolveAgeAssurancePolicy);

describe("effectiveSafetySettings", () => {
  it("defaults booleans when stored settings are empty", async () => {
    mockedResolveAgeAssurancePolicy.mockResolvedValueOnce({
      socialMinAge: 13,
      socialAgeGateMode: "off",
      restrictedModeDefaults: {},
    });
    const effective = await effectiveSafetySettings("13_17", {});
    expect(effective.restricted_mode.value).toBe(false);
    expect(effective.hide_social_feed.value).toBe(false);
    expect(effective.disable_direct_messaging.value).toBe(false);
  });

  it("honors stored toggles when policy does not force them", async () => {
    mockedResolveAgeAssurancePolicy.mockResolvedValueOnce({
      socialMinAge: 13,
      socialAgeGateMode: "off",
      restrictedModeDefaults: {},
    });
    const effective = await effectiveSafetySettings("18_plus", {
      restricted_mode: true,
      hide_social_feed: true,
    });
    expect(effective.restricted_mode.value).toBe(true);
    expect(effective.hide_social_feed.value).toBe(true);
    expect(effective.restricted_mode.locked).toBe(false);
  });

  it("forces restricted defaults only for 13_17 when the social gate is enforce", async () => {
    mockedResolveAgeAssurancePolicy.mockResolvedValue({
      socialMinAge: 13,
      socialAgeGateMode: "enforce",
      restrictedModeDefaults: {
        hide_social_feed: true,
        restricted_mode: true,
      },
    });
    const teen = await effectiveSafetySettings("13_17", { hide_social_feed: false });
    expect(teen.hide_social_feed.value).toBe(true);
    expect(teen.hide_social_feed.locked).toBe(true);

    const unknown = await effectiveSafetySettings("unknown", { hide_social_feed: false });
    expect(unknown.hide_social_feed.value).toBe(true);
    expect(unknown.hide_social_feed.locked).toBe(true);
  });
});

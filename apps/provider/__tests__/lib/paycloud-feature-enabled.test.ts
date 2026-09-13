import { resolvePaycloudFeatureEnabled } from "@/lib/paycloud-feature-enabled";

describe("resolvePaycloudFeatureEnabled", () => {
  it("returns true when public flag is on", () => {
    expect(
      resolvePaycloudFeatureEnabled({
        flagEnabled: true,
        settingsAvailable: false,
        platformSessionDisabled: false,
      }),
    ).toBe(true);
  });

  it("returns true when settings loaded without public flag", () => {
    expect(
      resolvePaycloudFeatureEnabled({
        flagEnabled: false,
        settingsAvailable: true,
        platformSessionDisabled: false,
      }),
    ).toBe(true);
  });

  it("returns false when neither flag nor settings are available", () => {
    expect(
      resolvePaycloudFeatureEnabled({
        flagEnabled: false,
        settingsAvailable: false,
        platformSessionDisabled: false,
      }),
    ).toBe(false);
  });

  it("returns false when platform session disabled even with settings", () => {
    expect(
      resolvePaycloudFeatureEnabled({
        flagEnabled: true,
        settingsAvailable: true,
        platformSessionDisabled: true,
      }),
    ).toBe(false);
  });
});

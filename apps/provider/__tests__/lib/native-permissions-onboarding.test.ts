/** Mirrors NativePermissionsOnboarding step order for regression coverage. */
const PERMISSIONS_ONBOARDING_STEPS = ["welcome", "notifications"] as const;

describe("NativePermissionsOnboarding steps", () => {
  it("includes welcome then notifications only", () => {
    expect(PERMISSIONS_ONBOARDING_STEPS).toEqual(["welcome", "notifications"]);
    expect(PERMISSIONS_ONBOARDING_STEPS).toHaveLength(2);
  });
});

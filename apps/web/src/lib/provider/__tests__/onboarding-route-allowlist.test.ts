import { describe, expect, it } from "vitest";
import { isProviderOnboardingRouteAllowed } from "../onboarding-route-allowlist";

describe("isProviderOnboardingRouteAllowed", () => {
  it("allows get-started and onboarding wizard", () => {
    expect(isProviderOnboardingRouteAllowed("/provider/get-started")).toBe(true);
    expect(isProviderOnboardingRouteAllowed("/provider/onboarding")).toBe(true);
  });

  it("allows dashboard and setup settings during onboarding portal", () => {
    expect(isProviderOnboardingRouteAllowed("/provider/dashboard")).toBe(true);
    expect(isProviderOnboardingRouteAllowed("/provider/settings/payout-accounts")).toBe(true);
    expect(isProviderOnboardingRouteAllowed("/provider/catalogue/services")).toBe(true);
  });

  it("blocks unrelated provider routes", () => {
    expect(isProviderOnboardingRouteAllowed("/provider/bookings")).toBe(false);
    expect(isProviderOnboardingRouteAllowed("/provider/finance")).toBe(false);
  });
});

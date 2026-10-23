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

  it("allows exact /provider/settings but not arbitrary settings subpaths", () => {
    expect(isProviderOnboardingRouteAllowed("/provider/settings")).toBe(true);
    expect(isProviderOnboardingRouteAllowed("/provider/settings/team")).toBe(false);
  });

  it("allows travel fees and cancellation policy setup routes", () => {
    expect(isProviderOnboardingRouteAllowed("/provider/settings/sales/travel-fees")).toBe(true);
    expect(isProviderOnboardingRouteAllowed("/provider/settings/cancellation-policies")).toBe(true);
    expect(isProviderOnboardingRouteAllowed("/provider/settings/business-description")).toBe(true);
  });
});

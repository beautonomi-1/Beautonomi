import {
  canSkipProviderVerification,
  providerVerificationOnboardingBanner,
  verificationRequiredForProviders,
} from "./provider-verification-ui";

describe("provider verification UI helpers", () => {
  it("detects required policy", () => {
    expect(verificationRequiredForProviders({ required_for_providers: true } as never)).toBe(true);
    expect(verificationRequiredForProviders({ required_for_providers: false } as never)).toBe(false);
    expect(verificationRequiredForProviders(undefined)).toBe(false);
  });

  it("shows required onboarding banner copy", () => {
    expect(providerVerificationOnboardingBanner(true)).toContain("required");
    expect(providerVerificationOnboardingBanner(false)).toContain("optional");
  });

  it("allows skip only when policy or status permits", () => {
    expect(canSkipProviderVerification({ required: true, status: "pending" })).toBe(true);
    expect(canSkipProviderVerification({ required: true, status: "not_started" })).toBe(false);
  });

  it("blocks skip when verification plan is incomplete even if status is in_progress", () => {
    expect(
      canSkipProviderVerification({
        required: true,
        status: "in_progress",
        planComplete: false,
      }),
    ).toBe(false);
    expect(
      canSkipProviderVerification({
        required: true,
        status: "in_progress",
        planComplete: true,
      }),
    ).toBe(true);
  });
});

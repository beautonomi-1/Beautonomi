import {
  canShowBiometricSetupPrompt,
  type BiometricPromptEligibilityInput,
} from "@/lib/biometric-setup-prompt";

function base(overrides: Partial<BiometricPromptEligibilityInput> = {}): BiometricPromptEligibilityInput {
  return {
    platform: "android",
    isScreenshotMode: false,
    isAvailable: true,
    isEnabled: false,
    dismissed: false,
    pending: true,
    pathname: "/(app)/(tabs)/dashboard",
    permissionsPhase: "complete",
    ...overrides,
  };
}

describe("canShowBiometricSetupPrompt (provider)", () => {
  it("shows when all gates pass", () => {
    expect(canShowBiometricSetupPrompt(base())).toBe(true);
  });

  it("blocks on onboarding wizard until navigation completes", () => {
    expect(
      canShowBiometricSetupPrompt(base({ pathname: "/(app)/onboarding/wizard" })),
    ).toBe(false);
  });

  it("allows after leaving onboarding for verify-identity is still blocked", () => {
    expect(
      canShowBiometricSetupPrompt(base({ pathname: "/(app)/onboarding/verify-identity" })),
    ).toBe(false);
  });
});

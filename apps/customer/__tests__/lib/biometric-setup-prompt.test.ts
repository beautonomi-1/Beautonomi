import {
  canShowBiometricSetupPrompt,
  type BiometricPromptEligibilityInput,
} from "@/lib/biometric-setup-prompt";

function base(overrides: Partial<BiometricPromptEligibilityInput> = {}): BiometricPromptEligibilityInput {
  return {
    platform: "ios",
    isScreenshotMode: false,
    isAvailable: true,
    isEnabled: false,
    dismissed: false,
    pending: true,
    pathname: "/(app)/(tabs)/home",
    permissionsPhase: "complete",
    ...overrides,
  };
}

describe("canShowBiometricSetupPrompt", () => {
  it("shows when all gates pass", () => {
    expect(canShowBiometricSetupPrompt(base())).toBe(true);
  });

  it("blocks web", () => {
    expect(canShowBiometricSetupPrompt(base({ platform: "web" }))).toBe(false);
  });

  it("blocks screenshot mode", () => {
    expect(canShowBiometricSetupPrompt(base({ isScreenshotMode: true }))).toBe(false);
  });

  it("blocks without pending flag", () => {
    expect(canShowBiometricSetupPrompt(base({ pending: false }))).toBe(false);
  });

  it("blocks when biometrics unavailable or already enabled", () => {
    expect(canShowBiometricSetupPrompt(base({ isAvailable: false }))).toBe(false);
    expect(canShowBiometricSetupPrompt(base({ isEnabled: true }))).toBe(false);
  });

  it("blocks when user dismissed the prompt", () => {
    expect(canShowBiometricSetupPrompt(base({ dismissed: true }))).toBe(false);
  });

  it("blocks on onboarding routes", () => {
    expect(canShowBiometricSetupPrompt(base({ pathname: "/(app)/onboarding" }))).toBe(false);
    expect(
      canShowBiometricSetupPrompt(base({ pathname: "/(app)/onboarding/wizard" })),
    ).toBe(false);
  });

  it("blocks while native permissions onboarding is active", () => {
    expect(canShowBiometricSetupPrompt(base({ permissionsPhase: "loading" }))).toBe(false);
    expect(canShowBiometricSetupPrompt(base({ permissionsPhase: "needs_onboarding" }))).toBe(false);
  });
});

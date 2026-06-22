import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  canShowBiometricSetupPrompt,
  clearBiometricPromptPending,
  dismissedKey,
  hydrateBiometricPromptPending,
  isBiometricPromptPending,
  isBiometricSetupPromptDismissed,
  markBiometricSetupPromptDismissed,
  pendingKey,
  setBiometricPromptPending,
  shouldOfferBiometricSetupToReturningUser,
  type BiometricPromptEligibilityInput,
} from "@/lib/biometric-setup-prompt";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

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

  it("blocks when setup celebration is visible", () => {
    expect(canShowBiometricSetupPrompt(base({ blockingModalOpen: true }))).toBe(false);
  });
});

describe("persisted pending (provider)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    void clearBiometricPromptPending();
  });

  it("persists pending and hydrates after restart", async () => {
    await setBiometricPromptPending("provider-1");
    expect(mockStorage.setItem).toHaveBeenCalledWith(pendingKey("provider-1"), "1");

    await clearBiometricPromptPending();
    mockStorage.getItem.mockResolvedValueOnce("1");
    await hydrateBiometricPromptPending("provider-1");
    expect(isBiometricPromptPending("provider-1")).toBe(true);
  });
});

describe("shouldOfferBiometricSetupToReturningUser (provider)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    void clearBiometricPromptPending();
  });

  it("offers eligible returning providers once", async () => {
    mockStorage.getItem.mockResolvedValue(null);
    await expect(
      shouldOfferBiometricSetupToReturningUser({
        userId: "provider-1",
        onboardingComplete: true,
        isEnabled: false,
        isAvailable: true,
        dismissed: false,
      }),
    ).resolves.toBe(true);
  });

  it("skips when dismissed", async () => {
    await expect(
      shouldOfferBiometricSetupToReturningUser({
        userId: "provider-1",
        onboardingComplete: true,
        isEnabled: false,
        isAvailable: true,
        dismissed: true,
      }),
    ).resolves.toBe(false);
  });
});

describe("dismiss snooze (provider)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stores snooze payload on dismiss", async () => {
    await markBiometricSetupPromptDismissed("provider-1");
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      dismissedKey("provider-1"),
      expect.stringContaining("snoozeUntil"),
    );
  });

  it("respects active snooze", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockStorage.getItem.mockResolvedValue(
      JSON.stringify({ dismissedAt: new Date().toISOString(), snoozeUntil: future }),
    );
    await expect(isBiometricSetupPromptDismissed("provider-1")).resolves.toBe(true);
  });
});

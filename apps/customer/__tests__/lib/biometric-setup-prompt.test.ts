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

  it("blocks when another modal is open", () => {
    expect(canShowBiometricSetupPrompt(base({ blockingModalOpen: true }))).toBe(false);
  });
});

describe("persisted pending", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    void clearBiometricPromptPending();
  });

  it("persists pending and hydrates after restart", async () => {
    await setBiometricPromptPending("user-1");
    expect(mockStorage.setItem).toHaveBeenCalledWith(pendingKey("user-1"), "1");
    expect(isBiometricPromptPending("user-1")).toBe(true);

    await clearBiometricPromptPending();
    expect(isBiometricPromptPending("user-1")).toBe(false);

    mockStorage.getItem.mockResolvedValueOnce("1");
    await hydrateBiometricPromptPending("user-1");
    expect(isBiometricPromptPending("user-1")).toBe(true);
  });

  it("clears persisted pending for an explicit user on sign-out", async () => {
    mockStorage.getItem.mockResolvedValueOnce("1");
    await hydrateBiometricPromptPending("user-1");
    await clearBiometricPromptPending("user-1");
    expect(mockStorage.removeItem).toHaveBeenCalledWith(pendingKey("user-1"));
    expect(isBiometricPromptPending("user-1")).toBe(false);
  });
});

describe("shouldOfferBiometricSetupToReturningUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    void clearBiometricPromptPending();
  });

  it("offers when eligible returning user", async () => {
    mockStorage.getItem.mockResolvedValue(null);
    await expect(
      shouldOfferBiometricSetupToReturningUser({
        userId: "user-1",
        onboardingComplete: true,
        isEnabled: false,
        isAvailable: true,
        dismissed: false,
      }),
    ).resolves.toBe(true);
  });

  it("skips when onboarding incomplete or already enabled", async () => {
    await expect(
      shouldOfferBiometricSetupToReturningUser({
        userId: "user-1",
        onboardingComplete: false,
        isEnabled: false,
        isAvailable: true,
        dismissed: false,
      }),
    ).resolves.toBe(false);

    await expect(
      shouldOfferBiometricSetupToReturningUser({
        userId: "user-1",
        onboardingComplete: true,
        isEnabled: true,
        isAvailable: true,
        dismissed: false,
      }),
    ).resolves.toBe(false);
  });

  it("skips when pending already stored", async () => {
    mockStorage.getItem.mockResolvedValue("1");
    await expect(
      shouldOfferBiometricSetupToReturningUser({
        userId: "user-1",
        onboardingComplete: true,
        isEnabled: false,
        isAvailable: true,
        dismissed: false,
      }),
    ).resolves.toBe(false);
  });
});

describe("dismiss snooze", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("treats legacy permanent dismiss as dismissed", async () => {
    mockStorage.getItem.mockResolvedValue("1");
    await expect(isBiometricSetupPromptDismissed("user-1")).resolves.toBe(true);
  });

  it("expires snooze after window", async () => {
    const expired = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    mockStorage.getItem.mockResolvedValue(
      JSON.stringify({ dismissedAt: expired, snoozeUntil: expired }),
    );
    await expect(isBiometricSetupPromptDismissed("user-1")).resolves.toBe(false);
    expect(mockStorage.removeItem).toHaveBeenCalledWith(dismissedKey("user-1"));
  });

  it("stores snooze payload on dismiss", async () => {
    await markBiometricSetupPromptDismissed("user-1");
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      dismissedKey("user-1"),
      expect.stringContaining("snoozeUntil"),
    );
  });
});

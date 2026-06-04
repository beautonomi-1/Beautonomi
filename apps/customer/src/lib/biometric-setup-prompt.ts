import AsyncStorage from "@react-native-async-storage/async-storage";

const DISMISSED_KEY_PREFIX = "biometric_setup_prompt_dismissed_v1";

let pendingUserId: string | null = null;
const pendingListeners = new Set<() => void>();

function notifyPendingListeners(): void {
  pendingListeners.forEach((listener) => listener());
}

export function dismissedKey(userId: string): string {
  return `${DISMISSED_KEY_PREFIX}:${userId}`;
}

/** Call when profile onboarding completes so the prompt can show on the next eligible screen. */
export function setBiometricPromptPending(userId: string): void {
  pendingUserId = userId;
  notifyPendingListeners();
}

/** Re-run eligibility when pending is set without a pathname change. */
export function subscribeBiometricPromptPending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

export function isBiometricPromptPending(userId: string): boolean {
  return pendingUserId === userId;
}

export function clearBiometricPromptPending(): void {
  pendingUserId = null;
  notifyPendingListeners();
}

export async function isBiometricSetupPromptDismissed(userId: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(dismissedKey(userId));
    return v === "1";
  } catch {
    return false;
  }
}

export async function markBiometricSetupPromptDismissed(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(dismissedKey(userId), "1");
  } catch {
    /* ignore */
  }
}

export async function clearBiometricSetupPromptDismissed(userId: string | null): Promise<void> {
  if (!userId?.trim()) return;
  try {
    await AsyncStorage.removeItem(dismissedKey(userId));
  } catch {
    /* ignore */
  }
}

export type BiometricPromptEligibilityInput = {
  platform: string;
  isScreenshotMode: boolean;
  isAvailable: boolean;
  isEnabled: boolean;
  dismissed: boolean;
  pending: boolean;
  pathname: string;
  permissionsPhase: "loading" | "needs_onboarding" | "complete";
};

export function canShowBiometricSetupPrompt(input: BiometricPromptEligibilityInput): boolean {
  if (input.platform === "web") return false;
  if (input.isScreenshotMode) return false;
  if (!input.pending) return false;
  if (!input.isAvailable || input.isEnabled || input.dismissed) return false;
  if (input.pathname.includes("/onboarding")) return false;
  if (input.permissionsPhase === "loading" || input.permissionsPhase === "needs_onboarding") {
    return false;
  }
  return true;
}

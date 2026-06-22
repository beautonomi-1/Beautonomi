import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_KEY_PREFIX = "provider_biometric_setup_prompt_pending_v1";
const DISMISSED_KEY_PREFIX = "provider_biometric_setup_prompt_dismissed_v1";
const SNOOZE_MS = 90 * 24 * 60 * 60 * 1000;

let pendingUserId: string | null = null;
const pendingListeners = new Set<() => void>();

function notifyPendingListeners(): void {
  pendingListeners.forEach((listener) => listener());
}

export function pendingKey(userId: string): string {
  return `${PENDING_KEY_PREFIX}:${userId}`;
}

export function dismissedKey(userId: string): string {
  return `${DISMISSED_KEY_PREFIX}:${userId}`;
}

/** Restore in-memory pending from AsyncStorage after app restart. */
export async function hydrateBiometricPromptPending(userId: string): Promise<void> {
  if (!userId.trim()) return;
  try {
    const v = await AsyncStorage.getItem(pendingKey(userId));
    if (v === "1" && pendingUserId !== userId) {
      pendingUserId = userId;
      notifyPendingListeners();
    }
  } catch {
    /* ignore */
  }
}

/** Call when provider setup onboarding completes so the prompt can show on the next eligible screen. */
export async function setBiometricPromptPending(userId: string): Promise<void> {
  pendingUserId = userId;
  try {
    await AsyncStorage.setItem(pendingKey(userId), "1");
  } catch {
    /* ignore */
  }
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

export async function hasStoredBiometricPromptPending(userId: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(pendingKey(userId));
    return v === "1";
  } catch {
    return false;
  }
}

export async function clearBiometricPromptPending(userId?: string | null): Promise<void> {
  const target = userId?.trim() ?? pendingUserId;
  pendingUserId = null;
  if (target) {
    try {
      await AsyncStorage.removeItem(pendingKey(target));
    } catch {
      /* ignore */
    }
  }
  notifyPendingListeners();
}

function parseDismissedValue(raw: string): { snoozed: boolean } {
  if (raw === "1") return { snoozed: true };
  try {
    const parsed = JSON.parse(raw) as { snoozeUntil?: string; dismissedAt?: string };
    if (parsed.snoozeUntil) {
      const until = Date.parse(parsed.snoozeUntil);
      if (!Number.isNaN(until) && Date.now() < until) return { snoozed: true };
      return { snoozed: false };
    }
    if (parsed.dismissedAt) {
      const at = Date.parse(parsed.dismissedAt);
      if (!Number.isNaN(at) && Date.now() - at < SNOOZE_MS) return { snoozed: true };
      return { snoozed: false };
    }
  } catch {
    /* legacy */
  }
  return { snoozed: raw === "1" };
}

export async function isBiometricSetupPromptDismissed(userId: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(dismissedKey(userId));
    if (!v) return false;
    const { snoozed } = parseDismissedValue(v);
    if (!snoozed && v !== "1") {
      await AsyncStorage.removeItem(dismissedKey(userId));
    }
    return snoozed;
  } catch {
    return false;
  }
}

export async function markBiometricSetupPromptDismissed(userId: string): Promise<void> {
  const snoozeUntil = new Date(Date.now() + SNOOZE_MS).toISOString();
  try {
    await AsyncStorage.setItem(
      dismissedKey(userId),
      JSON.stringify({ dismissedAt: new Date().toISOString(), snoozeUntil }),
    );
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

export async function shouldOfferBiometricSetupToReturningUser(input: {
  userId: string;
  onboardingComplete: boolean;
  isEnabled: boolean;
  isAvailable: boolean;
  dismissed: boolean;
}): Promise<boolean> {
  if (!input.onboardingComplete) return false;
  if (!input.isAvailable || input.isEnabled || input.dismissed) return false;
  if (isBiometricPromptPending(input.userId)) return false;
  if (await hasStoredBiometricPromptPending(input.userId)) return false;
  return true;
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
  blockingModalOpen?: boolean;
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
  if (input.blockingModalOpen) return false;
  return true;
}

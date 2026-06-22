import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { usePathname } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { api } from "@/lib/api-client";
import {
  hydrateBiometricPromptPending,
  isBiometricSetupPromptDismissed,
  setBiometricPromptPending,
  shouldOfferBiometricSetupToReturningUser,
} from "@/lib/biometric-setup-prompt";

/**
 * One-time opt-in for returning providers who completed setup before the
 * biometric setup prompt existed, or who never saw it on this device.
 */
export function BiometricSetupBootstrap() {
  const { user } = useAuth();
  const pathname = usePathname();
  const biometric = useBiometricAuth();
  const userId = user?.id ?? null;
  const evaluatedForUser = useRef<string | null>(null);
  const inFlightForUser = useRef<string | null>(null);

  useEffect(() => {
    evaluatedForUser.current = null;
    inFlightForUser.current = null;
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === "web" || !userId) return;
    if (pathname?.includes("/onboarding")) return;
    if (!biometric.isAvailable || biometric.isEnabled) return;
    if (evaluatedForUser.current === userId) return;
    if (inFlightForUser.current === userId) return;

    inFlightForUser.current = userId;
    let cancelled = false;

    const run = async () => {
      try {
        await hydrateBiometricPromptPending(userId);
        if (cancelled) return;

        let onboardingComplete = false;
        try {
          const res = await api.get<{ isComplete?: boolean }>("/api/provider/setup-status");
          onboardingComplete = res.data?.isComplete === true;
        } catch {
          /* ignore */
        }
        if (cancelled || !onboardingComplete) return;

        const dismissed = await isBiometricSetupPromptDismissed(userId);
        if (cancelled) return;

        const shouldOffer = await shouldOfferBiometricSetupToReturningUser({
          userId,
          onboardingComplete,
          isEnabled: biometric.isEnabled,
          isAvailable: biometric.isAvailable,
          dismissed,
        });
        if (cancelled) return;

        evaluatedForUser.current = userId;
        if (shouldOffer) {
          await setBiometricPromptPending(userId);
        }
      } finally {
        if (inFlightForUser.current === userId) {
          inFlightForUser.current = null;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [userId, pathname, biometric.isAvailable, biometric.isEnabled]);

  return null;
}

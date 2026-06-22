import { useState, useEffect, useCallback } from "react";
import { Platform, Alert } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_ENABLED_KEY = "provider_biometric_auth_enabled";

/**
 * §Release-audit 2026-04: single global key was never cleared on
 * sign-out, so another provider signing in on the same device saw the
 * previous user's biometric-enabled state. Worse, `BiometricGate` would
 * try to unlock with a stale preference. The auth layer now calls this
 * on every sign-out.
 */
export async function clearBiometricPreference(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  } catch {
    // Best-effort only.
  }
}

interface BiometricAuthState {
  isAvailable: boolean;
  biometricType: "fingerprint" | "face" | "iris" | null;
  isEnabled: boolean;
  isAuthenticating: boolean;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  authenticate: (reason?: string) => Promise<boolean>;
}

export function useBiometricAuth(): BiometricAuthState {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<
    "fingerprint" | "face" | "iris" | null
  >(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (Platform.OS === "web") return;

      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const available = compatible && enrolled;

        if (cancelled) return;
        setIsAvailable(available);

        if (available) {
          const types =
            await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (cancelled) return;

          if (
            types.includes(
              LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
            )
          ) {
            setBiometricType("face");
          } else if (
            types.includes(
              LocalAuthentication.AuthenticationType.FINGERPRINT,
            )
          ) {
            setBiometricType("fingerprint");
          } else if (
            types.includes(LocalAuthentication.AuthenticationType.IRIS)
          ) {
            setBiometricType("iris");
          }
        }

        const stored = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
        if (cancelled) return;
        setIsEnabled(stored === "true" && available);
      } catch {
        // Silently fail on platforms that don't support biometric
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!isAvailable) {
      Alert.alert(
        "Biometric Not Available",
        "Your device does not support biometric authentication or no biometrics are enrolled.",
      );
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Verify your identity to enable app lock",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });

    if (result.success) {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
      setIsEnabled(true);
      return true;
    }

    return false;
  }, [isAvailable]);

  const disable = useCallback(async () => {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "false");
    setIsEnabled(false);
  }, []);

  const authenticate = useCallback(
    async (reason?: string): Promise<boolean> => {
      if (!isAvailable || !isEnabled) return false;

      setIsAuthenticating(true);
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: reason ?? "Authenticate to access Beautonomi",
          cancelLabel: "Cancel",
          disableDeviceFallback: false,
        });
        return result.success;
      } catch {
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [isAvailable, isEnabled],
  );

  return {
    isAvailable,
    biometricType,
    isEnabled,
    isAuthenticating,
    enable,
    disable,
    authenticate,
  };
}

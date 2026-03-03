import { useState, useEffect, useCallback } from "react";
import { Platform, Alert } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_ENABLED_KEY = "biometric_auth_enabled";

interface BiometricAuthState {
  /** Whether the device supports biometric auth */
  isAvailable: boolean;
  /** Type of biometric (fingerprint, face, iris) */
  biometricType: "fingerprint" | "face" | "iris" | null;
  /** Whether the user has enabled biometric auth */
  isEnabled: boolean;
  /** Whether authentication is in progress */
  isAuthenticating: boolean;
  /** Enable biometric auth for future logins */
  enable: () => Promise<boolean>;
  /** Disable biometric auth */
  disable: () => Promise<void>;
  /** Prompt for biometric authentication */
  authenticate: (reason?: string) => Promise<boolean>;
}

export function useBiometricAuth(): BiometricAuthState {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<"fingerprint" | "face" | "iris" | null>(null);
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
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (cancelled) return;

          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricType("face");
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricType("fingerprint");
          } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
            setBiometricType("iris");
          }
        }

        const stored = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
        if (cancelled) return;
        setIsEnabled(stored === "true" && available);
      } catch {
        // Silently fail
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!isAvailable) {
      Alert.alert(
        "Biometric Not Available",
        "Your device does not support biometric authentication or no biometrics are enrolled."
      );
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Verify your identity to enable biometric login",
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

  const authenticate = useCallback(async (reason?: string): Promise<boolean> => {
    if (!isAvailable || !isEnabled) return false;

    setIsAuthenticating(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason ?? "Authenticate to continue",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAvailable, isEnabled]);

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

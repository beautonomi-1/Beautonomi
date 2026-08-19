/**
 * BiometricGate – customer app equivalent of the provider's BiometricGate.
 *
 * Behaviour:
 *   • On cold start: reads the `biometric_auth_enabled` SecureStore key
 *     (written by `useBiometricAuth` in Login & Security settings).
 *     If true, prompts immediately before showing any (app)/* screen.
 *   • On resume after backgrounding for more than BACKGROUND_GRACE_MS:
 *     re-prompts so the app re-locks after a significant absence.
 *   • Shows a locked screen while waiting; the user can tap "Unlock" to
 *     retry the prompt, or "Sign out" if biometrics become unavailable.
 *
 * The BIOMETRIC_ENABLED_KEY must match the key used in useBiometricAuth.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  InteractionManager,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";

const BIOMETRIC_ENABLED_KEY = "biometric_auth_enabled";
const BACKGROUND_GRACE_MS = 60_000; // 60 seconds

type GateStatus = "checking" | "locked" | "authenticating" | "unlocked" | "unavailable";

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const [status, setStatus] = useState<GateStatus>("checking");
  const lastBackgroundedAtRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const promptInFlightRef = useRef(false);

  const promptUnlock = useCallback(async () => {
    if (promptInFlightRef.current) return;
    promptInFlightRef.current = true;
    setStatus("authenticating");
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!compatible || !enrolled) {
        setStatus("unavailable");
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Beautonomi",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setStatus("unlocked");
      } else {
        setStatus("locked");
      }
    } catch {
      setStatus("locked");
    } finally {
      promptInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      setStatus("unlocked");
      return;
    }

    if (!session) {
      setStatus("unlocked");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
        if (cancelled) return;
        if (stored !== "true") {
          setStatus("unlocked");
          return;
        }
        await promptUnlock();
      } catch {
        if (!cancelled) setStatus("locked");
      }
    })();

    // Synchronously track transitions; defer all native bridge calls so they
    // don't compete with auth-refresh / nav-count fetches in the same tick.
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (prev === "active" && next.match(/inactive|background/)) {
        lastBackgroundedAtRef.current = Date.now();
        return;
      }

      if (next === "active" && prev.match(/inactive|background/)) {
        const backgroundedAt = lastBackgroundedAtRef.current;
        const away = backgroundedAt ? Date.now() - backgroundedAt : Infinity;
        if (away < BACKGROUND_GRACE_MS) return;

        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)
              .catch(() => null)
              .then((stored) => {
                if (stored !== "true") return;
                setStatus("locked");
                promptUnlock().catch(() => setStatus("locked"));
              });
          }, 150);
        });
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [promptUnlock, session?.user?.id]);

  if (status === "checking") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (status === "unlocked") {
    return <>{children}</>;
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        backgroundColor: Colors.white,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: Colors.gray[100],
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Ionicons name="lock-closed-outline" size={32} color={Colors.gray[600]} />
      </View>
      <Text
        style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginBottom: 6 }}
        accessibilityRole="header"
      >
        Beautonomi is locked
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: Colors.gray[500],
          textAlign: "center",
          marginBottom: 24,
          lineHeight: 20,
        }}
      >
        {status === "unavailable"
          ? "We couldn't use biometrics on this device. Sign out and back in to continue."
          : "Use Face ID, fingerprint, or your device passcode to unlock."}
      </Text>

      {status !== "unavailable" && (
        <TouchableOpacity
          onPress={() => {
            setStatus("locked");
            promptUnlock().catch(() => setStatus("locked"));
          }}
          disabled={status === "authenticating"}
          style={{
            backgroundColor: Colors.primary,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
            minWidth: 180,
            alignItems: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel="Unlock app"
        >
          {status === "authenticating" ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Unlock</Text>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={async () => {
          try {
            await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "false");
          } catch {
            /* ignore */
          }
          await signOut().catch(() => {});
        }}
        style={{ marginTop: 16, paddingVertical: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={{ color: Colors.gray[500], fontSize: 14 }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

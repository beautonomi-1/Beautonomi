/**
 * §Provider-launch (audit 2026-04): the biometric toggle in
 * apps/provider/app/(app)/(tabs)/more/settings/index.tsx only stored an
 * enabled/disabled flag — it never actually prompted on app open or
 * resume. Providers who thought their client lists, schedules, and
 * money flows were locked behind Face ID / fingerprint were wrong.
 *
 * This gate sits inside the (app)/_layout and:
 *   • runs a biometric prompt the first time the app hits the
 *     authenticated layout after a cold start;
 *   • re-prompts when the app returns to the foreground after being
 *     backgrounded for more than BACKGROUND_GRACE_MS (so you're not
 *     asked on every quick tab-out);
 *   • shows an Unlock screen until authentication succeeds;
 *   • offers a sign-out escape hatch if biometrics are unavailable
 *     (device changed, enrolment removed, etc.).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
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

const BIOMETRIC_ENABLED_KEY = "provider_biometric_auth_enabled";
const BACKGROUND_GRACE_MS = 60_000; // 60 seconds

type GateStatus = "checking" | "locked" | "authenticating" | "unlocked" | "unavailable";

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
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
        // Fail closed: we promised a lock but the OS can't provide one.
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

    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
        if (cancelled) return;
        if (stored !== "true") {
          setStatus("unlocked");
          return;
        }
        // Enabled — prompt immediately on mount.
        await promptUnlock();
      } catch {
        if (!cancelled) setStatus("unlocked");
      }
    })();

    const sub = AppState.addEventListener("change", async (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (prev === "active" && next.match(/inactive|background/)) {
        lastBackgroundedAtRef.current = Date.now();
        return;
      }

      if (next === "active" && prev.match(/inactive|background/)) {
        const stored = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY).catch(() => null);
        if (stored !== "true") return;
        const backgroundedAt = lastBackgroundedAtRef.current;
        const away = backgroundedAt ? Date.now() - backgroundedAt : Infinity;
        if (away >= BACKGROUND_GRACE_MS) {
          setStatus("locked");
          promptUnlock().catch(() => setStatus("locked"));
        }
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [promptUnlock]);

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
      <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginBottom: 6 }}>
        Beautonomi is locked
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: Colors.gray[500],
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        {status === "unavailable"
          ? "We couldn't use biometrics on this device. Sign out and back in to continue."
          : "Use Face ID, fingerprint, or your device passcode to unlock."}
      </Text>

      {status !== "unavailable" ? (
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
      ) : null}

      <TouchableOpacity
        onPress={async () => {
          try {
            // Clear the lock flag so the next sign-in doesn't get wedged if
            // biometrics are permanently unavailable.
            await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "false");
          } catch {
            /* ignore */
          }
          await signOut().catch(() => {});
        }}
        style={{
          marginTop: 16,
          paddingVertical: 10,
        }}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={{ color: Colors.gray[500], fontSize: 14 }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

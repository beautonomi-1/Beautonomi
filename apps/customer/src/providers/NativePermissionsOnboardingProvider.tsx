/**
 * Tracks first-run native permission onboarding (push, location, media).
 * Returning users (storage flag set) skip the modal; PushNotificationsProvider uses `fromRestore` to keep legacy auto-prompt behaviour.
 */
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isScreenshotMode } from "@/config/public-env";

const STORAGE_KEY = "native_permissions_onboarding_v2";

export type NativePermissionsGateState =
  | { phase: "loading" }
  | { phase: "needs_onboarding" }
  | { phase: "complete"; fromRestore: boolean };

type Ctx = {
  gate: NativePermissionsGateState;
  markOnboardingFinished: () => Promise<void>;
};

const NativePermissionsOnboardingContext = createContext<Ctx | null>(null);

export function NativePermissionsOnboardingProvider({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<NativePermissionsGateState>(() =>
    Platform.OS === "web" ? { phase: "complete", fromRestore: true } : { phase: "loading" },
  );

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (isScreenshotMode()) {
      setGate({ phase: "complete", fromRestore: true });
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (cancelled) return;
        setGate(v === "1" ? { phase: "complete", fromRestore: true } : { phase: "needs_onboarding" });
      })
      .catch(() => {
        if (!cancelled) setGate({ phase: "needs_onboarding" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markOnboardingFinished = useCallback(async () => {
    if (Platform.OS === "web") return;
    await AsyncStorage.setItem(STORAGE_KEY, "1");
    setGate({ phase: "complete", fromRestore: false });
  }, []);

  const value = useMemo(
    () => ({
      gate,
      markOnboardingFinished,
    }),
    [gate, markOnboardingFinished],
  );

  return (
    <NativePermissionsOnboardingContext.Provider value={value}>{children}</NativePermissionsOnboardingContext.Provider>
  );
}

export function useNativePermissionsOnboardingGate(): Ctx {
  const ctx = useContext(NativePermissionsOnboardingContext);
  if (!ctx) {
    throw new Error("useNativePermissionsOnboardingGate must be used within NativePermissionsOnboardingProvider");
  }
  return ctx;
}

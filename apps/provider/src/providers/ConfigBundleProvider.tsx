import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  fetchConfigBundle,
  getCachedConfigBundle,
  clearConfigBundleCache,
  isConfigBundleStub,
  isConfigBundleCacheFresh,
  type PublicConfigBundle,
  DEFAULT_AUTH,
  DEFAULT_VERIFICATION_POLICY,
} from "@/lib/config-bundle";
import { resyncLocaleFromBundle } from "@/lib/i18n";

interface ConfigBundleContextValue {
  bundle: PublicConfigBundle | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const defaultBundle: PublicConfigBundle = {
  isStub: true,
  meta: {
    env: "production",
    platform: "provider",
    version: null,
    fetched_at: new Date().toISOString(),
  },
  amplitude: {},
  third_party: {},
  branding: {},
  auth: { ...DEFAULT_AUTH },
  flags: {},
  modules: {
    on_demand: {
      enabled: false,
      ringtone_asset_path: null,
      ring_duration_seconds: 20,
      ring_repeat: true,
      normal_booking_ringtone_asset_path: null,
      normal_booking_ring_duration_seconds: 20,
      normal_booking_ring_repeat: true,
      waiting_screen_timeout_seconds: 45,
      provider_accept_window_seconds: 30,
      ui_copy: {},
    },
    ai: {},
    ads: {},
    ranking: {},
    identity_verification: {},
    aura: {},
    safety: {},
  },
  verification: { ...DEFAULT_VERIFICATION_POLICY },
};

const ConfigBundleContext = createContext<ConfigBundleContextValue | undefined>(undefined);

export function ConfigBundleProvider({ children }: { children: React.ReactNode }) {
  const initialCached = getCachedConfigBundle();
  const [bundle, setBundle] = useState<PublicConfigBundle | null>(initialCached);
  const [isLoading, setLoading] = useState(
    !initialCached || isConfigBundleStub(initialCached),
  );
  const [error, setError] = useState<string | null>(
    initialCached && isConfigBundleStub(initialCached)
      ? "Config bundle unavailable"
      : null,
  );
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  const applyBundle = useCallback((data: PublicConfigBundle) => {
    const stub = isConfigBundleStub(data);
    if (!stub) void resyncLocaleFromBundle();
    setBundle(data);
    setError(stub ? "Config bundle unavailable" : null);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      clearConfigBundleCache();
      const data = await fetchConfigBundle({
        platform: "provider",
        environment: __DEV__ ? "development" : "production",
      });
      applyBundle(data);
    } catch (e) {
      applyBundle(defaultBundle);
      setError(e instanceof Error ? e.message : "Failed to load config");
    }
  }, [applyBundle]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      const current = bundleRef.current;
      if (isConfigBundleStub(current) || !isConfigBundleCacheFresh()) {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <ConfigBundleContext.Provider
      value={{
        bundle,
        isLoading,
        error,
        refresh,
      }}
    >
      {children}
    </ConfigBundleContext.Provider>
  );
}

export function useConfigBundle(): ConfigBundleContextValue {
  const ctx = useContext(ConfigBundleContext);
  if (ctx === undefined) {
    return {
      bundle: null,
      isLoading: true,
      error: null,
      refresh: async () => {},
    };
  }
  return ctx;
}

export function useFeatureFlag(key: string): boolean {
  const { bundle } = useConfigBundle();
  const flag = bundle?.flags?.[key];
  return flag?.enabled ?? false;
}

export function useModuleConfig<K extends keyof PublicConfigBundle["modules"]>(
  module: K
): PublicConfigBundle["modules"][K] {
  const { bundle } = useConfigBundle();
  const mod = bundle?.modules?.[module];
  return (mod ?? defaultBundle.modules[module]) as PublicConfigBundle["modules"][K];
}

export function useThirdPartyConfig(): PublicConfigBundle["third_party"] {
  const { bundle } = useConfigBundle();
  return bundle?.third_party ?? defaultBundle.third_party;
}

export function useAmplitudeConfig(): PublicConfigBundle["amplitude"] {
  const { bundle } = useConfigBundle();
  return bundle?.amplitude ?? defaultBundle.amplitude;
}

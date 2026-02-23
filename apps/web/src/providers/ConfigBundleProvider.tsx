"use client";

import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";

export type Platform = "web" | "customer" | "provider";
export type Environment = "production" | "staging" | "development";

export interface ConfigBundleMeta {
  env: Environment;
  platform: Platform;
  version: string | null;
  fetched_at: string;
}

export interface ResolvedFlag {
  enabled: boolean;
  rollout_percent?: number;
  platforms_allowed?: string[] | null;
  roles_allowed?: string[] | null;
  min_app_version?: string | null;
  environments_allowed?: string[] | null;
}

export interface OnDemandModuleConfig {
  enabled: boolean;
  ringtone_asset_path: string | null;
  ring_duration_seconds: number;
  ring_repeat: boolean;
  waiting_screen_timeout_seconds: number;
  provider_accept_window_seconds: number;
  ui_copy: Record<string, unknown>;
}

export interface PublicConfigBundle {
  meta: ConfigBundleMeta;
  amplitude: Record<string, unknown>;
  third_party: Record<string, unknown>;
  branding: Record<string, unknown>;
  flags: Record<string, ResolvedFlag>;
  modules: {
    on_demand: OnDemandModuleConfig;
    ai: Record<string, unknown>;
    ads: Record<string, unknown>;
    ranking: Record<string, unknown>;
    distance: Record<string, unknown>;
    sumsub: Record<string, unknown>;
    aura: Record<string, unknown>;
    safety: Record<string, unknown>;
  };
}

interface ConfigBundleContextValue {
  bundle: PublicConfigBundle | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ConfigBundleContext = createContext<ConfigBundleContextValue | undefined>(undefined);

const defaultBundle: PublicConfigBundle = {
  meta: {
    env: "production",
    platform: "web",
    version: null,
    fetched_at: new Date().toISOString(),
  },
  amplitude: {},
  third_party: {},
  branding: {},
  flags: {},
  modules: {
    on_demand: {
      enabled: false,
      ringtone_asset_path: null,
      ring_duration_seconds: 20,
      ring_repeat: true,
      waiting_screen_timeout_seconds: 45,
      provider_accept_window_seconds: 30,
      ui_copy: {},
    },
    ai: {},
    ads: {},
    ranking: {},
    distance: {},
    sumsub: {},
    aura: {},
    safety: {},
  },
};

export function ConfigBundleProvider({
  children,
  platform = "web",
  environment = typeof window !== "undefined" && process.env.NODE_ENV === "development" ? "development" : "production",
}: {
  children: React.ReactNode;
  platform?: Platform;
  environment?: Environment;
}) {
  const [bundle, setBundle] = useState<PublicConfigBundle | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/public/config-bundle?platform=${platform}&environment=${environment}`;
      const data = await fetcher.get<PublicConfigBundle>(url);
      setBundle(data ?? defaultBundle);
    } catch (e) {
      setBundle(defaultBundle);
      setError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, [platform, environment]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value: ConfigBundleContextValue = {
    bundle,
    isLoading,
    error,
    refresh,
  };

  return (
    <ConfigBundleContext.Provider value={value}>
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

"use client";

import React, { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { fetcher, FetchError, FetchTimeoutError, DEFAULT_FETCH_TIMEOUT_MS } from "@/lib/http/fetcher";

export interface PlatformBranding {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
}

interface PlatformSettingsContextType {
  branding: PlatformBranding | null;
  isLoading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
}

const PlatformSettingsContext = createContext<PlatformSettingsContextType | undefined>(undefined);

// Default branding values (fallback)
const defaultBranding: PlatformBranding = {
  site_name: "Beautonomi",
  logo_url: "/images/logo.svg",
  favicon_url: "/icon.svg",
  primary_color: "#FF0077",
  secondary_color: "#D60565",
};

type SettingsSnapshot = {
  branding: PlatformBranding;
  isLoading: boolean;
  error: string | null;
};

const INITIAL_SETTINGS: SettingsSnapshot = {
  branding: defaultBranding,
  isLoading: true,
  error: null,
};

let settingsSnapshot: SettingsSnapshot = INITIAL_SETTINGS;
const settingsListeners = new Set<() => void>();
let settingsRequestId = 0;

function subscribeSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}

function emitSettings(): void {
  for (const listener of settingsListeners) listener();
}

function getSettingsSnapshot(): SettingsSnapshot {
  return settingsSnapshot;
}

function getSettingsServerSnapshot(): SettingsSnapshot {
  return INITIAL_SETTINGS;
}

function normalizeBranding(data: Partial<PlatformBranding> | null | undefined): PlatformBranding {
  return {
    site_name: data?.site_name || defaultBranding.site_name,
    logo_url: data?.logo_url || defaultBranding.logo_url,
    favicon_url: data?.favicon_url || defaultBranding.favicon_url,
    primary_color: data?.primary_color || defaultBranding.primary_color,
    secondary_color: data?.secondary_color || defaultBranding.secondary_color,
  };
}

async function loadPlatformSettings(): Promise<void> {
  const requestId = ++settingsRequestId;
  try {
    const response = await fetcher.get<{ data: PlatformBranding }>(
      "/api/public/settings/branding",
      { timeoutMs: DEFAULT_FETCH_TIMEOUT_MS }
    );
    if (requestId !== settingsRequestId) return;
    settingsSnapshot = {
      branding: normalizeBranding(response.data),
      isLoading: false,
      error: null,
    };
  } catch (err) {
    if (requestId !== settingsRequestId) return;
    console.error("Error loading platform settings:", err);
    settingsSnapshot = {
      branding: defaultBranding,
      isLoading: false,
      error:
        err instanceof FetchTimeoutError
          ? "Request timed out"
          : err instanceof FetchError
            ? err.message
            : "Failed to load settings",
    };
  }
  emitSettings();
}

async function refreshPlatformSettings(): Promise<void> {
  settingsSnapshot = {
    branding: settingsSnapshot.branding,
    isLoading: true,
    error: null,
  };
  emitSettings();
  await loadPlatformSettings();
}

export function PlatformSettingsProvider({ children }: { children: React.ReactNode }) {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getSettingsServerSnapshot,
  );

  useEffect(() => {
    void loadPlatformSettings();

    const handleSettingsUpdate = () => {
      void refreshPlatformSettings();
    };

    window.addEventListener("platform-settings-updated", handleSettingsUpdate);
    return () => {
      window.removeEventListener("platform-settings-updated", handleSettingsUpdate);
    };
  }, []);

  return (
    <PlatformSettingsContext.Provider
      value={{
        branding: settings.branding,
        isLoading: settings.isLoading,
        error: settings.error,
        refreshSettings: refreshPlatformSettings,
      }}
    >
      {children}
    </PlatformSettingsContext.Provider>
  );
}

export function usePlatformSettings() {
  const context = useContext(PlatformSettingsContext);
  if (context === undefined) {
    throw new Error("usePlatformSettings must be used within a PlatformSettingsProvider");
  }
  return context;
}

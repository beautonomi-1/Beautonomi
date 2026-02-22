"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";

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
  favicon_url: "/favicon.ico",
  primary_color: "#FF0077",
  secondary_color: "#D60565",
};

export function PlatformSettingsProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<PlatformBranding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Set default branding immediately so page can render
      setBranding(defaultBranding);

      const response = await fetcher.get<{ data: PlatformBranding }>(
        "/api/public/settings/branding",
        { timeoutMs: 3000 } // Shorter timeout for settings
      );

      if (response.data) {
        setBranding({
          site_name: response.data.site_name || defaultBranding.site_name,
          logo_url: response.data.logo_url || defaultBranding.logo_url,
          favicon_url: response.data.favicon_url || defaultBranding.favicon_url,
          primary_color: response.data.primary_color || defaultBranding.primary_color,
          secondary_color: response.data.secondary_color || defaultBranding.secondary_color,
        });
      } else {
        setBranding(defaultBranding);
      }
    } catch (err) {
      console.error("Error loading platform settings:", err);
      // Use defaults on error
      setBranding(defaultBranding);
      setError(
        err instanceof FetchTimeoutError
          ? "Request timed out"
          : err instanceof FetchError
          ? err.message
          : "Failed to load settings"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();

    // Listen for settings updates
    const handleSettingsUpdate = () => {
      loadSettings();
    };

    window.addEventListener("platform-settings-updated", handleSettingsUpdate);
    return () => {
      window.removeEventListener("platform-settings-updated", handleSettingsUpdate);
    };
  }, [loadSettings]);

  return (
    <PlatformSettingsContext.Provider
      value={{
        branding: branding || defaultBranding,
        isLoading,
        error,
        refreshSettings: loadSettings,
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

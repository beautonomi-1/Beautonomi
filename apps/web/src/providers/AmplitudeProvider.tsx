"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { initAmplitude, AmplitudeClient } from "@/lib/analytics/amplitude/client";
import { fetchAmplitudeConfig } from "@/lib/analytics/amplitude/config";
import { AmplitudeConfig } from "@/lib/analytics/amplitude/types";
import { PluginContext } from "@/lib/analytics/amplitude/plugins/types";
import { fetchIdentifyProperties } from "@/lib/analytics/amplitude/identify-client";

interface AmplitudeContextValue {
  amplitude: AmplitudeClient | null;
  isInitialized: boolean;
  config: AmplitudeConfig | null;
}

const AmplitudeContext = createContext<AmplitudeContextValue>({
  amplitude: null,
  isInitialized: false,
  config: null,
});

export function useAmplitudeContext() {
  return useContext(AmplitudeContext);
}

interface AmplitudeProviderProps {
  children: ReactNode;
  portal: "client" | "provider" | "admin";
}

export function AmplitudeProvider({ children, portal }: AmplitudeProviderProps) {
  const [amplitude, setAmplitude] = useState<AmplitudeClient | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [config, setConfig] = useState<AmplitudeConfig | null>(null);
  const pathname = usePathname();
  const { user, role } = useAuth();

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        // Fetch config
        const amplitudeConfig = await fetchAmplitudeConfig();
        
        if (!mounted) return;

        setConfig(amplitudeConfig);

        // Check if Amplitude is enabled for this portal
        const isEnabled =
          (portal === "client" && amplitudeConfig.enabled_client_portal) ||
          (portal === "provider" && amplitudeConfig.enabled_provider_portal) ||
          (portal === "admin" && amplitudeConfig.enabled_admin_portal);

        if (!isEnabled || !amplitudeConfig.api_key_public) {
          console.log(`[Amplitude] Disabled for ${portal} portal`);
          return;
        }

        // Create plugin context
        const pluginContext: PluginContext = {
          config: {
            debug_mode: amplitudeConfig.debug_mode,
            sampling_rate: amplitudeConfig.sampling_rate,
          },
          portal,
          route: pathname,
        };

        // Initialize Amplitude
        const client = await initAmplitude(amplitudeConfig, pluginContext);

        if (!mounted) return;

        if (client) {
          setAmplitude(client);
          setIsInitialized(true);
        }
      } catch (error) {
        console.error("[Amplitude] Initialization error:", error);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [portal, pathname]);

  // Identify user when they log in
  useEffect(() => {
    if (!amplitude || !user || !isInitialized) return;

    // Fetch comprehensive user properties from API (avoids server-only imports)
    fetchIdentifyProperties(user, role || "customer").then((properties) => {
      amplitude.identify(user.id, properties);
    }).catch((error) => {
      console.error("[Amplitude] Error identifying user:", error);
      // Fallback to basic identification
      amplitude.identify(user.id, {
        role: role || "customer",
      });
    });
  }, [amplitude, user, role, isInitialized]);

  return (
    <AmplitudeContext.Provider value={{ amplitude, isInitialized, config }}>
      {children}
    </AmplitudeContext.Provider>
  );
}

"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useCookieConsent } from "./CookieConsentProvider";
import { initAmplitude, hardResetAmplitudeBrowser, AmplitudeClient } from "@/lib/analytics/amplitude/client";
import { fetchAmplitudeConfig } from "@/lib/analytics/amplitude/config";
import { AmplitudeConfig } from "@/lib/analytics/amplitude/types";
import { PluginContext } from "@/lib/analytics/amplitude/plugins/types";
import { fetchIdentifyProperties, getDeviceTypeForAttribution } from "@/lib/analytics/amplitude/identify-client";

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
  const { isReady: consentReady, allowsAnalytics } = useCookieConsent();
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        // Superadmin: no analytics SDK (no events, no identify)
        if (role === "superadmin") {
          hardResetAmplitudeBrowser();
          if (mounted) {
            setAmplitude(null);
            setIsInitialized(false);
          }
          return;
        }

        if (!consentReady) {
          if (mounted) {
            setAmplitude(null);
            setIsInitialized(false);
          }
          return;
        }

        if (!allowsAnalytics) {
          hardResetAmplitudeBrowser();
          if (mounted && isDev) console.log("[Amplitude] Skipped: cookie or account analytics consent");
          if (mounted) {
            setAmplitude(null);
            setIsInitialized(false);
          }
          return;
        }

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
          if (isDev) console.log(`[Amplitude] Disabled for ${portal} portal`);
          if (mounted) {
            setAmplitude(null);
            setIsInitialized(false);
          }
          return;
        }

        // Session replay only for authenticated users who passed consent above; anonymous = no replay
        const enableSessionReplay = Boolean(user);

        const pluginContext: PluginContext = {
          config: {
            debug_mode: amplitudeConfig.debug_mode,
            sampling_rate: amplitudeConfig.sampling_rate,
          },
          portal,
          route: pathname,
        };

        const client = await initAmplitude(amplitudeConfig, pluginContext, { enableSessionReplay });

        if (!mounted) return;

        if (client) {
          setAmplitude(client);
          setIsInitialized(true);
        } else {
          setAmplitude(null);
          setIsInitialized(false);
        }
      } catch (error) {
        console.error("[Amplitude] Initialization error:", error);
        if (mounted) {
          setAmplitude(null);
          setIsInitialized(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [portal, pathname, user, role, isDev, consentReady, allowsAnalytics]);

  // Identify user when they log in (do not track superadmin)
  useEffect(() => {
    if (!amplitude || !user || !isInitialized || role === "superadmin") return;

    // Fetch comprehensive user properties from API with attribution (portal, platform, device_type)
    fetchIdentifyProperties(user, role || "customer", {
      portal,
      platform: "web",
      device_type: getDeviceTypeForAttribution(),
    }).then((properties) => {
      if (!properties) return;
      amplitude.identify(user.id, properties);
      if (properties.provider_id) {
        amplitude.setGroup("provider", properties.provider_id);
      }
    }).catch(() => {
      // Do not send partial identify; CDP traits must come from server API only.
      // Fail-soft: analytics should never interrupt user flow.
    });
  }, [amplitude, user, role, isInitialized, portal]);

  return (
    <AmplitudeContext.Provider value={{ amplitude, isInitialized, config }}>
      {children}
    </AmplitudeContext.Provider>
  );
}

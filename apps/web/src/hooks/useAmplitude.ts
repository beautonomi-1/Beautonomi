"use client";

import { useCallback } from "react";
import { useAmplitudeContext } from "@/providers/AmplitudeProvider";
import { useAuth } from "@/providers/AuthProvider";
import {
  fetchIdentifyProperties,
  getDeviceTypeForAttribution,
} from "@/lib/analytics/amplitude/identify-client";

/**
 * Hook to access Amplitude analytics client
 */
export function useAmplitude(): {
  track: (eventName: string, eventProperties?: Record<string, any>) => void;
  identify: (userId: string, userProperties?: Record<string, any>) => void;
  setUserProperties: (userProperties: Record<string, any>) => void;
  reset: () => void;
  isReady: boolean;
} {
  const { amplitude, isInitialized } = useAmplitudeContext();

  const track = (eventName: string, eventProperties?: Record<string, any>) => {
    if (amplitude && isInitialized) {
      amplitude.track(eventName, eventProperties);
    }
  };

  const identify = (userId: string, userProperties?: Record<string, any>) => {
    if (amplitude && isInitialized) {
      amplitude.identify(userId, userProperties);
    }
  };

  const setUserProperties = (userProperties: Record<string, any>) => {
    if (amplitude && isInitialized) {
      amplitude.setUserProperties(userProperties);
    }
  };

  const reset = () => {
    if (amplitude && isInitialized) {
      amplitude.reset();
    }
  };

  return {
    track,
    identify,
    setUserProperties,
    reset,
    isReady: isInitialized && !!amplitude,
  };
}

/**
 * Hook to refresh Amplitude identify (e.g. after profile or booking change).
 * Fetches latest properties from the server and calls identify. No-op if not ready or no user.
 */
export function useRefreshAmplitudeIdentify(portal: "client" | "provider" | "admin") {
  const { amplitude, isInitialized } = useAmplitudeContext();
  const { user, role } = useAuth();

  const refreshIdentify = useCallback(async () => {
    if (!amplitude || !isInitialized || !user) return;
    try {
      const properties = await fetchIdentifyProperties(user, role || "customer", {
        portal,
        platform: "web",
        device_type: getDeviceTypeForAttribution(),
      });
      amplitude.identify(user.id, properties);
    } catch {
      // Non-blocking
    }
  }, [amplitude, isInitialized, user, role, portal]);

  return refreshIdentify;
}

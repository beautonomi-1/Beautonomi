"use client";

import { useAmplitudeContext } from "@/providers/AmplitudeProvider";

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

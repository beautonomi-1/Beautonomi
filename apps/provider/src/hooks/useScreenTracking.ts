/**
 * Track screen view in Amplitude when screen mounts.
 * Call at top of each screen component.
 */
import { useEffect } from "react";
import { getAnalyticsClient } from "@/lib/analytics-rn";

export function useScreenTracking(screenName: string) {
  useEffect(() => {
    const client = getAnalyticsClient();
    client?.screen(screenName);
  }, [screenName]);
}

import { useEffect } from "react";
import { Platform } from "react-native";
import { requestAttBeforeTracking } from "@/lib/tracking/request-att-before-tracking";
import { initSingular } from "@/lib/singular";

/**
 * Runs ATT then Singular after splash hide — never at module load.
 * Mounted in root _layout inside SafeAreaProvider.
 */
export function AttTrackingBootstrap() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    void (async () => {
      try {
        await requestAttBeforeTracking();
        initSingular();
      } catch {
        try {
          initSingular();
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  return null;
}

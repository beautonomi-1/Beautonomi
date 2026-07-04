import { useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import { isScreenshotMode } from "@/config/public-env";
import { subscribeConnectivity } from "@/lib/connectivity";

/**
 * Offline indicator bar that appears at the top of the screen when the device
 * loses network connectivity. Automatically hides when connectivity is restored.
 *
 * Uses debounced NetInfo from `connectivity.ts` so iOS resume radio wake-up
 * does not flash a false "No internet connection" banner.
 */
export function OfflineBar() {
  const [isOffline, setIsOffline] = useState(false);
  const screenshot = isScreenshotMode();

  useEffect(() => {
    if (screenshot) return;
    return subscribeConnectivity(setIsOffline);
  }, [screenshot]);

  if (screenshot) return null;
  if (!isOffline) return null;

  return (
    <View
      style={{
        backgroundColor: "#111827",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
        paddingHorizontal: 16,
        ...(Platform.OS === "android" ? { paddingTop: 4, paddingBottom: 4 } : {}),
      }}
      accessibilityRole="alert"
      accessibilityLabel="No internet connection"
    >
      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>
        No internet connection
      </Text>
    </View>
  );
}

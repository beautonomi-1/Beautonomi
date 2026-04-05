import { useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { isScreenshotMode } from "@/config/public-env";

/**
 * Offline indicator bar that appears at the top of the screen when the device
 * loses network connectivity. Automatically hides when connectivity is restored.
 */
export function OfflineBar() {
  const [isOffline, setIsOffline] = useState(false);
  const screenshot = isScreenshotMode();

  useEffect(() => {
    if (screenshot) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
    });

    return () => unsubscribe();
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

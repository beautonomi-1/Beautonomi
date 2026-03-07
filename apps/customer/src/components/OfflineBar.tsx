import { useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";

/**
 * Offline indicator bar that appears at the top of the screen when the device
 * loses network connectivity. Automatically hides when connectivity is restored.
 */
export function OfflineBar() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
    });

    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <View
      style={[
        { backgroundColor: "#111827", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 16 },
        Platform.OS === "android" ? { paddingTop: 4, paddingBottom: 4 } : undefined,
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>No internet connection</Text>
    </View>
  );
}

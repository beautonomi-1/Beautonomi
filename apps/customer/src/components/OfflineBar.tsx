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
      className="bg-gray-900 flex-row items-center justify-center py-2 px-4 gap-2"
      style={Platform.OS === "android" ? { paddingTop: 4, paddingBottom: 4 } : undefined}
    >
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text className="text-white text-sm font-medium">
        No internet connection
      </Text>
    </View>
  );
}

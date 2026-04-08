import { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { IOS_APP_STORE_ID, APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";

const STORAGE_KEY = "beautonomi_install_banner_dismissed_v1";

/**
 * Smart-banner style prompt on web only; dismiss persists in AsyncStorage.
 */
export function InstallAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    void AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v !== "1") setVisible(true);
    });
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    void AsyncStorage.setItem(STORAGE_KEY, "1");
  }, []);

  const openStore = useCallback(() => {
    const base = APP_URL.replace(/\/$/, "");
    const id = IOS_APP_STORE_ID?.trim();
    const url =
      id && id !== "0000000000" ? `https://apps.apple.com/app/id${id}` : `${base}/download`;
    void Linking.openURL(url);
  }, []);

  if (!visible || Platform.OS !== "web") return null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#EFF6FF",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#BFDBFE",
      }}
    >
      <Text style={{ flex: 1, fontSize: 13, color: "#1E3A8A", paddingRight: 8 }}>
        For notifications and a faster checkout, use the Beautonomi app.
      </Text>
      <TouchableOpacity
        onPress={openStore}
        style={{
          paddingVertical: 6,
          paddingHorizontal: 10,
          backgroundColor: Colors.primary,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Get app</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={dismiss}
        accessibilityLabel="Dismiss install banner"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginLeft: 8 }}
      >
        <Ionicons name="close" size={22} color="#64748B" />
      </TouchableOpacity>
    </View>
  );
}

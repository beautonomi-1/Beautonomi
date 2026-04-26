import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { APP_URL } from "@/config/public-env";
import { replaceInAppBrowser } from "@/lib/in-app-web";
import { Colors } from "@/constants/colors";

/** Canonical legal text lives on the marketing site at `/privacy-policy`. */
export default function PrivacyScreen() {
  const router = useRouter();

  useEffect(() => {
    const url = `${APP_URL.replace(/\/$/, "")}/privacy-policy`;
    replaceInAppBrowser(router, url, "Privacy Policy");
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

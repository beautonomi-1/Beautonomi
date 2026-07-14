import { useEffect } from "react";
import { View, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { webPrivacyPolicyUrl } from "@/lib/legal-web";
import { Colors } from "@/constants/colors";

/**
 * Canonical legal text lives on the marketing site at `/privacy-policy`.
 * This `(auth)` route can be reached before sign-in (e.g. deep link), where the
 * `(app)` in-app browser is not mounted — so open the public URL directly.
 */
export default function PrivacyScreen() {
  const router = useRouter();

  useEffect(() => {
    Linking.openURL(webPrivacyPolicyUrl()).catch(() => {});
    if (router.canGoBack()) router.back();
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

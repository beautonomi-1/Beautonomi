import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { replaceWebPrivacyPolicy } from "@/lib/legal-web";
import { Colors } from "@/constants/colors";

/** Opens the canonical web privacy policy (`/privacy-policy`) in the in-app browser. */
export default function PrivacyPolicyScreen() {
  const router = useRouter();

  useEffect(() => {
    replaceWebPrivacyPolicy(router);
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.white }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

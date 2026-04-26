import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { replaceWebTermsOfService } from "@/lib/legal-web";
import { Colors } from "@/constants/colors";

/** Opens the canonical web terms (`/terms-and-condition`) in the in-app browser. */
export default function TermsOfServiceScreen() {
  const router = useRouter();

  useEffect(() => {
    replaceWebTermsOfService(router);
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.white }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

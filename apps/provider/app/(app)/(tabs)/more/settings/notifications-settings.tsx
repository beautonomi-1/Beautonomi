/**
 * §Provider-launch (audit 2026-04): see notification-preferences.tsx for
 * the full consolidation rationale. This route now redirects to the
 * canonical settings/notification-preferences screen so providers have a
 * single source of truth.
 */
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";

export default function NotificationsSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(app)/(tabs)/more/settings/notification-preferences" as never);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={Colors.primary} />
    </View>
  );
}

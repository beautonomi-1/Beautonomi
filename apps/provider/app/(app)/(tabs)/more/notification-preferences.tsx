/**
 * §Provider-launch (audit 2026-04): notification preferences
 * consolidation.
 *
 * There were four overlapping screens all writing to
 * /api/provider/notification-preferences:
 *   - more/notification-preferences.tsx             (this file — simplest)
 *   - more/settings-notification-preferences.tsx     (duplicate)
 *   - more/settings/notifications-settings.tsx      (duplicate)
 *   - more/settings/notification-preferences.tsx    (CANONICAL — has quiet
 *                                                    hours, digest mode,
 *                                                    test push, and the
 *                                                    full per-channel
 *                                                    matrix)
 *
 * To avoid providers seeing three copies with different defaults (which
 * made it look like the preference wasn't saving), this route now just
 * redirects into the canonical screen. Kept as a stub (rather than
 * deleted) because settings-account-hub.tsx still deep-links here by
 * mobileRoute.
 */
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";

export default function NotificationPreferencesRedirect() {
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

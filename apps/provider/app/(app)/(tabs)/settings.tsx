import { useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  // #region agent log
  useEffect(() => {
    console.log("[DEBUG-A] SettingsScreen (tabs-level) mounted - WRONG SCREEN");
    fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/(app)/(tabs)/settings.tsx:SettingsScreen",
        message: "SettingsScreen (tabs-level) mounted",
        data: {},
        timestamp: Date.now(),
        hypothesisId: "A",
      }),
    }).catch(() => {});
  }, []);
  // #endregion

  return (
    <View className="flex-1 bg-white p-6">
      <Text className="text-2xl font-semibold text-gray-900">Settings</Text>
      {user?.phone && (
        <Text className="mt-2 text-gray-500">{user.phone}</Text>
      )}
      <TouchableOpacity
        className="mt-8 rounded-lg border border-gray-300 py-3"
        onPress={async () => {
        await signOut();
        router.replace("/(auth)/login" as never);
      }}
      >
        <Text className="text-center font-medium text-gray-900">Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

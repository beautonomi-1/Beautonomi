/**
 * Legacy screen – most settings now open in-app natively. Use Settings & account from More.
 * Kept for old links; suggests using Settings & account in the app.
 */
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function SettingsWebScreen() {
  const router = useRouter();
  const { title, description } = useLocalSearchParams<{ title?: string; description?: string }>();
  const displayTitle = title ? decodeURIComponent(title) : "Settings";
  const displayDescription = description ? decodeURIComponent(description) : "Manage this in the app.";

  return (
    <ScreenContainer>
      <ScreenHeader title={displayTitle} onBack={() => router.back()} />
      <View className="px-2 pt-4">
        <View className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-gray-200">
            <Ionicons name="desktop-outline" size={24} color="#6b7280" />
          </View>
          <Text className="text-base font-medium text-gray-900">{displayTitle}</Text>
          <Text className="mt-2 text-sm text-gray-600 leading-5">{displayDescription}</Text>
          <Text className="mt-4 text-sm text-gray-500">
            All settings are available in-app. Go to More → Settings & account to manage this and other settings without leaving the app.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-4 rounded-xl bg-gray-900 py-2.5"
          >
            <Text className="text-center font-medium text-white">Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

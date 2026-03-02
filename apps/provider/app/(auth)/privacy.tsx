/**
 * Native React Native Privacy Policy screen. 100% in-app, no WebView or browser.
 */
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="flex-row items-center border-b border-gray-200 px-4 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-3 p-2"
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-900">Privacy Policy</Text>
      </View>
      <ScrollView className="flex-1 px-5 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="mb-4 text-sm leading-6 text-gray-700">
          Our Privacy Policy describes how we collect, use, and protect your data when you use the Beautonomi provider app and web portal.
        </Text>
        <Text className="mb-4 text-sm leading-6 text-gray-700">
          This includes account and business information, booking and payment data, and how we use cookies and similar technologies. We do not sell your personal information.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

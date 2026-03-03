/**
 * Native React Native Terms of Service screen. 100% in-app, no WebView or browser.
 */
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function TermsScreen() {
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
        <Text className="text-lg font-semibold text-gray-900">Terms of Service</Text>
      </View>
      <ScrollView className="flex-1 px-5 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="mb-4 text-sm leading-6 text-gray-700">
          By using the Beautonomi provider app you agree to our Terms of Service. These terms cover your use of the platform, booking and payment handling, and your responsibilities as a provider.
        </Text>
        <Text className="mb-4 text-sm leading-6 text-gray-700">
          Key points include: compliance with local laws, accurate service and business information, handling of client data and cancellations, and our right to update these terms with notice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

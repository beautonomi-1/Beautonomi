import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function UpgradeInfoScreen() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <ScreenHeader title="Upgrade to Salon" onBack={() => router.back()} />
      <View className="px-2 pt-4">
        <View className="mb-4 flex-row items-center rounded-xl border border-pink-200 bg-pink-50/80 p-4">
          <Ionicons name="sparkles" size={28} color="#ec4899" />
          <Text className="ml-3 flex-1 text-base font-medium text-pink-800">
            Unlock team management, multiple locations, and advanced features.
          </Text>
        </View>
        <Text className="text-base text-gray-700 leading-6">
          To upgrade your plan from Freelancer to Salon, please use the web portal. There you can compare plans and complete the upgrade.
        </Text>
        <Text className="mt-4 text-sm text-gray-500">
          Open the provider dashboard in your browser and go to Settings or Billing to upgrade.
        </Text>
      </View>
    </ScreenContainer>
  );
}

import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function SearchScreen() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <ScreenHeader title="Search" onBack={() => router.back()} />
      <View className="px-2 pt-8 items-center">
        <View className="rounded-xl border border-gray-200 bg-gray-50 p-6 items-center max-w-sm">
          <Ionicons name="search-outline" size={40} color="#9ca3af" />
          <Text className="mt-3 text-center text-gray-600">
            Use the provider dashboard on the web to search clients, bookings, and more.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

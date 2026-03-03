import { View, Text, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";

export default function OnDemandResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; requestId?: string }>();
  const status = params.status ?? "expired";
  const onDemandConfig = useModuleConfig("on_demand");
  const uiCopy = (onDemandConfig.ui_copy ?? {}) as Record<string, string>;

  const isAccepted = status === "accepted";
  const title = isAccepted
    ? (uiCopy.accepted_title ?? "Request accepted!")
    : status === "declined"
      ? (uiCopy.declined_title ?? "Not accepted")
      : status === "cancelled"
        ? "Request cancelled"
        : (uiCopy.expired_title ?? "Request expired");
  const subtitle = isAccepted
    ? (uiCopy.accepted_subtitle ?? "Your booking is confirmed. View details below.")
    : status === "declined"
      ? (uiCopy.declined_subtitle ?? "The provider was unable to accept. Try another time or book a scheduled appointment.")
      : status === "cancelled"
        ? "You cancelled this request."
        : (uiCopy.expired_subtitle ?? "The request timed out. You can try again or book a scheduled appointment.");

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      <View className="flex-1 px-6 pt-12">
        <View className="items-center mb-8">
          <View
            className={`w-20 h-20 rounded-full items-center justify-center mb-4 ${
              isAccepted ? "bg-green-100" : "bg-gray-100"
            }`}
          >
            <Ionicons
              name={isAccepted ? "checkmark-circle" : "time-outline"}
              size={48}
              color={isAccepted ? "#16a34a" : "#6b7280"}
            />
          </View>
          <Text className="text-xl font-semibold text-gray-900 text-center">{title}</Text>
          <Text className="text-gray-600 text-center mt-2">{subtitle}</Text>
        </View>

        <View className="gap-3">
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)/bookings" as never)}
            className="bg-primary rounded-2xl py-4 items-center"
          >
            <Text className="text-white font-semibold">View my bookings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)" as never)}
            className="border border-gray-300 rounded-2xl py-4 items-center"
          >
            <Text className="text-gray-700 font-medium">Back to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

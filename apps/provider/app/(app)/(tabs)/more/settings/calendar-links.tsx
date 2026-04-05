/**
 * Calendar links – native handoff.
 * Booking link management is native and API-backed in settings/booking-link.
 */
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";

export default function CalendarLinksScreen() {
  const router = useRouter();

  const openNativeBookingLink = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/settings/booking-link" as never);
  };

  return (
    <ScreenContainer>
      <ScreenHeader title="Calendar links" onBack={() => router.back()} subtitle="Share your calendar with clients" />
      <View style={twStyle("px-4 pt-4 pb-8")}>
        <View style={twStyle("rounded-2xl border border-gray-200 bg-gray-50 p-5")}>
          <View style={twStyle("h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 mb-4")}>
            <Ionicons name="link-outline" size={26} color="#6366f1" />
          </View>
          <Text style={twStyle("text-base font-semibold text-gray-900")}>Booking and calendar links</Text>
          <Text style={twStyle("mt-2 text-sm text-gray-600 leading-5")}>
            Create and manage booking links directly in the app. Share your booking URL with clients and track usage.
          </Text>
          <TouchableOpacity
            onPress={openNativeBookingLink}
            style={twStyle("mt-5 flex-row items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 py-3.5")}
            activeOpacity={0.8}
          >
            <Ionicons name="link-outline" size={20} color="#6366f1" />
            <Text style={twStyle("ml-2 font-semibold text-indigo-700")}>Manage links</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

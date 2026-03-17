/**
 * Calendar colors & icons – native screen.
 * Create and edit color schemes on the web; this screen explains and links to the portal.
 */
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";

export default function CalendarColorsIconsScreen() {
  const router = useRouter();

  const openOnWeb = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/(app)/(tabs)/more/portal",
      params: {
        path: "/provider/settings/calendar/colors-icons",
        title: "Calendar colors & icons",
      },
    } as never);
  };

  return (
    <ScreenContainer>
      <ScreenHeader title="Calendar colors & icons" onBack={() => router.back()} subtitle="Customize how appointments appear" />
      <View style={twStyle("px-4 pt-4 pb-8")}>
        <View style={twStyle("rounded-2xl border border-gray-200 bg-gray-50 p-5")}>
          <View style={twStyle("h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 mb-4")}>
            <Ionicons name="color-palette-outline" size={26} color="#6366f1" />
          </View>
          <Text style={twStyle("text-base font-semibold text-gray-900")}>Color schemes</Text>
          <Text style={twStyle("mt-2 text-sm text-gray-600 leading-5")}>
            Create color schemes to visually organize appointments on your calendar by service, status, or team member. Add and edit schemes in the provider dashboard on the web.
          </Text>
          <TouchableOpacity
            onPress={openOnWeb}
            style={twStyle("mt-5 flex-row items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 py-3.5")}
            activeOpacity={0.8}
          >
            <Ionicons name="open-outline" size={20} color="#6366f1" />
            <Text style={twStyle("ml-2 font-semibold text-indigo-700")}>Open on web</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

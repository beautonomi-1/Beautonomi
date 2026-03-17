/**
 * Native Marketing integrations – connect marketing tools (in-app screen).
 */
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";

export default function MarketingIntegrationsScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Marketing integrations"
        subtitle="Connect marketing tools"
        onBack={() => router.back()}
      />
      <View style={[twStyle("flex-1 px-4 pt-8"), { paddingHorizontal: screenPadding }]}>
        <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-8 items-center")}>
          <Ionicons name="share-social-outline" size={48} color="#9ca3af" />
          <Text style={twStyle("mt-4 text-lg font-semibold text-gray-900 text-center")}>
            Connect marketing tools
          </Text>
          <Text style={twStyle("mt-2 text-sm text-gray-500 text-center")}>
            Connect email, social, and other marketing tools from this screen. More options coming soon.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

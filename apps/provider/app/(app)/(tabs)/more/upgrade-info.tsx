import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";

export default function UpgradeInfoScreen() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <ScreenHeader title="Upgrade to Salon" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: 8, paddingTop: 16 }}>
        <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "#fbcfe8", backgroundColor: "rgba(253,242,248,0.8)", padding: 16 }}>
          <Ionicons name="sparkles" size={28} color="#ec4899" />
          <Text style={{ marginLeft: 12, flex: 1, fontSize: 16, fontWeight: "500", color: "#9d174d" }}>
            Unlock team management, multiple locations, and advanced features.
          </Text>
        </View>
        <Text style={{ fontSize: 16, color: Colors.gray[700], lineHeight: 24 }}>
          To upgrade your plan from Freelancer to Salon, please use the web portal. There you can compare plans and complete the upgrade.
        </Text>
        <Text style={{ marginTop: 16, fontSize: 14, color: Colors.gray[500] }}>
          Open the provider dashboard in your browser and go to Settings or Billing to upgrade.
        </Text>
      </View>
    </ScreenContainer>
  );
}

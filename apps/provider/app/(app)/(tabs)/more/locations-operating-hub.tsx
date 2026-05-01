/**
 * Entry point from More tab: jump to Locations or Operating hours (same screens as Settings → Business).
 */
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";

export default function LocationsOperatingHubScreen() {
  const router = useRouter();

  function go(route: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as never);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Locations & operating hours"
        subtitle="Manage branches and when you're open"
        showBack
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        <TouchableOpacity
          onPress={() => go("/(app)/(tabs)/more/locations")}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.gray[100],
            backgroundColor: Colors.white,
            padding: 16,
          }}
          accessibilityRole="button"
          accessibilityLabel="Locations"
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "#ecfdf5",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="location-outline" size={22} color="#059669" />
          </View>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>Locations</Text>
            <Text style={{ marginTop: 4, fontSize: 13, color: Colors.gray[500], lineHeight: 18 }}>
              Branches, addresses, maps & inactive sites
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray[300]} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => go("/(app)/(tabs)/more/settings/hours")}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.gray[100],
            backgroundColor: Colors.white,
            padding: 16,
          }}
          accessibilityRole="button"
          accessibilityLabel="Operating hours"
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "#eff6ff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="time-outline" size={22} color="#2563eb" />
          </View>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>Operating hours</Text>
            <Text style={{ marginTop: 4, fontSize: 13, color: Colors.gray[500], lineHeight: 18 }}>
              Opening & closing times, breaks & per-location schedules
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray[300]} />
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

/**
 * Legacy screen – most settings now open in-app natively. Use Settings & account from More.
 * Kept for old links; suggests using Settings & account in the app.
 */
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";

export default function SettingsWebScreen() {
  const router = useRouter();
  const { title, description } = useLocalSearchParams<{ title?: string; description?: string }>();
  const displayTitle = title ? decodeURIComponent(title) : "Settings";
  const displayDescription = description ? decodeURIComponent(description) : "Manage this in the app.";

  return (
    <ScreenContainer>
      <ScreenHeader title={displayTitle} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: 8, paddingTop: 16 }}>
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 20 }}>
          <View style={{ marginBottom: 16, height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: Colors.gray[200] }}>
            <Ionicons name="desktop-outline" size={24} color="#6b7280" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[900] }}>{displayTitle}</Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600], lineHeight: 20 }}>{displayDescription}</Text>
          <Text style={{ marginTop: 16, fontSize: 14, color: Colors.gray[500] }}>
            All settings are available in-app. Go to More → Settings & account to manage this and other settings without leaving the app.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 16, borderRadius: 12, backgroundColor: Colors.gray[900], paddingVertical: 10 }}
          >
            <Text style={{ textAlign: "center", fontWeight: "500", color: Colors.white }}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

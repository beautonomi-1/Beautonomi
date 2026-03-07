/**
 * Native React Native Privacy Policy screen. 100% in-app, no WebView or browser.
 */
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 12, padding: 8 }}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>Privacy Policy</Text>
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingVertical: 24 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ marginBottom: 16, fontSize: 14, lineHeight: 24, color: Colors.gray[700] }}>
          Our Privacy Policy describes how we collect, use, and protect your data when you use the Beautonomi provider app and web portal.
        </Text>
        <Text style={{ marginBottom: 16, fontSize: 14, lineHeight: 24, color: Colors.gray[700] }}>
          This includes account and business information, booking and payment data, and how we use cookies and similar technologies. We do not sell your personal information.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Native React Native Privacy Policy screen. 100% in-app, no WebView or browser.
 */
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";

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
        <Text style={{ marginBottom: 8, fontSize: 13, fontWeight: "600", color: Colors.gray[900] }}>
          Full policies on the web
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(`${APP_URL.replace(/\/$/, "")}/privacy-policy`).catch(() => {})}
          style={{ marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: Colors.gray[50], borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[200] }}
          accessibilityRole="button"
          accessibilityLabel="Open full privacy policy in browser"
        >
          <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "600" }}>Open Privacy Policy</Text>
          <Text style={{ fontSize: 12, color: Colors.gray[600], marginTop: 4 }}>Includes jurisdiction-specific rights (GDPR, POPIA, US states, and more).</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(`${APP_URL.replace(/\/$/, "")}/cookie-policy`).catch(() => {})}
          style={{ marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: Colors.gray[50], borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[200] }}
          accessibilityRole="button"
          accessibilityLabel="Open cookie policy in browser"
        >
          <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "600" }}>Open Cookie Policy</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

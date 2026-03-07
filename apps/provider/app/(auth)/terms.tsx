/**
 * Native React Native Terms of Service screen. 100% in-app, no WebView or browser.
 */
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

export default function TermsScreen() {
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
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>Terms of Service</Text>
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingVertical: 24 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ marginBottom: 16, fontSize: 14, lineHeight: 24, color: Colors.gray[700] }}>
          By using the Beautonomi provider app you agree to our Terms of Service. These terms cover your use of the platform, booking and payment handling, and your responsibilities as a provider.
        </Text>
        <Text style={{ marginBottom: 16, fontSize: 14, lineHeight: 24, color: Colors.gray[700] }}>
          Key points include: compliance with local laws, accurate service and business information, handling of client data and cancellations, and our right to update these terms with notice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

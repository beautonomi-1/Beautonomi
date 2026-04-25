import { View, StyleSheet, TouchableOpacity, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";

export default function HelpScreen() {
  useScreenTracking("Help");
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.quickLinks}>
        <TouchableOpacity
          style={[styles.quickLink, styles.quickLinkFirst]}
          onPress={() => router.push("/(app)/contact-support" as never)}
          accessibilityLabel="Contact support"
          accessibilityRole="button"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>Contact</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLink}
          onPress={() => router.push("/(app)/support-tickets" as never)}
          accessibilityLabel="View my support tickets"
          accessibilityRole="button"
        >
          <Ionicons name="ticket-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>My tickets</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.quickLinksSecondRow}>
        <TouchableOpacity
          style={[styles.quickLink, styles.quickLinkFirst]}
          onPress={() => router.push("/(app)/support-tickets/new" as never)}
          accessibilityLabel="Submit a new support ticket"
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>New ticket</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLink}
          onPress={() => router.push("/(app)/privacy-policy" as never)}
          accessibilityLabel="Open privacy policy"
          accessibilityRole="button"
        >
          <Ionicons name="document-text-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>Privacy</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.quickLinksThirdRow}>
        <TouchableOpacity
          style={[styles.quickLink, { flex: 1, marginRight: 0 }]}
          onPress={() => router.push("/(app)/terms-of-service" as never)}
          accessibilityLabel="Open terms of service"
          accessibilityRole="button"
        >
          <Ionicons name="reader-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>Terms</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Help center</Text>
        <Text style={styles.sectionBody}>
          Get support faster by opening a ticket with your booking/order details and screenshots where possible.
          You can track updates in My tickets and reply directly from the app.
        </Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Common questions</Text>
        <Text style={styles.faqTitle}>How long does support take?</Text>
        <Text style={styles.faqBody}>Most requests are answered within 1-2 business days.</Text>
        <Text style={styles.faqTitle}>How do I follow up on a ticket?</Text>
        <Text style={styles.faqBody}>Open My tickets, choose your ticket, and send a reply in the thread.</Text>
        <Text style={styles.faqTitle}>What should I include?</Text>
        <Text style={styles.faqBody}>A clear description, affected booking/order id, and screenshots if relevant.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { paddingBottom: 24 },
  quickLinks: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    backgroundColor: Colors.gray[50],
  },
  quickLink: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  quickLinkFirst: {
    marginRight: 12,
  },
  quickLinksSecondRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    backgroundColor: Colors.gray[50],
  },
  quickLinksThirdRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    backgroundColor: Colors.gray[50],
  },
  quickLinkIcon: { marginRight: 6 },
  quickLinkText: { fontSize: 14, fontWeight: "500", color: Colors.gray[800] },
  sectionCard: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: "#fff",
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 },
  sectionBody: { fontSize: 14, lineHeight: 20, color: Colors.gray[600] },
  faqTitle: { fontSize: 14, fontWeight: "600", color: Colors.gray[800], marginTop: 10 },
  faqBody: { fontSize: 13, lineHeight: 19, color: Colors.gray[600], marginTop: 4 },
});

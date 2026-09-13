import { View, StyleSheet, TouchableOpacity, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { pushWebLearningCenter, pushWebPrivacyPolicy, pushWebTermsOfService, pushWebAgeSuitability } from "@/lib/legal-web";
import { Ionicons } from "@expo/vector-icons";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

export default function HelpScreen() {
  useScreenTracking("Help");
  const router = useRouter();
  const { t } = useTranslation();
  const h = (key: string) => t(`customer.mobile.screens.help.${key}`) as string;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={styles.safetyCard}
        onPress={() => router.push("/(app)/safety" as never)}
        accessibilityLabel={t("customer.mobile.screens.safetyHub.title")}
        accessibilityRole="button"
      >
        <Ionicons name="shield-checkmark-outline" size={24} color="#B91C1C" style={styles.quickLinkIcon} />
        <View style={{ flex: 1 }}>
          <Text style={styles.safetyCardTitle}>{t("customer.mobile.screens.safetyHub.title")}</Text>
          <Text style={styles.safetyCardBody}>{t("customer.mobile.screens.safetyHub.helpCardBody")}</Text>
        </View>
        <DirectionalIcon name="chevron-forward" size={20} color={Colors.gray[400]} />
      </TouchableOpacity>
      <View style={styles.quickLinks}>
        <TouchableOpacity
          style={[styles.quickLink, styles.quickLinkFirst]}
          onPress={() => pushWebLearningCenter(router)}
          accessibilityLabel={h("learningCentreA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="school-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>{h("learningCentre")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLink}
          onPress={() => router.push("/(app)/(tabs)/support-tickets" as never)}
          accessibilityLabel={h("myTicketsA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="ticket-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>{h("myTickets")}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.quickLinksSecondRow}>
        <TouchableOpacity
          style={[styles.quickLink, styles.quickLinkFirst]}
          onPress={() => router.push("/(app)/(tabs)/support-tickets/new" as never)}
          accessibilityLabel={h("newTicketA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>{h("newTicket")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLink}
          onPress={() => pushWebPrivacyPolicy(router)}
          accessibilityLabel={h("privacyA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="document-text-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>{h("privacy")}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.quickLinksThirdRow}>
        <TouchableOpacity
          style={[styles.quickLink, styles.quickLinkFirst]}
          onPress={() => pushWebTermsOfService(router)}
          accessibilityLabel={h("termsA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="reader-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>{h("terms")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickLink}
          onPress={() => pushWebAgeSuitability(router)}
          accessibilityLabel={h("ageSuitabilityA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="shield-outline" size={20} color={Colors.primary} style={styles.quickLinkIcon} />
          <Text style={styles.quickLinkText}>{h("ageSuitability")}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{h("helpCenter")}</Text>
        <Text style={styles.sectionBody}>{h("helpCenterBody")}</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{h("commonQuestions")}</Text>
        <Text style={styles.faqTitle}>{h("faqGuidesQ")}</Text>
        <Text style={styles.faqBody}>{h("faqGuidesA")}</Text>
        <Text style={styles.faqTitle}>{h("faqSupportTimeQ")}</Text>
        <Text style={styles.faqBody}>{h("faqSupportTimeA")}</Text>
        <Text style={styles.faqTitle}>{h("faqFollowUpQ")}</Text>
        <Text style={styles.faqBody}>{h("faqFollowUpA")}</Text>
        <Text style={styles.faqTitle}>{h("faqIncludeQ")}</Text>
        <Text style={styles.faqBody}>{h("faqIncludeA")}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { paddingBottom: 24 },
  safetyCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  safetyCardTitle: { fontWeight: "600", color: "#991B1B", fontSize: 16 },
  safetyCardBody: { fontSize: 13, color: "#7F1D1D", marginTop: 4 },
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
    marginEnd: 12,
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
  quickLinkIcon: { marginEnd: 6 },
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

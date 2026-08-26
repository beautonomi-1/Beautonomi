import { useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { RADIUS_BUTTON } from "@/constants/layout";
import { webAgeSuitabilityUrl } from "@/lib/legal-web";

const PRIMARY = Colors.primary;

function ControlItem({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 4,
      }}
    >
      <Ionicons name={icon} size={18} color={Colors.gray[500]} style={{ marginRight: 10 }} />
      <Text style={{ flex: 1, fontSize: 14, color: Colors.gray[700], lineHeight: 20 }}>{label}</Text>
    </View>
  );
}

export default function SafetyAndAgeScreen() {
  useScreenTracking("Safety and age (pre-auth)");
  const { t } = useTranslation();
  const sa = useCallback((key: string) => t(`customer.mobile.screens.authSafetyAndAge.${key}`), [t]);
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const formNarrow = isTablet || Platform.OS === "web";
  const containerStyle = formNarrow
    ? { width: "100%" as const, maxWidth: Math.min(420, contentMaxWidth), alignSelf: "center" as const }
    : { width: "100%" as const };

  const postLoginControls = [
    {
      icon: "options-outline" as const,
      label: t("customer.accountSettings.contentSafetyTitle"),
    },
    {
      icon: "calendar-outline" as const,
      label: t("customer.mobile.screens.safetyHub.ageAssuranceLabel"),
    },
    {
      icon: "ban-outline" as const,
      label: t("customer.mobile.screens.blockedUsers.title"),
    },
    {
      icon: "person-outline" as const,
      label: t("customer.mobile.screens.safetyHub.emergencyContact"),
    },
    {
      icon: "flag-outline" as const,
      label: t("customer.mobile.screens.safetyHub.reportUser"),
    },
  ];

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: Colors.white }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: contentPadding,
          paddingTop: 16,
          paddingBottom: 48,
          ...(formNarrow ? { alignItems: "center" as const } : {}),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={containerStyle}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: Colors.gray[50],
              borderWidth: 1,
              borderColor: Colors.gray[200],
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>

          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "rgba(255,0,119,0.06)",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={28} color={PRIMARY} />
          </View>

          <Text
            style={{ fontSize: 26, fontWeight: "800", color: "#111827", marginBottom: 12, letterSpacing: -0.3 }}
            accessibilityRole="header"
          >
            {sa("title")}
          </Text>

          <Text style={{ fontSize: 15, color: "#6B7280", lineHeight: 22, marginBottom: 16 }}>{sa("intro")}</Text>

          <View
            style={{
              backgroundColor: "#FFF7ED",
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: "#FED7AA",
            }}
          >
            <Text style={{ fontSize: 14, color: "#9A3412", lineHeight: 20 }}>{sa("minAgeNote")}</Text>
          </View>

          <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
            {sa("signInRequiredTitle")}
          </Text>
          <Text style={{ fontSize: 14, color: "#6B7280", lineHeight: 20, marginBottom: 20 }}>{sa("signInRequiredBody")}</Text>

          <TouchableOpacity
            onPress={() => void Linking.openURL(webAgeSuitabilityUrl()).catch(() => {})}
            style={{
              borderWidth: 1,
              borderColor: Colors.gray[200],
              borderRadius: RADIUS_BUTTON,
              paddingVertical: 14,
              alignItems: "center",
              marginBottom: 12,
              backgroundColor: Colors.white,
            }}
            accessibilityRole="link"
            accessibilityLabel={sa("viewPolicyA11y")}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827" }}>{sa("viewPolicyCta")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/login" as never)}
            style={{
              backgroundColor: PRIMARY,
              borderRadius: RADIUS_BUTTON,
              paddingVertical: 16,
              alignItems: "center",
              marginBottom: 28,
            }}
            accessibilityRole="button"
            accessibilityLabel={sa("signInCtaA11y")}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{sa("signInCta")}</Text>
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: Colors.gray[400],
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            {sa("postLoginTitle")}
          </Text>
          <View
            style={{
              backgroundColor: Colors.gray[50],
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[100],
              paddingHorizontal: 12,
              paddingVertical: 4,
              marginBottom: 8,
            }}
          >
            {postLoginControls.map((item) => (
              <ControlItem key={item.label} icon={item.icon} label={item.label} />
            ))}
          </View>
          <Text style={{ fontSize: 12, color: Colors.gray[500], lineHeight: 18 }}>{sa("postLoginFootnote")}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { pushWebAgeSuitability, pushWebPrivacyPolicy, pushWebLearningCenter } from "@/lib/legal-web";
import { useAuth } from "@/providers/AuthProvider";
import { useSafetySettings } from "@/hooks/useSafetySettings";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: Colors.gray[400],
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 8,
          paddingHorizontal: 4,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: Colors.white,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: Colors.gray[100],
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  subtitle,
  onPress,
  destructive,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: Colors.gray[100],
      }}
      accessibilityRole="button"
    >
      <Ionicons
        name={icon}
        size={22}
        color={destructive ? "#DC2626" : Colors.primary}
        style={{ marginRight: 12 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "500", color: destructive ? "#DC2626" : Colors.gray[900] }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
    </TouchableOpacity>
  );
}

export default function SafetyHubScreen() {
  useScreenTracking("Safety hub");
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { age_band, age_source } = useSafetySettings();

  const callEmergency = () => {
    Alert.alert(
      t("customer.mobile.screens.safetyHub.emergencyCallTitle"),
      t("customer.mobile.screens.safetyHub.emergencyCallBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("customer.mobile.screens.safetyHub.emergencyCallAction"),
          style: "destructive",
          onPress: () => void Linking.openURL("tel:112"),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t("customer.mobile.screens.safetyHub.title"),
          headerBackTitle: t("common.back"),
          headerShown: true,
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: Colors.gray[50] }} contentContainerStyle={{ padding: 16 }}>
        <View
          style={{
            backgroundColor: "#FEF2F2",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: "#FECACA",
          }}
        >
          <Text style={{ fontWeight: "600", color: "#991B1B", marginBottom: 6 }}>
            {t("customer.mobile.screens.safetyHub.emergencyNoticeTitle")}
          </Text>
          <Text style={{ color: "#7F1D1D", lineHeight: 20 }}>
            {t("customer.mobile.screens.safetyHub.emergencyNoticeBody")}
          </Text>
          <TouchableOpacity
            onPress={callEmergency}
            style={{ marginTop: 12, alignSelf: "flex-start" }}
          >
            <Text style={{ fontWeight: "600", color: "#DC2626" }}>
              {t("customer.mobile.screens.safetyHub.emergencyCallAction")}
            </Text>
          </TouchableOpacity>
        </View>

        {(age_band === "unknown" || age_source === "none") && user ? (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/safety/age-assurance" as never)}
            style={{
              backgroundColor: "#FFF7ED",
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: "#FED7AA",
            }}
            accessibilityRole="button"
            accessibilityLabel="Add your date of birth for age assurance"
          >
            <Text style={{ fontWeight: "700", color: "#9A3412", marginBottom: 4 }}>Add your date of birth</Text>
            <Text style={{ color: "#9A3412", lineHeight: 20 }}>
              Age assurance uses your date of birth. Under 13 cannot use the app; 13–17 can use it; payouts require 18+. Calendar stays available until you save it.
            </Text>
          </TouchableOpacity>
        ) : null}

        <SectionCard title={t("customer.mobile.screens.safetyHub.getHelpTitle")}>
          <Row
            icon="ticket-outline"
            label={t("customer.mobile.screens.safetyHub.contactTrustSafety")}
            subtitle={t("customer.mobile.screens.safetyHub.contactTrustSafetyHint")}
            onPress={() =>
              router.push({
                pathname: "/(app)/(tabs)/more/support-tickets/new",
                params: { category: "safety_emergency" },
              } as never)
            }
          />
          <Row
            icon="flag-outline"
            label={t("customer.mobile.screens.safetyHub.reportUser")}
            subtitle={t("customer.mobile.screens.safetyHub.reportUserHint")}
            onPress={() =>
              router.push({
                pathname: "/(app)/(tabs)/more/support-tickets/new",
                params: { category: "safety_report_user" },
              } as never)
            }
            last
          />
        </SectionCard>

        <SectionCard title={t("customer.mobile.screens.safetyHub.yourProfileTitle")}>
          <Row
            icon="person-outline"
            label={t("customer.mobile.screens.safetyHub.emergencyContact")}
            subtitle={
              user
                ? t("customer.mobile.screens.safetyHub.emergencyContactHint")
                : t("customer.mobile.screens.safetyHub.signInHint")
            }
            onPress={() => router.push("/(app)/(tabs)/more/settings/personal-profile" as never)}
          />
          <Row
            icon="calendar-outline"
            label="Age assurance"
            subtitle={t(`customer.mobile.screens.safetyHub.ageBand.${age_band}`, {
              defaultValue: age_band,
            })}
            onPress={() => router.push("/(app)/(tabs)/more/safety/age-assurance" as never)}
          />
          <Row
            icon="shield-checkmark-outline"
            label={t("customer.mobile.screens.safetyHub.ageBandLabel")}
            subtitle={t(`customer.mobile.screens.safetyHub.ageBand.${age_band}`, {
              defaultValue: age_band,
            })}
            onPress={() => pushWebAgeSuitability(router)}
            last
          />
        </SectionCard>

        <SectionCard title={t("customer.mobile.screens.safetyHub.controlsTitle")}>
          <Row
            icon="options-outline"
            label={t("customer.accountSettings.contentSafetyTitle")}
            onPress={() => router.push("/(app)/(tabs)/more/settings/content-and-safety-controls" as never)}
          />
          <Row
            icon="ban-outline"
            label={t("customer.mobile.screens.blockedUsers.title")}
            onPress={() => router.push("/(app)/(tabs)/more/settings/blocked-users" as never)}
            last
          />
        </SectionCard>

        <SectionCard title={t("customer.mobile.screens.safetyHub.resourcesTitle")}>
          <Row
            icon="school-outline"
            label={t("customer.mobile.screens.safetyHub.learningCentre")}
            onPress={() => pushWebLearningCenter(router)}
          />
          <Row
            icon="document-text-outline"
            label={t("customer.mobile.screens.safetyHub.privacy")}
            onPress={() => pushWebPrivacyPolicy(router)}
            last
          />
        </SectionCard>
      </ScrollView>
    </>
  );
}

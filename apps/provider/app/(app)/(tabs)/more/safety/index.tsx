import { useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { pushWebAgeSuitability, pushWebPrivacyPolicy, pushWebLearningCenter } from "@/lib/legal-web";
import { useAuth } from "@/providers/AuthProvider";
import { useSafetySettings } from "@/hooks/useSafetySettings";
import { useUserBlocks } from "@/hooks/useUserBlocks";
import { useApi } from "@/hooks/useApi";
import { navigateFromSafetyHub } from "@/lib/provider-tab-navigation";
import {
  countActiveSafetyRestrictions,
  hasEmergencyContact,
  maskPhoneForDisplay,
} from "@/lib/safety/trust-hub-status";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { trackSafetyHubNav, trackSafetyHubView } from "@/lib/analytics";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
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
  const { settings, age_band, age_source } = useSafetySettings();
  const { blockedUsers, refresh: refreshBlocks } = useUserBlocks();
  const { data: profile, refresh: refreshProfile } = useApi<{ emergency_contact?: { name?: string; phone?: string } }>(
    "/api/me/profile",
  );

  const safetyConfig = useModuleConfig("safety") as { enabled?: boolean } | undefined;
  const panicEnabled = useFeatureFlag("safety.panic.enabled");
  const showBookingSafety = Boolean(safetyConfig?.enabled) && panicEnabled;

  const ph = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`provider.mobile.screens.safetyHub.${key}`, opts ?? {}) as string,
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      trackSafetyHubView();
      void refreshBlocks();
      void refreshProfile();
    }, [refreshBlocks, refreshProfile]),
  );

  const restrictionCount = countActiveSafetyRestrictions(settings);
  const contentSafetySubtitle =
    restrictionCount === 0
      ? ph("contentSafetySummaryNone")
      : (t(`provider.mobile.screens.safetyHub.contentSafetySummary${restrictionCount === 1 ? "" : "_plural"}`, {
          count: restrictionCount,
          defaultValue:
            restrictionCount === 1
              ? ph("contentSafetySummary", { count: restrictionCount })
              : ph("contentSafetySummary_plural", { count: restrictionCount }),
        }) as string);

  const emergencySubtitle = !user
    ? t("customer.mobile.screens.safetyHub.signInHint")
    : hasEmergencyContact(profile)
      ? ph("emergencyContactSet", {
          phone: maskPhoneForDisplay(profile?.emergency_contact?.phone) ?? "",
        })
      : ph("emergencyContactNotSet");

  const blockedSubtitle =
    blockedUsers.length === 0
      ? ph("blockedUsersEmpty")
      : ph("blockedUsersCount", { count: blockedUsers.length });

  const ageBandLabel = t(`customer.mobile.screens.safetyHub.ageBand.${age_band}`, {
    defaultValue: age_band,
  });

  const nav = useCallback(
    (destination: string, pathname: string, params?: Record<string, string>) => {
      trackSafetyHubNav(destination, "hub");
      navigateFromSafetyHub(router, pathname, params);
    },
    [router],
  );

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
            accessibilityRole="button"
            accessibilityLabel={t("customer.mobile.screens.safetyHub.emergencyCallAction")}
          >
            <Text style={{ fontWeight: "600", color: "#DC2626" }}>
              {t("customer.mobile.screens.safetyHub.emergencyCallAction")}
            </Text>
          </TouchableOpacity>
        </View>

        {(age_band === "unknown" || age_source === "none") && user ? (
          <TouchableOpacity
            onPress={() => nav("age_assurance", "/(app)/(tabs)/more/safety/age-assurance")}
            style={{
              backgroundColor: "#FFF7ED",
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: "#FED7AA",
            }}
            accessibilityRole="button"
            accessibilityLabel={ph("dobBannerA11y")}
          >
            <Text style={{ fontWeight: "700", color: "#9A3412", marginBottom: 4 }}>{ph("dobBannerTitle")}</Text>
            <Text style={{ color: "#9A3412", lineHeight: 20 }}>{ph("dobBannerBody")}</Text>
          </TouchableOpacity>
        ) : null}

        {showBookingSafety ? (
          <SectionCard title={ph("bookingSafetyTitle")}>
            <Row
              icon="calendar-outline"
              label={ph("bookingSafetyTitle")}
              subtitle={ph("bookingSafetyHint")}
              onPress={() => {
                Alert.alert(ph("bookingSafetyTitle"), ph("bookingSafetyBody"), [
                  { text: t("common.ok") },
                  {
                    text: t("customer.mobile.tabs.bookings", { defaultValue: "Bookings" }),
                    onPress: () => router.push("/(app)/(tabs)/bookings" as never),
                  },
                ]);
              }}
              last
            />
          </SectionCard>
        ) : null}

        <SectionCard title={t("customer.mobile.screens.safetyHub.getHelpTitle")}>
          <Row
            icon="ticket-outline"
            label={t("customer.mobile.screens.safetyHub.contactTrustSafety")}
            subtitle={t("customer.mobile.screens.safetyHub.contactTrustSafetyHint")}
            onPress={() =>
              nav("safety_emergency", "/(app)/(tabs)/more/support-tickets/new", {
                category: "safety_emergency",
              })
            }
          />
          <Row
            icon="alert-circle-outline"
            label={t("customer.mobile.screens.safetyHub.reportContent")}
            subtitle={t("customer.mobile.screens.safetyHub.reportContentHint")}
            onPress={() => {
              Alert.alert(
                t("customer.mobile.screens.safetyHub.reportContent"),
                t("customer.mobile.screens.safetyHub.reportContentHint"),
                [
                  { text: t("common.ok") },
                  {
                    text: t("customer.mobile.screens.safetyHub.openExplorePosts"),
                    onPress: () => router.push("/(app)/(tabs)/more/explore-posts" as never),
                  },
                ],
              );
            }}
          />
          <Row
            icon="flag-outline"
            label={t("customer.mobile.screens.safetyHub.reportUser")}
            subtitle={t("customer.mobile.screens.safetyHub.reportUserHint")}
            onPress={() =>
              nav("safety_report_user", "/(app)/(tabs)/more/safety/report-user")
            }
            last
          />
        </SectionCard>

        <SectionCard title={t("customer.mobile.screens.safetyHub.yourProfileTitle")}>
          <Row
            icon="person-outline"
            label={t("customer.mobile.screens.safetyHub.emergencyContact")}
            subtitle={emergencySubtitle}
            onPress={() => nav("emergency_contact", "/(app)/(tabs)/more/settings/emergency-contact")}
          />
          <Row
            icon="calendar-outline"
            label={ph("ageAssuranceLabel")}
            subtitle={ageBandLabel}
            onPress={() => nav("age_assurance", "/(app)/(tabs)/more/safety/age-assurance")}
          />
          <Row
            icon="shield-checkmark-outline"
            label={t("customer.mobile.screens.safetyHub.ageBandLabel")}
            subtitle={ageBandLabel}
            onPress={() => pushWebAgeSuitability(router)}
            last
          />
        </SectionCard>

        <SectionCard title={t("customer.mobile.screens.safetyHub.controlsTitle")}>
          <Row
            icon="options-outline"
            label={t("customer.accountSettings.contentSafetyTitle")}
            subtitle={contentSafetySubtitle}
            onPress={() => nav("content_safety", "/(app)/(tabs)/more/settings/content-and-safety-controls")}
          />
          <Row
            icon="ban-outline"
            label={t("customer.mobile.screens.blockedUsers.title")}
            subtitle={blockedSubtitle}
            onPress={() => nav("blocked_users", "/(app)/(tabs)/more/settings/blocked-users")}
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

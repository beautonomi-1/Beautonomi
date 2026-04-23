import { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, Share, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useApi } from "@/hooks/useApi";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import { getAnalyticsClient } from "@/lib/analytics-rn";
import { api } from "@/lib/api-client";
import { trackReferralShared } from "@/lib/analytics";
import { useTranslation, type TFunction } from "@beautonomi/i18n";

interface ProfileCompletion {
  percentage?: number;
  completionPercentage?: number;
  checklistItems?: { id: string; label: string; completed: boolean }[];
}

type IconName = keyof typeof Ionicons.glyphMap;

interface SettingsItem {
  id: string;
  title: string;
  desc: string;
  route: string;
  icon: IconName;
}

interface SettingsGroup {
  heading: string;
  items: SettingsItem[];
}

function buildAccountSettingsGroups(t: TFunction): SettingsGroup[] {
  return [
    {
      heading: t("customer.accountSettings.groupAccount"),
      items: [
        { id: "personal-info", title: t("customer.accountSettings.personalInfoTitle"), desc: t("customer.accountSettings.personalInfoDesc"), route: "personal-info", icon: "person-outline" },
        { id: "profile-details", title: t("customer.accountSettings.profileDetailsTitle"), desc: t("customer.accountSettings.profileDetailsDesc"), route: "profile-details", icon: "sparkles-outline" },
        { id: "login-and-security", title: t("customer.accountSettings.loginSecurityTitle"), desc: t("customer.accountSettings.loginSecurityDesc"), route: "login-and-security", icon: "lock-closed-outline" },
        { id: "identity-verification", title: t("customer.accountSettings.identityVerificationTitle"), desc: t("customer.accountSettings.identityVerificationDesc"), route: "identity-verification", icon: "card-outline" },
        { id: "addresses", title: t("customer.accountSettings.savedAddressesTitle"), desc: t("customer.accountSettings.savedAddressesDesc"), route: "addresses", icon: "location-outline" },
        { id: "privacy-and-sharing", title: t("customer.accountSettings.privacySharingTitle"), desc: t("customer.accountSettings.privacySharingDesc"), route: "privacy-and-sharing", icon: "shield-checkmark-outline" },
      ],
    },
    {
      heading: t("customer.accountSettings.groupBookingsActivity"),
      items: [
        { id: "bookings", title: t("customer.accountSettings.bookingsMenuTitle"), desc: t("customer.accountSettings.bookingsMenuDesc"), route: "bookings", icon: "calendar-outline" },
        { id: "recurring-bookings", title: t("customer.accountSettings.recurringBookingsTitle"), desc: t("customer.accountSettings.recurringBookingsDesc"), route: "recurring-bookings", icon: "repeat-outline" },
        { id: "product-orders", title: t("customer.accountSettings.productOrdersTitle"), desc: t("customer.accountSettings.productOrdersDesc"), route: "/(app)/product-orders", icon: "bag-outline" },
        { id: "returns", title: t("customer.accountSettings.returnsTitle"), desc: t("customer.accountSettings.returnsDesc"), route: "/(app)/my-returns", icon: "arrow-undo-outline" },
        { id: "custom-requests", title: t("customer.customRequests"), desc: t("customer.accountSettings.customRequestsMenuDesc"), route: "custom-requests", icon: "create-outline" },
        { id: "waitlist", title: t("customer.accountSettings.waitlistTitle"), desc: t("customer.accountSettings.waitlistDesc"), route: "waitlist", icon: "hourglass-outline" },
        { id: "reviews", title: t("customer.accountSettings.reviewsTitle"), desc: t("customer.accountSettings.reviewsDesc"), route: "reviews", icon: "star-outline" },
      ],
    },
    {
      heading: t("customer.accountSettings.groupPaymentsRewards"),
      items: [
        { id: "payments", title: t("customer.accountSettings.paymentMethodsTitle"), desc: t("customer.accountSettings.paymentMethodsDesc"), route: "payments", icon: "card-outline" },
        { id: "wallet", title: t("customer.wallet"), desc: t("customer.accountSettings.walletMenuDesc"), route: "wallet", icon: "wallet-outline" },
        { id: "loyalty", title: t("customer.loyalty"), desc: t("customer.accountSettings.loyaltyMenuDesc"), route: "loyalty", icon: "trophy-outline" },
        { id: "referrals", title: t("customer.referrals"), desc: t("customer.accountSettings.referralsMenuDesc"), route: "referrals", icon: "gift-outline" },
        { id: "membership", title: t("customer.accountSettings.membershipTitle"), desc: t("customer.accountSettings.membershipDesc"), route: "membership", icon: "ribbon-outline" },
      ],
    },
    {
      heading: t("customer.accountSettings.groupPreferences"),
      items: [
        { id: "notifications", title: t("customer.notifications"), desc: t("customer.accountSettings.notificationsMenuDesc"), route: "notifications", icon: "notifications-outline" },
        { id: "messages", title: t("customer.messages"), desc: t("customer.accountSettings.messagesMenuDesc"), route: "messages", icon: "chatbubbles-outline" },
        { id: "preferences", title: t("customer.accountSettings.languageRegionTitle"), desc: t("customer.accountSettings.languageRegionDesc"), route: "preferences", icon: "globe-outline" },
        { id: "wishlists", title: t("customer.accountSettings.savedWishlistsTitle"), desc: t("customer.accountSettings.savedWishlistsDesc"), route: "wishlists", icon: "heart-outline" },
      ],
    },
    {
      heading: t("customer.accountSettings.groupBillingTax"),
      items: [{ id: "taxes", title: t("customer.accountSettings.taxDocumentsTitle"), desc: t("customer.accountSettings.taxDocumentsDesc"), route: "taxes", icon: "document-text-outline" }],
    },
  ];
}

export default function AccountSettingsScreen() {
  useScreenTracking("Account Settings");
  const { t } = useTranslation();
  const groups = useMemo(() => buildAccountSettingsGroups(t), [t]);
  const { user, signOut } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const { data: profileCompletion } = useApi<ProfileCompletion>("/api/me/profile-completion", {
    staleTimeMs: 120_000,
  });
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const completionPct = profileCompletion?.percentage ?? profileCompletion?.completionPercentage ?? 0;
  const showCompletionBanner = profileCompletion && completionPct < 100;

  const handleShare = async () => {
    getAnalyticsClient()?.track("share_app", { source: "account_settings" });
    const shareFallback = async () => {
      await Share.share({
        message: t("customer.accountSettings.shareAppMessage", { link: APP_URL }),
        title: t("customer.accountSettings.shareAppTitle"),
      });
    };
    try {
      const res = await api.get<{ referral_link?: string }>("/api/me/referrals");
      if (res.error) {
        await shareFallback();
        return;
      }
      const link = res.data?.referral_link?.trim();
      if (link) {
        await Share.share({
          message: t("customer.referral.shareMessage", { link }),
          title: t("customer.referral.shareTitle"),
          ...(Platform.OS === "ios" ? { url: link } : {}),
        });
        trackReferralShared("account_settings");
      } else {
        await shareFallback();
      }
    } catch {
      await shareFallback();
    }
  };

  const handleNavigate = (route: string) => {
    if (route.startsWith("/")) {
      router.push(route as any);
    } else {
      router.push(`/account-settings/${route}` as any);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.gray[50] }}
      accessibilityLabel={t("customer.accountSettings.accessibilityScroll")}
      accessibilityRole="none"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}
    >
      {user && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
            {user.user_metadata?.full_name || user.email || t("customer.accountSettings.accountFallback")}
          </Text>
          <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
            {user.email || user.phone || ""}
          </Text>
        </View>
      )}

      {showCompletionBanner && (
        <TouchableOpacity
          onPress={() => router.push("/(app)/account-settings/profile-details" as any)}
          style={{
            marginBottom: 20,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.primaryLight || "#fce7f3",
            backgroundColor: Colors.primaryLight || "#fdf2f8",
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          accessibilityLabel={t("customer.accountSettings.accessibilityProfileBanner")}
          accessibilityRole="button"
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{t("customer.accountSettings.profileCompletionTitle")}</Text>
            <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 2 }}>
              {t("customer.accountSettings.profileCompletionBanner", { pct: completionPct })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
        </TouchableOpacity>
      )}

      {groups.map((group) => (
        <View key={group.heading} style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 }}>
            {group.heading}
          </Text>
          <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], overflow: "hidden" }}>
            {group.items.map((item, idx) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => handleNavigate(item.route)}
                style={[
                  { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
                  idx < group.items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: Colors.gray[100] } : undefined,
                ]}
                accessibilityLabel={`${item.title}. ${item.desc}`}
                accessibilityRole="button"
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: Colors.gray[50],
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Ionicons name={item.icon} size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{item.title}</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>{item.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {/* Footer actions */}
      <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], overflow: "hidden", marginBottom: 20 }}>
        <TouchableOpacity
          onPress={handleShare}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
          accessibilityLabel={t("customer.accountSettings.accessibilityShare")}
          accessibilityRole="button"
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.gray[50], alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="share-social-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{t("customer.accountSettings.shareFooterTitle")}</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>{t("customer.accountSettings.shareFooterDesc")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(app)/help")}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
          accessibilityLabel={t("customer.accountSettings.accessibilityHelp")}
          accessibilityRole="button"
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.gray[50], alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="help-circle-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{t("customer.accountSettings.helpTitle")}</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>{t("customer.accountSettings.helpDesc")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(app)/about")}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}
          accessibilityLabel={t("customer.accountSettings.accessibilityAbout")}
          accessibilityRole="button"
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.gray[50], alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{t("customer.accountSettings.aboutTitle")}</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>{t("customer.accountSettings.aboutDesc")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </TouchableOpacity>
      </View>

      {user && (
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/(app)/in-app-browser",
              params: { url: encodeURIComponent(`${APP_URL}/provider/onboarding`), title: t("customer.accountSettings.becomeProviderBrowserTitle") },
            })
          }
          style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], paddingHorizontal: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", marginBottom: 16 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryLight || "#fce7f3", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="storefront-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{t("customer.accountSettings.becomeProviderTitle")}</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>{t("customer.accountSettings.becomeProviderDesc")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </TouchableOpacity>
      )}

      {user && (
        <View style={{ marginTop: 4, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(t("auth.logout"), t("customer.accountSettings.logOutConfirm"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("auth.logout"), style: "destructive", onPress: () => signOut() },
              ])
            }
            style={{ paddingVertical: 16, alignItems: "center" }}
            accessibilityRole="button"
            accessibilityLabel={t("customer.accountSettings.accessibilityLogOut")}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#EF4444" }}>{t("auth.logout")}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

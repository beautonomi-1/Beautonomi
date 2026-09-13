import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { openNativeStoreReview } from "@/lib/open-store-review";
import { recordManualStoreReview } from "@/lib/store-review-prompt";
import { getAnalyticsClient } from "@/lib/analytics-rn";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudFeatureEnabled } from "@/hooks/usePaycloudFeatureEnabled";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { webPrivacyPolicyUrl, webTermsOfServiceUrl } from "@/lib/legal-web";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

type SettingsItem = {
  titleKey: string;
  descriptionKey: string;
  href: string;
  /** Native screen route (all settings are native). */
  mobileRoute?: string;
  isUpgrade?: boolean;
  staffOnly?: boolean;
  /** Special action instead of navigation (e.g. signOut, globalSignOut) */
  action?: "signOut" | "globalSignOut" | "rateStore" | "openPrivacy" | "openTerms";
  /** Style as destructive (e.g. deactivate) */
  isDestructive?: boolean;
  /** Style as subtle/muted (e.g. delete account – less prominent) */
  isSubtle?: boolean;
};

type SettingsCategory = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  items: SettingsItem[];
};

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "app",
    titleKey: "catApp",
    descriptionKey: "catAppDesc",
    items: [
      { titleKey: "itemLanguage", descriptionKey: "itemLanguageDesc", href: "/provider/settings/language", mobileRoute: "/(app)/(tabs)/more/settings/language" },
    ],
  },
  {
    id: "appointment-activity",
    titleKey: "catAppointment",
    descriptionKey: "catAppointmentDesc",
    items: [
      { titleKey: "itemAppointments", descriptionKey: "itemAppointmentsDesc", href: "/provider/settings/appointments", mobileRoute: "/(app)/(tabs)/more/settings-appointment-defaults" },
      { titleKey: "itemBusinessDetails", descriptionKey: "itemBusinessDetailsDesc", href: "/provider/settings/appointment-activity/business-details", mobileRoute: "/(app)/(tabs)/more/settings/business" },
      { titleKey: "itemBusinessDescription", descriptionKey: "itemBusinessDescriptionDesc", href: "/provider/settings/business-description", mobileRoute: "/(app)/(tabs)/more/settings-business-description" },
      { titleKey: "itemGallery", descriptionKey: "itemGalleryDesc", href: "/provider/settings/gallery", mobileRoute: "/(app)/(tabs)/more/gallery" },
      { titleKey: "itemBilling", descriptionKey: "itemBillingDesc", href: "/provider/settings/billing", mobileRoute: "/(app)/(tabs)/more/settings/billing" },
      { titleKey: "itemLocations", descriptionKey: "itemLocationsDesc", href: "/provider/settings/locations", mobileRoute: "/(app)/(tabs)/more/locations" },
      { titleKey: "itemHours", descriptionKey: "itemHoursDesc", href: "/provider/settings/operating-hours", mobileRoute: "/(app)/(tabs)/more/settings/hours" },
      { titleKey: "itemDistance", descriptionKey: "itemDistanceDesc", href: "/provider/settings/distance", mobileRoute: "/(app)/(tabs)/more/settings/distance-settings" },
      { titleKey: "itemServiceZones", descriptionKey: "itemServiceZonesDesc", href: "/provider/settings/service-zones", mobileRoute: "/(app)/(tabs)/more/settings/service-zones" },
      { titleKey: "itemVerification", descriptionKey: "itemVerificationDesc", href: "/provider/settings/verification", mobileRoute: "/(app)/(tabs)/more/settings/verification" },
      { titleKey: "itemOnlineBooking", descriptionKey: "itemOnlineBookingDesc", href: "/provider/settings/appointment-activity/online-booking", mobileRoute: "/(app)/(tabs)/more/settings/online-booking" },
      { titleKey: "itemNoteTemplates", descriptionKey: "itemNoteTemplatesDesc", href: "/provider/settings/note-templates", mobileRoute: "/(app)/(tabs)/more/settings/note-templates" },
      { titleKey: "itemResources", descriptionKey: "itemResourcesDesc", href: "/provider/settings/appointment-activity/resources", mobileRoute: "/(app)/(tabs)/more/settings/resource-groups" },
      { titleKey: "itemClosedPeriods", descriptionKey: "itemClosedPeriodsDesc", href: "/provider/settings/appointment-activity/closed-periods", mobileRoute: "/(app)/(tabs)/more/settings/closed-periods" },
      { titleKey: "itemBlockedTime", descriptionKey: "itemBlockedTimeDesc", href: "/provider/settings/appointment-activity/blocked-time", mobileRoute: "/(app)/(tabs)/more/settings/blocked-time" },
      { titleKey: "itemWaitlist", descriptionKey: "itemWaitlistDesc", href: "/provider/settings/appointment-activity/waitlist", mobileRoute: "/(app)/(tabs)/more/settings/waitlist-settings" },
    ],
  },
  {
    id: "clients",
    titleKey: "catClients",
    descriptionKey: "catClientsDesc",
    items: [
      { titleKey: "itemClientList", descriptionKey: "itemClientListDesc", href: "/provider/settings/clients/list", mobileRoute: "/(app)/(tabs)/clients" },
      { titleKey: "itemReferrals", descriptionKey: "itemReferralsDesc", href: "/provider/settings/clients/referrals", mobileRoute: "/(app)/(tabs)/more/settings/referral-sources" },
      { titleKey: "itemCancelReasons", descriptionKey: "itemCancelReasonsDesc", href: "/provider/settings/clients/cancellation-reasons", mobileRoute: "/(app)/(tabs)/more/settings/cancellation-reasons" },
      { titleKey: "itemCancelPolicies", descriptionKey: "itemCancelPoliciesDesc", href: "/provider/settings/cancellation-policies", mobileRoute: "/(app)/(tabs)/more/settings/cancellation-policies" },
      { titleKey: "itemVisibility", descriptionKey: "itemVisibilityDesc", href: "/provider/settings/customer-visibility", mobileRoute: "/(app)/(tabs)/more/settings/customer-visibility" },
    ],
  },
  {
    id: "services",
    titleKey: "catServices",
    descriptionKey: "catServicesDesc",
    items: [
      { titleKey: "itemServicesMenu", descriptionKey: "itemServicesMenuDesc", href: "/provider/settings/services/menu", mobileRoute: "/(app)/(tabs)/more/catalogue" },
      { titleKey: "itemPackages", descriptionKey: "itemPackagesDesc", href: "/provider/packages", mobileRoute: "/(app)/(tabs)/more/packages-list" },
      { titleKey: "itemAddons", descriptionKey: "itemAddonsDesc", href: "/provider/settings/addons", mobileRoute: "/(app)/(tabs)/more/settings/service-addons" },
      { titleKey: "itemMemberships", descriptionKey: "itemMembershipsDesc", href: "/provider/settings/services/memberships", mobileRoute: "/(app)/(tabs)/more/membership-plans" },
    ],
  },
  {
    id: "sales",
    titleKey: "catSales",
    descriptionKey: "catSalesDesc",
    items: [
      { titleKey: "itemPayoutCenter", descriptionKey: "itemPayoutCenterDesc", href: "/provider/payouts", mobileRoute: "/(app)/(tabs)/more/payouts" },
      { titleKey: "itemPayoutAccounts", descriptionKey: "itemPayoutAccountsDesc", href: "/provider/settings/payout-accounts", mobileRoute: "/(app)/(tabs)/more/settings/payout-accounts" },
      { titleKey: "itemCardMachines", descriptionKey: "itemCardMachinesDesc", href: "/provider/settings/sales/card-machines", mobileRoute: "/(app)/(tabs)/more/card-machines" },
      { titleKey: "itemYoco", descriptionKey: "itemYocoDesc", href: "/provider/settings/sales/yoco-integration", mobileRoute: "/(app)/(tabs)/more/settings/yoco-devices" },
      { titleKey: "itemPaystack", descriptionKey: "itemPaystackDesc", href: "/provider/settings/sales/paystack-terminal", mobileRoute: "/(app)/(tabs)/more/paystack-terminal" },
      { titleKey: "itemReceiptSeq", descriptionKey: "itemReceiptSeqDesc", href: "/provider/settings/sales/receipt-sequencing", mobileRoute: "/(app)/(tabs)/more/settings/receipt-sequencing" },
      { titleKey: "itemReceiptTpl", descriptionKey: "itemReceiptTplDesc", href: "/provider/settings/sales/receipt-template", mobileRoute: "/(app)/(tabs)/more/settings/receipt-template" },
      { titleKey: "itemTaxes", descriptionKey: "itemTaxesDesc", href: "/provider/settings/sales/taxes", mobileRoute: "/(app)/(tabs)/more/settings/tax-configuration" },
      { titleKey: "itemTravelFees", descriptionKey: "itemTravelFeesDesc", href: "/provider/settings/sales/travel-fees", mobileRoute: "/(app)/(tabs)/more/settings/travel-fees" },
      { titleKey: "itemTips", descriptionKey: "itemTipsDesc", href: "/provider/settings/sales/tips", mobileRoute: "/(app)/(tabs)/more/settings/sales-settings" },
      { titleKey: "itemTipsDist", descriptionKey: "itemTipsDistDesc", href: "/provider/settings/tips/distribution", mobileRoute: "/(app)/(tabs)/more/settings/tip-distribution" },
      { titleKey: "itemGiftCards", descriptionKey: "itemGiftCardsDesc", href: "/provider/settings/sales/gift-cards", mobileRoute: "/(app)/(tabs)/more/settings/gift-cards-settings" },
      { titleKey: "itemUpselling", descriptionKey: "itemUpsellingDesc", href: "/provider/settings/sales/upselling", mobileRoute: "/(app)/(tabs)/more/settings/upselling" },
    ],
  },
  {
    id: "team",
    titleKey: "catTeam",
    descriptionKey: "catTeamDesc",
    items: [
      { titleKey: "itemTeamMembers", descriptionKey: "itemTeamMembersDesc", href: "/provider/team/members", mobileRoute: "/(app)/(tabs)/more/team" },
      { titleKey: "itemTimeClock", descriptionKey: "itemTimeClockDesc", href: "/provider/team/time-clock", mobileRoute: "/(app)/(tabs)/more/time-clock" },
      { titleKey: "itemRoles", descriptionKey: "itemRolesDesc", href: "/provider/settings/team/roles", mobileRoute: "/(app)/(tabs)/more/settings/team-roles" },
      { titleKey: "itemPermissions", descriptionKey: "itemPermissionsDesc", href: "/provider/settings/team/permissions", mobileRoute: "/(app)/(tabs)/more/settings/staff-permissions" },
      { titleKey: "itemCommissions", descriptionKey: "itemCommissionsDesc", href: "/provider/settings/team/commissions", mobileRoute: "/(app)/(tabs)/more/settings/team-commissions" },
      { titleKey: "itemTimeOff", descriptionKey: "itemTimeOffDesc", href: "/provider/settings/team/time-off-types", mobileRoute: "/(app)/(tabs)/more/settings/time-off-types" },
      { titleKey: "itemTeamNotifs", descriptionKey: "itemTeamNotifsDesc", href: "/provider/settings/team/notifications", mobileRoute: "/(app)/(tabs)/more/settings/team-staff-notifications" },
    ],
  },
  {
    id: "marketing",
    titleKey: "catMarketing",
    descriptionKey: "catMarketingDesc",
    items: [
      { titleKey: "itemAiStudio", descriptionKey: "itemAiStudioDesc", href: "/provider/settings/ai", mobileRoute: "/(app)/(tabs)/more/ai-studio" },
      { titleKey: "itemPaidAds", descriptionKey: "itemPaidAdsDesc", href: "/provider/settings/ads", mobileRoute: "/(app)/(tabs)/more/settings/ads" },
      { titleKey: "itemEmailInt", descriptionKey: "itemEmailIntDesc", href: "/provider/settings/integrations/email", mobileRoute: "/(app)/(tabs)/more/settings/email-integration" },
      { titleKey: "itemTwilio", descriptionKey: "itemTwilioDesc", href: "/provider/settings/integrations/twilio", mobileRoute: "/(app)/(tabs)/more/settings/twilio-integration" },
    ],
  },
  {
    id: "account",
    titleKey: "catAccount",
    descriptionKey: "catAccountDesc",
    items: [
      { titleKey: "itemStartBusiness", descriptionKey: "itemStartBusinessDesc", href: "/provider/onboarding", mobileRoute: "/(app)/onboarding/wizard", staffOnly: true },
      { titleKey: "itemMyProfile", descriptionKey: "itemMyProfileDesc", href: "/provider/account/profile", mobileRoute: "/(app)/(tabs)/more/profile" },
      // §provider-setup-seamless-ux 2026-05: dedicated entry-point for the
      // freelancer Personal Profile screen (the bio that gates the
      // `personal-profile` setup step).
      { titleKey: "itemPersonalProfile", descriptionKey: "itemPersonalProfileDesc", href: "/provider/account/personal-profile", mobileRoute: "/(app)/(tabs)/more/settings/personal-profile" },
      { titleKey: "itemRewards", descriptionKey: "itemRewardsDesc", href: "/provider/gamification", mobileRoute: "/(app)/(tabs)/more/rewards-hub" },
      { titleKey: "itemSubscription", descriptionKey: "itemSubscriptionDesc", href: "/provider/subscription", mobileRoute: "/(app)/(tabs)/more/settings/subscription" },
      { titleKey: "itemNotifPrefs", descriptionKey: "itemNotifPrefsDesc", href: "/provider/settings/notifications", mobileRoute: "/(app)/(tabs)/more/settings/notification-preferences" },
      { titleKey: "itemMyTickets", descriptionKey: "itemMyTicketsDesc", href: "/help/my-tickets", mobileRoute: "/(app)/(tabs)/more/support-tickets" },
      { titleKey: "itemContactSupport", descriptionKey: "itemContactSupportDesc", href: "/help/submit-ticket", mobileRoute: "/(app)/(tabs)/more/contact-support" },
      {
        titleKey: "itemRateApp",
        descriptionKey: "itemRateAppDesc",
        href: "#",
        action: "rateStore" as const,
      },
      { titleKey: "itemLoginSecurity", descriptionKey: "itemLoginSecurityDesc", href: "/account-settings/login-and-security", mobileRoute: "/(app)/(tabs)/more/settings-login-and-security" },
      { titleKey: "itemPrivacy", descriptionKey: "itemPrivacyDesc", href: "/privacy-policy", action: "openPrivacy" as const },
      { titleKey: "itemTerms", descriptionKey: "itemTermsDesc", href: "/terms-and-condition", action: "openTerms" as const },
      { titleKey: "itemDeactivate", descriptionKey: "itemDeactivateDesc", href: "/account-settings/login-and-security", mobileRoute: "/(app)/(tabs)/more/settings-deactivate-account", isDestructive: true },
      { titleKey: "itemSignOut", descriptionKey: "itemSignOutDesc", href: "#", action: "signOut" as const },
      { titleKey: "itemGlobalSignOut", descriptionKey: "itemGlobalSignOutDesc", href: "#", action: "globalSignOut" as const },
      { titleKey: "itemDelete", descriptionKey: "itemDeleteDesc", href: "/account-settings/privacy-and-sharing", mobileRoute: "/(app)/(tabs)/more/delete-account-info", isSubtle: true },
    ],
  },
];

export default function SettingsAccountHubScreen() {
  const { t } = useTranslation();
  const ah = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.settingsAccountHub.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { role } = useProvider();
  const [expandedId, setExpandedId] = useState<string | null>("account");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = usePaycloudFeatureEnabled();

  const { data: providerData } = useApi<{ business_type?: string } | { data?: { business_type?: string } }>(
    "/api/me/provider"
  );
  const businessType =
    (providerData as { business_type?: string })?.business_type ??
    (providerData as { data?: { business_type?: string } })?.data?.business_type ??
    null;
  const isFreelancer = businessType === "freelancer";

  const handleSignOut = useCallback(() => {
    const goToLogin = () => router.replace("/(auth)/login" as never);
    const performSignOut = () => signOut().then(goToLogin).catch(goToLogin);
    if (Platform.OS === "web") {
      performSignOut();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(ah("signOutTitle"), ah("signOutBody"), [
      { text: ah("cancel"), style: "cancel" },
      { text: ah("signOut"), style: "destructive", onPress: performSignOut },
    ]);
  }, [signOut, router, ah]);

  // Wave 2.4 (audit 2026-04 final 100/100): global sign-out — revokes
  // every refresh token for this provider across all devices.
  const handleGlobalSignOut = useCallback(() => {
    const goToLogin = () => router.replace("/(auth)/login" as never);
    const perform = async () => {
      try {
        const res = await api.post<{ ok?: boolean }>("/api/auth/sign-out-global", {});
        if (res.error) {
          Alert.alert(ah("errorTitle"), res.error.message ?? ah("signOutEverywhereFailed"));
          return;
        }
        // Use AuthProvider `signOut` (bounded remote + local fallback + cache
        // + biometrics) — raw `supabase.auth.signOut()` can hang on network.
        await signOut();
        goToLogin();
      } catch (e) {
        Alert.alert(ah("errorTitle"), getApiErrorMessage(e, ah("signOutEverywhereFailedShort")));
      }
    };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      ah("globalSignOutTitle"),
      ah("globalSignOutBody"),
      [
        { text: ah("cancel"), style: "cancel" },
        { text: ah("signOutEverywhere"), style: "destructive", onPress: () => void perform() },
      ],
    );
  }, [router, signOut, ah]);

  const handleItemPress = useCallback(
    (item: SettingsItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (item.action === "signOut") {
        handleSignOut();
        return;
      }
      if (item.action === "globalSignOut") {
        handleGlobalSignOut();
        return;
      }
      if (item.action === "rateStore") {
        getAnalyticsClient()?.track("rate_app_store", { source: "settings_account_hub" });
        void recordManualStoreReview(user?.id);
        void openNativeStoreReview();
        return;
      }
      if (item.action === "openPrivacy") {
        pushInAppBrowser(router, webPrivacyPolicyUrl(), ah("itemPrivacy"));
        return;
      }
      if (item.action === "openTerms") {
        pushInAppBrowser(router, webTermsOfServiceUrl(), ah("itemTerms"));
        return;
      }
      // §Provider-launch (audit 2026-04): the dynamically-injected
      // "Upgrade to Salon" row inside the `appointment-activity` category
      // (isUpgrade=true) has no mobileRoute, which previously made the
      // tap a no-op. Route upgrade rows to the native upgrade screen so
      // freelancers can actually reach it from either entry point.
      if (item.isUpgrade) {
        router.push("/(app)/(tabs)/more/upgrade-info" as never);
        return;
      }
      if (item.mobileRoute) {
        router.push(item.mobileRoute as never);
      }
    },
    [router, handleSignOut, handleGlobalSignOut, ah]
  );

  const toggleSection = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <ScreenContainer>
      <ScreenHeader
        title={ah("title")}
        subtitle={ah("subtitle")}
        onBack={() => router.back()}
      />

      <View style={twStyle("px-2 pb-2")}>
        <View style={twStyle("mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3")}>
          <Text style={twStyle("text-sm text-gray-700")}>
            {ah("nativeHint")}
          </Text>
        </View>
      </View>

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* §provider-setup-seamless-ux 2026-05: pinned Setup checklist row.
           Lives at the top of the hub regardless of expanded category so a
           provider mid-setup can always one-tap back to the full list. */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/more/settings/setup-status" as never);
          }}
          style={twStyle("mb-3 flex-row items-center rounded-xl border border-emerald-100 bg-emerald-50/70 p-4")}
          activeOpacity={0.7}
          accessibilityLabel={ah("setupChecklistA11y")}
          accessibilityRole="button"
        >
          <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-emerald-100")}>
            <Ionicons name="checkbox-outline" size={22} color="#059669" />
          </View>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("font-semibold text-emerald-900")}>{ah("setupChecklist")}</Text>
            <Text style={twStyle("mt-0.5 text-sm text-emerald-800")}>
              {ah("setupChecklistSub")}
            </Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={20} color="#059669" />
        </TouchableOpacity>

        {isFreelancer && (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/upgrade-info" as never)}
            style={twStyle("mb-3 flex-row items-center rounded-xl border border-pink-200 bg-pink-50/80 p-4")}
            activeOpacity={0.7}
            accessibilityLabel={ah("upgradeBannerA11y")}
            accessibilityRole="button"
          >
            <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-pink-100")}>
              <Ionicons name="sparkles" size={22} color="#ec4899" />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("font-semibold text-pink-800")}>{ah("upgradeBanner")}</Text>
              <Text style={twStyle("mt-0.5 text-sm text-pink-700")}>
                {ah("upgradeBannerSub")}
              </Text>
            </View>
            <DirectionalIcon name="chevron-forward" size={20} color="#ec4899" />
          </TouchableOpacity>
        )}

        {SETTINGS_CATEGORIES.map((category) => {
          const isExpanded = expandedId === category.id;
          const rawItems = category.id === "appointment-activity" && isFreelancer
            ? [{ titleKey: "itemUpgradeList", descriptionKey: "itemUpgradeListDesc", href: "/provider/settings/upgrade-to-salon", isUpgrade: true as const }, ...category.items]
            : category.items;
          const items = rawItems.filter((item) => {
            const routeKey = item.mobileRoute ?? item.href;
            if (item.staffOnly && role !== "provider_staff") return false;
            return (
              (paystackTerminalEnabled || !routeKey.includes("paystack-terminal")) &&
              (yocoEnabled || !routeKey.includes("yoco")) &&
              (paycloudEnabled || !routeKey.includes("card-machines"))
            );
          });
          return (
            <View key={category.id} style={twStyle("mb-2")}>
              <TouchableOpacity
                onPress={() => toggleSection(category.id)}
                style={twStyle("flex-row items-center justify-between rounded-t-xl border border-gray-200 bg-white px-4 py-3.5")}
                activeOpacity={0.7}
                accessibilityLabel={ah("sectionA11y", { title: ah(category.titleKey), action: isExpanded ? ah("collapse") : ah("expand") })}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-base font-semibold text-gray-900")}>
                  {ah(category.titleKey)}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#6b7280"
                />
              </TouchableOpacity>
              {isExpanded && (
                <View style={twStyle("rounded-b-xl border border-t-0 border-gray-200 bg-white overflow-hidden")}>
                  <View style={twStyle("px-3 pb-2")}>
                    <Text style={twStyle("text-sm text-gray-500 mb-2")}>
{ah(category.descriptionKey)}
                    </Text>
                  </View>
                  {items.map((item, idx) => {
                    const isSignOut = item.action === "signOut" || item.action === "globalSignOut";
                    const isDestructive = item.isDestructive ?? isSignOut;
                    const isSubtle = item.isSubtle ?? false;
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleItemPress(item)}
                        style={twStyle(`flex-row items-center justify-between px-4 py-3.5 ${idx < items.length - 1 ? "border-b border-gray-100" : ""} ${item.isUpgrade ? "bg-pink-50/50" : ""} ${isDestructive ? "bg-red-50/50" : ""} ${isSubtle ? "bg-gray-50/50" : ""}`)}
                        activeOpacity={0.6}
                        accessibilityLabel={ah("itemA11y", { title: ah(item.titleKey), description: ah(item.descriptionKey) })}
                        accessibilityRole="button"
                      >
                        <View style={twStyle("flex-1 pe-3")}>
                          {item.isUpgrade && (
                            <Ionicons name="sparkles" size={16} color="#ec4899" style={{ position: "absolute", left: 0, top: 2 }} />
                          )}
                          <Text style={twStyle(`text-[15px] font-medium ${item.isUpgrade ? "text-pink-800" : isDestructive ? "text-red-700" : isSubtle ? "text-gray-500" : "text-gray-900"}`)}>
                            {ah(item.titleKey)}
                          </Text>
                          <Text style={twStyle(`mt-0.5 text-xs ${isDestructive ? "text-red-600/90" : isSubtle ? "text-gray-400" : "text-gray-500"}`)} numberOfLines={1}>
                            {ah(item.descriptionKey)}
                          </Text>
                        </View>
                        <View style={twStyle("flex-row items-center")}>
                          {isSignOut ? (
                            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
                          ) : (
                            <DirectionalIcon name="chevron-forward" size={18} color={item.isUpgrade ? "#ec4899" : isDestructive ? "#dc2626" : "#9ca3af"} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

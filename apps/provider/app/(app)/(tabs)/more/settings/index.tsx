import { useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, DeviceEventEmitter } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAppNativeVersion } from "@/lib/app-native-version";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useTheme } from "@/providers/ThemeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudFeatureEnabled } from "@/hooks/usePaycloudFeatureEnabled";
import { useTranslation } from "@beautonomi/i18n";
import { PROVIDER_SETUP_STATUS_CHANGED } from "@/lib/setup-status-cache";
import { trackSafetyHubNav } from "@/lib/analytics";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

const TRUST_SAFETY_ROUTE_DESTINATIONS: Record<string, string> = {
  "/(app)/(tabs)/more/safety": "safety_hub",
  "/(app)/(tabs)/more/safety/age-assurance": "age_assurance",
  "/(app)/(tabs)/more/settings/emergency-contact": "emergency_contact",
  "/(app)/(tabs)/more/settings/content-and-safety-controls": "content_safety",
  "/(app)/(tabs)/more/settings/blocked-users": "blocked_users",
};

interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  steps: { id: string; title: string; completed: boolean; required: boolean; link: string }[];
}

interface SettingItem {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  subtitle?: string;
  labelKey?: string;
  subtitleKey?: string;
  route: string;
  color: string;
}

const SETTINGS_SECTIONS: { title: string; titleKey?: string; items: SettingItem[] }[] = [
  {
    title: "Business",
    titleKey: "provider.mobile.screens.settingsIndex.sectionBusiness",
    items: [
      { icon: "checkmark-done-outline", labelKey: "provider.mobile.screens.settingsIndex.setupChecklist", subtitleKey: "provider.mobile.screens.settingsIndex.setupChecklistSub", route: "/(app)/(tabs)/more/settings/setup-status", color: "#22c55e" },
      { icon: "business-outline", labelKey: "provider.mobile.screens.settingsIndex.businessDetails", subtitleKey: "provider.mobile.screens.settingsIndex.businessDetailsSub", route: "/(app)/(tabs)/more/settings/business", color: "#6366f1" },
      { icon: "person-circle-outline", labelKey: "provider.mobile.screens.settingsIndex.personalProfile", subtitleKey: "provider.mobile.screens.settingsIndex.personalProfileSub", route: "/(app)/(tabs)/more/settings/personal-profile", color: "#ec4899" },
      { icon: "time-outline", labelKey: "provider.mobile.screens.settingsIndex.operatingHours", subtitleKey: "provider.mobile.screens.settingsIndex.operatingHoursSub", route: "/(app)/(tabs)/more/settings/hours", color: "#3b82f6" },
      { icon: "location-outline", labelKey: "provider.mobile.screens.settingsIndex.locations", subtitleKey: "provider.mobile.screens.settingsIndex.locationsSub", route: "/(app)/(tabs)/more/locations", color: "#22c55e" },
      { icon: "car-outline", labelKey: "provider.mobile.screens.settingsIndex.houseCallsTravel", subtitleKey: "provider.mobile.screens.settingsIndex.houseCallsTravelSub", route: "/(app)/(tabs)/more/settings/travel-fees", color: "#0891b2" },
      { icon: "navigate-outline", labelKey: "provider.mobile.screens.settingsIndex.distanceRadius", subtitleKey: "provider.mobile.screens.settingsIndex.distanceRadiusSub", route: "/(app)/(tabs)/more/settings/distance-settings", color: "#0891b2" },
    ],
  },
  {
    title: "Appointments",
    titleKey: "provider.mobile.screens.settingsIndex.sectionAppointments",
    items: [
      { icon: "book-outline", labelKey: "provider.mobile.screens.settingsIndex.bookingSettings", subtitleKey: "provider.mobile.screens.settingsIndex.bookingSettingsSub", route: "/(app)/(tabs)/more/settings/booking-settings", color: "#8b5cf6" },
      { icon: "people-outline", labelKey: "provider.mobile.screens.settingsIndex.groupAppointments", subtitleKey: "provider.mobile.screens.settingsIndex.groupAppointmentsSub", route: "/(app)/(tabs)/more/settings/group-appointments", color: "#14b8a6" },
      { icon: "close-circle-outline", labelKey: "provider.mobile.screens.settingsIndex.cancellationPolicies", subtitleKey: "provider.mobile.screens.settingsIndex.cancellationPoliciesSub", route: "/(app)/(tabs)/more/settings/cancellation-policies", color: "#ef4444" },
      { icon: "help-circle-outline", labelKey: "provider.mobile.screens.settingsIndex.cancellationReasons", subtitleKey: "provider.mobile.screens.settingsIndex.cancellationReasonsSub", route: "/(app)/(tabs)/more/settings/cancellation-reasons", color: "#f97316" },
      { icon: "calendar-outline", labelKey: "provider.mobile.screens.settingsIndex.closedPeriods", subtitleKey: "provider.mobile.screens.settingsIndex.closedPeriodsSub", route: "/(app)/(tabs)/more/settings/closed-periods", color: "#dc2626" },
      { icon: "document-text-outline", labelKey: "provider.mobile.screens.settingsIndex.noteTemplates", subtitleKey: "provider.mobile.screens.settingsIndex.noteTemplatesSub", route: "/(app)/(tabs)/more/settings/note-templates", color: "#0ea5e9" },
      { icon: "document-outline", labelKey: "provider.mobile.screens.settingsIndex.forms", subtitleKey: "provider.mobile.screens.settingsIndex.formsSub", route: "/(app)/(tabs)/more/settings/forms", color: "#0d9488" },
      { icon: "flash-outline", labelKey: "provider.mobile.screens.settingsIndex.automations", subtitleKey: "provider.mobile.screens.settingsIndex.automationsSub", route: "/(app)/(tabs)/more/settings/automations", color: "#f59e0b" },
    ],
  },
  {
    title: "Payments & Billing",
    titleKey: "provider.mobile.screens.settingsIndex.sectionPaymentsBilling",
    items: [
      { icon: "card-outline", labelKey: "provider.mobile.screens.settingsIndex.paymentSettings", subtitleKey: "provider.mobile.screens.settingsIndex.paymentSettingsSub", route: "/(app)/(tabs)/more/settings/payments", color: "#f59e0b" },
      { icon: "ribbon-outline", labelKey: "provider.mobile.screens.settingsIndex.subscription", subtitleKey: "provider.mobile.screens.settingsIndex.subscriptionSub", route: "/(app)/(tabs)/more/settings/subscription", color: "#8b5cf6" },
      { icon: "receipt-outline", labelKey: "provider.mobile.screens.settingsIndex.billingInvoices", subtitleKey: "provider.mobile.screens.settingsIndex.billingInvoicesSub", route: "/(app)/(tabs)/more/settings/billing", color: "#6366f1" },
      { icon: "hardware-chip-outline", labelKey: "provider.mobile.screens.settingsIndex.yocoDevices", subtitleKey: "provider.mobile.screens.settingsIndex.yocoDevicesSub", route: "/(app)/(tabs)/more/settings/yoco-devices", color: "#3b82f6" },
      { icon: "hardware-chip-outline", labelKey: "provider.mobile.screens.settingsIndex.cardMachines", subtitleKey: "provider.mobile.screens.settingsIndex.cardMachinesSub", route: "/(app)/(tabs)/more/card-machines", color: "#7c3aed" },
      { icon: "cart-outline", labelKey: "provider.mobile.screens.settingsIndex.terminalShop", subtitleKey: "provider.mobile.screens.settingsIndex.terminalShopSub", route: "/(app)/(tabs)/more/terminal-shop", color: "#db2777" },
      { icon: "qr-code-outline", labelKey: "provider.mobile.screens.settingsIndex.paystackTerminal", subtitleKey: "provider.mobile.screens.settingsIndex.paystackTerminalSub", route: "/(app)/(tabs)/more/paystack-terminal", color: "#16a34a" },
      { icon: "wallet-outline", labelKey: "provider.mobile.screens.settingsIndex.payoutAccounts", subtitleKey: "provider.mobile.screens.settingsIndex.payoutAccountsSub", route: "/(app)/(tabs)/more/settings/payout-accounts", color: "#22c55e" },
      { icon: "pricetag-outline", labelKey: "provider.mobile.screens.settingsIndex.salesSettings", subtitleKey: "provider.mobile.screens.settingsIndex.salesSettingsSub", route: "/(app)/(tabs)/more/settings/sales-settings", color: "#ec4899" },
      { icon: "calculator-outline", labelKey: "provider.mobile.screens.settingsIndex.taxConfiguration", subtitleKey: "provider.mobile.screens.settingsIndex.taxConfigurationSub", route: "/(app)/(tabs)/more/settings/tax-configuration", color: "#dc2626" },
      { icon: "document-outline", labelKey: "provider.mobile.screens.settingsIndex.receiptTemplate", subtitleKey: "provider.mobile.screens.settingsIndex.receiptTemplateSub", route: "/(app)/(tabs)/more/settings/receipt-template", color: "#0d9488" },
      { icon: "gift-outline", labelKey: "provider.mobile.screens.settingsIndex.giftCards", subtitleKey: "provider.mobile.screens.settingsIndex.giftCardsSub", route: "/(app)/(tabs)/more/settings/gift-cards-settings", color: "#a855f7" },
      { icon: "car-outline", labelKey: "provider.mobile.screens.settingsIndex.travelFees", subtitleKey: "provider.mobile.screens.settingsIndex.travelFeesSub", route: "/(app)/(tabs)/more/settings/travel-fees", color: "#0891b2" },
      { icon: "map-outline", labelKey: "provider.mobile.screens.settingsIndex.serviceZones", subtitleKey: "provider.mobile.screens.settingsIndex.serviceZonesSub", route: "/(app)/(tabs)/more/settings/service-zones", color: "#8b5cf6" },
    ],
  },
  {
    title: "Team",
    titleKey: "provider.mobile.screens.settingsIndex.sectionTeam",
    items: [
      { icon: "people-outline", labelKey: "provider.mobile.screens.settingsIndex.staffPermissions", subtitleKey: "provider.mobile.screens.settingsIndex.staffPermissionsSub", route: "/(app)/(tabs)/more/settings/staff-permissions", color: "#14b8a6" },
      { icon: "shield-outline", labelKey: "provider.mobile.screens.settingsIndex.teamRoles", subtitleKey: "provider.mobile.screens.settingsIndex.teamRolesSub", route: "/(app)/(tabs)/more/settings/team-roles", color: "#6366f1" },
      { icon: "trending-up-outline", labelKey: "provider.mobile.screens.settingsIndex.commissions", subtitleKey: "provider.mobile.screens.settingsIndex.commissionsSub", route: "/(app)/(tabs)/more/settings/team-commissions", color: "#f59e0b" },
    ],
  },
  {
    title: "Services & Products",
    titleKey: "provider.mobile.screens.settingsIndex.sectionServicesProducts",
    items: [
      { icon: "grid-outline", labelKey: "provider.mobile.screens.settingsIndex.serviceCategories", subtitleKey: "provider.mobile.screens.settingsIndex.serviceCategoriesSub", route: "/(app)/(tabs)/more/settings/service-categories", color: "#8b5cf6" },
      { icon: "add-circle-outline", labelKey: "provider.mobile.screens.settingsIndex.serviceAddons", subtitleKey: "provider.mobile.screens.settingsIndex.serviceAddonsSub", route: "/(app)/(tabs)/more/settings/service-addons", color: "#f97316" },
      { icon: "trending-up-outline", labelKey: "provider.mobile.screens.settingsIndex.upselling", subtitleKey: "provider.mobile.screens.settingsIndex.upsellingSub", route: "/(app)/(tabs)/more/settings/upselling", color: "#f59e0b" },
    ],
  },
  {
    title: "Booking & Visibility",
    titleKey: "provider.mobile.screens.settingsIndex.sectionBookingVisibility",
    items: [
      { icon: "globe-outline", labelKey: "provider.mobile.screens.settingsIndex.onlineBooking", subtitleKey: "provider.mobile.screens.settingsIndex.onlineBookingSub", route: "/(app)/(tabs)/more/settings/online-booking", color: "#6366f1" },
      { icon: "link-outline", labelKey: "provider.mobile.screens.settingsIndex.bookingLink", subtitleKey: "provider.mobile.screens.settingsIndex.bookingLinkSub", route: "/(app)/(tabs)/more/settings/booking-link", color: "#3b82f6" },
      { icon: "flash-outline", labelKey: "provider.mobile.screens.settingsIndex.bookingLinks", subtitleKey: "provider.mobile.screens.settingsIndex.bookingLinksSub", route: "/(app)/(tabs)/more/express-booking", color: "#f59e0b" },
      { icon: "eye-outline", labelKey: "provider.mobile.screens.settingsIndex.customerVisibility", subtitleKey: "provider.mobile.screens.settingsIndex.customerVisibilitySub", route: "/(app)/(tabs)/more/settings/customer-visibility", color: "#8b5cf6" },
    ],
  },
  {
    title: "Clients",
    titleKey: "provider.mobile.screens.settingsIndex.sectionClients",
    items: [
      { icon: "git-network-outline", labelKey: "provider.mobile.screens.settingsIndex.referralSources", subtitleKey: "provider.mobile.screens.settingsIndex.referralSourcesSub", route: "/(app)/(tabs)/more/settings/referral-sources", color: "#14b8a6" },
    ],
  },
  {
    title: "Trust & Safety",
    titleKey: "customer.mobile.screens.safetyHub.title",
    items: [
      {
        icon: "shield-checkmark-outline",
        labelKey: "customer.mobile.screens.safetyHub.title",
        subtitleKey: "customer.mobile.screens.safetyHub.helpCardBody",
        route: "/(app)/(tabs)/more/safety",
        color: "#dc2626",
      },
      {
        icon: "calendar-outline",
        labelKey: "provider.mobile.screens.ageAssurance.title",
        subtitleKey: "provider.mobile.screens.ageAssurance.formHint",
        route: "/(app)/(tabs)/more/safety/age-assurance",
        color: "#0ea5e9",
      },
      {
        icon: "person-outline",
        labelKey: "provider.mobile.screens.emergencyContact.title",
        subtitleKey: "provider.mobile.screens.emergencyContact.subtitle",
        route: "/(app)/(tabs)/more/settings/emergency-contact",
        color: "#f97316",
      },
      {
        icon: "options-outline",
        labelKey: "customer.accountSettings.contentSafetyTitle",
        subtitleKey: "customer.accountSettings.contentSafetyDesc",
        route: "/(app)/(tabs)/more/settings/content-and-safety-controls",
        color: "#6366f1",
      },
      {
        icon: "ban-outline",
        labelKey: "customer.mobile.screens.blockedUsers.title",
        subtitleKey: "customer.mobile.screens.blockedUsers.settingsDesc",
        route: "/(app)/(tabs)/more/settings/blocked-users",
        color: "#64748b",
      },
    ],
  },
  {
    title: "Tips",
    titleKey: "provider.mobile.screens.settingsIndex.sectionTips",
    items: [
      { icon: "cash-outline", labelKey: "provider.mobile.screens.settingsIndex.tipDistribution", subtitleKey: "provider.mobile.screens.settingsIndex.tipDistributionSub", route: "/(app)/(tabs)/more/settings/tip-distribution", color: "#f59e0b" },
    ],
  },
  {
    title: "Team Time Off",
    titleKey: "provider.mobile.screens.settingsIndex.sectionTeamTimeOff",
    items: [
      { icon: "sunny-outline", labelKey: "provider.mobile.screens.settingsIndex.timeOffTypes", subtitleKey: "provider.mobile.screens.settingsIndex.timeOffTypesSub", route: "/(app)/(tabs)/more/settings/time-off-types", color: "#f97316" },
    ],
  },
  {
    title: "Products",
    titleKey: "provider.mobile.screens.settingsIndex.sectionProducts",
    items: [
      { icon: "grid-outline", labelKey: "provider.mobile.screens.settingsIndex.productCategories", subtitleKey: "provider.mobile.screens.settingsIndex.productCategoriesSub", route: "/(app)/(tabs)/more/settings/product-categories", color: "#8b5cf6" },
      { icon: "boat-outline", labelKey: "provider.mobile.screens.settingsIndex.shippingDelivery", subtitleKey: "provider.mobile.screens.settingsIndex.shippingDeliverySub", route: "/(app)/(tabs)/more/settings/shipping-config", color: "#0891b2" },
    ],
  },
  {
    title: "Resources",
    titleKey: "provider.mobile.screens.settingsIndex.sectionResources",
    items: [
      { icon: "layers-outline", labelKey: "provider.mobile.screens.settingsIndex.resourceGroups", subtitleKey: "provider.mobile.screens.settingsIndex.resourceGroupsSub", route: "/(app)/(tabs)/more/settings/resource-groups", color: "#14b8a6" },
    ],
  },
  {
    title: "Integrations",
    titleKey: "provider.mobile.screens.settingsIndex.sectionIntegrations",
    items: [
      { icon: "analytics-outline", labelKey: "provider.mobile.screens.settingsIndex.serviceZoneAnalytics", subtitleKey: "provider.mobile.screens.settingsIndex.serviceZoneAnalyticsSub", route: "/(app)/(tabs)/more/settings/service-zones-analytics", color: "#0891b2" },
      { icon: "mail-outline", labelKey: "provider.mobile.screens.settingsIndex.emailIntegration", subtitleKey: "provider.mobile.screens.settingsIndex.emailIntegrationSub", route: "/(app)/(tabs)/more/settings/email-integration", color: "#3b82f6" },
      { icon: "chatbubble-ellipses-outline", labelKey: "provider.mobile.screens.settingsIndex.smsWhatsapp", subtitleKey: "provider.mobile.screens.settingsIndex.smsWhatsappSub", route: "/(app)/(tabs)/more/settings/twilio-integration", color: "#22c55e" },
    ],
  },
  {
    title: "Notifications",
    titleKey: "provider.mobile.screens.settingsIndex.sectionNotifications",
    items: [
      { icon: "notifications-outline", labelKey: "provider.mobile.screens.settingsIndex.notificationPreferences", subtitleKey: "provider.mobile.screens.settingsIndex.notificationPreferencesSub", route: "/(app)/(tabs)/more/settings/notification-preferences", color: "#ec4899" },
    ],
  },
  {
    title: "App",
    titleKey: "provider.mobile.screens.settingsIndex.sectionApp",
    items: [
      { icon: "language-outline", labelKey: "provider.mobile.screens.settingsIndex.languageRegion", subtitleKey: "provider.mobile.screens.settingsIndex.languageRegionSub", route: "/(app)/(tabs)/more/settings/language", color: "#0ea5e9" },
    ],
  },
  {
    title: "More",
    titleKey: "provider.mobile.screens.settingsIndex.sectionMore",
    items: [
      { icon: "receipt-outline", labelKey: "provider.mobile.screens.settingsIndex.receiptSequencing", subtitleKey: "provider.mobile.screens.settingsIndex.receiptSequencingSub", route: "/(app)/(tabs)/more/settings/receipt-sequencing", color: "#0d9488" },
      { icon: "megaphone-outline", labelKey: "provider.mobile.screens.settingsIndex.ads", subtitleKey: "provider.mobile.screens.settingsIndex.adsSub", route: "/(app)/(tabs)/more/settings/ads", color: "#f59e0b" },
      { icon: "share-social-outline", labelKey: "provider.mobile.screens.settingsIndex.marketingIntegrations", subtitleKey: "provider.mobile.screens.settingsIndex.marketingIntegrationsSub", route: "/(app)/(tabs)/more/settings/marketing-integrations", color: "#ec4899" },
    ],
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { screenPadding } = useResponsive();
  const { themeMode, setThemeMode } = useTheme();
  const { data: setupStatus, refresh: refreshSetupStatus } = useApi<SetupStatus>("/api/provider/setup-status");

  useFocusEffect(
    useCallback(() => {
      void refreshSetupStatus();
    }, [refreshSetupStatus]),
  );

  const openSetting = useCallback(
    (route: string) => {
      const destination = TRUST_SAFETY_ROUTE_DESTINATIONS[route];
      if (destination) trackSafetyHubNav(destination, "settings");
      router.push(route as never);
    },
    [router],
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROVIDER_SETUP_STATUS_CHANGED, () => {
      void refreshSetupStatus();
    });
    return () => sub.remove();
  }, [refreshSetupStatus]);
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = usePaycloudFeatureEnabled();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const terminalEcommerceEnabled = useFeatureFlag("terminal_ecommerce_enabled");
  const terminalCatalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const terminalShopEnabled = terminalEcommerceEnabled || terminalCatalogEnabled;

  return (
    <SafeAreaView style={twStyle("flex-1 bg-white")} edges={["top"]}>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title={t("provider.mobile.screens.settingsIndex.title")} showBack subtitle={t("provider.mobile.screens.settingsIndex.subtitle")} />

        {setupStatus && !setupStatus.isComplete && setupStatus.completionPercentage < 100 && (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/settings/setup-status" as never)}
            style={twStyle("mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4")}
            activeOpacity={0.8}
          >
            <View style={twStyle("flex-row items-center justify-between")}>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("font-semibold text-indigo-900")}>{t("provider.mobile.screens.settingsIndex.setupStatus")}</Text>
                <Text style={twStyle("mt-1 text-sm text-indigo-700")}>
                  {t("provider.mobile.screens.settingsIndex.setupProgress", { percent: setupStatus.completionPercentage })}
                </Text>
              </View>
              <DirectionalIcon name="chevron-forward" size={20} color="#4338ca" />
            </View>
          </TouchableOpacity>
        )}

        {SETTINGS_SECTIONS.map((section) => {
          const items = section.items.filter((item) => {
            if (!yocoEnabled && item.route.includes("yoco")) return false;
            if (!paycloudEnabled && item.route.includes("card-machines")) return false;
            if (!terminalShopEnabled && item.route.includes("terminal-shop")) return false;
            if (!paystackTerminalEnabled && item.route.includes("paystack-terminal")) return false;
            return true;
          });
          if (items.length === 0) return null;
          return (
          <View key={section.title} style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
              {section.titleKey ? t(section.titleKey) : section.title}
            </Text>
            <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
              {items.map((item, idx) => (
                <TouchableOpacity
                  key={item.route || item.label || item.labelKey}
                  style={twStyle(`min-h-[56px] flex-row items-center px-4 py-3.5 ${
                    idx < items.length - 1 ? "border-b border-gray-50" : ""
                  }`)}
                  onPress={() => item.route && openSetting(item.route)}
                >
                  <View style={twStyle("min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-gray-50")}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={twStyle("ms-3 flex-1")}>
                    <Text style={twStyle("text-base font-medium text-gray-900")}>
                      {item.labelKey ? t(item.labelKey) : item.label}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {item.subtitleKey ? t(item.subtitleKey) : item.subtitle}
                    </Text>
                  </View>
                  <DirectionalIcon name="chevron-forward" size={16} color="#d1d5db" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
          );
        })}

        {/* Appearance */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
            {t("provider.mobile.screens.settingsIndex.appearance")}
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {(["light", "dark", "system"] as const).map((mode, idx) => (
              <TouchableOpacity
                key={mode}
                style={twStyle(`min-h-[48px] flex-row items-center px-4 py-3 ${
                  idx < 2 ? "border-b border-gray-50" : ""
                }`)}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setThemeMode(mode);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: themeMode === mode }}
              >
                <View style={twStyle("min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-gray-50")}>
                  <Ionicons
                    name={mode === "light" ? "sunny-outline" : mode === "dark" ? "moon-outline" : "phone-portrait-outline"}
                    size={18}
                    color={themeMode === mode ? "#6366f1" : "#9ca3af"}
                  />
                </View>
                <Text style={twStyle("ms-3 flex-1 text-base font-medium text-gray-900")}>
                  {mode === "light"
                    ? t("provider.mobile.screens.settingsIndex.themeLight")
                    : mode === "dark"
                      ? t("provider.mobile.screens.settingsIndex.themeDark")
                      : t("provider.mobile.screens.settingsIndex.themeSystem")}
                </Text>
                {themeMode === mode && (
                  <Ionicons name="checkmark-circle" size={22} color="#6366f1" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* App version */}
        <View style={twStyle("mt-6 items-center pb-4")}>
          <Text style={twStyle("text-xs text-gray-400")}>
            {t("provider.mobile.screens.settingsIndex.appVersion", { version: getAppNativeVersion() })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

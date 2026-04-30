import { View, Text, TouchableOpacity, ScrollView, Switch, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useTheme } from "@/providers/ThemeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";

interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  steps: { id: string; title: string; completed: boolean; required: boolean; link: string }[];
}

interface SettingItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  route: string;
  color: string;
}

const SETTINGS_SECTIONS: { title: string; items: SettingItem[] }[] = [
  {
    title: "Business",
    items: [
      { icon: "checkmark-done-outline", label: "Setup Status", subtitle: "Onboarding & completion", route: "/(app)/(tabs)/more/settings/setup-status", color: "#22c55e" },
      { icon: "business-outline", label: "Business Details", subtitle: "Name, logo, description", route: "/(app)/(tabs)/more/settings/business", color: "#6366f1" },
      { icon: "time-outline", label: "Operating Hours", subtitle: "Opening & closing times", route: "/(app)/(tabs)/more/settings/hours", color: "#3b82f6" },
      { icon: "location-outline", label: "Locations", subtitle: "Manage your locations", route: "/(app)/(tabs)/more/settings/locations", color: "#22c55e" },
      { icon: "navigate-outline", label: "Distance & radius", subtitle: "How far you travel for house calls", route: "/(app)/(tabs)/more/settings/distance-settings", color: "#0891b2" },
    ],
  },
  {
    title: "Appointments",
    items: [
      { icon: "book-outline", label: "Booking Settings", subtitle: "Online booking, intervals", route: "/(app)/(tabs)/more/settings/booking-settings", color: "#8b5cf6" },
      { icon: "people-outline", label: "Group Appointments", subtitle: "Group booking settings", route: "/(app)/(tabs)/more/settings/group-appointments", color: "#14b8a6" },
      { icon: "close-circle-outline", label: "Cancellation Policies", subtitle: "Late cancel & no-show fees", route: "/(app)/(tabs)/more/settings/cancellation-policies", color: "#ef4444" },
      { icon: "help-circle-outline", label: "Cancellation Reasons", subtitle: "Manage reason options", route: "/(app)/(tabs)/more/settings/cancellation-reasons", color: "#f97316" },
      { icon: "calendar-outline", label: "Closed Periods", subtitle: "Holidays & closures", route: "/(app)/(tabs)/more/settings/closed-periods", color: "#dc2626" },
      { icon: "document-text-outline", label: "Note Templates", subtitle: "Reusable booking notes", route: "/(app)/(tabs)/more/settings/note-templates", color: "#0ea5e9" },
      { icon: "document-outline", label: "Forms", subtitle: "Intake, consent & waivers", route: "/(app)/(tabs)/more/settings/forms", color: "#0d9488" },
      { icon: "flash-outline", label: "Automations", subtitle: "Automated messages & reminders", route: "/(app)/(tabs)/more/settings/automations", color: "#f59e0b" },
    ],
  },
  {
    title: "Payments & Billing",
    items: [
      { icon: "card-outline", label: "Payment Settings", subtitle: "Yoco, methods, taxes", route: "/(app)/(tabs)/more/settings/payments", color: "#f59e0b" },
      { icon: "ribbon-outline", label: "Subscription", subtitle: "Plan, upgrade, cancel, renew", route: "/(app)/(tabs)/more/settings/subscription", color: "#8b5cf6" },
      { icon: "receipt-outline", label: "Billing & Invoices", subtitle: "Invoices, payment methods", route: "/(app)/(tabs)/more/settings/billing", color: "#6366f1" },
      { icon: "hardware-chip-outline", label: "Yoco Devices", subtitle: "Manage card terminals & Web POS", route: "/(app)/(tabs)/more/settings/yoco-devices", color: "#3b82f6" },
      { icon: "wallet-outline", label: "Payout Accounts", subtitle: "Bank accounts for payouts", route: "/(app)/(tabs)/more/settings/payout-accounts", color: "#22c55e" },
      { icon: "pricetag-outline", label: "Sales Settings", subtitle: "Tips, taxes & receipts", route: "/(app)/(tabs)/more/settings/sales-settings", color: "#ec4899" },
      { icon: "calculator-outline", label: "Tax Configuration", subtitle: "VAT registration & tax rates", route: "/(app)/(tabs)/more/settings/tax-configuration", color: "#dc2626" },
      { icon: "document-outline", label: "Receipt Template", subtitle: "Customize receipts & numbering", route: "/(app)/(tabs)/more/settings/receipt-template", color: "#0d9488" },
      { icon: "gift-outline", label: "Gift Cards", subtitle: "Gift card settings", route: "/(app)/(tabs)/more/settings/gift-cards-settings", color: "#a855f7" },
      { icon: "car-outline", label: "Travel Fees", subtitle: "At-home service charges", route: "/(app)/(tabs)/more/settings/travel-fees", color: "#0891b2" },
      { icon: "map-outline", label: "Service Zones", subtitle: "Service area management", route: "/(app)/(tabs)/more/settings/service-zones", color: "#8b5cf6" },
    ],
  },
  {
    title: "Team",
    items: [
      { icon: "people-outline", label: "Staff Permissions", subtitle: "Review and revoke staff access", route: "/(app)/(tabs)/more/settings/staff-permissions", color: "#14b8a6" },
      { icon: "shield-outline", label: "Team Roles", subtitle: "Create & manage roles", route: "/(app)/(tabs)/more/settings/team-roles", color: "#6366f1" },
      { icon: "trending-up-outline", label: "Commissions", subtitle: "Commission rates & tiers", route: "/(app)/(tabs)/more/settings/team-commissions", color: "#f59e0b" },
    ],
  },
  {
    title: "Services & Products",
    items: [
      { icon: "grid-outline", label: "Service Categories", subtitle: "Organize your services", route: "/(app)/(tabs)/more/settings/service-categories", color: "#8b5cf6" },
      { icon: "add-circle-outline", label: "Service Addons", subtitle: "Upsell treatments & extras", route: "/(app)/(tabs)/more/settings/service-addons", color: "#f97316" },
      { icon: "trending-up-outline", label: "Upselling", subtitle: "Suggestions & recommendations", route: "/(app)/(tabs)/more/settings/upselling", color: "#f59e0b" },
    ],
  },
  {
    title: "Booking & Visibility",
    items: [
      { icon: "globe-outline", label: "Online Booking", subtitle: "Booking link & settings", route: "/(app)/(tabs)/more/settings/online-booking", color: "#6366f1" },
      { icon: "link-outline", label: "Booking Link", subtitle: "Share & embed your booking URL", route: "/(app)/(tabs)/more/settings/booking-link", color: "#3b82f6" },
      { icon: "flash-outline", label: "Share with clients", subtitle: "Quick link, QR & short links for WhatsApp & Instagram", route: "/(app)/(tabs)/more/express-booking", color: "#f59e0b" },
      { icon: "eye-outline", label: "Customer Visibility", subtitle: "Control what clients see", route: "/(app)/(tabs)/more/settings/customer-visibility", color: "#8b5cf6" },
    ],
  },
  {
    title: "Clients",
    items: [
      { icon: "git-network-outline", label: "Referral Sources", subtitle: "Track how clients find you", route: "/(app)/(tabs)/more/settings/referral-sources", color: "#14b8a6" },
    ],
  },
  {
    title: "Tips",
    items: [
      { icon: "cash-outline", label: "Tip Distribution", subtitle: "How tips are shared with staff", route: "/(app)/(tabs)/more/settings/tip-distribution", color: "#f59e0b" },
    ],
  },
  {
    title: "Team Time Off",
    items: [
      { icon: "sunny-outline", label: "Time Off Types", subtitle: "Leave categories & pay rules", route: "/(app)/(tabs)/more/settings/time-off-types", color: "#f97316" },
    ],
  },
  {
    title: "Products",
    items: [
      { icon: "grid-outline", label: "Product Categories", subtitle: "Organize your products", route: "/(app)/(tabs)/more/settings/product-categories", color: "#8b5cf6" },
      { icon: "boat-outline", label: "Shipping & Delivery", subtitle: "Delivery fees & options", route: "/(app)/(tabs)/more/settings/shipping-config", color: "#0891b2" },
    ],
  },
  {
    title: "Resources",
    items: [
      { icon: "layers-outline", label: "Resource Groups", subtitle: "Organize rooms & equipment", route: "/(app)/(tabs)/more/settings/resource-groups", color: "#14b8a6" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { icon: "calendar-outline", label: "Calendar Integration", subtitle: "Google, Apple & Outlook sync", route: "/(app)/(tabs)/more/settings/calendar-integration", color: "#6366f1" },
      { icon: "options-outline", label: "Calendar Preferences", subtitle: "Display & time grid options", route: "/(app)/(tabs)/more/settings/calendar-preferences", color: "#3b82f6" },
      { icon: "shield-checkmark-outline", label: "Staff Permissions", subtitle: "Per-staff access control", route: "/(app)/(tabs)/more/settings/staff-permissions", color: "#22c55e" },
      { icon: "analytics-outline", label: "Service Zone Analytics", subtitle: "At-home zone performance", route: "/(app)/(tabs)/more/settings/service-zones-analytics", color: "#0891b2" },
      { icon: "mail-outline", label: "Email Integration", subtitle: "SendGrid or Mailchimp", route: "/(app)/(tabs)/more/settings/email-integration", color: "#3b82f6" },
      { icon: "chatbubble-ellipses-outline", label: "SMS & WhatsApp", subtitle: "Twilio integration", route: "/(app)/(tabs)/more/settings/twilio-integration", color: "#22c55e" },
    ],
  },
  {
    title: "Notifications",
    // §Provider-launch (audit 2026-04): collapsed two entries into one.
    // Both routes previously edited the same server preferences and had
    // slightly different UIs, which made it look like changes weren't
    // saving. The canonical screen (settings/notification-preferences)
    // includes per-channel, quiet hours, digest, and test notifications.
    items: [
      { icon: "notifications-outline", label: "Notification Preferences", subtitle: "Email, SMS, push, quiet hours, and digests", route: "/(app)/(tabs)/more/settings/notification-preferences", color: "#ec4899" },
    ],
  },
  {
    title: "App",
    items: [
      { icon: "language-outline", label: "Language", subtitle: "English, isiZulu, isiXhosa, Afrikaans, Sesotho, and more", route: "/(app)/(tabs)/more/settings/language", color: "#0ea5e9" },
    ],
  },
  {
    title: "More",
    items: [
      { icon: "link-outline", label: "Calendar links", subtitle: "Booking page URLs & embed", route: "/(app)/(tabs)/more/settings/booking-link", color: "#6366f1" },
      { icon: "options-outline", label: "Calendar display", subtitle: "Colors, icons, time grid", route: "/(app)/(tabs)/more/settings/calendar-preferences", color: "#3b82f6" },
      { icon: "receipt-outline", label: "Receipt sequencing", subtitle: "Receipt numbers & format", route: "/(app)/(tabs)/more/settings/receipt-sequencing", color: "#0d9488" },
      { icon: "megaphone-outline", label: "Ads", subtitle: "Ad campaigns & spend", route: "/(app)/(tabs)/more/settings/ads", color: "#f59e0b" },
      { icon: "share-social-outline", label: "Marketing integrations", subtitle: "Connect marketing tools", route: "/(app)/(tabs)/more/settings/marketing-integrations", color: "#ec4899" },
    ],
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const { isAvailable, biometricType, isEnabled, enable, disable } = useBiometricAuth();
  const { themeMode, setThemeMode } = useTheme();
  const { data: setupStatus } = useApi<SetupStatus>("/api/provider/setup-status");

  const biometricLabel =
    biometricType === "face" ? "Face ID" :
    biometricType === "fingerprint" ? "Fingerprint" :
    biometricType === "iris" ? "Iris" : "Biometric";

  async function handleBiometricToggle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isEnabled) {
        await disable();
      } else {
        await enable();
      }
    } catch {
      Alert.alert("Error", `Could not ${isEnabled ? "disable" : "enable"} ${biometricLabel}. Please try again.`);
    }
  }

  return (
    <SafeAreaView style={twStyle("flex-1 bg-white")} edges={["top"]}>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Settings" showBack subtitle="Business configuration" />

        {setupStatus && !setupStatus.isComplete && setupStatus.completionPercentage < 100 && (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/settings/setup-status" as never)}
            style={twStyle("mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4")}
            activeOpacity={0.8}
          >
            <View style={twStyle("flex-row items-center justify-between")}>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("font-semibold text-indigo-900")}>Setup status</Text>
                <Text style={twStyle("mt-1 text-sm text-indigo-700")}>
                  {setupStatus.completionPercentage}% complete – finish onboarding
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#4338ca" />
            </View>
          </TouchableOpacity>
        )}

        {SETTINGS_SECTIONS.map((section) => (
          <View key={section.title} style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
              {section.title}
            </Text>
            <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.route || item.label}
                  style={twStyle(`min-h-[56px] flex-row items-center px-4 py-3.5 ${
                    idx < section.items.length - 1 ? "border-b border-gray-50" : ""
                  }`)}
                  onPress={() => item.route && router.push(item.route as never)}
                >
                  <View style={twStyle("min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-gray-50")}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={twStyle("ml-3 flex-1")}>
                    <Text style={twStyle("text-base font-medium text-gray-900")}>{item.label}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Security */}
        {Platform.OS !== "web" && isAvailable && (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
              Security
            </Text>
            <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
              <View style={twStyle("min-h-[56px] flex-row items-center px-4 py-3.5")}>
                <View style={twStyle("min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-gray-50")}>
                  <Ionicons
                    name={biometricType === "face" ? "scan-outline" : "finger-print-outline"}
                    size={18}
                    color="#6366f1"
                  />
                </View>
                <View style={twStyle("ml-3 flex-1")}>
                  <Text style={twStyle("text-base font-medium text-gray-900")}>
                    {biometricLabel} Lock
                  </Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    Require {biometricLabel.toLowerCase()} to open the app
                  </Text>
                </View>
                <Switch
                  value={isEnabled}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ false: "#e5e7eb", true: "#6366f1" }}
                  thumbColor="#fff"
                  accessibilityLabel={`Toggle ${biometricLabel} lock`}
                />
              </View>
            </View>
          </View>
        )}

        {/* Appearance */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
            Appearance
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
                <Text style={twStyle("ml-3 flex-1 text-base font-medium text-gray-900")}>
                  {mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System Default"}
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
            Beautonomi Provider v{Constants.expoConfig?.version ?? "1.0.0"}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

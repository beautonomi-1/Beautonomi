import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { openNativeStoreReview } from "@/lib/open-store-review";
import { getAnalyticsClient } from "@/lib/analytics-rn";

type SettingsItem = {
  title: string;
  description: string;
  href: string;
  /** Native screen route (all settings are native). */
  mobileRoute?: string;
  isUpgrade?: boolean;
  /** Special action instead of navigation (e.g. signOut, globalSignOut) */
  action?: "signOut" | "globalSignOut" | "rateStore";
  /** Style as destructive (e.g. deactivate) */
  isDestructive?: boolean;
  /** Style as subtle/muted (e.g. delete account – less prominent) */
  isSubtle?: boolean;
};

type SettingsCategory = {
  id: string;
  title: string;
  description: string;
  items: SettingsItem[];
};

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "app",
    title: "App",
    description: "Language and display",
    items: [
      { title: "Language", description: "App language (English, Afrikaans, isiZulu, Sesotho, and more)", href: "/provider/settings/language", mobileRoute: "/(app)/(tabs)/more/settings/language" },
    ],
  },
  {
    id: "appointment-activity",
    title: "Appointment & activity",
    description: "Appointments, business details, locations, hours",
    items: [
      { title: "Appointment settings", description: "Default status, confirmation", href: "/provider/settings/appointments", mobileRoute: "/(app)/(tabs)/more/settings-appointment-defaults" },
      { title: "Business details", description: "Business information", href: "/provider/settings/appointment-activity/business-details", mobileRoute: "/(app)/(tabs)/more/settings/business" },
      { title: "Business description", description: "Description customers see", href: "/provider/settings/business-description", mobileRoute: "/(app)/(tabs)/more/settings-business-description" },
      { title: "Gallery & images", description: "Business photos", href: "/provider/settings/gallery", mobileRoute: "/(app)/(tabs)/more/gallery" },
      { title: "Billing & invoices", description: "Billing and invoices", href: "/provider/settings/billing", mobileRoute: "/(app)/(tabs)/more/settings/billing" },
      { title: "Locations", description: "Business locations", href: "/provider/settings/locations", mobileRoute: "/(app)/(tabs)/more/locations" },
      { title: "Operating hours", description: "Opening and closing times", href: "/provider/settings/operating-hours", mobileRoute: "/(app)/(tabs)/more/settings/hours" },
      { title: "Distance settings", description: "House call limits", href: "/provider/settings/distance", mobileRoute: "/(app)/(tabs)/more/settings/distance-settings" },
      { title: "Service zones", description: "Service radius and at-home booking zones", href: "/provider/settings/service-zones", mobileRoute: "/(app)/(tabs)/more/settings/service-zones" },
      { title: "Identity verification", description: "KYC for payouts", href: "/provider/settings/verification", mobileRoute: "/(app)/(tabs)/more/settings/verification" },
      { title: "Online booking", description: "Online booking settings", href: "/provider/settings/appointment-activity/online-booking", mobileRoute: "/(app)/(tabs)/more/settings/online-booking" },
      { title: "Note templates", description: "Reusable note templates", href: "/provider/settings/note-templates", mobileRoute: "/(app)/(tabs)/more/settings/note-templates" },
      { title: "Resources", description: "Resources and equipment", href: "/provider/settings/appointment-activity/resources", mobileRoute: "/(app)/(tabs)/more/settings/resource-groups" },
      { title: "Closed periods", description: "Holiday and closure dates", href: "/provider/settings/appointment-activity/closed-periods", mobileRoute: "/(app)/(tabs)/more/settings/closed-periods" },
      { title: "Blocked time types", description: "Blocked time options", href: "/provider/settings/appointment-activity/blocked-time", mobileRoute: "/(app)/(tabs)/more/settings/blocked-time" },
      { title: "Calendar integration", description: "Google, Apple, Outlook sync", href: "/provider/settings/calendar-integration", mobileRoute: "/(app)/(tabs)/more/settings/calendar-integration" },
      { title: "Calendar display", description: "Display options for the calendar", href: "/provider/settings/calendar/display-preferences", mobileRoute: "/(app)/(tabs)/more/settings/calendar-preferences" },
      { title: "Calendar colors & icons", description: "Colors and icons for appointments", href: "/provider/settings/calendar/colors-icons", mobileRoute: "/(app)/(tabs)/more/settings/calendar-colors-icons" },
      { title: "Calendar links", description: "Booking and calendar links", href: "/provider/settings/calendar/links", mobileRoute: "/(app)/(tabs)/more/settings/calendar-links" },
      { title: "Waitlist settings", description: "Waitlist configuration", href: "/provider/settings/appointment-activity/waitlist", mobileRoute: "/(app)/(tabs)/more/settings/waitlist-settings" },
    ],
  },
  {
    id: "clients",
    title: "Clients",
    description: "Client management and preferences",
    items: [
      { title: "Client list", description: "View and manage clients", href: "/provider/settings/clients/list", mobileRoute: "/(app)/(tabs)/more/clients" },
      { title: "Referral sources", description: "Track where clients come from", href: "/provider/settings/clients/referrals", mobileRoute: "/(app)/(tabs)/more/settings/referral-sources" },
      { title: "Cancellation reasons", description: "Manage cancellation reasons", href: "/provider/settings/clients/cancellation-reasons", mobileRoute: "/(app)/(tabs)/more/settings/cancellation-reasons" },
      { title: "Cancellation policies", description: "Refund and cancellation policies", href: "/provider/settings/cancellation-policies", mobileRoute: "/(app)/(tabs)/more/settings/cancellation-policies" },
      { title: "Customer visibility", description: "How lists are displayed", href: "/provider/settings/customer-visibility", mobileRoute: "/(app)/(tabs)/more/settings/customer-visibility" },
    ],
  },
  {
    id: "services",
    title: "Services",
    description: "Service menu and add-ons",
    items: [
      { title: "Services menu", description: "Service offerings", href: "/provider/settings/services/menu", mobileRoute: "/(app)/(tabs)/more/catalogue" },
      { title: "Packages", description: "Bundles of services and products", href: "/provider/packages", mobileRoute: "/(app)/(tabs)/more/packages-list" },
      { title: "Service add-ons", description: "Add-ons and upgrades", href: "/provider/settings/addons", mobileRoute: "/(app)/(tabs)/more/settings/service-addons" },
      { title: "Memberships", description: "Membership plans", href: "/provider/settings/services/memberships", mobileRoute: "/(app)/(tabs)/more/membership-plans" },
    ],
  },
  {
    id: "sales",
    title: "Sales",
    description: "Payments and receipts",
    items: [
      { title: "Payout center", description: "Balance, statements and payouts", href: "/provider/payouts", mobileRoute: "/(app)/(tabs)/more/payouts" },
      { title: "Payout accounts", description: "Bank accounts for payouts", href: "/provider/settings/payout-accounts", mobileRoute: "/(app)/(tabs)/more/settings/payout-accounts" },
      { title: "Yoco integration", description: "Yoco payment devices", href: "/provider/settings/sales/yoco-integration", mobileRoute: "/(app)/(tabs)/more/settings/yoco-devices" },
      { title: "Receipt sequencing", description: "Receipt numbering", href: "/provider/settings/sales/receipt-sequencing", mobileRoute: "/(app)/(tabs)/more/settings/receipt-sequencing" },
      { title: "Receipt template", description: "Receipt design", href: "/provider/settings/sales/receipt-template", mobileRoute: "/(app)/(tabs)/more/settings/receipt-template" },
      { title: "Taxes", description: "Tax rates", href: "/provider/settings/sales/taxes", mobileRoute: "/(app)/(tabs)/more/settings/tax-configuration" },
      { title: "Travel fees", description: "At-home travel fees", href: "/provider/settings/sales/travel-fees", mobileRoute: "/(app)/(tabs)/more/settings/travel-fees" },
      { title: "Tips", description: "Tip settings", href: "/provider/settings/sales/tips", mobileRoute: "/(app)/(tabs)/more/settings/sales-settings" },
      { title: "Tips distribution", description: "Tips between you and staff", href: "/provider/settings/tips/distribution", mobileRoute: "/(app)/(tabs)/more/settings/tip-distribution" },
      { title: "Gift cards", description: "Gift card settings", href: "/provider/settings/sales/gift-cards", mobileRoute: "/(app)/(tabs)/more/settings/gift-cards-settings" },
      { title: "Upselling", description: "Upselling preferences", href: "/provider/settings/sales/upselling", mobileRoute: "/(app)/(tabs)/more/settings/upselling" },
    ],
  },
  {
    id: "team",
    title: "Team",
    description: "Team and permissions",
    items: [
      { title: "Team members", description: "Manage your team", href: "/provider/team/members", mobileRoute: "/(app)/(tabs)/more/team" },
      { title: "Time clock", description: "Clock in/out and time cards", href: "/provider/team/time-clock", mobileRoute: "/(app)/(tabs)/more/time-clock" },
      { title: "Roles", description: "Team roles and permissions", href: "/provider/settings/team/roles", mobileRoute: "/(app)/(tabs)/more/settings/team-roles" },
      { title: "Permissions", description: "Team permissions", href: "/provider/settings/team/permissions", mobileRoute: "/(app)/(tabs)/more/settings/staff-permissions" },
      { title: "Commissions", description: "Commission rates", href: "/provider/settings/team/commissions", mobileRoute: "/(app)/(tabs)/more/settings/team-commissions" },
      { title: "Time off types", description: "Time off categories", href: "/provider/settings/team/time-off-types", mobileRoute: "/(app)/(tabs)/more/settings/time-off-types" },
      { title: "Team notifications", description: "Per-member notification preferences", href: "/provider/settings/team/notifications", mobileRoute: "/(app)/(tabs)/more/settings/team-staff-notifications" },
    ],
  },
  {
    id: "marketing",
    title: "Marketing",
    description: "Integrations and ads",
    items: [
      { title: "AI studio", description: "Profile and content suggestions (plan-based)", href: "/provider/settings/ai", mobileRoute: "/(app)/(tabs)/more/ai-studio" },
      { title: "Paid ads", description: "Boosted listings and campaigns", href: "/provider/settings/ads", mobileRoute: "/(app)/(tabs)/more/settings/ads" },
      { title: "Email integration", description: "SendGrid, Mailchimp", href: "/provider/settings/integrations/email", mobileRoute: "/(app)/(tabs)/more/settings/email-integration" },
      { title: "Twilio integration", description: "SMS and WhatsApp", href: "/provider/settings/integrations/twilio", mobileRoute: "/(app)/(tabs)/more/settings/twilio-integration" },
    ],
  },
  {
    id: "account",
    title: "Account",
    description: "Account and notifications",
    items: [
      { title: "My profile", description: "Photo, personal info, address & plan", href: "/provider/account/profile", mobileRoute: "/(app)/(tabs)/more/profile" },
      { title: "Rewards & badges", description: "Points, tiers, milestones & badge progress", href: "/provider/gamification", mobileRoute: "/(app)/(tabs)/more/rewards-hub" },
      { title: "Subscription & plan", description: "Upgrade, billing period, cancel or renew", href: "/provider/subscription", mobileRoute: "/(app)/(tabs)/more/settings/subscription" },
      { title: "Notification preferences", description: "How you receive notifications", href: "/provider/settings/notifications", mobileRoute: "/(app)/(tabs)/more/settings/notification-preferences" },
      { title: "My tickets", description: "View and reply to your support tickets", href: "/help/my-tickets", mobileRoute: "/(app)/(tabs)/more/support-tickets" },
      { title: "Contact support", description: "Submit a support ticket or get help", href: "/help/submit-ticket", mobileRoute: "/(app)/(tabs)/more/contact-support" },
      {
        title: "Rate Beautonomi on the App Store",
        description: "Opens the App Store or Google Play so you can leave a review",
        href: "#",
        action: "rateStore" as const,
      },
      { title: "Change password", description: "Update your account password", href: "/account-settings/login-and-security", mobileRoute: "/(app)/(tabs)/more/settings-change-password" },
      { title: "Privacy Policy", description: "How we use your data", href: "/privacy-policy", mobileRoute: "/(auth)/privacy" },
      { title: "Terms of Service", description: "Terms and conditions", href: "/terms-and-condition", mobileRoute: "/(auth)/terms" },
      { title: "Deactivate account", description: "Temporarily disable your account", href: "/account-settings/login-and-security", mobileRoute: "/(app)/(tabs)/more/settings-deactivate-account", isDestructive: true },
      { title: "Sign out", description: "Sign out of your account", href: "#", action: "signOut" as const },
      { title: "Sign out from all devices", description: "End every active session on your account", href: "#", action: "globalSignOut" as const },
      { title: "Delete account", description: "Permanently delete account and data", href: "/account-settings/privacy-and-sharing", mobileRoute: "/(app)/(tabs)/more/delete-account-info", isSubtle: true },
    ],
  },
];

export default function SettingsAccountHubScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>("account");

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
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: performSignOut },
    ]);
  }, [signOut, router]);

  // Wave 2.4 (audit 2026-04 final 100/100): global sign-out — revokes
  // every refresh token for this provider across all devices.
  const handleGlobalSignOut = useCallback(() => {
    const goToLogin = () => router.replace("/(auth)/login" as never);
    const perform = async () => {
      try {
        const res = await api.post<{ ok?: boolean }>("/api/auth/sign-out-global", {});
        if (res.error) {
          Alert.alert("Error", res.error.message ?? "Could not sign out everywhere. Please try again.");
          return;
        }
        // Use AuthProvider `signOut` (bounded remote + local fallback + cache
        // + biometrics) — raw `supabase.auth.signOut()` can hang on network.
        await signOut();
        goToLogin();
      } catch (e) {
        Alert.alert("Error", getApiErrorMessage(e, "Could not sign out everywhere"));
      }
    };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Sign out from all devices?",
      "This will end every active session across all your phones, tablets and browsers. You'll need to log in again everywhere. Use this if you suspect someone else accessed your account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out everywhere", style: "destructive", onPress: () => void perform() },
      ],
    );
  }, [router, signOut]);

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
        void openNativeStoreReview();
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
    [router, handleSignOut, handleGlobalSignOut]
  );

  const toggleSection = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Settings & account"
        subtitle="Business settings & rewards"
        onBack={() => router.back()}
      />

      <View style={twStyle("px-2 pb-2")}>
        <View style={twStyle("mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3")}>
          <Text style={twStyle("text-sm text-gray-700")}>
            All screens are native. Manage your business settings here.
          </Text>
        </View>
      </View>

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {isFreelancer && (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/upgrade-info" as never)}
            style={twStyle("mb-3 flex-row items-center rounded-xl border border-pink-200 bg-pink-50/80 p-4")}
            activeOpacity={0.7}
            accessibilityLabel="Upgrade to Salon, unlock team, locations and advanced features"
            accessibilityRole="button"
          >
            <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-pink-100")}>
              <Ionicons name="sparkles" size={22} color="#ec4899" />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("font-semibold text-pink-800")}>Upgrade to Salon</Text>
              <Text style={twStyle("mt-0.5 text-sm text-pink-700")}>
                Unlock team, locations & advanced features
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ec4899" />
          </TouchableOpacity>
        )}

        {SETTINGS_CATEGORIES.map((category) => {
          const isExpanded = expandedId === category.id;
          const items = category.id === "appointment-activity" && isFreelancer
            ? [{ title: "Upgrade to Salon", description: "Unlock team management and more", href: "/provider/settings/upgrade-to-salon", isUpgrade: true as const }, ...category.items]
            : category.items;
          return (
            <View key={category.id} style={twStyle("mb-2")}>
              <TouchableOpacity
                onPress={() => toggleSection(category.id)}
                style={twStyle("flex-row items-center justify-between rounded-t-xl border border-gray-200 bg-white px-4 py-3.5")}
                activeOpacity={0.7}
                accessibilityLabel={`${category.title}, ${isExpanded ? "collapse" : "expand"} section`}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-base font-semibold text-gray-900")}>
                  {category.title}
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
                      {category.description}
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
                        accessibilityLabel={item.description ? `${item.title}, ${item.description}` : item.title}
                        accessibilityRole="button"
                      >
                        <View style={twStyle("flex-1 pr-3")}>
                          {item.isUpgrade && (
                            <Ionicons name="sparkles" size={16} color="#ec4899" style={{ position: "absolute", left: 0, top: 2 }} />
                          )}
                          <Text style={twStyle(`text-[15px] font-medium ${item.isUpgrade ? "text-pink-800" : isDestructive ? "text-red-700" : isSubtle ? "text-gray-500" : "text-gray-900"}`)}>
                            {item.title}
                          </Text>
                          <Text style={twStyle(`mt-0.5 text-xs ${isDestructive ? "text-red-600/90" : isSubtle ? "text-gray-400" : "text-gray-500"}`)} numberOfLines={1}>
                            {item.description}
                          </Text>
                        </View>
                        <View style={twStyle("flex-row items-center")}>
                          {isSignOut ? (
                            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
                          ) : (
                            <Ionicons name="chevron-forward" size={18} color={item.isUpgrade ? "#ec4899" : isDestructive ? "#dc2626" : "#9ca3af"} />
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

import { View, Text, ScrollView, TouchableOpacity, Share, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import { getAnalyticsClient } from "@/lib/analytics-rn";

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

const GROUPS: SettingsGroup[] = [
  {
    heading: "Account",
    items: [
      { id: "personal-info", title: "Personal info", desc: "Name, photo, email and phone", route: "personal-info", icon: "person-outline" },
      { id: "login-and-security", title: "Login & security", desc: "Password and account protection", route: "login-and-security", icon: "lock-closed-outline" },
      { id: "addresses", title: "Saved addresses", desc: "Home, work and other addresses", route: "addresses", icon: "location-outline" },
      { id: "privacy-and-sharing", title: "Privacy & sharing", desc: "Data preferences and visibility", route: "privacy-and-sharing", icon: "shield-checkmark-outline" },
    ],
  },
  {
    heading: "Bookings & Activity",
    items: [
      { id: "bookings", title: "Bookings", desc: "Upcoming, past and cancelled", route: "bookings", icon: "calendar-outline" },
      { id: "recurring-bookings", title: "Recurring bookings", desc: "Manage repeat appointments", route: "recurring-bookings", icon: "repeat-outline" },
      { id: "product-orders", title: "Product orders", desc: "Track purchases and deliveries", route: "/product-orders", icon: "bag-outline" },
      { id: "returns", title: "Returns & refunds", desc: "Return requests and status", route: "/my-returns", icon: "arrow-undo-outline" },
      { id: "custom-requests", title: "Custom requests", desc: "Bespoke service requests", route: "custom-requests", icon: "create-outline" },
      { id: "waitlist", title: "Waitlist", desc: "Slots you're waiting for", route: "waitlist", icon: "hourglass-outline" },
      { id: "reviews", title: "My reviews", desc: "Reviews you've written", route: "reviews", icon: "star-outline" },
    ],
  },
  {
    heading: "Payments & Rewards",
    items: [
      { id: "payments", title: "Payment methods", desc: "Cards, gift cards and coupons", route: "payments", icon: "card-outline" },
      { id: "wallet", title: "Wallet", desc: "Balance and transaction history", route: "wallet", icon: "wallet-outline" },
      { id: "loyalty", title: "Loyalty points", desc: "Earn and redeem rewards", route: "loyalty", icon: "trophy-outline" },
      { id: "referrals", title: "Referrals", desc: "Invite friends, earn credits", route: "referrals", icon: "gift-outline" },
      { id: "membership", title: "Membership", desc: "Subscription benefits", route: "membership", icon: "ribbon-outline" },
    ],
  },
  {
    heading: "Preferences",
    items: [
      { id: "notifications", title: "Notifications", desc: "Email, SMS and push alerts", route: "notifications", icon: "notifications-outline" },
      { id: "preferences", title: "Language & region", desc: "Language, currency and timezone", route: "preferences", icon: "globe-outline" },
      { id: "wishlists", title: "Saved & wishlists", desc: "Saved providers and posts", route: "wishlists", icon: "heart-outline" },
    ],
  },
  {
    heading: "Billing & Tax",
    items: [
      { id: "taxes", title: "Tax documents", desc: "Receipts and tax invoices", route: "taxes", icon: "document-text-outline" },
      { id: "business", title: "Business account", desc: "Corporate bookings and invoicing", route: "business", icon: "briefcase-outline" },
    ],
  },
];

export default function AccountSettingsScreen() {
  useScreenTracking("Account Settings");
  const { user } = useAuth();

  const handleShare = () => {
    getAnalyticsClient()?.track("share_app", { source: "account_settings" });
    Share.share({
      message: `Book beauty services on Beautonomi: ${APP_URL}`,
      title: "Beautonomi",
    });
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
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
    >
      {user && (
        <View className="mb-5">
          <Text className="text-lg font-bold text-gray-900">
            {user.user_metadata?.full_name || user.email || "Account"}
          </Text>
          <Text className="text-sm text-gray-500 mt-1">
            {user.email || user.phone || ""}
          </Text>
        </View>
      )}

      {GROUPS.map((group) => (
        <View key={group.heading} className="mb-5">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            {group.heading}
          </Text>
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {group.items.map((item, idx) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => handleNavigate(item.route)}
                className="flex-row items-center px-4 py-3.5"
                style={
                  idx < group.items.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }
                    : undefined
                }
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "#f9fafb",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Ionicons name={item.icon} size={18} color={Colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900">
                    {item.title}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-0.5">{item.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {/* Footer actions */}
      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5">
        <TouchableOpacity
          onPress={handleShare}
          className="flex-row items-center px-4 py-3.5"
          style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#f9fafb",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="share-social-outline" size={18} color={Colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">Share Beautonomi</Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              Invite friends and family
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(app)/help")}
          className="flex-row items-center px-4 py-3.5"
          style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#f9fafb",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="help-circle-outline" size={18} color={Colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">Help & support</Text>
            <Text className="text-xs text-gray-400 mt-0.5">FAQs and contact us</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(app)/about")}
          className="flex-row items-center px-4 py-3.5"
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#f9fafb",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">About Beautonomi</Text>
            <Text className="text-xs text-gray-400 mt-0.5">Our mission and story</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </TouchableOpacity>
      </View>

      {user && (
        <TouchableOpacity
          onPress={() =>
            Linking.openURL(`${APP_URL}/provider/onboarding`)
          }
          className="bg-white rounded-2xl border border-gray-100 px-4 py-4 flex-row items-center mb-4"
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: Colors.primaryLight || "#fce7f3",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="storefront-outline" size={18} color={Colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">
              Become a provider
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              Offer your beauty services on Beautonomi
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

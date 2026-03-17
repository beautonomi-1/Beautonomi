import { View, Text, ScrollView, TouchableOpacity, Share, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useApi } from "@/hooks/useApi";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import { getAnalyticsClient } from "@/lib/analytics-rn";

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

const GROUPS: SettingsGroup[] = [
  {
    heading: "Account",
    items: [
      { id: "personal-info", title: "Personal info", desc: "Name, photo, email and phone", route: "personal-info", icon: "person-outline" },
      { id: "profile-details", title: "Profile details", desc: "Questions, interests and beauty preferences", route: "profile-details", icon: "sparkles-outline" },
      { id: "login-and-security", title: "Login & security", desc: "Password and account protection", route: "login-and-security", icon: "lock-closed-outline" },
      { id: "identity-verification", title: "Identity verification", desc: "Verify your identity with a document", route: "identity-verification", icon: "card-outline" },
      { id: "addresses", title: "Saved addresses", desc: "Home, work and other addresses", route: "addresses", icon: "location-outline" },
      { id: "privacy-and-sharing", title: "Privacy & sharing", desc: "Data preferences and visibility", route: "privacy-and-sharing", icon: "shield-checkmark-outline" },
    ],
  },
  {
    heading: "Bookings & Activity",
    items: [
      { id: "bookings", title: "Bookings", desc: "Upcoming, past and cancelled", route: "bookings", icon: "calendar-outline" },
      { id: "recurring-bookings", title: "Recurring bookings", desc: "Manage repeat appointments", route: "recurring-bookings", icon: "repeat-outline" },
      { id: "product-orders", title: "Product orders", desc: "Track purchases and deliveries", route: "/(app)/product-orders", icon: "bag-outline" },
      { id: "returns", title: "Returns & refunds", desc: "Return requests and status", route: "/(app)/my-returns", icon: "arrow-undo-outline" },
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
      { id: "messages", title: "Messages", desc: "Conversations with providers", route: "messages", icon: "chatbubbles-outline" },
      { id: "preferences", title: "Language & region", desc: "Language, currency and timezone", route: "preferences", icon: "globe-outline" },
      { id: "wishlists", title: "Saved & wishlists", desc: "Saved providers and posts", route: "wishlists", icon: "heart-outline" },
    ],
  },
  {
    heading: "Billing & Tax",
    items: [
      { id: "taxes", title: "Tax documents", desc: "Receipts and tax invoices", route: "taxes", icon: "document-text-outline" },
    ],
  },
];

export default function AccountSettingsScreen() {
  useScreenTracking("Account Settings");
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const { data: profileCompletion } = useApi<ProfileCompletion>("/api/me/profile-completion");
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const completionPct = profileCompletion?.percentage ?? profileCompletion?.completionPercentage ?? 0;
  const showCompletionBanner = profileCompletion && completionPct < 100;

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
      style={{ flex: 1, backgroundColor: Colors.gray[50] }}
      accessibilityLabel="Account settings"
      accessibilityRole="none"
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}
    >
      {user && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
            {user.user_metadata?.full_name || user.email || "Account"}
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
          accessibilityLabel="Complete your profile"
          accessibilityRole="button"
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Profile completion</Text>
            <Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 2 }}>
              {completionPct}% complete – add details to get better recommendations
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
        </TouchableOpacity>
      )}

      {GROUPS.map((group) => (
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
          accessibilityLabel="Share Beautonomi. Invite friends and family"
          accessibilityRole="button"
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.gray[50], alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="share-social-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>Share Beautonomi</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>Invite friends and family</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(app)/help")}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
          accessibilityLabel="Help and support. FAQs and contact us"
          accessibilityRole="button"
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.gray[50], alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="help-circle-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>Help & support</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>FAQs and contact us</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(app)/about")}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}
          accessibilityLabel="About Beautonomi. Our mission and story"
          accessibilityRole="button"
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.gray[50], alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>About Beautonomi</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>Our mission and story</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </TouchableOpacity>
      </View>

      {user && (
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/(app)/in-app-browser", params: { url: encodeURIComponent(`${APP_URL}/provider/onboarding`), title: "Become a provider" } })}
          style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], paddingHorizontal: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", marginBottom: 16 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryLight || "#fce7f3", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="storefront-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>Become a provider</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>Offer your beauty services on Beautonomi</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

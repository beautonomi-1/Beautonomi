import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationsCount } from "@/providers/NotificationsCountContext";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { NotificationsDropdown } from "./_components/NotificationsDropdown";

/** Profile completion API response (GET /api/provider/profile-completion) */
type ProfileCompletionItem = {
  id: string;
  label: string;
  completed: boolean;
  required: boolean;
  route: string;
};
type ProfileCompletionData = {
  completed: number;
  total: number;
  percentage: number;
  items: ProfileCompletionItem[];
};

/**
 * Map API routes to app routes. Use dedicated screens when they exist so the card deep-links
 * straight to business, locations, or operating hours. Catalogue and gallery map to existing hubs.
 */
const PROFILE_COMPLETION_ROUTE_MAP: Record<string, string> = {
  "/(app)/(tabs)/more/settings/business": "/(app)/(tabs)/more/settings/business",
  "/(app)/(tabs)/more/settings/locations": "/(app)/(tabs)/more/locations",
  "/(app)/(tabs)/more/settings/hours": "/(app)/(tabs)/more/settings-operating-hours",
  "/(app)/(tabs)/more/catalogue": "/(app)/(tabs)/more/catalogue-offerings-hub",
  "/(app)/(tabs)/more/gallery": "/(app)/(tabs)/more/gallery",
};
function getProfileCompletionRoute(apiRoute: string): string {
  return PROFILE_COMPLETION_ROUTE_MAP[apiRoute] ?? apiRoute;
}

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  route: string;
  color: string;
  bg: string;
}

const MENU_SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: "Operations",
    items: [
      { icon: "book-outline", label: "Bookings & calendar", subtitle: "Appointments, waitlist & schedule", route: "/(app)/(tabs)/more/bookings-calendar-hub", color: "#6366f1", bg: "bg-indigo-50" },
      { icon: "construct-outline", label: "Resources & forms", subtitle: "Resources, intake & consent forms", route: "/(app)/(tabs)/more/resources-forms-hub", color: "#0d9488", bg: "bg-teal-50" },
      { icon: "chatbox-ellipses-outline", label: "Custom Requests", subtitle: "Client quotes & offers", route: "/(app)/(tabs)/more/custom-requests", color: "#f97316", bg: "bg-orange-50" },
      { icon: "navigate-outline", label: "Routes", subtitle: "Optimize at-home trips", route: "/(app)/(tabs)/more/routes", color: "#3b82f6", bg: "bg-blue-50" },
    ],
  },
  {
    title: "E-Commerce & Products",
    items: [
      { icon: "cube-outline", label: "Products & e-commerce", subtitle: "Inventory, orders & sales", route: "/(app)/(tabs)/more/products-ecommerce-hub", color: "#8b5cf6", bg: "bg-violet-50" },
    ],
  },
  {
    title: "Business",
    items: [
      { icon: "layers-outline", label: "Catalogue & offerings", subtitle: "Services, products & packages", route: "/(app)/(tabs)/more/catalogue-offerings-hub", color: "#ec4899", bg: "bg-pink-50" },
      { icon: "people-circle-outline", label: "Team & scheduling", subtitle: "Staff, shifts & time clock", route: "/(app)/(tabs)/more/team-hub", color: "#14b8a6", bg: "bg-teal-50" },
      { icon: "cash-outline", label: "Finance & billing", subtitle: "Earnings, payroll, invoices & gift cards", route: "/(app)/(tabs)/more/finance-billing-hub", color: "#22c55e", bg: "bg-green-50" },
      { icon: "swap-horizontal-outline", label: "Transactions & history", subtitle: "Payments, fees & sales", route: "/(app)/(tabs)/more/transactions-hub", color: "#0d9488", bg: "bg-teal-50" },
      { icon: "bar-chart-outline", label: "Reports", subtitle: "Analytics, activity & insights", route: "/(app)/(tabs)/more/reports", color: "#3b82f6", bg: "bg-blue-50" },
      { icon: "images-outline", label: "Gallery", subtitle: "Portfolio & photos", route: "/(app)/(tabs)/more/gallery", color: "#f43f5e", bg: "bg-rose-50" },
    ],
  },
  {
    title: "Engagement",
    items: [
      { icon: "chatbubbles-outline", label: "Engagement", subtitle: "Reviews, messaging & marketing", route: "/(app)/(tabs)/more/engagement-hub", color: "#6366f1", bg: "bg-indigo-50" },
    ],
  },
  {
    title: "Settings",
    items: [
      { icon: "settings-outline", label: "Settings & account", subtitle: "Business settings & rewards", route: "/(app)/(tabs)/more/settings-account-hub", color: "#6b7280", bg: "bg-gray-100" },
    ],
  },
];

/** Top shortcuts (customer app pattern: 2x2 quick actions above the fold) */
const QUICK_ACTIONS: { icon: keyof typeof Ionicons.glyphMap; label: string; route: string; color: string }[] = [
  { icon: "book-outline", label: "Bookings", route: "/(app)/(tabs)/more/bookings-calendar-hub", color: "#6366f1" },
  { icon: "people-outline", label: "Waitlist", route: "/(app)/(tabs)/more/waitlist", color: "#06b6d4" },
  { icon: "cash-outline", label: "Finance", route: "/(app)/(tabs)/more/finance-hub", color: "#22c55e" },
  { icon: "settings-outline", label: "Settings", route: "/(app)/(tabs)/more/settings-account-hub", color: "#6b7280" },
];

export default function MoreScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { totalUnread } = useNotificationsCount();
  const { isTablet } = useResponsive();
  const pad = isTablet ? 24 : 16;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Operations: true,
    "E-Commerce & Products": true,
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: completionData, loading: completionLoading, error: completionError, refresh: refreshCompletion } = useApi<ProfileCompletionData>(
    "/api/provider/profile-completion"
  );
  const completion = completionData ?? null;
  const completionItems = completion?.items ?? [];
  const completionPct = completion?.percentage ?? 0;
  const showCompletionCard = completionItems.length > 0 && completionPct < 100;
  const firstIncompleteRoute = completionItems.find((i) => !i.completed)?.route;
  const showCompletionError = !completionLoading && !!completionError && !completionData;

  useFocusEffect(
    useCallback(() => {
      refreshCompletion();
    }, [refreshCompletion])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshCompletion();
    setRefreshing(false);
  }, [refreshCompletion]);

  const toggleSection = useCallback((title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  }, []);

  function handleMenuPress(route: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as never);
  }

  function handleSignOut() {
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
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {/* Profile header - tappable to My Profile */}
        <TouchableOpacity
          className="mb-5 flex-row items-center pt-4"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/more/profile" as never);
          }}
          activeOpacity={0.7}
          accessibilityLabel="My profile"
          accessibilityRole="button"
        >
          <View className="h-14 w-14 items-center justify-center rounded-full bg-gray-900">
            <Ionicons name="person" size={24} color="#fff" />
          </View>
          <View className="ml-3.5 flex-1">
            <Text className="text-xl font-bold tracking-tight text-gray-900">
              My profile
            </Text>
            <Text className="mt-0.5 text-sm text-gray-500">
              {user?.phone ?? user?.email ?? ""}
            </Text>
          </View>
          <TouchableOpacity
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-50"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNotificationsOpen(true);
            }}
            accessibilityLabel={totalUnread > 0 ? `Notifications (${totalUnread} unread)` : "Notifications"}
            accessibilityRole="button"
          >
            <View>
              <Ionicons name="notifications-outline" size={20} color="#374151" />
              {totalUnread > 0 && (
                <View className="absolute -right-1 -top-1 h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FF0077] px-1">
                  <Text className="text-[10px] font-semibold text-white" numberOfLines={1}>
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Quick actions - customer-style 2x2 grid (shortens perceived page length) */}
        <View className="mb-5 flex-row flex-wrap gap-3">
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.route}
              onPress={() => handleMenuPress(action.route)}
              activeOpacity={0.7}
              className="flex-1 min-w-[45%] bg-white rounded-2xl border border-gray-100 items-center py-4"
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-xl mb-2"
                style={{ backgroundColor: `${action.color}20` }}
              >
                <Ionicons name={action.icon} size={20} color={action.color} />
              </View>
              <Text className="text-xs font-medium text-gray-700">{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Profile completion load error - non-blocking message with retry */}
        {showCompletionError && (
          <View className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Text className="text-sm text-amber-800">
              {t("provider.profileCompletionLoadError")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                refreshCompletion();
              }}
              className="mt-3 self-start rounded-lg bg-amber-200 px-4 py-2"
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t("common.retry")}
            >
              <Text className="text-sm font-semibold text-amber-900">
                {t("common.retry")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Profile completion card - show when < 100% and items exist */}
        {!completionLoading && showCompletionCard && (
          <View className="mb-5">
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const route = firstIncompleteRoute ? getProfileCompletionRoute(firstIncompleteRoute) : "/(app)/(tabs)/more/settings-account-hub";
                router.push(route as never);
              }}
              activeOpacity={0.8}
              className="bg-white rounded-2xl border border-gray-100 p-4"
              accessibilityRole="button"
              accessibilityLabel={t("provider.profileCompletionTitle")}
            >
              <View className="flex-row items-start">
                <View
                  className="w-11 h-11 rounded-full bg-indigo-50 items-center justify-center mr-3"
                >
                  <Ionicons name="sparkles" size={22} color="#6366f1" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900">
                    {t("provider.profileCompletionTitle")}
                  </Text>
                  <Text className="text-sm text-gray-500 mt-1">
                    {t("provider.profileCompletionSubtitle")}
                  </Text>
                  <View className="mt-3 flex-row items-center">
                    <View className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden mr-2.5">
                      <View
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${completionPct}%` }}
                      />
                    </View>
                    <Text className="text-xs font-semibold text-gray-600">
                      {completionPct}%
                    </Text>
                  </View>
                  {completionItems.length > 0 && (
                    <View className="mt-3 gap-2">
                      {completionItems.slice(0, 6).map((item) => {
                        const done = item.completed;
                        const mandatoryMissing = !done && item.required;
                        const iconName = done
                          ? "checkmark-circle"
                          : mandatoryMissing
                            ? "close-circle"
                            : "ellipse-outline";
                        const iconColor = done ? "#16A34A" : mandatoryMissing ? "#ef4444" : "#9ca3af";
                        const route = getProfileCompletionRoute(item.route);
                        return (
                          <TouchableOpacity
                            key={item.id}
                            onPress={(e) => {
                              e.stopPropagation();
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              router.push(route as never);
                            }}
                            className="flex-row items-center"
                            accessibilityRole="button"
                            accessibilityLabel={`${item.label}${item.required ? ", required" : ""}`}
                          >
                            <Ionicons
                              name={iconName as keyof typeof Ionicons.glyphMap}
                              size={18}
                              color={iconColor}
                              style={{ marginRight: 8 }}
                            />
                            <Text
                              className="flex-1 text-sm"
                              style={{
                                color: done ? "#16A34A" : mandatoryMissing ? "#b91c1c" : "#6b7280",
                              }}
                            >
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Collapsible menu sections - short by default (customer: fewer items on main screen) */}
        <View className="mb-2 ml-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            All features
          </Text>
        </View>
        {MENU_SECTIONS.map((section) => {
          const isExpanded = expandedSections[section.title] ?? false;
          return (
            <View key={section.title} className="mb-2">
              <TouchableOpacity
                onPress={() => toggleSection(section.title)}
                className={`flex-row items-center justify-between border border-gray-100 bg-white px-4 py-3.5 ${isExpanded ? "rounded-t-2xl border-b-0" : "rounded-2xl"}`}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${section.title}, ${isExpanded ? "collapse" : "expand"}`}
              >
                <Text className="text-[15px] font-medium text-gray-900">{section.title}</Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#9ca3af"
                />
              </TouchableOpacity>
              {isExpanded && (
                <View className="overflow-hidden rounded-b-2xl border border-gray-100 border-t-0 bg-white">
                  {section.items.map((item, idx) => (
                    <TouchableOpacity
                      key={item.route}
                      className={`min-h-[52px] flex-row items-center px-4 py-2.5 ${
                        idx < section.items.length - 1 ? "border-b border-gray-50" : ""
                      }`}
                      onPress={() => handleMenuPress(item.route)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.label}: ${item.subtitle}`}
                    >
                      <View
                        className={`${item.bg} min-h-[32px] min-w-[32px] items-center justify-center rounded-lg`}
                      >
                        <Ionicons name={item.icon} size={16} color={item.color} />
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="text-[14px] font-medium text-gray-900">
                          {item.label}
                        </Text>
                        <Text className="mt-0.5 text-xs text-gray-500">
                          {item.subtitle}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <NotificationsDropdown
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onSeeAll={() => router.push("/(app)/notifications" as never)}
        />

        {/* Sign Out - Revolut minimal style */}
        <TouchableOpacity
          className="mb-8 min-h-[48px] items-center justify-center rounded-xl border border-gray-200"
          onPress={handleSignOut}
          activeOpacity={0.6}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
        >
          <Text className="text-[15px] font-medium text-red-600">
            {t("auth.logout")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

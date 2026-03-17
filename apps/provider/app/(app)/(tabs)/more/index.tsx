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
import { Colors } from "@/constants/colors";
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
      { icon: "book-outline", label: "Bookings & calendar", subtitle: "Appointments, waitlist & schedule", route: "/(app)/(tabs)/more/bookings-calendar-hub", color: "#6366f1", bg: "#eef2ff" },
      { icon: "construct-outline", label: "Resources & forms", subtitle: "Resources, intake & consent forms", route: "/(app)/(tabs)/more/resources-forms-hub", color: "#0d9488", bg: "#ccfbf1" },
      { icon: "chatbox-ellipses-outline", label: "Custom Requests", subtitle: "Client quotes & offers", route: "/(app)/(tabs)/more/custom-requests", color: "#f97316", bg: "#fff7ed" },
      { icon: "navigate-outline", label: "Routes", subtitle: "Optimize at-home trips", route: "/(app)/(tabs)/more/routes", color: "#3b82f6", bg: "#eff6ff" },
    ],
  },
  {
    title: "E-Commerce & Products",
    items: [
      { icon: "cube-outline", label: "Products & e-commerce", subtitle: "Inventory, orders & sales", route: "/(app)/(tabs)/more/products-ecommerce-hub", color: "#8b5cf6", bg: "#ede9fe" },
    ],
  },
  {
    title: "Business",
    items: [
      { icon: "layers-outline", label: "Catalogue & offerings", subtitle: "Services, products & packages", route: "/(app)/(tabs)/more/catalogue-offerings-hub", color: "#ec4899", bg: "#fdf2f8" },
      { icon: "people-circle-outline", label: "Team & scheduling", subtitle: "Staff, shifts & time clock", route: "/(app)/(tabs)/more/team", color: "#14b8a6", bg: "#ccfbf1" },
      { icon: "cash-outline", label: "Finance & billing", subtitle: "Earnings, payroll, invoices & gift cards", route: "/(app)/(tabs)/more/finance-billing-hub", color: "#22c55e", bg: "#f0fdf4" },
      { icon: "swap-horizontal-outline", label: "Transactions & history", subtitle: "Payments, fees & sales", route: "/(app)/(tabs)/more/transactions-hub", color: "#0d9488", bg: "#ccfbf1" },
      { icon: "bar-chart-outline", label: "Reports", subtitle: "Analytics, activity & insights", route: "/(app)/(tabs)/more/reports", color: "#3b82f6", bg: "#eff6ff" },
      { icon: "images-outline", label: "Gallery", subtitle: "Portfolio & photos", route: "/(app)/(tabs)/more/gallery", color: "#f43f5e", bg: "#fff1f2" },
    ],
  },
  {
    title: "Engagement",
    items: [
      { icon: "chatbubbles-outline", label: "Engagement", subtitle: "Reviews, messaging & marketing", route: "/(app)/(tabs)/more/engagement-hub", color: "#6366f1", bg: "#eef2ff" },
    ],
  },
  {
    title: "Settings",
    items: [
      { icon: "settings-outline", label: "Settings & account", subtitle: "Business settings & rewards", route: "/(app)/(tabs)/more/settings-account-hub", color: "#6b7280", bg: Colors.gray[100] },
      { icon: "help-buoy-outline", label: "Help & support", subtitle: "Contact support & my tickets", route: "/(app)/(tabs)/more/contact-support", color: "#0ea5e9", bg: "#e0f2fe" },
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
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {/* Profile header - tappable to My Profile */}
        <TouchableOpacity
          style={{ marginBottom: 20, flexDirection: "row", alignItems: "center", paddingTop: 16 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/more/profile" as never);
          }}
          activeOpacity={0.7}
          accessibilityLabel="My profile"
          accessibilityRole="button"
        >
          <View style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: Colors.gray[900] }}>
            <Ionicons name="person" size={24} color="#fff" />
          </View>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", letterSpacing: -0.5, color: Colors.gray[900] }}>
              My profile
            </Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }}>
              {user?.phone ?? user?.email ?? ""}
            </Text>
          </View>
          <TouchableOpacity
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: Colors.gray[50] }}
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
                <View style={{ position: "absolute", right: -4, top: -4, height: 16, minWidth: 16, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: Colors.primary, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: Colors.white }} numberOfLines={1}>
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Quick actions - customer-style 2x2 grid (shortens perceived page length) */}
        <View style={{ marginBottom: 20, flexDirection: "row", flexWrap: "wrap" }}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.route}
              onPress={() => handleMenuPress(action.route)}
              activeOpacity={0.7}
              style={{ flex: 1, minWidth: "45%", marginRight: 12, marginBottom: 12, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], alignItems: "center", paddingVertical: 16 }}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View
                style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, marginBottom: 8, backgroundColor: `${action.color}20` }}
              >
                <Ionicons name={action.icon} size={20} color={action.color} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[700] }}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Profile completion load error - non-blocking message with retry */}
        {showCompletionError && (
          <View style={{ marginBottom: 20, borderRadius: 16, borderWidth: 1, borderColor: "#fcd34d", backgroundColor: "#fffbeb", padding: 16 }}>
            <Text style={{ fontSize: 14, color: "#92400e" }}>
              {t("provider.profileCompletionLoadError")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                refreshCompletion();
              }}
              style={{ marginTop: 12, alignSelf: "flex-start", borderRadius: 8, backgroundColor: "#fcd34d", paddingHorizontal: 16, paddingVertical: 8 }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t("common.retry")}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#78350f" }}>
                {t("common.retry")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Profile completion card - show when < 100% and items exist */}
        {!completionLoading && showCompletionCard && (
          <View style={{ marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const route = firstIncompleteRoute ? getProfileCompletionRoute(firstIncompleteRoute) : "/(app)/(tabs)/more/settings-account-hub";
                router.push(route as never);
              }}
              activeOpacity={0.8}
              style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], padding: 16 }}
              accessibilityRole="button"
              accessibilityLabel={t("provider.profileCompletionTitle")}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", marginRight: 12 }}
                >
                  <Ionicons name="sparkles" size={22} color="#6366f1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                    {t("provider.profileCompletionTitle")}
                  </Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
                    {t("provider.profileCompletionSubtitle")}
                  </Text>
                  <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1, height: 6, backgroundColor: Colors.gray[100], borderRadius: 9999, overflow: "hidden", marginRight: 10 }}>
                      <View
                        style={{ height: "100%", backgroundColor: "#4f46e5", borderRadius: 9999, width: `${completionPct}%` }}
                      />
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[600] }}>
                      {completionPct}%
                    </Text>
                  </View>
                  {completionItems.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      {completionItems.slice(0, 6).map((item, idx) => {
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
                            style={{ flexDirection: "row", alignItems: "center", marginTop: idx === 0 ? 0 : 8 }}
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
                              style={{ flex: 1, fontSize: 14, color: done ? "#16A34A" : mandatoryMissing ? "#b91c1c" : "#6b7280" }}
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
        <View style={{ marginBottom: 8, marginLeft: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, color: Colors.gray[400] }}>
            All features
          </Text>
        </View>
        {MENU_SECTIONS.map((section) => {
          const isExpanded = expandedSections[section.title] ?? false;
          return (
            <View key={section.title} style={{ marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => toggleSection(section.title)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: Colors.gray[100],
                  backgroundColor: Colors.white,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderTopLeftRadius: isExpanded ? 16 : 16,
                  borderTopRightRadius: isExpanded ? 16 : 16,
                  borderBottomLeftRadius: isExpanded ? 0 : 16,
                  borderBottomRightRadius: isExpanded ? 0 : 16,
                  borderBottomWidth: isExpanded ? 0 : 1,
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${section.title}, ${isExpanded ? "collapse" : "expand"}`}
              >
                <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }}>{section.title}</Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#9ca3af"
                />
              </TouchableOpacity>
              {isExpanded && (
                <View style={{ overflow: "hidden", borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderWidth: 1, borderTopWidth: 0, borderColor: Colors.gray[100], backgroundColor: Colors.white }}>
                  {section.items.map((item, idx) => (
                    <TouchableOpacity
                      key={item.route}
                      style={{
                        minHeight: 52,
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderBottomWidth: idx < section.items.length - 1 ? 1 : 0,
                        borderBottomColor: Colors.gray[50],
                      }}
                      onPress={() => handleMenuPress(item.route)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.label}: ${item.subtitle}`}
                    >
                      <View
                        style={{ minHeight: 32, minWidth: 32, backgroundColor: item.bg, alignItems: "center", justifyContent: "center", borderRadius: 8 }}
                      >
                        <Ionicons name={item.icon} size={16} color={item.color} />
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                          {item.label}
                        </Text>
                        <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
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
          style={{ marginBottom: 32, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] }}
          onPress={handleSignOut}
          activeOpacity={0.6}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: "#dc2626" }}>
            {t("auth.logout")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

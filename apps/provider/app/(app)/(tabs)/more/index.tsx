import { useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { Colors } from "@/constants/colors";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { openNativeStoreReview } from "@/lib/open-store-review";
import { getAnalyticsClient } from "@/lib/analytics-rn";
import { formatCurrency } from "@/lib/format";
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

type FinanceSummaryData = {
  earnings?: {
    available_balance?: number;
    pending_payouts?: number;
    minimum_payout_amount?: number;
  };
};

type PayoutAccountSummary = {
  id: string;
  account_name?: string | null;
  bank_name?: string | null;
  account_number_last4?: string | null;
  account_number?: string | null;
  active?: boolean;
  is_primary?: boolean;
};

type PayoutScheduleData = {
  payout_schedule?: string;
  payout_hold_days?: number;
  next_payout_date?: string | null;
  next_payout_description?: string | null;
};

type TeamAccessData = {
  can_process_payments?: boolean;
};

type ProviderNavCounts = {
  pending_bookings: number;
  active_product_orders: number;
  unread_messages: number;
  waiting_room: number;
  critical_total: number;
};

function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/**
 * Map API routes to app routes. Use dedicated screens when they exist so the card deep-links
 * straight to business, locations, or operating hours. Gallery maps to its hub; catalogue uses `/(app)/…/catalogue` directly from the API when present.
 */
const PROFILE_COMPLETION_ROUTE_MAP: Record<string, string> = {
  "/(app)/(tabs)/more/settings/business": "/(app)/(tabs)/more/settings/business",
  "/(app)/(tabs)/more/settings/locations": "/(app)/(tabs)/more/locations",
  // §Provider-audit 2026-04: canonicalised on `settings/hours` (full
  // break-editor). `settings-operating-hours` is kept as a redirect stub
  // so no external surface breaks, but routing now points at the richer
  // editor.
  "/(app)/(tabs)/more/settings/hours": "/(app)/(tabs)/more/settings/hours",
  "/(app)/(tabs)/more/gallery": "/(app)/(tabs)/more/gallery",
};
/**
 * §Provider-launch (audit 2026-04): profile-completion rows previously
 * fell back to `apiRoute` verbatim, which could push a web path (e.g.
 * `/provider/settings/foo`) into the native router and crash or dead-end.
 * If the API route isn't a known native route, send the provider to the
 * settings hub where they can drill in manually instead of pushing an
 * unknown string into `router.push`.
 */
const NATIVE_ROUTE_PREFIX = "/(app)/";
const SETTINGS_HUB_ROUTE = "/(app)/(tabs)/more/settings-account-hub";
function getProfileCompletionRoute(apiRoute: string): string {
  const mapped = PROFILE_COMPLETION_ROUTE_MAP[apiRoute];
  if (mapped) return mapped;
  if (typeof apiRoute === "string" && apiRoute.startsWith(NATIVE_ROUTE_PREFIX)) {
    return apiRoute;
  }
  return SETTINGS_HUB_ROUTE;
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
    title: "Grow your business",
    items: [
      {
        icon: "megaphone-outline",
        label: "Buy ads",
        subtitle: "Sponsored listings, campaigns & reach",
        route: "/(app)/(tabs)/more/settings/ads",
        color: "#d97706",
        bg: "#fffbeb",
      },
      {
        icon: "card-outline",
        label: "Sell memberships",
        subtitle: "Plans, benefits, pricing & subscribers",
        route: "/(app)/(tabs)/more/membership-plans",
        color: "#7c3aed",
        bg: "#ede9fe",
      },
      {
        icon: "pricetag-outline",
        label: "Promo codes",
        subtitle: "Your discounts—scoped to your bookings only",
        route: "/(app)/(tabs)/more/promotions",
        color: "#ea580c",
        bg: "#fff7ed",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      { icon: "book-outline", label: "Bookings & calendar", subtitle: "Appointments, waitlist & schedule", route: "/(app)/(tabs)/more/bookings", color: "#6366f1", bg: "#eef2ff" },
      { icon: "people-outline", label: "Group Bookings", subtitle: "Manage group appointments", route: "/(app)/(tabs)/more/group-bookings", color: "#8b5cf6", bg: "#ede9fe" },
      { icon: "construct-outline", label: "Resources & forms", subtitle: "Resources, intake & consent forms", route: "/(app)/(tabs)/more/resources-forms-hub", color: "#0d9488", bg: "#ccfbf1" },
      { icon: "chatbox-ellipses-outline", label: "Custom Requests", subtitle: "Client quotes & offers", route: "/(app)/(tabs)/more/custom-requests", color: "#f97316", bg: "#fff7ed" },
      { icon: "navigate-outline", label: "Routes", subtitle: "Optimize at-home trips", route: "/(app)/(tabs)/more/routes", color: "#64748b", bg: "#f8fafc" },
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
      { icon: "layers-outline", label: "Catalogue & offerings", subtitle: "Services, products & packages", route: "/(app)/(tabs)/more/catalogue", color: "#ec4899", bg: "#fdf2f8" },
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
      { icon: "compass-outline", label: "Explore posts", subtitle: "Your feed posts, views & comments", route: "/(app)/(tabs)/more/explore-posts", color: "#a855f7", bg: "#faf5ff" },
    ],
  },
  {
    title: "Settings",
    items: [
      { icon: "ribbon-outline", label: "Rewards & badges", subtitle: "Points, milestones & badge progress", route: "/(app)/(tabs)/more/rewards-hub", color: "#059669", bg: "#d1fae5" },
      { icon: "ticket-outline", label: "Support tickets", subtitle: "All tickets, replies & status", route: "/(app)/(tabs)/more/support-tickets", color: "#0ea5e9", bg: "#e0f2fe" },
      { icon: "settings-outline", label: "Settings & account", subtitle: "Business, team & account", route: "/(app)/(tabs)/more/settings-account-hub", color: "#6b7280", bg: Colors.gray[100] },
      { icon: "help-buoy-outline", label: "Help & support", subtitle: "Contact support & new ticket", route: "/(app)/(tabs)/more/contact-support", color: "#0284c7", bg: "#e0f2fe" },
    ],
  },
];

/** Top shortcuts (customer app pattern: 2x2 quick actions above the fold) */
const QUICK_ACTIONS: { icon: keyof typeof Ionicons.glyphMap; label: string; route: string; color: string }[] = [
  { icon: "book-outline", label: "Bookings", route: "/(app)/(tabs)/more/bookings", color: "#6366f1" },
  { icon: "layers-outline", label: "Catalogue", route: "/(app)/(tabs)/more/catalogue", color: "#ec4899" },
  { icon: "megaphone-outline", label: "Buy ads", route: "/(app)/(tabs)/more/settings/ads", color: "#f59e0b" },
  { icon: "card-outline", label: "Memberships", route: "/(app)/(tabs)/more/membership-plans", color: "#7c3aed" },
];

export default function MoreScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    "Grow your business": true,
    Operations: true,
    "E-Commerce & Products": true,
  });
  const [refreshing, setRefreshing] = useState(false);

  const { data: completionData, loading: completionLoading, error: completionError, refresh: refreshCompletion } = useApi<ProfileCompletionData>(
    "/api/provider/profile-completion"
  );
  type MeProfileLite = {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    /** From GET /api/me/profile: business (`providers`) rating when the user is owner/staff */
    provider_rating_average?: number | null;
    provider_review_count?: number | null;
  };
  const { data: meProfile, refresh: refreshMeProfile } = useApi<MeProfileLite>("/api/me/profile", { staleTimeMs: 45_000 });
  const { data: financeSummary, refresh: refreshFinanceSummary } = useApi<FinanceSummaryData>("/api/provider/finance?range=month", { staleTimeMs: 30_000 });
  const { data: payoutAccounts, loading: payoutAccountsLoading, refresh: refreshPayoutAccounts } = useApi<PayoutAccountSummary[]>("/api/provider/payout-accounts", { staleTimeMs: 30_000 });
  const { data: payoutSchedule, refresh: refreshPayoutSchedule } = useApi<PayoutScheduleData>("/api/provider/payouts/next-date", { staleTimeMs: 60_000 });
  const { data: teamAccess } = useApi<TeamAccessData>("/api/provider/team-access", { staleTimeMs: 60_000 });
  const { data: navCounts, refresh: refreshNavCounts } = useApi<ProviderNavCounts>("/api/provider/nav-counts", { staleTimeMs: 30_000 });
  const completion = completionData ?? null;
  const completionItems = completion?.items ?? [];
  const completionPct = completion?.percentage ?? 0;
  const showCompletionCard = completionItems.length > 0 && completionPct < 100;
  const firstIncompleteRoute = completionItems.find((i) => !i.completed)?.route;
  const showCompletionError = !completionLoading && !!completionError && !completionData;
  const availablePayout = Number(financeSummary?.earnings?.available_balance ?? 0);
  const pendingPayouts = Number(financeSummary?.earnings?.pending_payouts ?? 0);
  const minimumPayout = Number(financeSummary?.earnings?.minimum_payout_amount ?? 100);
  const accounts = Array.isArray(payoutAccounts) ? payoutAccounts : [];
  const primaryPayoutAccount =
    accounts.find((account) => account.is_primary === true) ??
    accounts.find((account) => account.active !== false) ??
    accounts[0];
  const hasPayoutAccount = accounts.length > 0;
  const payoutAccountLast4 = primaryPayoutAccount?.account_number_last4 ?? primaryPayoutAccount?.account_number?.slice(-4);
  const canRequestPayouts = teamAccess?.can_process_payments !== false;
  const requestPayoutDisabledReason = !canRequestPayouts
    ? "Requires payment-processing permission"
    : !hasPayoutAccount
      ? "Add a bank account first"
      : availablePayout < minimumPayout
        ? `Minimum payout is ${formatCurrency(minimumPayout)}`
        : null;
  const nextPayoutDate = payoutSchedule?.next_payout_date
    ? new Date(payoutSchedule.next_payout_date)
    : null;

  function completionItemLabel(item: ProfileCompletionItem) {
    return t(`provider.profileCompletionItems.${item.id}` as never);
  }

  useFocusEffect(
    useCallback(() => {
      void refreshCompletion();
      void refreshMeProfile();
      void refreshFinanceSummary();
      void refreshPayoutAccounts();
      void refreshPayoutSchedule();
      void refreshNavCounts();
    }, [refreshCompletion, refreshMeProfile, refreshFinanceSummary, refreshPayoutAccounts, refreshPayoutSchedule, refreshNavCounts])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshCompletion(),
        refreshMeProfile(),
        refreshFinanceSummary(),
        refreshPayoutAccounts(),
        refreshPayoutSchedule(),
        refreshNavCounts(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCompletion, refreshMeProfile, refreshFinanceSummary, refreshPayoutAccounts, refreshPayoutSchedule, refreshNavCounts]);

  const getRouteBadgeCount = useCallback(
    (route: string): number => {
      if (route.includes("/bookings")) {
        return Number(navCounts?.pending_bookings ?? 0) + Number(navCounts?.waiting_room ?? 0);
      }
      if (route.includes("products-ecommerce-hub") || route.includes("product-orders") || route.includes("orders-hub")) {
        return Number(navCounts?.active_product_orders ?? 0);
      }
      if (route.includes("engagement-hub") || route.includes("messaging")) {
        return Number(navCounts?.unread_messages ?? 0);
      }
      return 0;
    },
    [navCounts],
  );

  const headerInitials = useMemo(() => {
    const n = (meProfile?.full_name || user?.email || "").trim();
    if (!n) return "?";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }, [meProfile?.full_name, user?.email]);

  const headerSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (meProfile?.phone?.trim()) parts.push(meProfile.phone.trim());
    const em =
      meProfile?.email?.trim() ||
      (typeof (user as { email?: string } | null)?.email === "string" ? (user as { email: string }).email.trim() : "");
    if (em) parts.push(em);
    return parts.join(" · ");
  }, [meProfile?.phone, meProfile?.email, user]);

  const toggleSection = useCallback((title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  }, []);

  function handleMenuPress(route: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as never);
  }

  const rateStoreTitle =
    Platform.OS === "ios"
      ? t("common.rateBeautonomiAppStore")
      : Platform.OS === "android"
        ? t("common.rateBeautonomiPlayStore")
        : t("common.rateBeautonomiStoreWeb");

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
    <ScreenContainer
      scrollable
      refreshing={refreshing}
      onRefresh={onRefresh}
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
          {meProfile?.avatar_url ? (
            <Image
              source={{ uri: meProfile.avatar_url }}
              style={{ width: 56, height: 56, borderRadius: 28 }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={{
                width: 56,
                height: 56,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 28,
                backgroundColor: Colors.gray[900],
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#fff" }}>{headerInitials}</Text>
            </View>
          )}
          <View style={{ marginLeft: 14, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  letterSpacing: -0.5,
                  color: Colors.gray[900],
                  flexGrow: 1,
                  flexShrink: 1,
                }}
              >
                My profile
              </Text>
              {meProfile?.provider_rating_average != null && (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/(app)/(tabs)/more/reviews" as never);
                  }}
                  style={{ flexDirection: "row", alignItems: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel={`Business rating ${meProfile.provider_rating_average.toFixed(1)} from ${meProfile.provider_review_count ?? 0} reviews. Opens reviews.`}
                >
                  <Ionicons name="star" size={16} color="#f59e0b" style={{ marginRight: 3 }} />
                  <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                    {meProfile.provider_rating_average.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }}>({meProfile.provider_review_count ?? 0})</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }} numberOfLines={2}>
              {headerSubtitle}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray[300]} />
        </TouchableOpacity>

        {/* Payouts - web payout center parity: balance, request action, and bank setup above the fold */}
        <View
          style={{
            marginBottom: 16,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#bbf7d0",
            backgroundColor: "#ecfdf5",
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: "#d1fae5",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="wallet-outline" size={24} color="#047857" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#047857", textTransform: "uppercase", letterSpacing: 0.7 }}>
                Provider payouts
              </Text>
              <Text style={{ marginTop: 2, fontSize: 28, fontWeight: "800", color: "#064e3b", letterSpacing: -0.8 }}>
                {formatCurrency(availablePayout)}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 13, color: "#047857" }}>
                Available for payout
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View style={{ borderRadius: 999, backgroundColor: "#d1fae5", paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#065f46" }}>
                Min {formatCurrency(minimumPayout)}
              </Text>
            </View>
            {pendingPayouts > 0 && (
              <View style={{ borderRadius: 999, backgroundColor: "#fef3c7", paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400e" }}>
                  {formatCurrency(pendingPayouts)} pending
                </Text>
              </View>
            )}
            {nextPayoutDate && Number.isFinite(nextPayoutDate.getTime()) && (
              <View style={{ borderRadius: 999, backgroundColor: "#e0f2fe", paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#075985" }}>
                  Next run {nextPayoutDate.toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={() => handleMenuPress(hasPayoutAccount ? "/(app)/(tabs)/more/payouts" : "/(app)/(tabs)/more/settings/payout-accounts")}
            activeOpacity={0.75}
            style={{
              marginTop: 14,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 14,
              backgroundColor: hasPayoutAccount ? "#047857" : "#111827",
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={hasPayoutAccount ? "Request payout" : "Set up bank account for payouts"}
          >
            <Ionicons name={hasPayoutAccount ? "cash-outline" : "business-outline"} size={20} color="#fff" />
            <Text style={{ marginLeft: 8, flex: 1, fontSize: 15, fontWeight: "700", color: "#fff" }}>
              {hasPayoutAccount ? "Request payout" : "Set up bank account"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleMenuPress("/(app)/(tabs)/more/settings/payout-accounts")}
            activeOpacity={0.75}
            style={{
              marginTop: 10,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#a7f3d0",
              backgroundColor: "#fff",
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel="Bank account setup"
          >
            <Ionicons name={hasPayoutAccount ? "checkmark-circle" : "alert-circle"} size={20} color={hasPayoutAccount ? "#059669" : "#d97706"} />
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.gray[900] }}>
                Bank account setup
              </Text>
              <Text style={{ marginTop: 1, fontSize: 12, color: Colors.gray[500] }} numberOfLines={2}>
                {payoutAccountsLoading
                  ? "Checking payout account..."
                  : hasPayoutAccount
                    ? `${primaryPayoutAccount?.bank_name || "Bank account"}${payoutAccountLast4 ? ` • •••• ${payoutAccountLast4}` : ""}`
                    : "Add a bank account before requesting payouts"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
          </TouchableOpacity>

          {requestPayoutDisabledReason && (
            <Text style={{ marginTop: 10, fontSize: 12, color: "#92400e", lineHeight: 16 }}>
              {requestPayoutDisabledReason}
            </Text>
          )}
        </View>

        {/* Highlight ads + memberships above the fold (also listed under “Grow your business”) */}
        <View style={{ marginBottom: 16, flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            onPress={() => handleMenuPress("/(app)/(tabs)/more/settings/ads")}
            activeOpacity={0.75}
            style={{
              flex: 1,
              borderRadius: 16,
              padding: 14,
              backgroundColor: "#fffbeb",
              borderWidth: 1,
              borderColor: "#fde68a",
            }}
            accessibilityRole="button"
            accessibilityLabel="Buy ads: sponsored listings and campaigns"
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "rgba(245, 158, 11, 0.25)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="megaphone-outline" size={20} color="#d97706" />
              </View>
              <Text style={{ marginLeft: 10, fontSize: 12, fontWeight: "700", color: "#92400e", textTransform: "uppercase", letterSpacing: 0.6 }}>
                Ads
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#78350f" }}>Buy ads</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: "#a16207", lineHeight: 16 }}>Boost discovery & fill your calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleMenuPress("/(app)/(tabs)/more/membership-plans")}
            activeOpacity={0.75}
            style={{
              flex: 1,
              borderRadius: 16,
              padding: 14,
              backgroundColor: "#f5f3ff",
              borderWidth: 1,
              borderColor: "#ddd6fe",
            }}
            accessibilityRole="button"
            accessibilityLabel="Sell memberships: plans and subscribers"
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "rgba(124, 58, 237, 0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="card-outline" size={20} color="#7c3aed" />
              </View>
              <Text style={{ marginLeft: 10, fontSize: 12, fontWeight: "700", color: "#5b21b6", textTransform: "uppercase", letterSpacing: 0.6 }}>
                Recurring
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#4c1d95" }}>Sell memberships</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: "#6d28d9", lineHeight: 16 }}>Plans, perks & subscriber revenue</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions - customer-style 2x2 grid (shortens perceived page length) */}
        <View style={{ marginBottom: 20, flexDirection: "row", flexWrap: "wrap" }}>
          {QUICK_ACTIONS.map((action) => {
            const badge = formatBadgeCount(getRouteBadgeCount(action.route));
            return (
              <TouchableOpacity
                key={action.route}
                onPress={() => handleMenuPress(action.route)}
                activeOpacity={0.7}
                style={{ flex: 1, minWidth: "45%", marginRight: 12, marginBottom: 12, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], alignItems: "center", paddingVertical: 16 }}
                accessibilityRole="button"
                accessibilityLabel={badge ? `${action.label}, ${badge} alerts` : action.label}
              >
                <View
                  style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, marginBottom: 8, backgroundColor: `${action.color}20` }}
                >
                  <Ionicons name={action.icon} size={20} color={action.color} />
                  {badge ? (
                    <View style={{ position: "absolute", right: -8, top: -8, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#fff" }}>{badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[700], textAlign: "center" }} numberOfLines={2}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
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
                            accessibilityLabel={`${completionItemLabel(item)}${item.required ? ", required" : ""}`}
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
                              {completionItemLabel(item)}
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
                  {section.items.map((item, idx) => {
                    const badge = formatBadgeCount(getRouteBadgeCount(item.route));
                    return (
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
                        accessibilityLabel={badge ? `${item.label}: ${item.subtitle}. ${badge} alerts.` : `${item.label}: ${item.subtitle}`}
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
                        {badge ? (
                          <View style={{ marginRight: 8, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>{badge}</Text>
                          </View>
                        ) : null}
                        <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ marginBottom: 8, marginLeft: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, color: Colors.gray[400] }}>
            {t("provider.moreTab.rateStoreHeading")}
          </Text>
        </View>
        <TouchableOpacity
          style={{
            marginBottom: 20,
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: Colors.gray[100],
            backgroundColor: Colors.white,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
          onPress={() => {
            getAnalyticsClient()?.track("rate_app_store", { source: "more_tab" });
            void openNativeStoreReview();
          }}
          activeOpacity={0.7}
          accessibilityLabel={rateStoreTitle}
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
            <Ionicons name="star-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{rateStoreTitle}</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>{t("common.rateBeautonomiStoreSubtitle")}</Text>
          </View>
          <Ionicons name="open-outline" size={16} color="#d1d5db" />
        </TouchableOpacity>

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
    </ScreenContainer>
  );
}

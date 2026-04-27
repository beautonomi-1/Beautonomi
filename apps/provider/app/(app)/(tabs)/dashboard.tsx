import { useState, useCallback, useMemo, useEffect } from "react";
import { InteractionManager, View, Text, TouchableOpacity, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format, subDays, addDays } from "date-fns";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/lib/supabase/client";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ProviderDashboardExcellenceBanner } from "@/components/ProviderDashboardExcellenceBanner";
import { SkeletonDashboard } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatCurrency,
  formatRelativeDate,
  formatDuration,
  formatPercentage,
  formatTimeAgo,
} from "@/lib/format";
import { trackDashboardView } from "@/lib/analytics";
import { newBookingScreenHref } from "@/lib/new-booking-nav-defaults";
import { Colors } from "@/constants/colors";

interface DashboardMetrics {
  total_bookings: number;
  active_bookings: number;
  confirmed_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  pending_bookings: number;
  no_show_bookings: number;
  revenue_this_month: number;
  revenue_this_week: number;
  revenue_today: number;
  revenue_growth: number;
  lifetime_revenue: number;
  available_balance: number;
  pending_payments_amount: number;
  completion_rate: number;
  no_show_rate: number;
  average_rating: number;
  total_reviews: number;
  appointments_today: number;
  appointments_this_week: number;
  appointments_this_month: number;
  service_earnings_total: number;
  travel_fees_total: number;
  gamification?: {
    total_points: number;
    lifetime_points: number;
    current_badge: { name: string; color: string; icon_url: string } | null;
    progress_to_next_badge: {
      badge: { name: string; tier: number; color: string };
      current_points: number;
      required_points: number;
      points_needed: number;
      progress_percentage: number;
    } | null;
  } | null;
  provider_profile?: {
    supports_house_calls: boolean;
    supports_salon: boolean;
    max_service_distance_km: number | null;
  };
  dashboard_bundle_version?: number;
  insights?: {
    weekly_revenue: WeeklyRevenue[];
    top_services: TopService[];
    recent_activity: ActivityItem[];
    today_bookings: Booking[];
    upcoming_bookings: Booking[];
  } | null;
  booking_eligibility?: {
    can_accept_online_bookings: boolean;
    booking_limit_message: string | null;
  } | null;
}

interface Booking {
  id: string;
  booking_number: string;
  status: string;
  scheduled_at: string;
  total_amount: number;
  currency: string;
  location_type: string;
  services: {
    name?: string;
    offering_name?: string;
    duration_minutes: number;
    staff_name: string | null;
    guest_name?: string | null;
  }[];
  customers: { full_name: string; phone: string } | null;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  group_booking_ref?: string | null;
  package_name?: string | null;
  products?: { product_name?: string; quantity?: number }[];
}

interface WeeklyRevenue {
  day: string;
  revenue: number;
}

interface TopService {
  service_name: string;
  booking_count: number;
  total_revenue: number;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  created_at: string;
  data?: {
    booking_id?: string;
    client_name?: string;
    amount?: number;
  };
}

const DATE_RANGE_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
];

function getActivityIcon(type: string): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  switch (type) {
    case "booking_created":
    case "new_booking":
      return { name: "book-outline", color: "#6366f1", bg: "#eef2ff" };
    case "booking_completed":
      return { name: "checkmark-circle-outline", color: "#22c55e", bg: "#f0fdf4" };
    case "booking_cancelled":
      return { name: "close-circle-outline", color: "#ef4444", bg: "#fef2f2" };
    case "payment_received":
      return { name: "cash-outline", color: "#22c55e", bg: "#f0fdf4" };
    case "new_review":
      return { name: "star-outline", color: "#f59e0b", bg: "#fffbeb" };
    case "new_client":
      return { name: "person-add-outline", color: "#3b82f6", bg: "#eff6ff" };
    default:
      return { name: "ellipse-outline", color: "#6b7280", bg: "#f3f4f6" };
  }
}

function WeeklyRevenueChart({ data }: { data: WeeklyRevenue[] }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // §UX-audit 2026-04: `new Date().toISOString().slice(0, 10)` returns
  // the UTC calendar date, which is wrong for any provider whose local
  // date differs from UTC (ZA is +02:00 — so every night between 22:00
  // and 00:00 local, "today" highlighted the wrong bar). Build the
  // date string from the device's local Y/M/D instead.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const dayLabels = data.map((d) => {
    if (!d.day) return "?";
    const dt = new Date(d.day + "T12:00:00");
    return Number.isFinite(dt.getTime()) ? SHORT_DAYS[dt.getDay()] : d.day.slice(5);
  });

  return (
    <Card variant="default" padding="md">
      <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, fontWeight: "500", letterSpacing: 0.5, color: Colors.gray[400] }}>
          7-Day Total
        </Text>
        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
          {formatCurrency(totalRevenue)}
        </Text>
      </View>

      <View
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 120 }}
        accessibilityLabel="Weekly revenue bar chart"
      >
        {data.map((day) => {
          const barHeight = Math.max(
            (day.revenue / maxRevenue) * 100,
            day.revenue > 0 ? 6 : 2,
          );
          // §UX-audit 2026-04: previously this also treated the last-index
          // bar as today as a safety net, which was wrong whenever the
          // backend returned a week that wasn't anchored on today (or
          // timezones shifted the comparison). Rely solely on the
          // authoritative date string.
          const isToday = day.day === todayStr;
          return (
            <View key={day.day} style={{ flex: 1, alignItems: "center", paddingHorizontal: 2 }}>
              {day.revenue > 0 && (
                <Text
                  style={{ marginBottom: 4, fontSize: 11, fontWeight: "500", color: Colors.gray[500] }}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {formatCurrency(day.revenue).replace(/\.00$/, "")}
                </Text>
              )}
              <View
                style={{
                  width: "100%",
                  maxWidth: 28,
                  borderRadius: 8,
                  height: barHeight,
                  backgroundColor: isToday ? Colors.gray[900] : day.revenue > 0 ? Colors.gray[200] : Colors.gray[100],
                }}
              />
            </View>
          );
        })}
      </View>

      <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
        {dayLabels.map((label, i) => {
          const isToday = data[i]?.day === todayStr;
          return (
            <View key={`${label}-${i}`} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 10, fontWeight: isToday ? "700" : "400", color: isToday ? Colors.gray[900] : Colors.gray[400] }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const openBookingSurface = useCallback(
    (booking: Booking) => {
      if (booking.is_group_booking && booking.group_booking_id) {
        router.push(
          {
            pathname: "/(app)/(tabs)/more/group-bookings",
            params: { open_group_id: booking.group_booking_id },
          } as never,
        );
        return;
      }
      router.push(`/(app)/(tabs)/bookings/${booking.id}` as never);
    },
    [router],
  );
  const [isFocused, setIsFocused] = useState(true);
  const { provider, selectedLocationId } = useProvider();
  const { isTablet, columns } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("today");
  const [secondaryEnabled, setSecondaryEnabled] = useState(false);

  const encodedLocationId = selectedLocationId ? encodeURIComponent(selectedLocationId) : "";
  const locQFirst = encodedLocationId ? `?location_id=${encodedLocationId}` : "";
  const locQ = encodedLocationId ? `&location_id=${encodedLocationId}` : "";

  const {
    data: metrics,
    loading: metricsLoading,
    error: metricsError,
    timedOut: metricsTimedOut,
    refresh: refreshMetrics,
  } = useApi<DashboardMetrics>(
    `/api/provider/dashboard${locQFirst}${locQFirst ? "&" : "?"}include=insights`,
    {
      enabled: isFocused,
      timeoutMs: 15000,
      staleTimeMs: 0,
    },
  );

  useEffect(() => {
    trackDashboardView();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!isFocused) {
      setSecondaryEnabled(false);
      return;
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) setSecondaryEnabled(true);
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [isFocused, selectedLocationId]);

  const hasBundledInsights = Boolean(metrics?.insights);
  const hasBundledBookingEligibility = Boolean(metrics?.booking_eligibility);
  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const upcomingEnd = format(addDays(new Date(), 6), "yyyy-MM-dd");

  const {
    data: fallbackTodayBookings,
    error: fallbackTodayBookingsError,
    refresh: refreshFallbackTodayBookings,
  } = useApi<Booking[]>(
    `/api/provider/bookings?start_date=${today}&end_date=${today}${locQ}`,
    {
      enabled: isFocused && metrics !== null && !hasBundledInsights,
      staleTimeMs: 15_000,
    },
  );
  const {
    data: fallbackUpcomingBookings,
    error: fallbackUpcomingError,
    refresh: refreshFallbackUpcoming,
  } = useApi<Booking[]>(
    `/api/provider/bookings?status=confirmed,pending,booked&start_date=${today}&end_date=${upcomingEnd}&limit=20&sort=scheduled_at${locQ}`,
    {
      enabled: isFocused && metrics !== null && !hasBundledInsights,
      staleTimeMs: 15_000,
    },
  );
  const {
    data: fallbackWeeklyRevenue,
    refresh: refreshFallbackWeekly,
  } = useApi<WeeklyRevenue[]>(
    `/api/provider/reports/weekly-revenue?start_date=${weekStart}&end_date=${today}${locQ}`,
    {
      enabled: isFocused && secondaryEnabled && metrics !== null && !hasBundledInsights,
      staleTimeMs: 60_000,
    },
  );
  const {
    data: fallbackTopServices,
    error: fallbackTopServicesError,
    refresh: refreshFallbackTopServices,
  } = useApi<TopService[]>(
    `/api/provider/reports/top-services?limit=5${locQ}`,
    {
      enabled: isFocused && secondaryEnabled && metrics !== null && !hasBundledInsights,
      staleTimeMs: 60_000,
    },
  );
  const {
    data: fallbackRecentActivity,
    error: fallbackActivityError,
    refresh: refreshFallbackActivity,
  } = useApi<ActivityItem[]>(
    `/api/provider/activity?limit=10${locQ}`,
    {
      enabled: isFocused && secondaryEnabled && metrics !== null && !hasBundledInsights,
      staleTimeMs: 30_000,
    },
  );
  const {
    data: fallbackBookingEligibility,
    refresh: refreshFallbackBookingEligibility,
  } = useApi<{
    can_accept_online_bookings: boolean;
    booking_limit_message: string | null;
  }>("/api/provider/subscription/booking-eligibility", {
    enabled: isFocused && metrics !== null && !hasBundledBookingEligibility,
    staleTimeMs: 60_000,
  });

  const todayBookings = metrics?.insights?.today_bookings ?? fallbackTodayBookings ?? null;
  const upcomingBookings = metrics?.insights?.upcoming_bookings ?? fallbackUpcomingBookings ?? null;
  const todayBookingsError = hasBundledInsights ? null : fallbackTodayBookingsError;
  const upcomingError = hasBundledInsights ? null : fallbackUpcomingError;

  const weeklyRevenue = metrics?.insights?.weekly_revenue ?? fallbackWeeklyRevenue ?? null;
  const topServices = metrics?.insights?.top_services ?? fallbackTopServices ?? null;
  const recentActivity = metrics?.insights?.recent_activity ?? fallbackRecentActivity ?? null;
  const bookingEligibility = metrics?.booking_eligibility ?? fallbackBookingEligibility ?? null;
  const topServicesError = hasBundledInsights ? null : fallbackTopServicesError;
  const activityError = hasBundledInsights ? null : fallbackActivityError;

  const refreshRealtimeDashboardData = useCallback(() => {
    const tasks = [refreshMetrics()];
    if (!hasBundledInsights) {
      tasks.push(refreshFallbackTodayBookings(), refreshFallbackUpcoming());
      if (secondaryEnabled) {
        tasks.push(refreshFallbackWeekly(), refreshFallbackTopServices(), refreshFallbackActivity());
      }
    }
    if (!hasBundledBookingEligibility) {
      tasks.push(refreshFallbackBookingEligibility());
    }
    void Promise.all(tasks);
  }, [
    refreshMetrics,
    hasBundledInsights,
    hasBundledBookingEligibility,
    refreshFallbackTodayBookings,
    refreshFallbackUpcoming,
    refreshFallbackWeekly,
    refreshFallbackTopServices,
    refreshFallbackActivity,
    refreshFallbackBookingEligibility,
    secondaryEnabled,
  ]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const tasks = [refreshMetrics()];
      if (!hasBundledInsights) {
        tasks.push(refreshFallbackTodayBookings(), refreshFallbackUpcoming());
        if (secondaryEnabled) {
          tasks.push(refreshFallbackWeekly(), refreshFallbackTopServices(), refreshFallbackActivity());
        }
      }
      if (!hasBundledBookingEligibility) {
        tasks.push(refreshFallbackBookingEligibility());
      }
      await Promise.all(tasks);
    } finally {
      setRefreshing(false);
    }
  }, [
    refreshMetrics,
    hasBundledInsights,
    hasBundledBookingEligibility,
    refreshFallbackTodayBookings,
    refreshFallbackUpcoming,
    refreshFallbackWeekly,
    refreshFallbackTopServices,
    refreshFallbackActivity,
    refreshFallbackBookingEligibility,
    secondaryEnabled,
  ]);

  useEffect(() => {
    if (!isFocused || !provider?.id) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshRealtimeDashboardData();
      }, 500);
    };

    const channel = supabase
      .channel("dashboard-booking-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${provider.id}`,
        },
        () => {
          scheduleRefresh();
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [isFocused, provider?.id, refreshRealtimeDashboardData]);

  const m = metrics;
  const statColumns = isTablet ? (columns >= 3 ? 4 : 2) : 2;
  /** Inline dashboard figures: keep compact on narrow phones (four-up row). */
  const dashMetricLg = isTablet ? 22 : 17;
  const dashMetricMd = isTablet ? 19 : 15;

  const displayRevenue = useMemo(() => {
    if (!m) return formatCurrency(0);
    switch (dateRange) {
      case "today":
        return formatCurrency(m.revenue_today ?? 0);
      case "week":
        return formatCurrency(m.revenue_this_week ?? 0);
      case "month":
        return formatCurrency(m.revenue_this_month ?? 0);
      default:
        return formatCurrency(m.revenue_today ?? 0);
    }
  }, [m, dateRange]);

  const displayAppointments = useMemo(() => {
    if (!m) return 0;
    switch (dateRange) {
      case "today":
        return m.appointments_today ?? 0;
      case "week":
        return m.appointments_this_week ?? 0;
      case "month":
        return m.appointments_this_month ?? 0;
      default:
        return m.appointments_today ?? 0;
    }
  }, [m, dateRange]);

  const periodLabel = useMemo(() => {
    switch (dateRange) {
      case "today":
        return "Today";
      case "week":
        return "This Week";
      case "month":
        return "This Month";
      default:
        return "Today";
    }
  }, [dateRange]);

  const chartData: WeeklyRevenue[] = useMemo(
    () =>
      weeklyRevenue ??
      Array.from({ length: 7 }, (_, i) => ({
        day: format(subDays(new Date(), 6 - i), "yyyy-MM-dd"),
        revenue: 0,
      })),
    [weeklyRevenue],
  );
  const insightsLoading = !secondaryEnabled;

  if (metricsLoading && !metrics && !metricsTimedOut) {
    return (
      <ScreenContainer scrollable={false}>
        <SkeletonDashboard />
      </ScreenContainer>
    );
  }

  if (metricsTimedOut && !metrics) {
    return (
      <ScreenContainer scrollable={false}>
        <ErrorState
          message="Request is taking longer than usual. Check your connection and try again."
          onRetry={refreshMetrics}
          retryLabel="Retry"
        />
      </ScreenContainer>
    );
  }

  if (metricsError && !metrics) {
    return (
      <ScreenContainer scrollable={false}>
        <ErrorState message={metricsError} onRetry={refreshMetrics} />
      </ScreenContainer>
    );
  }

  const gam = m?.gamification;
  const nextBadge = gam?.progress_to_next_badge;

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Dashboard" subtitle={`${m?.appointments_today ?? 0} appointments today`} />

      {bookingEligibility &&
        !bookingEligibility.can_accept_online_bookings &&
        bookingEligibility.booking_limit_message?.trim() && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/settings/subscription" as never);
            }}
            style={{
              marginBottom: 16,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#fecaca",
              backgroundColor: "#fef2f2",
              padding: 12,
              flexDirection: "row",
              alignItems: "flex-start",
            }}
            accessibilityRole="button"
            accessibilityLabel="Subscription required for online bookings. Opens plan and billing."
          >
            <Ionicons name="alert-circle-outline" size={22} color="#b91c1c" style={{ marginRight: 10, marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#991b1b" }}>Online bookings need attention</Text>
              <Text style={{ fontSize: 13, color: "#7f1d1d", marginTop: 4, lineHeight: 18 }}>
                {bookingEligibility.booking_limit_message}
              </Text>
              <Text style={{ fontSize: 13, color: Colors.primary, marginTop: 8, fontWeight: "600" }}>
                Open plan & billing →
              </Text>
            </View>
          </TouchableOpacity>
        )}

      <ProviderDashboardExcellenceBanner />

      {/* Identity strip: rating, badge, service type, at-home radius */}
      {m && (
        <View
          style={{ marginBottom: 16, flexDirection: "row", flexWrap: "wrap", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 10 }}
          accessibilityLabel={`Rating ${m.average_rating?.toFixed(1) ?? "0.0"}, ${m.total_reviews ?? 0} reviews. Level: ${gam?.current_badge?.name ?? "Getting started"}. ${m.provider_profile?.supports_house_calls ? "At-home" : ""} ${m.provider_profile?.supports_salon ? "At-salon" : ""}. ${m.provider_profile?.supports_house_calls && m.provider_profile?.max_service_distance_km ? `Within ${m.provider_profile.max_service_distance_km} km` : ""}`}
        >
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 12 }}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(app)/(tabs)/more/reviews" as never);
              }}
              accessibilityLabel={`Rating ${m.average_rating?.toFixed(1) ?? "0.0"} from ${m.total_reviews ?? 0} reviews`}
            >
              <Ionicons name="star" size={16} color="#f59e0b" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                {m.average_rating?.toFixed(1) ?? "0.0"}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                ({m.total_reviews ?? 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 12 }}
              activeOpacity={0.8}
              onPress={() => router.push("/(app)/(tabs)/more/rewards-hub" as never)}
              accessibilityLabel={gam?.current_badge?.name ? `Level ${gam.current_badge.name}` : "View rewards"}
            >
              <Ionicons name="trophy" size={16} color="#92400e" style={{ marginRight: 4 }} />
              <View
                style={{
                  borderRadius: 9999,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  backgroundColor:
                    (gam?.current_badge?.color && /^#/.test(gam.current_badge.color))
                      ? gam.current_badge.color
                      : "#6366f1",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.white }}>
                  {gam?.current_badge?.name ?? "Getting started"}
                </Text>
              </View>
            </TouchableOpacity>
            {(m.provider_profile?.supports_house_calls || m.provider_profile?.supports_salon) && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {m.provider_profile.supports_house_calls && (
                  <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 4, backgroundColor: "#dcfce7", paddingHorizontal: 8, paddingVertical: 2, marginRight: 6 }}>
                    <Ionicons name="home-outline" size={12} color="#166534" />
                    <Text style={{ marginLeft: 2, fontSize: 12, fontWeight: "500", color: "#166534" }}>At-home</Text>
                  </View>
                )}
                {m.provider_profile.supports_salon && (
                  <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 4, backgroundColor: "#f3e8ff", paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Ionicons name="business-outline" size={12} color="#6b21a8" />
                    <Text style={{ marginLeft: 2, fontSize: 12, fontWeight: "500", color: "#6b21a8" }}>At-salon</Text>
                  </View>
                )}
              </View>
            )}
            {m.provider_profile?.supports_house_calls &&
              m.provider_profile?.max_service_distance_km != null &&
              m.provider_profile.max_service_distance_km > 0 && (
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", borderRadius: 4, backgroundColor: "#eef2ff", paddingHorizontal: 8, paddingVertical: 2, marginRight: 12 }}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/(app)/(tabs)/more/settings/distance-settings" as never);
                  }}
                  accessibilityLabel={`Within ${m.provider_profile.max_service_distance_km} km. Tap to change distance settings.`}
                >
                  <Ionicons name="location-outline" size={12} color="#4338ca" style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 12, fontWeight: "500", color: "#3730a3" }}>
                    Within {m.provider_profile.max_service_distance_km} km
                  </Text>
                </TouchableOpacity>
              )}
        </View>
      )}

      {/*
        Wave 4.3 (audit 2026-04 final 100/100): provider mobile front-desk
        quick actions. Walk-in + product-sale now surface on the home
        screen so a provider can take a front-desk customer or a retail
        sale in two taps, matching the web portal's front-desk parity.
      */}
      <View style={{ marginBottom: 16, flexDirection: "row" }}>
        <TouchableOpacity
          style={{ minHeight: 48, flex: 1, marginRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.gray[900] }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push(
              newBookingScreenHref({
                ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
              }) as never,
            );
          }}
          activeOpacity={0.7}
          accessibilityLabel="Create new booking"
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={{ marginLeft: 8, fontWeight: "600", color: Colors.white }}>New</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ minHeight: 48, flex: 1, marginRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push(
              newBookingScreenHref({
                walkIn: true,
                ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
              }) as never,
            );
          }}
          activeOpacity={0.7}
          accessibilityLabel="Record a walk-in booking"
          accessibilityRole="button"
        >
          <Ionicons name="walk-outline" size={18} color="#111" />
          <Text style={{ marginLeft: 8, fontWeight: "600", color: Colors.gray[900] }}>Walk-in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/more/walk-in-sale" as never);
          }}
          activeOpacity={0.7}
          accessibilityLabel="Start a product sale"
          accessibilityRole="button"
        >
          <Ionicons name="pricetag-outline" size={18} color="#111" />
          <Text style={{ marginLeft: 8, fontWeight: "600", color: Colors.gray[900] }}>Sale</Text>
        </TouchableOpacity>
      </View>

      {/* Date Range Selector */}
      <View style={{ marginBottom: 16 }}>
        <FilterChipGroup
          options={DATE_RANGE_OPTIONS}
          selected={dateRange}
          onSelect={(val) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setDateRange(val);
          }}
        />
      </View>

      {/* Revenue Stats */}
      <View
        style={{ flexDirection: "row", flexWrap: "wrap" }}
      >
        <View style={{ width: statColumns === 4 ? "24%" : "48.5%", marginRight: 12, marginBottom: 12 }}>
          <StatCard
            title={`${periodLabel} Revenue`}
            value={displayRevenue}
            icon="wallet-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact={!isTablet}
          />
        </View>
        <View style={{ width: statColumns === 4 ? "24%" : "48.5%", marginRight: 12, marginBottom: 12 }}>
          <StatCard
            title={`${periodLabel} Appointments`}
            value={String(displayAppointments)}
            icon="calendar-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            compact={!isTablet}
          />
        </View>
        <View style={{ width: statColumns === 4 ? "24%" : "48.5%", marginRight: 12, marginBottom: 12 }}>
          <StatCard
            title="Available Balance"
            value={formatCurrency(m?.available_balance ?? 0)}
            icon="cash-outline"
            iconColor="#f59e0b"
            iconBg="bg-amber-50"
            compact={!isTablet}
          />
        </View>
        <View style={{ width: statColumns === 4 ? "24%" : "48.5%", marginBottom: 12 }}>
          <StatCard
            title="Completion Rate"
            value={formatPercentage(m?.completion_rate ?? 0)}
            icon="checkmark-circle-outline"
            iconColor="#06b6d4"
            iconBg="bg-cyan-50"
            compact={!isTablet}
          />
        </View>
      </View>

      {/* Weekly Revenue Chart */}
      <SectionHeader title="Revenue Trend (7 Days)" />
      {insightsLoading ? (
        <Card variant="default" padding="md">
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[500] }}>Loading insights…</Text>
          </View>
        </Card>
      ) : (
        <WeeklyRevenueChart data={chartData} />
      )}

      {/* Bookings Overview - schedule count is period-scoped; status counts are all-time */}
      <SectionHeader
        title="Booking Status"
        actionLabel="View All"
        onAction={() =>
          router.push("/(app)/(tabs)/bookings" as never)
        }
      />
      <View style={{ flexDirection: "row" }}>
        <View
          style={{ flex: 1, marginRight: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={`${displayAppointments} scheduled bookings ${periodLabel.toLowerCase()}`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: Colors.gray[900] }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {displayAppointments}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{periodLabel}</Text>
        </View>
        <View
          style={{ flex: 1, marginRight: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={`${m?.pending_bookings ?? 0} pending`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#d97706" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {m?.pending_bookings ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Pending</Text>
        </View>
        <View
          style={{ flex: 1, marginRight: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={`${m?.confirmed_bookings ?? 0} confirmed`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#4f46e5" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {m?.confirmed_bookings ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Confirmed</Text>
        </View>
        <View
          style={{ flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={`${m?.completed_bookings ?? 0} completed`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#16a34a" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {m?.completed_bookings ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Completed</Text>
        </View>
      </View>

      {/* Top Services */}
      <SectionHeader title="Top Services" />
      {insightsLoading ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 24 }}>
          <Ionicons name="hourglass-outline" size={24} color="#9ca3af" />
          <Text style={{ marginTop: 8, fontSize: 13, color: Colors.gray[500] }}>Preparing top services…</Text>
        </View>
      ) : topServicesError && !topServices ? (
        <TouchableOpacity onPress={refreshFallbackTopServices} activeOpacity={0.7} style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 16 }}>
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>Failed to load · Tap to retry</Text>
        </TouchableOpacity>
      ) : !topServices || topServices.length === 0 ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 24 }}>
          <Ionicons name="bar-chart-outline" size={28} color="#d1d5db" />
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400] }}>
            No service data yet
          </Text>
        </View>
      ) : (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white }}>
          {topServices.map((svc, idx) => {
            const maxRev = topServices[0].total_revenue || 1;
            const barWidth = (svc.total_revenue / maxRev) * 100;
            return (
              <View
                key={idx}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  ...(idx < topServices.length - 1 ? { borderBottomWidth: 1, borderBottomColor: Colors.gray[50] } : {}),
                }}
                accessibilityLabel={`${svc.service_name}: ${svc.booking_count} bookings, ${formatCurrency(svc.total_revenue)} revenue`}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                      {svc.service_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                      {svc.booking_count} bookings
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                    {formatCurrency(svc.total_revenue)}
                  </Text>
                </View>
                <View style={{ marginTop: 6, height: 6, overflow: "hidden", borderRadius: 9999, backgroundColor: Colors.gray[100] }}>
                  <View style={{ height: "100%", borderRadius: 9999, backgroundColor: "#818cf8", width: `${barWidth}%` }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Performance */}
      <SectionHeader title="Performance" />
      <View style={{ flexDirection: "row" }}>
        <View
          style={{ flex: 1, marginRight: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          accessibilityLabel={`Rating: ${m?.average_rating?.toFixed(1) ?? "0.0"} from ${m?.total_reviews ?? 0} reviews`}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="star" size={18} color="#f59e0b" style={{ marginRight: 6 }} />
            <Text
              style={{ marginLeft: 6, fontSize: dashMetricMd, fontWeight: "700", color: Colors.gray[900] }}
              numberOfLines={1}
              adjustsFontSizeToFit={Platform.OS !== "web"}
              minimumFontScale={0.75}
            >
              {m?.average_rating?.toFixed(1) ?? "0.0"}
            </Text>
          </View>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
            {m?.total_reviews ?? 0} reviews
          </Text>
        </View>
        <View
          style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          accessibilityLabel={`No show rate: ${formatPercentage(m?.no_show_rate ?? 0)}`}
        >
          <Text
            style={{ fontSize: dashMetricMd, fontWeight: "700", color: Colors.gray[900] }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.75}
          >
            {formatPercentage(m?.no_show_rate ?? 0)}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>No-show rate</Text>
        </View>
        <View
          style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          accessibilityLabel={`${m?.completed_bookings ?? 0} completed bookings`}
        >
          <Text
            style={{ fontSize: dashMetricMd, fontWeight: "700", color: Colors.gray[900] }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.75}
          >
            {m?.completed_bookings ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Completed</Text>
        </View>
      </View>

      {/* Rewards & Achievements — always visible */}
      <SectionHeader
        title="Rewards & Achievements"
        actionLabel="View All"
        onAction={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(app)/(tabs)/more/rewards-hub" as never);
        }}
      />
      <TouchableOpacity
        style={{ borderRadius: 16, borderWidth: 1, borderColor: "#c7d2fe", backgroundColor: "#eef2ff", padding: 16 }}
        onPress={() => router.push("/(app)/(tabs)/more/rewards-hub" as never)}
        activeOpacity={0.7}
        accessibilityLabel={`Rewards: ${gam?.total_points ?? 0} points`}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: "#e0e7ff" }}>
            <Ionicons name="trophy" size={24} color="#6366f1" />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ fontWeight: "600", color: "#312e81" }}>
              {gam?.current_badge?.name ?? "Getting Started"}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: "#4338ca" }}>
              {(gam?.total_points ?? 0).toLocaleString()} points earned
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6366f1" />
        </View>
        {nextBadge && (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: "#4338ca" }}>
                Next: {nextBadge.badge.name}
              </Text>
              <Text style={{ fontSize: 12, color: "#4f46e5" }}>
                {nextBadge.progress_percentage}%
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 9999, backgroundColor: "#c7d2fe", overflow: "hidden" }}>
              <View style={{ height: "100%", borderRadius: 9999, backgroundColor: "#4f46e5", width: `${nextBadge.progress_percentage}%` }} />
            </View>
            <Text style={{ marginTop: 4, fontSize: 10, color: "#6366f1" }}>
              {nextBadge.points_needed.toLocaleString()} pts to go
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Upcoming Appointments (next 7 days) */}
      <SectionHeader
        title="Upcoming (Next 7 Days)"
        actionLabel="See All"
        onAction={() => router.push("/(app)/(tabs)/calendar" as never)}
      />
      {upcomingError && !upcomingBookings ? (
        <TouchableOpacity onPress={refreshFallbackUpcoming} activeOpacity={0.7} style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 16 }}>
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>Failed to load · Tap to retry</Text>
        </TouchableOpacity>
      ) : !upcomingBookings || upcomingBookings.length === 0 ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 32 }}>
          <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400] }}>
            No upcoming appointments
          </Text>
        </View>
      ) : (
        <View style={[ isTablet ? { flexDirection: "row", flexWrap: "wrap" } : {} ]}>
          {upcomingBookings.slice(0, 7).map((booking) => (
            <TouchableOpacity
              key={booking.id}
              style={[
                { borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 },
                isTablet ? { width: "48%", marginRight: 12, marginBottom: 12 } : { marginBottom: 8 },
              ]}
              onPress={() =>
                openBookingSurface(booking)
              }
              accessibilityLabel={`Upcoming: ${booking.customers?.full_name ?? "Walk-in"} at ${formatRelativeDate(booking.scheduled_at)}`}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Avatar
                      name={booking.customers?.full_name ?? "Guest"}
                      size="sm"
                    />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                        {booking.customers?.full_name ?? "Walk-in"}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                        {formatRelativeDate(booking.scheduled_at)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 8 }}>
                    {booking.services?.slice(0, 2).map((s, i) => (
                      <Text key={i} style={{ fontSize: 12, color: Colors.gray[600] }} numberOfLines={1}>
                        {s.name ?? s.offering_name ?? "Service"}
                        {s.guest_name ? ` (${s.guest_name})` : ""} ({formatDuration(s.duration_minutes)})
                      </Text>
                    ))}
                  </View>
                  {booking.is_group_booking && booking.group_booking_ref && (
                    <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[500] }} numberOfLines={1}>
                      Group: {booking.group_booking_ref}
                    </Text>
                  )}
                  {booking.package_name ? (
                    <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[600] }} numberOfLines={1}>
                      Package: {booking.package_name}
                    </Text>
                  ) : null}
                  {(booking.products?.length ?? 0) > 0 ? (
                    <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[600] }} numberOfLines={1}>
                      {booking.products!.length} product{booking.products!.length === 1 ? "" : "s"}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Badge status={booking.status} />
                  <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                    {formatCurrency(booking.total_amount, booking.currency)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Recent Activity */}
      <SectionHeader title="Recent Activity" />
      {insightsLoading ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 24 }}>
          <Ionicons name="hourglass-outline" size={24} color="#9ca3af" />
          <Text style={{ marginTop: 8, fontSize: 13, color: Colors.gray[500] }}>Preparing recent activity…</Text>
        </View>
      ) : activityError && !recentActivity ? (
        <TouchableOpacity onPress={refreshFallbackActivity} activeOpacity={0.7} style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 16 }}>
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>Failed to load · Tap to retry</Text>
        </TouchableOpacity>
      ) : !recentActivity || recentActivity.length === 0 ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 24 }}>
          <Ionicons name="pulse-outline" size={28} color="#d1d5db" />
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400] }}>
            No recent activity
          </Text>
        </View>
      ) : (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white }}>
          {recentActivity.map((item, idx) => {
            const iconInfo = getActivityIcon(item.type);
            return (
              <TouchableOpacity
                key={item.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  ...(idx < recentActivity.length - 1 ? { borderBottomWidth: 1, borderBottomColor: Colors.gray[50] } : {}),
                }}
                onPress={() => {
                  if (item.data?.booking_id) {
                    router.push(
                      `/(app)/(tabs)/bookings/${item.data.booking_id}` as never,
                    );
                  }
                }}
                accessibilityLabel={`${item.description}, ${formatTimeAgo(item.created_at)}`}
                accessibilityRole="button"
              >
                <View style={{ backgroundColor: iconInfo.bg, height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
                  <Ionicons name={iconInfo.name} size={18} color={iconInfo.color} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[900] }} numberOfLines={1}>
                    {item.description}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[400] }}>
                    {formatTimeAgo(item.created_at)}
                  </Text>
                </View>
                {item.data?.amount != null && (
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                    {formatCurrency(item.data.amount)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Today's Appointments (existing) */}
      <SectionHeader
        title="Today's Appointments"
        actionLabel="See All"
        onAction={() => router.push("/(app)/(tabs)/calendar" as never)}
      />
      {todayBookingsError && !todayBookings ? (
        <TouchableOpacity onPress={refreshFallbackTodayBookings} activeOpacity={0.7} style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 16 }}>
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>Failed to load appointments · Tap to retry</Text>
        </TouchableOpacity>
      ) : !todayBookings || todayBookings.length === 0 ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 32 }}>
          <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400] }}>
            No appointments today
          </Text>
        </View>
      ) : (
        <View style={[ isTablet ? { flexDirection: "row", flexWrap: "wrap" } : {} ]}>
          {todayBookings
            .slice(0, isTablet ? 6 : 4)
            .map((booking) => (
              <TouchableOpacity
                key={booking.id}
                style={[
                  { borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 },
                  isTablet ? { width: "48%", marginRight: 12, marginBottom: 12 } : { marginBottom: 8 },
                ]}
                onPress={() =>
                  openBookingSurface(booking)
                }
                accessibilityLabel={`Today: ${booking.customers?.full_name ?? "Walk-in"}`}
                accessibilityRole="button"
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Avatar name={booking.customers?.full_name ?? "Guest"} size="sm" />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                          {booking.customers?.full_name ?? "Walk-in"}
                        </Text>
                        <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                          {formatRelativeDate(booking.scheduled_at)}
                        </Text>
                      </View>
                    </View>
                    <View style={{ marginTop: 8 }}>
                      {booking.services?.slice(0, 2).map((s, i) => (
                        <Text key={i} style={{ fontSize: 12, color: Colors.gray[600] }} numberOfLines={1}>
                          {s.name ?? s.offering_name ?? "Service"}
                          {s.guest_name ? ` (${s.guest_name})` : ""} ({formatDuration(s.duration_minutes)})
                        </Text>
                      ))}
                    </View>
                    {booking.is_group_booking && booking.group_booking_ref && (
                      <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[500] }} numberOfLines={1}>
                        Group: {booking.group_booking_ref}
                      </Text>
                    )}
                    {booking.package_name ? (
                      <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[600] }} numberOfLines={1}>
                        Package: {booking.package_name}
                      </Text>
                    ) : null}
                    {(booking.products?.length ?? 0) > 0 ? (
                      <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[600] }} numberOfLines={1}>
                        {booking.products!.length} product{booking.products!.length === 1 ? "" : "s"}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Badge status={booking.status} />
                    <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                      {formatCurrency(booking.total_amount, booking.currency)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}

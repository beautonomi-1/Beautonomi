import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { InteractionManager, View, Text, TouchableOpacity, Platform, DeviceEventEmitter } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format, subDays, addDays } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { useProvider } from "@/providers/ProviderContext";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActiveLocationChip } from "@/components/reports/ActiveLocationChip";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ProviderDashboardExcellenceBanner } from "@/components/ProviderDashboardExcellenceBanner";
import { DashboardSetupCard } from "@/components/setup/DashboardSetupCard";
import { Skeleton, SkeletonDashboard, SkeletonList } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatCurrency,
  formatRelativeDate,
  formatDuration,
  formatPercentage,
  formatTimeAgo,
} from "@/lib/format";
import { trackDashboardView } from "@/lib/analytics";
import { navigateToMoreScreen } from "@/lib/provider-tab-navigation";
import { PROVIDER_DASHBOARD_REFRESH_EVENT } from "@/lib/provider-dashboard-events";
import { normalizeTopServicesPayload } from "@/lib/normalize-top-services";
import { getReportDateRange } from "@/lib/reportDateRanges";
import { newBookingScreenHref } from "@/lib/new-booking-nav-defaults";
import { getProviderActivityIcon } from "@/lib/provider-activity-icons";
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
  pending_payout_queue?: number;
  payout_hold_days?: number;
  has_negative_payout_balance?: boolean;
  balance_owed_to_platform?: number;
  pending_payments_amount: number;
  pending_payments_count?: number;
  completion_rate: number;
  no_show_rate: number;
  average_rating: number;
  total_reviews: number;
  appointments_today: number;
  appointments_this_week: number;
  appointments_this_month: number;
  service_earnings_total: number;
  booking_earnings_total?: number;
  product_order_earnings_total?: number;
  product_order_earnings_platform_total?: number;
  product_order_retail_total?: number;
  retail_sales_today?: number;
  retail_sales_this_week?: number;
  retail_sales_this_month?: number;
  retail_sales_count_today?: number;
  retail_sales_count_this_week?: number;
  retail_sales_count_this_month?: number;
  additional_charge_earnings_total?: number;
  other_earnings_total?: number;
  recognized_earnings_total?: number;
  tips_total?: number;
  travel_fees_total: number;
  gift_card_sales_total?: number;
  membership_sales_total?: number;
  refunds_total?: number;
  earnings_mix_time_basis?: string;
  metrics_time_basis?: string;
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
    is_distance_filter_enabled?: boolean;
  };
  dashboard_bundle_version?: number;
  bookings_truncated?: boolean;
  ledger_truncated?: boolean;
  insights?: {
    weekly_revenue: WeeklyRevenue[];
    top_services: TopService[];
    recent_activity: ActivityItem[];
    today_bookings: Booking[];
    upcoming_bookings: Booking[];
    basis?: {
      upcoming?: string;
      activity?: string | null;
      activity_window?: string | null;
    };
  } | null;
  booking_eligibility?: {
    can_accept_online_bookings: boolean;
    booking_limit_message: string | null;
  } | null;
  period_breakdown?: {
    today: DashboardPeriodSlice;
    this_week: DashboardPeriodSlice;
    this_month: DashboardPeriodSlice;
  } | null;
  period_comparison?: {
    today: DashboardPeriodComparison;
    this_week: DashboardPeriodComparison;
    this_month: DashboardPeriodComparison;
  } | null;
}

type DashboardPeriodChannelMix = {
  online: number;
  walk_in: number;
  provider: number;
};

type DashboardPeriodEarningsMix = {
  service_earnings: number;
  product_order_earnings: number;
  membership_earnings: number;
  additional_charge_earnings: number;
  other_earnings: number;
  tips: number;
  travel_fees: number;
  gift_card_sales: number;
  membership_sales: number;
  refunds: number;
  recognized_total: number;
};

type DashboardPeriodSlice = {
  revenue: number;
  appointments: number;
  retail_sales: number;
  retail_sales_count: number;
  earnings_mix: DashboardPeriodEarningsMix;
  channel_mix?: DashboardPeriodChannelMix;
  /**
   * True when earnings_mix carries all-time totals (legacy fallback for an API
   * that didn't send period_breakdown) rather than period-scoped values. The UI
   * must label the breakdown "all-time" so the numbers aren't read as the period.
   */
  earnings_mix_is_all_time?: boolean;
  booking_status: {
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    no_show: number;
    scheduled_total: number;
  };
  performance: {
    completion_rate: number;
    no_show_rate: number;
  };
};

type DashboardPeriodComparison = {
  revenue_growth_pct: number;
  appointments_growth_pct: number;
  prior_revenue: number;
  prior_appointments: number;
  prior_label: string;
};

type PeriodChip = "today" | "week" | "month";
type PeriodApiKey = "today" | "this_week" | "this_month";

function periodApiKey(chip: PeriodChip): PeriodApiKey {
  if (chip === "week") return "this_week";
  if (chip === "month") return "this_month";
  return "today";
}

function legacyPeriodSlice(m: DashboardMetrics, chip: PeriodChip): DashboardPeriodSlice {
  const revenue =
    chip === "today"
      ? m.revenue_today ?? 0
      : chip === "week"
        ? m.revenue_this_week ?? 0
        : m.revenue_this_month ?? 0;
  const appointments =
    chip === "today"
      ? m.appointments_today ?? 0
      : chip === "week"
        ? m.appointments_this_week ?? 0
        : m.appointments_this_month ?? 0;
  const retail_sales =
    chip === "today"
      ? m.retail_sales_today ?? 0
      : chip === "week"
        ? m.retail_sales_this_week ?? 0
        : m.retail_sales_this_month ?? 0;
  const retail_sales_count =
    chip === "today"
      ? m.retail_sales_count_today ?? 0
      : chip === "week"
        ? m.retail_sales_count_this_week ?? 0
        : m.retail_sales_count_this_month ?? 0;

  return {
    revenue,
    appointments,
    retail_sales,
    retail_sales_count,
    // These *_total fields are lifetime aggregates, not period-scoped, so flag
    // the mix as all-time and let the UI relabel it (avoids mislabeling).
    earnings_mix_is_all_time: true,
    earnings_mix: {
      service_earnings: m.service_earnings_total ?? 0,
      product_order_earnings:
        m.product_order_earnings_platform_total ?? m.product_order_earnings_total ?? 0,
      membership_earnings: 0,
      additional_charge_earnings: m.additional_charge_earnings_total ?? 0,
      other_earnings: m.other_earnings_total ?? 0,
      tips: m.tips_total ?? 0,
      travel_fees: m.travel_fees_total ?? 0,
      gift_card_sales: m.gift_card_sales_total ?? 0,
      membership_sales: m.membership_sales_total ?? 0,
      refunds: m.refunds_total ?? 0,
      recognized_total: m.recognized_earnings_total ?? revenue,
    },
    booking_status: {
      pending: m.pending_bookings ?? 0,
      confirmed: m.confirmed_bookings ?? 0,
      completed: m.completed_bookings ?? 0,
      cancelled: m.cancelled_bookings ?? 0,
      no_show: m.no_show_bookings ?? 0,
      scheduled_total: appointments,
    },
    performance: {
      completion_rate: m.completion_rate ?? 0,
      no_show_rate: m.no_show_rate ?? 0,
    },
  };
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
    product_order_id?: string;
    client_name?: string;
    amount?: number;
  };
}

/** GET /api/provider/activity — structured payload (legacy clients received a bare array). */
interface ActivityFeedApiPayload {
  activities: ActivityItem[];
  basis?: Record<string, string>;
  timezone?: string;
  window?: { fromYmd: string; toYmd: string };
}

function unwrapActivityFeedPayload(
  data: ActivityFeedApiPayload | ActivityItem[] | null | undefined,
): ActivityItem[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  return data.activities ?? [];
}

const DATE_RANGE_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
];

function WeeklyRevenueChart({ data, todayYmd }: { data: WeeklyRevenue[]; todayYmd?: string }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Prefer provider-business `today` from parent (dashboard passes it). Fallback: device local Y/M/D.
  const now = new Date();
  const todayStr =
    todayYmd ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

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
        navigateToMoreScreen(router, "/(app)/(tabs)/more/group-bookings", {
          open_group_id: booking.group_booking_id,
          from: "dashboard",
        });
        return;
      }
      router.push(`/(app)/(tabs)/bookings/${booking.id}` as never);
    },
    [router],
  );
  const [isFocused, setIsFocused] = useState(true);
  const { provider, selectedLocationId } = useProvider();
  const unifiedPosEnabled = useFeatureFlag("provider.unified_pos_checkout");
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
    `/api/provider/dashboard${locQFirst}`,
    {
      enabled: isFocused,
      timeoutMs: 15000,
      staleTimeMs: 0,
    },
  );

  const {
    data: insightsMetrics,
    loading: insightsFetchLoading,
    refresh: refreshInsights,
  } = useApi<DashboardMetrics>(
    `/api/provider/dashboard${locQFirst}${locQFirst ? "&" : "?"}include=insights`,
    {
      enabled: isFocused && secondaryEnabled && metrics !== null,
      timeoutMs: 15000,
      staleTimeMs: 60_000,
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

  const dashboardView = useMemo(() => {
    if (!metrics) return null;
    if (!insightsMetrics) return metrics;
    return {
      ...metrics,
      insights: insightsMetrics.insights ?? metrics.insights,
      booking_eligibility: insightsMetrics.booking_eligibility ?? metrics.booking_eligibility,
    };
  }, [metrics, insightsMetrics]);

  const hasBundledInsights = Boolean(dashboardView?.insights);
  const hasBundledBookingEligibility = Boolean(dashboardView?.booking_eligibility);
  const insightsPending = secondaryEnabled && insightsFetchLoading && !hasBundledInsights;

  /** Align dashboard date windows with provider business timezone (API expands civil dates in that zone). */
  const { today, weekStart, upcomingEnd } = useMemo(() => {
    const tz = provider?.timezone?.trim() || null;
    if (tz) {
      try {
        const zNow = toZonedTime(new Date(), tz);
        return {
          today: formatInTimeZone(new Date(), tz, "yyyy-MM-dd"),
          weekStart: formatInTimeZone(subDays(zNow, 6), tz, "yyyy-MM-dd"),
          upcomingEnd: formatInTimeZone(addDays(zNow, 6), tz, "yyyy-MM-dd"),
        };
      } catch {
        /* fall through */
      }
    }
    const n = new Date();
    return {
      today: format(n, "yyyy-MM-dd"),
      weekStart: format(subDays(n, 6), "yyyy-MM-dd"),
      upcomingEnd: format(addDays(n, 6), "yyyy-MM-dd"),
    };
  }, [provider?.timezone]);

  const {
    data: fallbackUpcomingBookings,
    error: fallbackUpcomingError,
    refresh: refreshFallbackUpcoming,
  } = useApi<Booking[]>(
    `/api/provider/bookings?status=pending,pending_payment,booked,started,in_progress,waiting,checked_in&start_date=${today}&end_date=${upcomingEnd}&from_now=1&limit=20&sort=scheduled_at${locQ}`,
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
  const topServicesRange = useMemo(() => {
    const key = dateRange === "week" ? "week" : dateRange === "month" ? "month" : "today";
    return getReportDateRange(key, { timezone: provider?.timezone });
  }, [dateRange, provider?.timezone]);

  const {
    data: fallbackTopServices,
    error: fallbackTopServicesError,
    refresh: refreshFallbackTopServices,
  } = useApi<unknown>(
    `/api/provider/reports/top-services?limit=5&from=${topServicesRange.from}&to=${topServicesRange.to}${locQ}`,
    {
      enabled: isFocused && secondaryEnabled && metrics !== null,
      staleTimeMs: 60_000,
    },
  );
  const {
    data: fallbackActivityPayload,
    error: fallbackActivityError,
    refresh: refreshFallbackActivity,
  } = useApi<ActivityFeedApiPayload | ActivityItem[]>(
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

  const upcomingBookingsRaw =
    dashboardView?.insights?.upcoming_bookings ?? fallbackUpcomingBookings ?? null;
  const upcomingBookings = useMemo(() => {
    if (!upcomingBookingsRaw?.length) return upcomingBookingsRaw;
    const nowMs = Date.now();
    return upcomingBookingsRaw.filter((b) => {
      const when = b.scheduled_at ? new Date(b.scheduled_at).getTime() : NaN;
      return Number.isFinite(when) && when >= nowMs;
    });
  }, [upcomingBookingsRaw]);
  const upcomingError = hasBundledInsights ? null : fallbackUpcomingError;

  const weeklyRevenue = dashboardView?.insights?.weekly_revenue ?? fallbackWeeklyRevenue ?? null;
  const topServices =
    normalizeTopServicesPayload(dashboardView?.insights?.top_services ?? fallbackTopServices) ?? null;
  const recentActivity =
    dashboardView?.insights?.recent_activity ?? unwrapActivityFeedPayload(fallbackActivityPayload);
  const bookingEligibility = dashboardView?.booking_eligibility ?? fallbackBookingEligibility ?? null;
  const topServicesError = hasBundledInsights ? null : fallbackTopServicesError;
  const activityError = hasBundledInsights ? null : fallbackActivityError;

  const refreshRealtimeDashboardData = useCallback(() => {
    const tasks = [refreshMetrics(), refreshInsights()];
    if (!hasBundledInsights) {
      tasks.push(refreshFallbackUpcoming());
      if (secondaryEnabled) {
        tasks.push(refreshFallbackWeekly(), refreshFallbackActivity());
      }
    }
    if (secondaryEnabled && !hasBundledInsights) {
      tasks.push(refreshFallbackTopServices());
    }
    if (!hasBundledBookingEligibility) {
      tasks.push(refreshFallbackBookingEligibility());
    }
    void Promise.all(tasks);
  }, [
    refreshMetrics,
    refreshInsights,
    hasBundledInsights,
    hasBundledBookingEligibility,
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
      const tasks = [refreshMetrics(), refreshInsights()];
      if (!hasBundledInsights) {
        tasks.push(refreshFallbackUpcoming());
        if (secondaryEnabled) {
          tasks.push(refreshFallbackWeekly(), refreshFallbackActivity());
        }
      }
      if (secondaryEnabled && !hasBundledInsights) {
        tasks.push(refreshFallbackTopServices());
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
    refreshInsights,
    hasBundledInsights,
    hasBundledBookingEligibility,
    refreshFallbackUpcoming,
    refreshFallbackWeekly,
    refreshFallbackTopServices,
    refreshFallbackActivity,
    refreshFallbackBookingEligibility,
    secondaryEnabled,
  ]);

  const dashboardRefreshRef = useRef(refreshRealtimeDashboardData);
  useEffect(() => { dashboardRefreshRef.current = refreshRealtimeDashboardData; }, [refreshRealtimeDashboardData]);

  useEffect(() => {
    if (!isFocused || !provider?.id) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        dashboardRefreshRef.current();
      }, 500);
    };

    try {
      const topic = nextRealtimeTopic(`dashboard-booking-updates:${provider.id}`);
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "bookings",
            filter: `provider_id=eq.${provider.id}`,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "product_orders",
            filter: `provider_id=eq.${provider.id}`,
          },
          scheduleRefresh,
        )
        .subscribe();
    } catch {
      // Non-fatal: dashboard still refreshes on focus / pull.
    }

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [isFocused, provider?.id]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROVIDER_DASHBOARD_REFRESH_EVENT, () => {
      void refreshRealtimeDashboardData();
    });
    return () => sub.remove();
  }, [refreshRealtimeDashboardData]);

  const m = metrics;
  const statColumns = isTablet ? (columns >= 3 ? 4 : 2) : 2;
  /** Inline dashboard figures: keep compact on narrow phones (four-up row). */
  const dashMetricLg = isTablet ? 22 : 17;
  const dashMetricMd = isTablet ? 19 : 15;

  const periodKey = periodApiKey(dateRange as PeriodChip);

  const activePeriod = useMemo(() => {
    if (!m) return null;
    return m.period_breakdown?.[periodKey] ?? legacyPeriodSlice(m, dateRange as PeriodChip);
  }, [m, periodKey, dateRange]);

  const activeComparison = useMemo(() => {
    if (!m) return null;
    return m.period_comparison?.[periodKey] ?? null;
  }, [m, periodKey]);

  const displayRevenue = formatCurrency(activePeriod?.revenue ?? 0);
  const displayAppointments = activePeriod?.appointments ?? 0;
  const displayRetailSales = formatCurrency(activePeriod?.retail_sales ?? 0);
  const earningsMix = activePeriod?.earnings_mix;
  const bookingStatus = activePeriod?.booking_status;
  const periodPerformance = activePeriod?.performance;

  const revenueTrend = activeComparison
    ? { value: activeComparison.revenue_growth_pct, label: `vs ${activeComparison.prior_label}` }
    : undefined;
  const appointmentsTrend = activeComparison
    ? { value: activeComparison.appointments_growth_pct, label: `vs ${activeComparison.prior_label}` }
    : undefined;

  const upcomingBasisFootnote =
    dashboardView?.insights?.basis?.upcoming ??
    "Includes confirmed and in-progress appointments in your business timezone.";

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

  /** Platform-held payout balance (not filtered by dashboard date range). */
  const payoutBalanceCard = useMemo(() => {
    if (!m) {
      return {
        title: "Available to withdraw",
        value: formatCurrency(0),
        subtitle: "Platform-held balance",
      };
    }
    const locationNote = selectedLocationId ? "All locations · " : "";
    if (m.has_negative_payout_balance) {
      return {
        title: "Balance owed",
        value: formatCurrency(m.balance_owed_to_platform ?? 0),
        subtitle: `${locationNote}Owed to platform`,
      };
    }
    const pendingQueue = Math.max(0, m.pending_payout_queue ?? 0);
    const holdDays = Math.max(0, m.payout_hold_days ?? 0);
    let subtitle = `${locationNote}Platform-held · not date-filtered`;
    if (pendingQueue > 0.009) {
      subtitle = `${locationNote}${formatCurrency(pendingQueue)} in payout queue`;
    } else if (holdDays > 0) {
      subtitle = `${locationNote}${holdDays}-day hold on new earnings`;
    }
    return {
      title: "Available to withdraw",
      value: formatCurrency(m.available_balance ?? 0),
      subtitle,
    };
  }, [m, selectedLocationId]);

  const chartData: WeeklyRevenue[] = useMemo(() => {
    if (weeklyRevenue) return weeklyRevenue;
    const tz = provider?.timezone?.trim() || null;
    if (tz) {
      try {
        const zNow = toZonedTime(new Date(), tz);
        return Array.from({ length: 7 }, (_, i) => ({
          day: formatInTimeZone(subDays(zNow, 6 - i), tz, "yyyy-MM-dd"),
          revenue: 0,
        }));
      } catch {
        /* fall through */
      }
    }
    return Array.from({ length: 7 }, (_, i) => ({
      day: format(subDays(new Date(), 6 - i), "yyyy-MM-dd"),
      revenue: 0,
    }));
  }, [weeklyRevenue, provider?.timezone]);
  const insightsLoading = !secondaryEnabled || insightsPending;

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
      <ScreenHeader title="Dashboard" subtitle={`${displayAppointments} appointments ${periodLabel.toLowerCase()}`} />
      <ActiveLocationChip />

      {provider?.status === "pending_approval" && (
        <View
          style={{
            backgroundColor: "#fffbeb",
            borderColor: "#fde68a",
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            marginBottom: 16,
            gap: 8,
          }}
          accessibilityRole="text"
          accessibilityLabel="Your account is under review"
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <Ionicons name="hourglass-outline" size={20} color="#d97706" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#92400e" }}>
                Your account is under review
              </Text>
              <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: "#b45309" }}>
                We&apos;ll notify you once your profile is approved and visible to customers. In the meantime, use
                the time to complete your profile — a strong profile gets approved faster.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => router.push("/(app)/(tabs)/more/settings/setup-status" as never)}
            style={{
              alignSelf: "flex-start",
              marginLeft: 30,
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: 20,
              backgroundColor: "#fef3c7",
              borderWidth: 1,
              borderColor: "#fcd34d",
            }}
            accessibilityRole="button"
            accessibilityLabel="Complete your profile to speed up approval"
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400e" }}>
              Complete your profile →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <DashboardSetupCard />

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
          accessibilityLabel={`Rating ${m.average_rating?.toFixed(1) ?? "0.0"}, ${m.total_reviews ?? 0} reviews. Level: ${gam?.current_badge?.name ?? "Getting started"}. ${m.provider_profile?.supports_house_calls ? "At-home" : ""} ${m.provider_profile?.supports_salon ? "At-salon" : ""}. ${m.provider_profile?.supports_house_calls && m.provider_profile?.is_distance_filter_enabled === true && m.provider_profile?.max_service_distance_km ? `Within ${m.provider_profile.max_service_distance_km} km` : ""}`}
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
              m.provider_profile?.is_distance_filter_enabled === true &&
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
                timeZone: provider?.timezone ?? null,
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
                timeZone: provider?.timezone ?? null,
                ...(selectedLocationId ? { locationId: selectedLocationId } : {}),
              }) as never,
            );
          }}
          activeOpacity={0.7}
          accessibilityLabel="Create a walk-in appointment"
          accessibilityRole="button"
        >
          <Ionicons name="walk-outline" size={18} color="#111" />
          <Text style={{ marginLeft: 8, fontWeight: "600", color: Colors.gray[900] }}>Walk-in appt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigateToMoreScreen(router, "/(app)/(tabs)/more/walk-in-sale", { from: "dashboard" });
          }}
          activeOpacity={0.7}
          accessibilityLabel="Start a product sale"
          accessibilityRole="button"
        >
          <Ionicons name="pricetag-outline" size={18} color="#111" />
          <Text style={{ marginLeft: 8, fontWeight: "600", color: Colors.gray[900] }}>Retail</Text>
        </TouchableOpacity>
      </View>

      {unifiedPosEnabled ? (
      <TouchableOpacity
        style={{
          minHeight: 48,
          marginBottom: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.primaryRing,
          backgroundColor: Colors.primarySoft,
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/(app)/(tabs)/sales" as never);
        }}
        activeOpacity={0.7}
        accessibilityLabel="Open sell and point of sale checkout"
        accessibilityRole="button"
      >
        <Ionicons name="card-outline" size={18} color={Colors.primary} />
        <Text style={{ marginLeft: 8, fontWeight: "700", color: Colors.primary }}>Sell / POS</Text>
      </TouchableOpacity>
      ) : null}

      {/* Date Range Selector */}
      <View style={{ marginBottom: 8 }}>
        <FilterChipGroup
          options={DATE_RANGE_OPTIONS}
          selected={dateRange}
          onSelect={(val) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setDateRange(val);
          }}
        />
      </View>

      <SectionHeader title={`This ${periodLabel}`} />
      <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12, marginTop: -4 }}>
        Revenue earned is ledger-based (platform-settled payments). Cash and Yoco service payments you collected are not included. Earnings use the day you were paid. Appointments use the day they are scheduled.
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <View style={{ width: isTablet && columns >= 3 ? "31%" : "48.5%", marginRight: 12, marginBottom: 12 }}>
          <StatCard
            title="Revenue earned"
            value={displayRevenue}
            subtitle="Ledger by payment date · excludes cash/Yoco service payments"
            icon="wallet-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            trend={revenueTrend}
            compact={!isTablet}
          />
        </View>
        <View style={{ width: isTablet && columns >= 3 ? "31%" : "48.5%", marginRight: 12, marginBottom: 12 }}>
          <StatCard
            title="Appointments"
            value={String(displayAppointments)}
            subtitle="Scheduled in period"
            icon="calendar-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            trend={appointmentsTrend}
            compact={!isTablet}
          />
        </View>
        <View style={{ width: isTablet && columns >= 3 ? "31%" : "48.5%", marginBottom: 12 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Retail sales, ${displayRetailSales}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigateToMoreScreen(router, "/(app)/(tabs)/more/walk-in-sale", { from: "dashboard" });
            }}
          >
            <StatCard
              title="Retail sales"
              value={displayRetailSales}
              subtitle="In-person sales you collected"
              icon="pricetag-outline"
              iconColor="#059669"
              iconBg="bg-emerald-50"
              compact={!isTablet}
            />
          </TouchableOpacity>
        </View>
      </View>

      <SectionHeader title="How you earned it" />
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 14, marginBottom: 12 }}>
        {activePeriod?.earnings_mix_is_all_time ? (
          <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 10 }}>
            Showing all-time totals (a per-period breakdown is not available for this view).
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Services</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.service_earnings ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Online product orders</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.product_order_earnings ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Additional charges</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.additional_charge_earnings ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Tips</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.tips ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Travel fees</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.travel_fees ?? 0)}
          </Text>
        </View>
        {(earningsMix?.gift_card_sales ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Gift card sales</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              {formatCurrency(earningsMix?.gift_card_sales ?? 0)}
            </Text>
          </View>
        ) : null}
        {(earningsMix?.membership_sales ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Membership sales</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              {formatCurrency(earningsMix?.membership_sales ?? 0)}
            </Text>
          </View>
        ) : null}
        {(earningsMix?.refunds ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Refunds</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              -{formatCurrency(earningsMix?.refunds ?? 0)}
            </Text>
          </View>
        ) : null}
        {(earningsMix?.other_earnings ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Other earnings</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              {formatCurrency(earningsMix?.other_earnings ?? 0)}
            </Text>
          </View>
        ) : null}
        <View style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.gray[800] }}>
            Total earned ({activePeriod?.earnings_mix_is_all_time ? "all-time" : periodLabel.toLowerCase()})
          </Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.recognized_total ?? activePeriod?.revenue ?? 0)}
          </Text>
        </View>
      </View>

      <SectionHeader title="Earnings trend (last 7 days)" />
      {insightsLoading ? (
        <Card variant="default" padding="md">
          <Skeleton height={160} borderRadius={12} />
        </Card>
      ) : (
        <WeeklyRevenueChart data={chartData} todayYmd={today} />
      )}

      <SectionHeader
        title={`Booking status (${periodLabel.toLowerCase()})`}
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
          accessibilityLabel={`${bookingStatus?.pending ?? 0} pending`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#d97706" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.pending ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Pending</Text>
        </View>
        <View
          style={{ flex: 1, marginRight: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={`${bookingStatus?.confirmed ?? 0} confirmed`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#4f46e5" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.confirmed ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Confirmed</Text>
        </View>
        <View
          style={{ flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={`${bookingStatus?.completed ?? 0} completed`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#16a34a" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.completed ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Completed</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", marginTop: 8 }}>
        <View
          style={{ flex: 1, marginRight: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={`${bookingStatus?.cancelled ?? 0} cancelled`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#6b7280" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.cancelled ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Cancelled</Text>
        </View>
        <View
          style={{ flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={`${bookingStatus?.no_show ?? 0} no show`}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#dc2626" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.no_show ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>No-show</Text>
        </View>
      </View>

      {(activePeriod?.channel_mix?.online ?? 0) +
        (activePeriod?.channel_mix?.walk_in ?? 0) +
        (activePeriod?.channel_mix?.provider ?? 0) >
        0 ? (
        <>
          <SectionHeader title={`Appointments by channel (${periodLabel.toLowerCase()})`} />
          <Text style={{ marginTop: -6, marginBottom: 8, fontSize: 11, color: Colors.gray[500] }}>
            Appointment counts — not revenue. Channel earnings are in Reports → Bookings.
          </Text>
          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <View
              style={{
                flex: 1,
                marginRight: 8,
                alignItems: "center",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[100],
                backgroundColor: Colors.white,
                padding: 12,
              }}
              accessibilityRole="text"
              accessibilityLabel={`${activePeriod?.channel_mix?.online ?? 0} online bookings ${periodLabel.toLowerCase()}`}
            >
              <Text style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#3b82f6" }}>
                {activePeriod?.channel_mix?.online ?? 0}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Online</Text>
            </View>
            <View
              style={{
                flex: 1,
                marginRight: 8,
                alignItems: "center",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[100],
                backgroundColor: Colors.white,
                padding: 12,
              }}
              accessibilityRole="text"
              accessibilityLabel={`${activePeriod?.channel_mix?.walk_in ?? 0} walk-in bookings ${periodLabel.toLowerCase()}`}
            >
              <Text style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#d97706" }}>
                {activePeriod?.channel_mix?.walk_in ?? 0}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Walk-in</Text>
            </View>
            <View
              style={{
                flex: 1,
                alignItems: "center",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[100],
                backgroundColor: Colors.white,
                padding: 12,
              }}
              accessibilityRole="text"
              accessibilityLabel={`${activePeriod?.channel_mix?.provider ?? 0} provider-created bookings ${periodLabel.toLowerCase()}`}
            >
              <Text style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#8b5cf6" }}>
                {activePeriod?.channel_mix?.provider ?? 0}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Provider</Text>
            </View>
          </View>
        </>
      ) : null}

      <SectionHeader title={`Top services (${periodLabel.toLowerCase()})`} />
      <Text style={{ marginTop: -6, marginBottom: 8, fontSize: 11, color: Colors.gray[500] }}>
        Completed appointments scheduled {topServicesRange.from} – {topServicesRange.to}.
      </Text>
      {insightsLoading ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}>
          <SkeletonList rows={3} />
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

      <SectionHeader title={`Performance (${periodLabel.toLowerCase()})`} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <View
          style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          accessibilityLabel={`Completion rate: ${formatPercentage(periodPerformance?.completion_rate ?? 0)}`}
        >
          <Text
            style={{ fontSize: dashMetricMd, fontWeight: "700", color: Colors.gray[900] }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.75}
          >
            {formatPercentage(periodPerformance?.completion_rate ?? 0)}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Completion rate</Text>
        </View>
        <View
          style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          accessibilityLabel={`No show rate: ${formatPercentage(periodPerformance?.no_show_rate ?? 0)}`}
        >
          <Text
            style={{ fontSize: dashMetricMd, fontWeight: "700", color: Colors.gray[900] }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.75}
          >
            {formatPercentage(periodPerformance?.no_show_rate ?? 0)}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>No-show rate</Text>
        </View>
      </View>
      {(m?.bookings_truncated || m?.ledger_truncated) && (
        <Text style={{ marginTop: 8, fontSize: 11, color: Colors.gray[500], paddingHorizontal: 4 }}>
          {m?.bookings_truncated && m?.ledger_truncated
            ? "Some booking and ledger totals may be incomplete for very high-volume accounts."
            : m?.bookings_truncated
              ? "Booking status counts may be incomplete for very high-volume accounts."
              : "Period earnings may be incomplete for very high-volume accounts."}
        </Text>
      )}

      <SectionHeader title="Balances now" />
      <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12, marginTop: -4 }}>
        Current balances are not filtered by the period above.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <View style={{ width: "48.5%", marginRight: 12, marginBottom: 12 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${payoutBalanceCard.title}, ${payoutBalanceCard.value}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/payouts" as never);
            }}
          >
            <StatCard
              title={payoutBalanceCard.title}
              value={payoutBalanceCard.value}
              subtitle={payoutBalanceCard.subtitle}
              icon="cash-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
              compact={!isTablet}
            />
          </TouchableOpacity>
        </View>
        <View style={{ width: "48.5%", marginBottom: 12 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Unpaid bookings, ${formatCurrency(m?.pending_payments_amount ?? 0)}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/bookings?status=pending_payment" as never);
            }}
          >
            <StatCard
              title="Unpaid bookings"
              value={formatCurrency(m?.pending_payments_amount ?? 0)}
              subtitle={
                (m?.pending_payments_count ?? 0) > 0
                  ? `${m?.pending_payments_count} booking${(m?.pending_payments_count ?? 0) === 1 ? "" : "s"} awaiting payment`
                  : "Nothing outstanding"
              }
              icon="time-outline"
              iconColor="#f97316"
              iconBg="bg-orange-50"
              compact={!isTablet}
            />
          </TouchableOpacity>
        </View>
      </View>

      <SectionHeader title="Your standing" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <TouchableOpacity
          style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          activeOpacity={0.8}
          onPress={() => router.push("/(app)/(tabs)/more/reviews" as never)}
          accessibilityLabel={`Rating ${m?.average_rating?.toFixed(1) ?? "0.0"} from ${m?.total_reviews ?? 0} reviews`}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="star" size={18} color="#f59e0b" />
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
        </TouchableOpacity>
      </View>

      <SectionHeader
        title="Rewards & achievements"
        actionLabel="View All"
        onAction={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(app)/(tabs)/more/rewards-hub" as never);
        }}
      />
      <TouchableOpacity
        style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.primaryRing, backgroundColor: Colors.primaryLight, padding: 16 }}
        onPress={() => router.push("/(app)/(tabs)/more/rewards-hub" as never)}
        activeOpacity={0.7}
        accessibilityLabel={`Rewards: ${gam?.total_points ?? 0} points`}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: Colors.primaryLight }}>
            <Ionicons name="trophy" size={24} color={Colors.primary} />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>
              {gam?.current_badge?.name ?? "Getting Started"}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
              {(gam?.total_points ?? 0).toLocaleString()} points earned
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
        </View>
        {nextBadge && (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: Colors.gray[700] }}>
                Next: {nextBadge.badge.name}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.primary }}>
                {nextBadge.progress_percentage}%
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 9999, backgroundColor: Colors.primaryLight, overflow: "hidden" }}>
              <View style={{ height: "100%", borderRadius: 9999, backgroundColor: Colors.primary, width: `${nextBadge.progress_percentage}%` }} />
            </View>
            <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[600] }}>
              {nextBadge.points_needed.toLocaleString()} pts to level up
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Upcoming Appointments (next 7 days) */}
      <SectionHeader
        title="Upcoming (Next 7 Days)"
        actionLabel="See All"
        onAction={() => router.push("/(app)/(tabs)/bookings" as never)}
      />
      {upcomingError && !upcomingBookings ? (
        <TouchableOpacity onPress={refreshFallbackUpcoming} activeOpacity={0.7} style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 16 }}>
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>Failed to load · Tap to retry</Text>
        </TouchableOpacity>
      ) : !upcomingBookings || upcomingBookings.length === 0 ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 32, paddingHorizontal: 16 }}>
          <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400], textAlign: "center" }}>
            No upcoming appointments
          </Text>
          <Text style={{ marginTop: 6, fontSize: 11, color: Colors.gray[400], textAlign: "center" }}>
            {upcomingBasisFootnote}
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
                  {booking.is_group_booking ? (
                    <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center" }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          borderRadius: 999,
                          backgroundColor: "#eef2ff",
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Ionicons name="people-outline" size={12} color="#4338ca" style={{ marginRight: 4 }} />
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#4338ca" }}>
                          GRP{booking.group_booking_ref ? ` · ${booking.group_booking_ref}` : ""}
                        </Text>
                      </View>
                    </View>
                  ) : null}
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
      <SectionHeader
        title="Recent activity"
        actionLabel="View all"
        onAction={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(app)/(tabs)/more/activity" as never);
        }}
      />
      <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12, marginTop: -4 }}>
        {dashboardView?.insights?.basis?.activity_window
          ? `Last 14 days (${dashboardView.insights.basis.activity_window}) · not filtered by the period above.`
          : "Latest updates across bookings, payments, and reviews — not filtered by the period above."}
      </Text>
      {insightsLoading ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}>
          <SkeletonList rows={4} />
        </View>
      ) : activityError && !hasBundledInsights && fallbackActivityPayload == null ? (
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
            const iconInfo = getProviderActivityIcon(item.type);
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
                  } else if (item.data?.product_order_id) {
                    router.push(
                      `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(item.data.product_order_id)}` as never,
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

      <View style={{ height: 32 }} />
    </ScreenContainer>
  );
}

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { InteractionManager, View, Text, TouchableOpacity, Platform, DeviceEventEmitter } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format, subDays, addDays } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { useApi, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
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
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

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
  unrecognized_payments_today?: number;
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

function WeeklyRevenueChart({ data, todayYmd }: { data: WeeklyRevenue[]; todayYmd?: string }) {
  const { t } = useTranslation();
  const db = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.dashboard.${key}`, opts) as string;
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const SHORT_DAYS = [db("daySun"), db("dayMon"), db("dayTue"), db("dayWed"), db("dayThu"), db("dayFri"), db("daySat")];
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
          {db("sevenDayTotal")}
        </Text>
        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
          {formatCurrency(totalRevenue)}
        </Text>
      </View>

      <View
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 120 }}
        accessibilityLabel={db("weeklyChartA11y")}
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
  const { t } = useTranslation();
  const db = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.dashboard.${key}`, opts) as string,
    [t],
  );
  const dateRangeOptions = useMemo(
    () => [
      { label: db("dateRangeToday"), value: "today" },
      { label: db("dateRangeWeek"), value: "week" },
      { label: db("dateRangeMonth"), value: "month" },
    ],
    [db],
  );
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
      timeoutMs: MONEY_SURFACE_TIMEOUT_MS,
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
      timeoutMs: MONEY_SURFACE_TIMEOUT_MS,
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
    loading: fallbackUpcomingLoading,
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

  /**
   * Period-scoped top services. This is the primary source, not a fallback: the
   * dashboard insights bundle always aggregates a fixed 29-day window, which does
   * not match the Today / This week / This month chip the heading advertises.
   */
  const {
    data: periodTopServicesPayload,
    loading: periodTopServicesLoading,
    error: periodTopServicesError,
    errorCode: periodTopServicesErrorCode,
    refresh: refreshPeriodTopServices,
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
  /**
   * Without this the section renders "No upcoming appointments" while the insights
   * bundle is still in flight — indistinguishable from an genuinely empty week.
   */
  const upcomingLoading =
    upcomingBookings == null && (insightsPending || fallbackUpcomingLoading);
  const refreshUpcoming = useCallback(
    () => (hasBundledInsights ? refreshInsights() : refreshFallbackUpcoming()),
    [hasBundledInsights, refreshInsights, refreshFallbackUpcoming],
  );

  const weeklyRevenue = dashboardView?.insights?.weekly_revenue ?? fallbackWeeklyRevenue ?? null;
  const periodTopServices = normalizeTopServicesPayload(periodTopServicesPayload);
  const bundledTopServices = normalizeTopServicesPayload(dashboardView?.insights?.top_services);
  /** The bundle's fixed 29-day figures stand in only when the period request fails. */
  const topServices = periodTopServices ?? bundledTopServices ?? null;
  const topServicesArePeriodScoped = periodTopServices != null;
  const topServicesError =
    periodTopServices == null &&
    periodTopServicesErrorCode !== "SUBSCRIPTION_REQUIRED"
      ? periodTopServicesError
      : null;
  const topServicesLoading = periodTopServicesLoading && topServices == null;
  const recentActivity =
    dashboardView?.insights?.recent_activity ?? unwrapActivityFeedPayload(fallbackActivityPayload);
  const bookingEligibility = dashboardView?.booking_eligibility ?? fallbackBookingEligibility ?? null;
  const activityError = hasBundledInsights ? null : fallbackActivityError;

  const refreshRealtimeDashboardData = useCallback(() => {
    const tasks = [refreshMetrics(), refreshInsights()];
    if (!hasBundledInsights) {
      tasks.push(refreshFallbackUpcoming());
      if (secondaryEnabled) {
        tasks.push(refreshFallbackWeekly(), refreshFallbackActivity());
      }
    }
    if (secondaryEnabled) {
      tasks.push(refreshPeriodTopServices());
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
    refreshPeriodTopServices,
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
      if (secondaryEnabled) {
        tasks.push(refreshPeriodTopServices());
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
    refreshPeriodTopServices,
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
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "finance_transactions",
            filter: `provider_id=eq.${provider.id}`,
          },
          scheduleRefresh,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "additional_charges",
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
    ? { value: activeComparison.revenue_growth_pct, label: db("vsPrior", { label: activeComparison.prior_label }) }
    : undefined;
  const appointmentsTrend = activeComparison
    ? { value: activeComparison.appointments_growth_pct, label: db("vsPrior", { label: activeComparison.prior_label }) }
    : undefined;

  const upcomingBasisFootnote =
    dashboardView?.insights?.basis?.upcoming ??
    db("upcomingBasisDefault");

  const periodLabel = useMemo(() => {
    switch (dateRange) {
      case "week":
        return db("dateRangeWeek");
      case "month":
        return db("dateRangeMonth");
      default:
        return db("dateRangeToday");
    }
  }, [dateRange, db]);

  const periodLabelLower = useMemo(() => {
    switch (dateRange) {
      case "week":
        return db("periodWeekLower");
      case "month":
        return db("periodMonthLower");
      default:
        return db("periodTodayLower");
    }
  }, [dateRange, db]);

  /** Platform-held payout balance (not filtered by dashboard date range). */
  const payoutBalanceCard = useMemo(() => {
    if (!m) {
      return {
        title: db("availableToWithdraw"),
        value: formatCurrency(0),
        subtitle: db("platformHeldBalance"),
      };
    }
    const locationNote = selectedLocationId ? db("allLocationsPrefix") : "";
    if (m.has_negative_payout_balance) {
      return {
        title: db("balanceOwed"),
        value: formatCurrency(m.balance_owed_to_platform ?? 0),
        subtitle: db("owedToPlatform", { prefix: locationNote }),
      };
    }
    const pendingQueue = Math.max(0, m.pending_payout_queue ?? 0);
    const holdDays = Math.max(0, m.payout_hold_days ?? 0);
    let subtitle = db("platformHeldNotFiltered", { prefix: locationNote });
    if (pendingQueue > 0.009) {
      subtitle = db("payoutQueue", { prefix: locationNote, amount: formatCurrency(pendingQueue) });
    } else if (holdDays > 0) {
      subtitle = db("holdOnEarnings", { prefix: locationNote, days: holdDays });
    }
    return {
      title: db("availableToWithdraw"),
      value: formatCurrency(m.available_balance ?? 0),
      subtitle,
    };
  }, [m, selectedLocationId, db]);

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
          message={db("timeoutMessage")}
          onRetry={refreshMetrics}
          retryLabel={db("retry")}
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
      <ScreenHeader title={db("title")} subtitle={db("subtitle", { count: displayAppointments, period: periodLabelLower })} />
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
          accessibilityLabel={db("underReviewA11y")}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <Ionicons name="hourglass-outline" size={20} color="#d97706" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#92400e" }}>
                {db("underReviewTitle")}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: "#b45309" }}>
                {db("underReviewBody")}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => router.push("/(app)/(tabs)/more/settings/setup-status" as never)}
            style={{
              alignSelf: "flex-start",
              marginStart: 30,
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: 20,
              backgroundColor: "#fef3c7",
              borderWidth: 1,
              borderColor: "#fcd34d",
            }}
            accessibilityRole="button"
            accessibilityLabel={db("completeProfileA11y")}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400e" }}>
              {db("completeProfileCta")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <DashboardSetupCard />

      {(m?.unrecognized_payments_today ?? 0) > 0 ? (
        <View
          style={{
            backgroundColor: "#fffbeb",
            borderColor: "#fde68a",
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
          accessibilityRole="text"
          accessibilityLabel={db("reconcilingA11y", { count: m?.unrecognized_payments_today })}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <Ionicons name="time-outline" size={18} color="#d97706" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: "#92400e" }}>
              {db("reconcilingBody", { count: m?.unrecognized_payments_today })}
            </Text>
          </View>
        </View>
      ) : null}

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
            accessibilityLabel={db("subscriptionRequiredA11y")}
          >
            <Ionicons name="alert-circle-outline" size={22} color="#b91c1c" style={{ marginEnd: 10, marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#991b1b" }}>{db("onlineBookingsNeedAttention")}</Text>
              <Text style={{ fontSize: 13, color: "#7f1d1d", marginTop: 4, lineHeight: 18 }}>
                {bookingEligibility.booking_limit_message}
              </Text>
              <Text style={{ fontSize: 13, color: Colors.primary, marginTop: 8, fontWeight: "600" }}>
                {db("openPlanBilling")}
              </Text>
            </View>
          </TouchableOpacity>
        )}

      <ProviderDashboardExcellenceBanner />

      {/* Identity strip: rating, badge, service type, at-home radius */}
      {m && (
        <View
          style={{ marginBottom: 16, flexDirection: "row", flexWrap: "wrap", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 10 }}
          accessibilityLabel={db("identityStripA11y", {
            rating: m.average_rating?.toFixed(1) ?? "0.0",
            reviews: m.total_reviews ?? 0,
            level: gam?.current_badge?.name ?? db("gettingStarted"),
            services: [m.provider_profile?.supports_house_calls ? db("atHome") : "", m.provider_profile?.supports_salon ? db("atSalon") : ""].filter(Boolean).join(" "),
            distance:
              m.provider_profile?.supports_house_calls &&
              m.provider_profile?.is_distance_filter_enabled === true &&
              m.provider_profile?.max_service_distance_km
                ? db("withinKm", { km: m.provider_profile.max_service_distance_km })
                : "",
          })}
        >
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginEnd: 12 }}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(app)/(tabs)/more/reviews" as never);
              }}
              accessibilityLabel={db("ratingFromReviewsA11y", { rating: m.average_rating?.toFixed(1) ?? "0.0", reviews: m.total_reviews ?? 0 })}
            >
              <Ionicons name="star" size={16} color="#f59e0b" style={{ marginEnd: 4 }} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                {m.average_rating?.toFixed(1) ?? "0.0"}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                ({m.total_reviews ?? 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginEnd: 12 }}
              activeOpacity={0.8}
              onPress={() => router.push("/(app)/(tabs)/more/rewards-hub" as never)}
              accessibilityLabel={gam?.current_badge?.name ? db("levelA11y", { name: gam.current_badge.name }) : db("viewRewardsA11y")}
            >
              <Ionicons name="trophy" size={16} color="#92400e" style={{ marginEnd: 4 }} />
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
                  {gam?.current_badge?.name ?? db("gettingStarted")}
                </Text>
              </View>
            </TouchableOpacity>
            {(m.provider_profile?.supports_house_calls || m.provider_profile?.supports_salon) && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {m.provider_profile.supports_house_calls && (
                  <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 4, backgroundColor: "#dcfce7", paddingHorizontal: 8, paddingVertical: 2, marginEnd: 6 }}>
                    <Ionicons name="home-outline" size={12} color="#166534" />
                    <Text style={{ marginStart: 2, fontSize: 12, fontWeight: "500", color: "#166534" }}>{db("atHome")}</Text>
                  </View>
                )}
                {m.provider_profile.supports_salon && (
                  <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 4, backgroundColor: "#f3e8ff", paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Ionicons name="business-outline" size={12} color="#6b21a8" />
                    <Text style={{ marginStart: 2, fontSize: 12, fontWeight: "500", color: "#6b21a8" }}>{db("atSalon")}</Text>
                  </View>
                )}
              </View>
            )}
            {m.provider_profile?.supports_house_calls &&
              m.provider_profile?.is_distance_filter_enabled === true &&
              m.provider_profile?.max_service_distance_km != null &&
              m.provider_profile.max_service_distance_km > 0 && (
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", borderRadius: 4, backgroundColor: "#eef2ff", paddingHorizontal: 8, paddingVertical: 2, marginEnd: 12 }}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/(app)/(tabs)/more/settings/distance-settings" as never);
                  }}
                  accessibilityLabel={db("withinKmA11y", { km: m.provider_profile.max_service_distance_km })}
                >
                  <Ionicons name="location-outline" size={12} color="#4338ca" style={{ marginEnd: 4 }} />
                  <Text style={{ fontSize: 12, fontWeight: "500", color: "#3730a3" }}>
                    {db("withinKm", { km: m.provider_profile.max_service_distance_km })}
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
          style={{ minHeight: 48, flex: 1, marginEnd: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.gray[900] }}
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
          accessibilityLabel={db("createBookingA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={{ marginStart: 8, fontWeight: "600", color: Colors.white }}>{db("newBooking")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ minHeight: 48, flex: 1, marginEnd: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}
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
          accessibilityLabel={db("walkInApptA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="walk-outline" size={18} color="#111" />
          <Text style={{ marginStart: 8, fontWeight: "600", color: Colors.gray[900] }}>{db("walkInAppt")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigateToMoreScreen(router, "/(app)/(tabs)/more/walk-in-sale", { from: "dashboard" });
          }}
          activeOpacity={0.7}
          accessibilityLabel={db("productSaleA11y")}
          accessibilityRole="button"
        >
          <Ionicons name="pricetag-outline" size={18} color="#111" />
          <Text style={{ marginStart: 8, fontWeight: "600", color: Colors.gray[900] }}>{db("retail")}</Text>
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
        accessibilityLabel={db("posA11y")}
        accessibilityRole="button"
      >
        <Ionicons name="card-outline" size={18} color={Colors.primary} />
        <Text style={{ marginStart: 8, fontWeight: "700", color: Colors.primary }}>{db("sellPos")}</Text>
      </TouchableOpacity>
      ) : null}

      {/* Date Range Selector */}
      <View style={{ marginBottom: 8 }}>
        <FilterChipGroup
          options={dateRangeOptions}
          selected={dateRange}
          onSelect={(val) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setDateRange(val);
          }}
        />
      </View>

      <SectionHeader title={db("thisPeriod", { period: periodLabel })} />
      <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12, marginTop: -4 }}>
        {db("ledgerFootnote")}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <View style={{ width: isTablet && columns >= 3 ? "31%" : "48.5%", marginEnd: 12, marginBottom: 12 }}>
          <StatCard
            title={db("revenueEarned")}
            value={displayRevenue}
            subtitle={db("revenueSubtitle")}
            icon="wallet-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            trend={revenueTrend}
            compact={!isTablet}
          />
        </View>
        <View style={{ width: isTablet && columns >= 3 ? "31%" : "48.5%", marginEnd: 12, marginBottom: 12 }}>
          <StatCard
            title={db("appointments")}
            value={String(displayAppointments)}
            subtitle={db("scheduledInPeriod")}
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
            accessibilityLabel={db("retailSalesA11y", { amount: displayRetailSales })}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigateToMoreScreen(router, "/(app)/(tabs)/more/walk-in-sale", { from: "dashboard" });
            }}
          >
            <StatCard
              title={db("retailSales")}
              value={displayRetailSales}
              subtitle={db("retailSalesSubtitle")}
              icon="pricetag-outline"
              iconColor="#059669"
              iconBg="bg-emerald-50"
              compact={!isTablet}
            />
          </TouchableOpacity>
        </View>
      </View>

      <SectionHeader title={db("howYouEarnedIt")} />
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 14, marginBottom: 12 }}>
        {activePeriod?.earnings_mix_is_all_time ? (
          <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 10 }}>
            {db("earningsMixAllTimeNote")}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("services")}</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.service_earnings ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("onlineProductOrders")}</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.product_order_earnings ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("additionalCharges")}</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.additional_charge_earnings ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("tips")}</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.tips ?? 0)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("travelFees")}</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.travel_fees ?? 0)}
          </Text>
        </View>
        {(earningsMix?.gift_card_sales ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("giftCardSales")}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              {formatCurrency(earningsMix?.gift_card_sales ?? 0)}
            </Text>
          </View>
        ) : null}
        {(earningsMix?.membership_sales ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("membershipSales")}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              {formatCurrency(earningsMix?.membership_sales ?? 0)}
            </Text>
          </View>
        ) : null}
        {(earningsMix?.refunds ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("refunds")}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              -{formatCurrency(earningsMix?.refunds ?? 0)}
            </Text>
          </View>
        ) : null}
        {(earningsMix?.other_earnings ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{db("otherEarnings")}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              {formatCurrency(earningsMix?.other_earnings ?? 0)}
            </Text>
          </View>
        ) : null}
        <View style={{ marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.gray[800] }}>
            {db("totalEarned", { period: activePeriod?.earnings_mix_is_all_time ? db("allTime") : periodLabelLower })}
          </Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900] }}>
            {formatCurrency(earningsMix?.recognized_total ?? activePeriod?.revenue ?? 0)}
          </Text>
        </View>
      </View>

      <SectionHeader title={db("earningsTrend")} />
      {insightsLoading ? (
        <Card variant="default" padding="md">
          <Skeleton height={160} borderRadius={12} />
        </Card>
      ) : (
        <WeeklyRevenueChart data={chartData} todayYmd={today} />
      )}

      <SectionHeader
        title={db("bookingStatus", { period: periodLabelLower })}
        actionLabel={db("viewAll")}
        onAction={() =>
          router.push("/(app)/(tabs)/bookings" as never)
        }
      />
      <View style={{ flexDirection: "row" }}>
        <View
          style={{ flex: 1, marginEnd: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={db("scheduledBookingsA11y", { count: displayAppointments, period: periodLabelLower })}
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
          style={{ flex: 1, marginEnd: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={db("pendingA11y", { count: bookingStatus?.pending ?? 0 })}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#d97706" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.pending ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("pending")}</Text>
        </View>
        <View
          style={{ flex: 1, marginEnd: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={db("confirmedA11y", { count: bookingStatus?.confirmed ?? 0 })}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#4f46e5" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.confirmed ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("confirmed")}</Text>
        </View>
        <View
          style={{ flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={db("completedA11y", { count: bookingStatus?.completed ?? 0 })}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#16a34a" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.completed ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("completed")}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", marginTop: 8 }}>
        <View
          style={{ flex: 1, marginEnd: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={db("cancelledA11y", { count: bookingStatus?.cancelled ?? 0 })}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#6b7280" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.cancelled ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("cancelled")}</Text>
        </View>
        <View
          style={{ flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
          accessibilityLabel={db("noShowA11y", { count: bookingStatus?.no_show ?? 0 })}
        >
          <Text
            style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#dc2626" }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.7}
          >
            {bookingStatus?.no_show ?? 0}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("noShow")}</Text>
        </View>
      </View>

      {(activePeriod?.channel_mix?.online ?? 0) +
        (activePeriod?.channel_mix?.walk_in ?? 0) +
        (activePeriod?.channel_mix?.provider ?? 0) >
        0 ? (
        <>
          <SectionHeader title={db("appointmentsByChannel", { period: periodLabelLower })} />
          <Text style={{ marginTop: -6, marginBottom: 8, fontSize: 11, color: Colors.gray[500] }}>
            {db("channelFootnote")}
          </Text>
          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <View
              style={{
                flex: 1,
                marginEnd: 8,
                alignItems: "center",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[100],
                backgroundColor: Colors.white,
                padding: 12,
              }}
              accessibilityRole="text"
              accessibilityLabel={db("onlineBookingsA11y", { count: activePeriod?.channel_mix?.online ?? 0, period: periodLabelLower })}
            >
              <Text style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#3b82f6" }}>
                {activePeriod?.channel_mix?.online ?? 0}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("online")}</Text>
            </View>
            <View
              style={{
                flex: 1,
                marginEnd: 8,
                alignItems: "center",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[100],
                backgroundColor: Colors.white,
                padding: 12,
              }}
              accessibilityRole="text"
              accessibilityLabel={db("walkInBookingsA11y", { count: activePeriod?.channel_mix?.walk_in ?? 0, period: periodLabelLower })}
            >
              <Text style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#d97706" }}>
                {activePeriod?.channel_mix?.walk_in ?? 0}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("walkIn")}</Text>
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
              accessibilityLabel={db("providerBookingsA11y", { count: activePeriod?.channel_mix?.provider ?? 0, period: periodLabelLower })}
            >
              <Text style={{ fontSize: dashMetricLg, fontWeight: "700", color: "#8b5cf6" }}>
                {activePeriod?.channel_mix?.provider ?? 0}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("providerChannel")}</Text>
            </View>
          </View>
        </>
      ) : null}

      <SectionHeader
        title={
          topServicesArePeriodScoped
            ? db("topServicesPeriod", { period: periodLabelLower })
            : db("topServicesFallback")
        }
      />
      <Text style={{ marginTop: -6, marginBottom: 8, fontSize: 11, color: Colors.gray[500] }}>
        {topServicesArePeriodScoped
          ? db("topServicesPeriodHint", { from: topServicesRange.from, to: topServicesRange.to })
          : db("topServicesFallbackHint")}
      </Text>
      {topServicesLoading ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}>
          <SkeletonList rows={3} />
        </View>
      ) : topServicesError && !topServices ? (
        <TouchableOpacity onPress={refreshPeriodTopServices} activeOpacity={0.7} style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 16 }}>
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>{db("loadFailedRetry")}</Text>
        </TouchableOpacity>
      ) : !topServices || topServices.length === 0 ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 24 }}>
          <Ionicons name="bar-chart-outline" size={28} color="#d1d5db" />
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400] }}>
            {db("noServiceData")}
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
                accessibilityLabel={db("topServiceA11y", { name: svc.service_name, count: svc.booking_count, revenue: formatCurrency(svc.total_revenue) })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                      {svc.service_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                      {db("bookingsCount", { count: svc.booking_count })}
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

      <SectionHeader title={db("performance", { period: periodLabelLower })} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <View
          style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          accessibilityLabel={db("completionRateA11y", { pct: formatPercentage(periodPerformance?.completion_rate ?? 0) })}
        >
          <Text
            style={{ fontSize: dashMetricMd, fontWeight: "700", color: Colors.gray[900] }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.75}
          >
            {formatPercentage(periodPerformance?.completion_rate ?? 0)}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("completionRate")}</Text>
        </View>
        <View
          style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          accessibilityLabel={db("noShowRateA11y", { pct: formatPercentage(periodPerformance?.no_show_rate ?? 0) })}
        >
          <Text
            style={{ fontSize: dashMetricMd, fontWeight: "700", color: Colors.gray[900] }}
            numberOfLines={1}
            adjustsFontSizeToFit={Platform.OS !== "web"}
            minimumFontScale={0.75}
          >
            {formatPercentage(periodPerformance?.no_show_rate ?? 0)}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{db("noShowRate")}</Text>
        </View>
      </View>
      {(m?.bookings_truncated || m?.ledger_truncated) && (
        <Text style={{ marginTop: 8, fontSize: 11, color: Colors.gray[500], paddingHorizontal: 4 }}>
          {m?.bookings_truncated && m?.ledger_truncated
            ? db("truncatedBoth")
            : m?.bookings_truncated
              ? db("truncatedBookings")
              : db("truncatedLedger")}
        </Text>
      )}

      <SectionHeader title={db("balancesNow")} />
      <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12, marginTop: -4 }}>
        {db("balancesFootnote")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <View style={{ width: "48.5%", marginEnd: 12, marginBottom: 12 }}>
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
            accessibilityLabel={db("unpaidBookingsA11y", { amount: formatCurrency(m?.pending_payments_amount ?? 0) })}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/bookings?status=pending_payment" as never);
            }}
          >
            <StatCard
              title={db("unpaidBookings")}
              value={formatCurrency(m?.pending_payments_amount ?? 0)}
              subtitle={
                (m?.pending_payments_count ?? 0) > 0
                  ? db("awaitingPayment", { count: m?.pending_payments_count })
                  : db("nothingOutstanding")
              }
              icon="time-outline"
              iconColor="#f97316"
              iconBg="bg-orange-50"
              compact={!isTablet}
            />
          </TouchableOpacity>
        </View>
      </View>

      <SectionHeader title={db("yourStanding")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <TouchableOpacity
          style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
          activeOpacity={0.8}
          onPress={() => router.push("/(app)/(tabs)/more/reviews" as never)}
          accessibilityLabel={db("ratingFromReviewsA11y", { rating: m?.average_rating?.toFixed(1) ?? "0.0", reviews: m?.total_reviews ?? 0 })}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="star" size={18} color="#f59e0b" />
            <Text
              style={{ marginStart: 6, fontSize: dashMetricMd, fontWeight: "700", color: Colors.gray[900] }}
              numberOfLines={1}
              adjustsFontSizeToFit={Platform.OS !== "web"}
              minimumFontScale={0.75}
            >
              {m?.average_rating?.toFixed(1) ?? "0.0"}
            </Text>
          </View>
          <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
            {db("reviewsCount", { count: m?.total_reviews ?? 0 })}
          </Text>
        </TouchableOpacity>
      </View>

      <SectionHeader
        title={db("rewardsTitle")}
        actionLabel={db("viewAll")}
        onAction={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(app)/(tabs)/more/rewards-hub" as never);
        }}
      />
      <TouchableOpacity
        style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.primaryRing, backgroundColor: Colors.primaryLight, padding: 16 }}
        onPress={() => router.push("/(app)/(tabs)/more/rewards-hub" as never)}
        activeOpacity={0.7}
        accessibilityLabel={db("rewardsA11y", { points: gam?.total_points ?? 0 })}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: Colors.primaryLight }}>
            <Ionicons name="trophy" size={24} color={Colors.primary} />
          </View>
          <View style={{ marginStart: 12, flex: 1 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>
              {gam?.current_badge?.name ?? db("gettingStartedTitle")}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
              {db("pointsEarned", { points: (gam?.total_points ?? 0).toLocaleString() })}
            </Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={18} color={Colors.gray[400]} />
        </View>
        {nextBadge && (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: Colors.gray[700] }}>
                {db("nextBadge", { name: nextBadge.badge.name })}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.primary }}>
                {nextBadge.progress_percentage}%
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 9999, backgroundColor: Colors.primaryLight, overflow: "hidden" }}>
              <View style={{ height: "100%", borderRadius: 9999, backgroundColor: Colors.primary, width: `${nextBadge.progress_percentage}%` }} />
            </View>
            <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[600] }}>
              {db("ptsToLevelUp", { count: nextBadge.points_needed.toLocaleString() })}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Upcoming Appointments (next 7 days) */}
      <SectionHeader
        title={db("upcomingTitle")}
        actionLabel={db("seeAll")}
        onAction={() => router.push("/(app)/(tabs)/bookings" as never)}
      />
      {upcomingLoading ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}>
          <SkeletonList rows={3} />
        </View>
      ) : upcomingError && !upcomingBookings ? (
        <TouchableOpacity onPress={refreshUpcoming} activeOpacity={0.7} style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 16 }}>
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>{db("loadFailedRetry")}</Text>
        </TouchableOpacity>
      ) : !upcomingBookings || upcomingBookings.length === 0 ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 32, paddingHorizontal: 16 }}>
          <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400], textAlign: "center" }}>
            {db("noUpcoming")}
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
                isTablet ? { width: "48%", marginEnd: 12, marginBottom: 12 } : { marginBottom: 8 },
              ]}
              onPress={() =>
                openBookingSurface(booking)
              }
              accessibilityLabel={db("upcomingBookingA11y", { name: booking.customers?.full_name ?? db("walkInCustomer"), when: formatRelativeDate(booking.scheduled_at) })}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Avatar
                      name={booking.customers?.full_name ?? db("guest")}
                      size="sm"
                    />
                    <View style={{ marginStart: 10, flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                        {booking.customers?.full_name ?? db("walkInCustomer")}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                        {formatRelativeDate(booking.scheduled_at)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 8 }}>
                    {booking.services?.slice(0, 2).map((s, i) => (
                      <Text key={i} style={{ fontSize: 12, color: Colors.gray[600] }} numberOfLines={1}>
                        {s.name ?? s.offering_name ?? db("serviceFallback")}
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
                        <Ionicons name="people-outline" size={12} color="#4338ca" style={{ marginEnd: 4 }} />
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#4338ca" }}>
                          {booking.group_booking_ref ? db("groupBadgeWithRef", { ref: booking.group_booking_ref }) : db("groupBadge")}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {booking.package_name ? (
                    <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[600] }} numberOfLines={1}>
                      {db("packageLabel", { name: booking.package_name })}
                    </Text>
                  ) : null}
                  {(booking.products?.length ?? 0) > 0 ? (
                    <Text style={{ marginTop: 4, fontSize: 10, color: Colors.gray[600] }} numberOfLines={1}>
                      {db("productsCount", { count: booking.products!.length })}
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
        title={db("recentActivity")}
        actionLabel={db("viewAllLower")}
        onAction={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(app)/(tabs)/more/activity" as never);
        }}
      />
      <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12, marginTop: -4 }}>
        {dashboardView?.insights?.basis?.activity_window
          ? db("activityWindow", { window: dashboardView.insights.basis.activity_window })
          : db("activityDefaultHint")}
      </Text>
      {insightsLoading ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}>
          <SkeletonList rows={4} />
        </View>
      ) : activityError && !hasBundledInsights && fallbackActivityPayload == null ? (
        <TouchableOpacity onPress={refreshFallbackActivity} activeOpacity={0.7} style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 16 }}>
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text style={{ marginTop: 4, fontSize: 12, color: "#ef4444" }}>{db("loadFailedRetry")}</Text>
        </TouchableOpacity>
      ) : !recentActivity || recentActivity.length === 0 ? (
        <View style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 24 }}>
          <Ionicons name="pulse-outline" size={28} color="#d1d5db" />
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400] }}>
            {db("noRecentActivity")}
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
                <View style={{ marginStart: 12, flex: 1 }}>
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

import { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format, subDays, addDays } from "date-fns";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { SkeletonDashboard } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatCurrency,
  formatRelativeDate,
  formatDuration,
  formatPercentage,
  formatTimeAgo,
} from "@/lib/format";

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
  group_booking_ref?: string | null;
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
      return { name: "book-outline", color: "#6366f1", bg: "bg-indigo-50" };
    case "booking_completed":
      return {
        name: "checkmark-circle-outline",
        color: "#22c55e",
        bg: "bg-green-50",
      };
    case "booking_cancelled":
      return { name: "close-circle-outline", color: "#ef4444", bg: "bg-red-50" };
    case "payment_received":
      return { name: "cash-outline", color: "#22c55e", bg: "bg-green-50" };
    case "new_review":
      return { name: "star-outline", color: "#f59e0b", bg: "bg-amber-50" };
    case "new_client":
      return { name: "person-add-outline", color: "#3b82f6", bg: "bg-blue-50" };
    default:
      return {
        name: "ellipse-outline",
        color: "#6b7280",
        bg: "bg-gray-100",
      };
  }
}

function WeeklyRevenueChart({ data }: { data: WeeklyRevenue[] }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <Card variant="default" padding="md">
      <View className="mb-3 flex-row items-baseline justify-between">
        <Text className="text-xs font-medium uppercase tracking-wide text-gray-400">
          7-Day Total
        </Text>
        <Text className="text-base font-bold text-gray-900">
          {formatCurrency(totalRevenue)}
        </Text>
      </View>

      <View
        className="flex-row items-end justify-between"
        style={{ height: 120 }}
        accessibilityLabel="Weekly revenue bar chart"
      >
        {data.map((day, index) => {
          const barHeight = Math.max(
            (day.revenue / maxRevenue) * 100,
            day.revenue > 0 ? 6 : 2,
          );
          const isToday = index === todayIdx;
          return (
            <View key={day.day} className="flex-1 items-center px-0.5">
              {day.revenue > 0 && (
                <Text className="mb-1 text-[9px] font-medium text-gray-400">
                  {formatCurrency(day.revenue).replace(/\.00$/, "")}
                </Text>
              )}
              <View
                className={`w-full max-w-[28px] ${
                  isToday
                    ? "rounded-lg bg-gray-900"
                    : day.revenue > 0
                      ? "rounded-lg bg-gray-200"
                      : "rounded-lg bg-gray-100"
                }`}
                style={{ height: barHeight }}
              />
            </View>
          );
        })}
      </View>

      <View className="mt-2 flex-row justify-between">
        {DAY_LABELS.map((label, i) => (
          <View key={label} className="flex-1 items-center">
            <Text
              className={`text-[10px] ${
                i === todayIdx ? "font-bold text-gray-900" : "text-gray-400"
              }`}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { selectedLocationId } = useProvider();
  const { isTablet, columns } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("today");

  const locQ = selectedLocationId ? `&location_id=${selectedLocationId}` : "";
  const locQFirst = selectedLocationId ? `?location_id=${selectedLocationId}` : "";

  const {
    data: metrics,
    loading: metricsLoading,
    error: metricsError,
    refresh: refreshMetrics,
  } = useApi<DashboardMetrics>(`/api/provider/dashboard${locQFirst}`);

  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings, error: todayBookingsError, refresh: refreshBookings } = useApi<Booking[]>(
    `/api/provider/bookings?start_date=${today}&end_date=${today}${locQ}`,
  );

  // Upcoming = next 7 days (today through today + 6)
  const upcomingEnd = format(addDays(new Date(), 6), "yyyy-MM-dd");
  const { data: upcomingBookings, error: upcomingError, refresh: refreshUpcoming } = useApi<
    Booking[]
  >(
    `/api/provider/bookings?status=confirmed,pending,booked&start_date=${today}&end_date=${upcomingEnd}&limit=20&sort=scheduled_at${locQ}`,
  );

  const weekStart = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const { data: weeklyRevenue, refresh: refreshWeekly } = useApi<
    WeeklyRevenue[]
  >(
    `/api/provider/reports/weekly-revenue?start_date=${weekStart}&end_date=${today}${locQ}`,
  );

  const { data: topServices, error: topServicesError, refresh: refreshTopServices } = useApi<
    TopService[]
  >(`/api/provider/reports/top-services?limit=5${locQ}`);

  const { data: recentActivity, error: activityError, refresh: refreshActivity } = useApi<
    ActivityItem[]
  >(`/api/provider/activity?limit=10${locQ}`);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshMetrics(),
      refreshBookings(),
      refreshUpcoming(),
      refreshWeekly(),
      refreshTopServices(),
      refreshActivity(),
    ]);
    setRefreshing(false);
  }, [
    refreshMetrics,
    refreshBookings,
    refreshUpcoming,
    refreshWeekly,
    refreshTopServices,
    refreshActivity,
  ]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("dashboard-booking-updates")
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${user.id}`,
        },
        () => {
          refreshMetrics();
          refreshBookings();
          refreshUpcoming();
          refreshWeekly();
          refreshActivity();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    user?.id,
    refreshMetrics,
    refreshBookings,
    refreshUpcoming,
    refreshWeekly,
    refreshActivity,
  ]);

  const m = metrics;
  const statColumns = isTablet ? (columns >= 3 ? 4 : 2) : 2;

  const displayRevenue = useMemo(() => {
    if (!m) return "R0.00";
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

  const chartData: WeeklyRevenue[] =
    weeklyRevenue ??
    Array.from({ length: 7 }, (_, i) => ({
      day: format(subDays(new Date(), 6 - i), "yyyy-MM-dd"),
      revenue: 0,
    }));

  if (metricsLoading && !metrics) {
    return (
      <ScreenContainer scrollable={false}>
        <SkeletonDashboard />
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
      <ScreenHeader
        title="Dashboard"
        subtitle={`${m?.appointments_today ?? 0} appointments today`}
        rightAction={
          <TouchableOpacity
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-100"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/notifications" as any);
            }}
            accessibilityLabel="View notifications"
            accessibilityRole="button"
          >
            <Ionicons name="notifications-outline" size={20} color="#111" />
          </TouchableOpacity>
        }
      />

      {/* Identity strip: rating, badge, service type, at-home radius */}
      {m && (
        <View
          className="mb-4 flex-row flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5"
          accessibilityLabel={`Rating ${m.average_rating?.toFixed(1) ?? "0.0"}, ${m.total_reviews ?? 0} reviews. Level: ${gam?.current_badge?.name ?? "Getting started"}. ${m.provider_profile?.supports_house_calls ? "At-home" : ""} ${m.provider_profile?.supports_salon ? "At-salon" : ""}. ${m.provider_profile?.supports_house_calls && m.provider_profile?.max_service_distance_km ? `Within ${m.provider_profile.max_service_distance_km} km` : ""}`}
        >
            <TouchableOpacity
              className="flex-row items-center gap-1 rounded-lg px-2 py-1 active:opacity-80"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(app)/(tabs)/more/reviews" as any);
              }}
              accessibilityLabel={`Rating ${m.average_rating?.toFixed(1) ?? "0.0"} from ${m.total_reviews ?? 0} reviews`}
            >
              <Ionicons name="star" size={16} color="#f59e0b" />
              <Text className="text-base font-bold text-gray-900">
                {m.average_rating?.toFixed(1) ?? "0.0"}
              </Text>
              <Text className="text-xs text-gray-500">
                ({m.total_reviews ?? 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center gap-1 rounded-lg px-2 py-1 active:opacity-80"
              onPress={() => router.push("/(app)/(tabs)/more/rewards" as any)}
              accessibilityLabel={gam?.current_badge?.name ? `Level ${gam.current_badge.name}` : "View rewards"}
            >
              <Ionicons name="trophy" size={16} color="#92400e" />
              <View
                className="rounded-full px-2 py-0.5"
                style={{
                  backgroundColor:
                    (gam?.current_badge?.color && /^#/.test(gam.current_badge.color))
                      ? gam.current_badge.color
                      : "#6366f1",
                }}
              >
                <Text className="text-xs font-semibold text-white">
                  {gam?.current_badge?.name ?? "Getting started"}
                </Text>
              </View>
            </TouchableOpacity>
            {(m.provider_profile?.supports_house_calls || m.provider_profile?.supports_salon) && (
              <View className="flex-row items-center gap-1.5">
                {m.provider_profile.supports_house_calls && (
                  <View className="flex-row items-center rounded bg-green-100 px-2 py-0.5">
                    <Ionicons name="home-outline" size={12} color="#166534" />
                    <Text className="ml-0.5 text-xs font-medium text-green-800">At-home</Text>
                  </View>
                )}
                {m.provider_profile.supports_salon && (
                  <View className="flex-row items-center rounded bg-purple-100 px-2 py-0.5">
                    <Ionicons name="business-outline" size={12} color="#6b21a8" />
                    <Text className="ml-0.5 text-xs font-medium text-purple-800">At-salon</Text>
                  </View>
                )}
              </View>
            )}
            {m.provider_profile?.supports_house_calls &&
              m.provider_profile?.max_service_distance_km != null &&
              m.provider_profile.max_service_distance_km > 0 && (
                <TouchableOpacity
                  className="flex-row items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 active:opacity-80"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/(app)/(tabs)/more/settings/distance-settings" as any);
                  }}
                  accessibilityLabel={`Within ${m.provider_profile.max_service_distance_km} km. Tap to change distance settings.`}
                >
                  <Ionicons name="location-outline" size={12} color="#4338ca" />
                  <Text className="text-xs font-medium text-indigo-800">
                    Within {m.provider_profile.max_service_distance_km} km
                  </Text>
                </TouchableOpacity>
              )}
        </View>
      )}

      {/* Quick Actions */}
      <View className="mb-4 flex-row gap-3">
        <TouchableOpacity
          className="min-h-[48px] flex-1 flex-row items-center justify-center rounded-xl bg-gray-900"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/(app)/(tabs)/more/bookings/new" as any);
          }}
          activeOpacity={0.7}
          accessibilityLabel="Create new booking"
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text className="ml-2 font-semibold text-white">New Booking</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="min-h-[48px] flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/calendar" as any);
          }}
          activeOpacity={0.7}
          accessibilityLabel="View schedule"
          accessibilityRole="button"
        >
          <Ionicons name="calendar-outline" size={18} color="#111" />
          <Text className="ml-2 font-semibold text-gray-900">Schedule</Text>
        </TouchableOpacity>
      </View>

      {/* Date Range Selector */}
      <View className="mb-4">
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
        className="gap-3"
        style={{ flexDirection: "row", flexWrap: "wrap" }}
      >
        <View style={{ width: statColumns === 4 ? "24%" : "48.5%" }}>
          <StatCard
            title={`${periodLabel} Revenue`}
            value={displayRevenue}
            icon="wallet-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact={!isTablet}
          />
        </View>
        <View style={{ width: statColumns === 4 ? "24%" : "48.5%" }}>
          <StatCard
            title={`${periodLabel} Appointments`}
            value={String(displayAppointments)}
            icon="calendar-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            compact={!isTablet}
          />
        </View>
        <View style={{ width: statColumns === 4 ? "24%" : "48.5%" }}>
          <StatCard
            title="Available Balance"
            value={formatCurrency(m?.available_balance ?? 0)}
            icon="cash-outline"
            iconColor="#f59e0b"
            iconBg="bg-amber-50"
            compact={!isTablet}
          />
        </View>
        <View style={{ width: statColumns === 4 ? "24%" : "48.5%" }}>
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
      <WeeklyRevenueChart data={chartData} />

      {/* Bookings Overview - filter responsive */}
      <SectionHeader
        title={`Bookings — ${periodLabel}`}
        actionLabel="View All"
        onAction={() =>
          router.push("/(app)/(tabs)/more/bookings" as any)
        }
      />
      <View className="flex-row gap-3">
        <View
          className="flex-1 items-center rounded-xl border border-gray-100 bg-white p-3"
          accessibilityLabel={`${displayAppointments} bookings ${periodLabel.toLowerCase()}`}
        >
          <Text className="text-2xl font-bold text-gray-900">
            {displayAppointments}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">Scheduled</Text>
        </View>
        <View
          className="flex-1 items-center rounded-xl border border-gray-100 bg-white p-3"
          accessibilityLabel={`${m?.pending_bookings ?? 0} pending`}
        >
          <Text className="text-2xl font-bold text-amber-600">
            {m?.pending_bookings ?? 0}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">Pending</Text>
        </View>
        <View
          className="flex-1 items-center rounded-xl border border-gray-100 bg-white p-3"
          accessibilityLabel={`${m?.confirmed_bookings ?? 0} confirmed`}
        >
          <Text className="text-2xl font-bold text-indigo-600">
            {m?.confirmed_bookings ?? 0}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">Confirmed</Text>
        </View>
        <View
          className="flex-1 items-center rounded-xl border border-gray-100 bg-white p-3"
          accessibilityLabel={`${m?.completed_bookings ?? 0} completed`}
        >
          <Text className="text-2xl font-bold text-green-600">
            {m?.completed_bookings ?? 0}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">Completed</Text>
        </View>
      </View>

      {/* Top Services */}
      <SectionHeader title="Top Services" />
      {topServicesError && !topServices ? (
        <View className="items-center rounded-xl border border-dashed border-red-200 bg-red-50 py-4">
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text className="mt-1 text-xs text-red-500">Failed to load</Text>
        </View>
      ) : !topServices || topServices.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-6">
          <Ionicons name="bar-chart-outline" size={28} color="#d1d5db" />
          <Text className="mt-2 text-sm text-gray-400">
            No service data yet
          </Text>
        </View>
      ) : (
        <View className="rounded-2xl border border-gray-100 bg-white">
          {topServices.map((svc, idx) => {
            const maxRev = topServices[0].total_revenue || 1;
            const barWidth = (svc.total_revenue / maxRev) * 100;
            return (
              <View
                key={idx}
                className={`px-4 py-3 ${
                  idx < topServices.length - 1 ? "border-b border-gray-50" : ""
                }`}
                accessibilityLabel={`${svc.service_name}: ${svc.booking_count} bookings, ${formatCurrency(svc.total_revenue)} revenue`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      className="text-sm font-medium text-gray-900"
                      numberOfLines={1}
                    >
                      {svc.service_name}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {svc.booking_count} bookings
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-gray-900">
                    {formatCurrency(svc.total_revenue)}
                  </Text>
                </View>
                <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <View
                    className="h-full rounded-full bg-indigo-400"
                    style={{ width: `${barWidth}%` }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Performance */}
      <SectionHeader title="Performance" />
      <View className="flex-row gap-3">
        <View
          className="flex-1 rounded-xl border border-gray-100 bg-white p-4"
          accessibilityLabel={`Rating: ${m?.average_rating?.toFixed(1) ?? "0.0"} from ${m?.total_reviews ?? 0} reviews`}
        >
          <View className="flex-row items-center">
            <Ionicons name="star" size={18} color="#f59e0b" />
            <Text className="ml-1.5 text-xl font-bold text-gray-900">
              {m?.average_rating?.toFixed(1) ?? "0.0"}
            </Text>
          </View>
          <Text className="mt-1 text-xs text-gray-500">
            {m?.total_reviews ?? 0} reviews
          </Text>
        </View>
        <View
          className="flex-1 rounded-xl border border-gray-100 bg-white p-4"
          accessibilityLabel={`No show rate: ${formatPercentage(m?.no_show_rate ?? 0)}`}
        >
          <Text className="text-xl font-bold text-gray-900">
            {formatPercentage(m?.no_show_rate ?? 0)}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">No-show rate</Text>
        </View>
        <View
          className="flex-1 rounded-xl border border-gray-100 bg-white p-4"
          accessibilityLabel={`${m?.completed_bookings ?? 0} completed bookings`}
        >
          <Text className="text-xl font-bold text-gray-900">
            {m?.completed_bookings ?? 0}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">Completed</Text>
        </View>
      </View>

      {/* Rewards & Achievements — always visible */}
      <SectionHeader
        title="Rewards & Achievements"
        actionLabel="View All"
        onAction={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(app)/(tabs)/more/rewards" as any);
        }}
      />
      <TouchableOpacity
        className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"
        onPress={() => router.push("/(app)/(tabs)/more/rewards" as any)}
        activeOpacity={0.7}
        accessibilityLabel={`Rewards: ${gam?.total_points ?? 0} points`}
      >
        <View className="flex-row items-center">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
            <Ionicons name="trophy" size={24} color="#6366f1" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="font-semibold text-indigo-900">
              {gam?.current_badge?.name ?? "Getting Started"}
            </Text>
            <Text className="mt-0.5 text-sm text-indigo-700">
              {(gam?.total_points ?? 0).toLocaleString()} points earned
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6366f1" />
        </View>
        {nextBadge && (
          <View className="mt-3">
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs text-indigo-700">
                Next: {nextBadge.badge.name}
              </Text>
              <Text className="text-xs text-indigo-600">
                {nextBadge.progress_percentage}%
              </Text>
            </View>
            <View className="h-2 rounded-full bg-indigo-200 overflow-hidden">
              <View
                className="h-full rounded-full bg-indigo-600"
                style={{ width: `${nextBadge.progress_percentage}%` }}
              />
            </View>
            <Text className="mt-1 text-[10px] text-indigo-500">
              {nextBadge.points_needed.toLocaleString()} pts to go
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Upcoming Appointments (next 7 days) */}
      <SectionHeader
        title="Upcoming (Next 7 Days)"
        actionLabel="See All"
        onAction={() => router.push("/(app)/(tabs)/calendar" as any)}
      />
      {upcomingError && !upcomingBookings ? (
        <View className="items-center rounded-xl border border-dashed border-red-200 bg-red-50 py-4">
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text className="mt-1 text-xs text-red-500">Failed to load</Text>
        </View>
      ) : !upcomingBookings || upcomingBookings.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-8">
          <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
          <Text className="mt-2 text-sm text-gray-400">
            No upcoming appointments
          </Text>
        </View>
      ) : (
        <View className={isTablet ? "flex-row flex-wrap gap-3" : "gap-2"}>
          {upcomingBookings.slice(0, 7).map((booking) => (
            <TouchableOpacity
              key={booking.id}
              className={`rounded-xl border border-gray-100 bg-white p-4 ${
                isTablet ? "w-[48%]" : ""
              }`}
              onPress={() =>
                router.push(
                  `/(app)/(tabs)/more/bookings/${booking.id}` as any,
                )
              }
              accessibilityLabel={`Upcoming: ${booking.customers?.full_name ?? "Walk-in"} at ${formatRelativeDate(booking.scheduled_at)}`}
              accessibilityRole="button"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Avatar
                      name={booking.customers?.full_name ?? "Guest"}
                      size="sm"
                    />
                    <View className="ml-2.5 flex-1">
                      <Text
                        className="text-sm font-semibold text-gray-900"
                        numberOfLines={1}
                      >
                        {booking.customers?.full_name ?? "Walk-in"}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {formatRelativeDate(booking.scheduled_at)}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-2">
                    {booking.services?.slice(0, 2).map((s, i) => (
                      <Text
                        key={i}
                        className="text-xs text-gray-600"
                        numberOfLines={1}
                      >
                        {s.name ?? s.offering_name ?? "Service"}
                        {s.guest_name ? ` (${s.guest_name})` : ""} ({formatDuration(s.duration_minutes)})
                      </Text>
                    ))}
                  </View>
                  {booking.is_group_booking && booking.group_booking_ref && (
                    <Text className="mt-1 text-[10px] text-gray-500" numberOfLines={1}>
                      Group: {booking.group_booking_ref}
                    </Text>
                  )}
                </View>
                <View className="items-end">
                  <Badge status={booking.status} />
                  <Text className="mt-2 text-sm font-semibold text-gray-900">
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
      {activityError && !recentActivity ? (
        <View className="items-center rounded-xl border border-dashed border-red-200 bg-red-50 py-4">
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text className="mt-1 text-xs text-red-500">Failed to load</Text>
        </View>
      ) : !recentActivity || recentActivity.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-6">
          <Ionicons name="pulse-outline" size={28} color="#d1d5db" />
          <Text className="mt-2 text-sm text-gray-400">
            No recent activity
          </Text>
        </View>
      ) : (
        <View className="rounded-2xl border border-gray-100 bg-white">
          {recentActivity.map((item, idx) => {
            const iconInfo = getActivityIcon(item.type);
            return (
              <TouchableOpacity
                key={item.id}
                className={`flex-row items-center px-4 py-3 ${
                  idx < recentActivity.length - 1
                    ? "border-b border-gray-50"
                    : ""
                }`}
                onPress={() => {
                  if (item.data?.booking_id) {
                    router.push(
                      `/(app)/(tabs)/more/bookings/${item.data.booking_id}` as any,
                    );
                  }
                }}
                accessibilityLabel={`${item.description}, ${formatTimeAgo(item.created_at)}`}
                accessibilityRole="button"
              >
                <View
                  className={`${iconInfo.bg} h-10 w-10 items-center justify-center rounded-xl`}
                >
                  <Ionicons
                    name={iconInfo.name}
                    size={18}
                    color={iconInfo.color}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <Text
                    className="text-sm text-gray-900"
                    numberOfLines={1}
                  >
                    {item.description}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    {formatTimeAgo(item.created_at)}
                  </Text>
                </View>
                {item.data?.amount != null && (
                  <Text className="text-sm font-semibold text-gray-900">
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
        onAction={() => router.push("/(app)/(tabs)/calendar" as any)}
      />
      {todayBookingsError && !todayBookings ? (
        <View className="items-center rounded-xl border border-dashed border-red-200 bg-red-50 py-4">
          <Ionicons name="alert-circle-outline" size={22} color="#ef4444" />
          <Text className="mt-1 text-xs text-red-500">Failed to load appointments</Text>
        </View>
      ) : !todayBookings || todayBookings.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-8">
          <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
          <Text className="mt-2 text-sm text-gray-400">
            No appointments today
          </Text>
        </View>
      ) : (
        <View className={isTablet ? "flex-row flex-wrap gap-3" : "gap-2"}>
          {todayBookings
            .slice(0, isTablet ? 6 : 4)
            .map((booking) => (
              <TouchableOpacity
                key={booking.id}
                className={`rounded-xl border border-gray-100 bg-white p-4 ${
                  isTablet ? "w-[48%]" : ""
                }`}
                onPress={() =>
                  router.push(
                    `/(app)/(tabs)/more/bookings/${booking.id}` as any,
                  )
                }
                accessibilityLabel={`Today: ${booking.customers?.full_name ?? "Walk-in"}`}
                accessibilityRole="button"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Avatar
                        name={booking.customers?.full_name ?? "Guest"}
                        size="sm"
                      />
                      <View className="ml-2.5 flex-1">
                        <Text
                          className="text-sm font-semibold text-gray-900"
                          numberOfLines={1}
                        >
                          {booking.customers?.full_name ?? "Walk-in"}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {formatRelativeDate(booking.scheduled_at)}
                        </Text>
                      </View>
                    </View>
                    <View className="mt-2">
                      {booking.services?.slice(0, 2).map((s, i) => (
                        <Text
                          key={i}
                          className="text-xs text-gray-600"
                          numberOfLines={1}
                        >
                          {s.name ?? s.offering_name ?? "Service"}
                          {s.guest_name ? ` (${s.guest_name})` : ""} ({formatDuration(s.duration_minutes)})
                        </Text>
                      ))}
                    </View>
                    {booking.is_group_booking && booking.group_booking_ref && (
                      <Text className="mt-1 text-[10px] text-gray-500" numberOfLines={1}>
                        Group: {booking.group_booking_ref}
                      </Text>
                    )}
                  </View>
                  <View className="items-end">
                    <Badge status={booking.status} />
                    <Text className="mt-2 text-sm font-semibold text-gray-900">
                      {formatCurrency(booking.total_amount, booking.currency)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
        </View>
      )}

      <View className="h-8" />
    </ScreenContainer>
  );
}

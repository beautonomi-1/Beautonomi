/**
 * Service zones analytics – zone performance for at-home bookings.
 * GET /api/provider/service-zones/analytics?start_date=&end_date=
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/format";
import { getReportDateRange } from "@/lib/reportDateRanges";
import { useProvider } from "@/providers/ProviderContext";
import { twStyle } from "@/lib/twStyle";

interface ZoneStat {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  is_active: boolean;
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_revenue: number;
  total_travel_fees: number;
  average_booking_value: number;
  completion_rate: number;
}

interface AnalyticsResponse {
  zones: ZoneStat[];
  summary: {
    total_zones: number;
    active_zones: number;
    total_at_home_bookings: number;
    total_revenue: number;
    total_travel_fees: number;
    average_booking_value: number;
  };
  period: { start_date: string | null; end_date: string | null };
}

const PERIOD_KEYS = {
  week: "periodWeek",
  month: "periodMonth",
  quarter: "periodQuarter",
} as const;

export default function ServiceZonesAnalyticsScreen() {
  const { t } = useTranslation();
  const sz = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.serviceZonesAnalytics.${key}`, opts) as string,
    [t],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const { provider } = useProvider();
  const rangeKey = period === "week" ? "week" : period === "month" ? "month" : "3months";
  const { from: startStr, to: endStr } = getReportDateRange(rangeKey, {
    timezone: provider?.timezone,
  });

  const { data, loading, error, refresh } = useApi<AnalyticsResponse>(
    `/api/provider/service-zones/analytics?start_date=${startStr}&end_date=${endStr}`
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message={sz("loading")} />
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={sz("title")} showBack subtitle={sz("subtitle")} />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const summary = data?.summary;
  const zones = data?.zones ?? [];

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title={sz("title")}
        showBack
        subtitle={sz("subtitle")}
      />
      <View style={twStyle("mb-3 flex-row")}>
        {(["week", "month", "quarter"] as const).map((p, i) => (
          <TouchableOpacity
            key={p}
            style={[twStyle(`flex-1 rounded-xl border py-2 ${
              period === p ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white"
            }`), i < 2 ? { marginEnd: 8 } : undefined]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={twStyle(`text-center text-sm font-medium ${
                period === p ? "text-indigo-700" : "text-gray-600"
              }`)}
            >
              {sz(PERIOD_KEYS[p])}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {summary && (
        <>
          <SectionHeader title={sz("summary")} />
          <View style={twStyle("mb-4 flex-row flex-wrap")}>
            <View style={[twStyle("flex-1 min-w-[100px]"), { marginEnd: 12, marginBottom: 12 }]}>
              <StatCard
                title={sz("statZones")}
                value={`${summary.active_zones}/${summary.total_zones}`}
                icon="map-outline"
                iconColor="#6366f1"
                iconBg="bg-indigo-50"
                compact
              />
            </View>
            <View style={[twStyle("flex-1 min-w-[100px]"), { marginEnd: 12, marginBottom: 12 }]}>
              <StatCard
                title={sz("statAtHome")}
                value={String(summary.total_at_home_bookings)}
                icon="car-outline"
                iconColor="#22c55e"
                iconBg="bg-green-50"
                compact
              />
            </View>
            <View style={[twStyle("flex-1 min-w-[100px]"), { marginEnd: 12, marginBottom: 12 }]}>
              <StatCard
                title={sz("statRevenue")}
                value={formatCurrency(summary.total_revenue)}
                icon="cash-outline"
                iconColor="#f59e0b"
                iconBg="bg-amber-50"
                compact
              />
            </View>
            <View style={[twStyle("flex-1 min-w-[100px]"), { marginEnd: 12, marginBottom: 12 }]}>
              <StatCard
                title={sz("statTravelFees")}
                value={formatCurrency(summary.total_travel_fees)}
                icon="navigate-outline"
                iconColor="#0891b2"
                iconBg="bg-cyan-50"
                compact
              />
            </View>
          </View>
        </>
      )}
      <SectionHeader title={sz("byZone")} />
      {zones.length === 0 ? (
        <EmptyState
          icon="map-outline"
          title={sz("emptyTitle")}
          description={sz("emptyDescription")}
        />
      ) : (
        <View>
          {zones.map((z, idx) => (
            <View
              key={z.zone_id}
              style={[twStyle("rounded-xl border border-gray-100 bg-white p-4"), idx > 0 ? { marginTop: 8 } : undefined]}
            >
              <View style={twStyle("flex-row items-center justify-between")}>
                <Text style={twStyle("font-medium text-gray-900")}>{z.zone_name}</Text>
                <View
                  style={twStyle(`rounded-full px-2 py-0.5 ${
                    z.is_active ? "bg-green-50" : "bg-gray-100"
                  }`)}
                >
                  <Text
                    style={twStyle(`text-[10px] font-medium ${
                      z.is_active ? "text-green-700" : "text-gray-500"
                    }`)}
                  >
                    {z.is_active ? sz("active") : sz("inactive")}
                  </Text>
                </View>
              </View>
              <View style={twStyle("mt-2 flex-row flex-wrap")}>
                <Text style={[twStyle("text-xs text-gray-500"), { marginEnd: 12 }]}>
                  {sz("bookingsLine", { total: z.total_bookings, completed: z.completed_bookings })}
                </Text>
                <Text style={[twStyle("text-xs text-gray-500"), { marginEnd: 12 }]}>
                  {sz("revenueLine", { amount: formatCurrency(z.total_revenue) })}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {sz("travelLine", { amount: formatCurrency(z.total_travel_fees) })}
                </Text>
              </View>
              <View style={twStyle("mt-1 flex-row")}>
                <Text style={[twStyle("text-[10px] text-gray-400"), { marginEnd: 8 }]}>
                  {sz("completionLine", { percent: z.completion_rate.toFixed(0) })}
                </Text>
                <Text style={twStyle("text-[10px] text-gray-400")}>
                  {sz("avgLine", { amount: formatCurrency(z.average_booking_value) })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}

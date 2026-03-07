/**
 * Service zones analytics – zone performance for at-home bookings.
 * GET /api/provider/service-zones/analytics?start_date=&end_date=
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/format";
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

export default function ServiceZonesAnalyticsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const now = new Date();
  const start =
    period === "week"
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : period === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);

  const { data, loading, refresh } = useApi<AnalyticsResponse>(
    `/api/provider/service-zones/analytics?start_date=${startStr}&end_date=${endStr}`
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading zone analytics..." />
      </ScreenContainer>
    );
  }

  const summary = data?.summary;
  const zones = data?.zones ?? [];

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Zone analytics"
        showBack
        subtitle="At-home booking performance"
      />
      <View style={twStyle("mb-3 flex-row")}>
        {(["week", "month", "quarter"] as const).map((p, i) => (
          <TouchableOpacity
            key={p}
            style={[twStyle(`flex-1 rounded-xl border py-2 ${
              period === p ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white"
            }`), i < 2 ? { marginRight: 8 } : undefined]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={twStyle(`text-center text-sm font-medium capitalize ${
                period === p ? "text-indigo-700" : "text-gray-600"
              }`)}
            >
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {summary && (
        <>
          <SectionHeader title="Summary" />
          <View style={twStyle("mb-4 flex-row flex-wrap")}>
            <View style={[twStyle("flex-1 min-w-[100px]"), { marginRight: 12, marginBottom: 12 }]}>
              <StatCard
                title="Zones"
                value={`${summary.active_zones}/${summary.total_zones}`}
                icon="map-outline"
                iconColor="#6366f1"
                iconBg="bg-indigo-50"
                compact
              />
            </View>
            <View style={[twStyle("flex-1 min-w-[100px]"), { marginRight: 12, marginBottom: 12 }]}>
              <StatCard
                title="At-home bookings"
                value={String(summary.total_at_home_bookings)}
                icon="car-outline"
                iconColor="#22c55e"
                iconBg="bg-green-50"
                compact
              />
            </View>
            <View style={[twStyle("flex-1 min-w-[100px]"), { marginRight: 12, marginBottom: 12 }]}>
              <StatCard
                title="Revenue"
                value={formatCurrency(summary.total_revenue)}
                icon="cash-outline"
                iconColor="#f59e0b"
                iconBg="bg-amber-50"
                compact
              />
            </View>
            <View style={[twStyle("flex-1 min-w-[100px]"), { marginRight: 12, marginBottom: 12 }]}>
              <StatCard
                title="Travel fees"
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
      <SectionHeader title="By zone" />
      {zones.length === 0 ? (
        <EmptyState
          icon="map-outline"
          title="No zone data"
          description="Add service zones and complete at-home bookings to see analytics."
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
                    {z.is_active ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>
              <View style={twStyle("mt-2 flex-row flex-wrap")}>
                <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 12 }]}>
                  Bookings: {z.total_bookings} ({z.completed_bookings} completed)
                </Text>
                <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 12 }]}>
                  Revenue: {formatCurrency(z.total_revenue)}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  Travel: {formatCurrency(z.total_travel_fees)}
                </Text>
              </View>
              <View style={twStyle("mt-1 flex-row")}>
                <Text style={[twStyle("text-[10px] text-gray-400"), { marginRight: 8 }]}>
                  Completion: {z.completion_rate.toFixed(0)}%
                </Text>
                <Text style={twStyle("text-[10px] text-gray-400")}>
                  Avg: {formatCurrency(z.average_booking_value)}
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

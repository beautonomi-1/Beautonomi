import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type BookingSummary = {
  totalBookings?: number;
  totalRevenue?: number;
  averageBookingValue?: number;
  statusBreakdown?: { status: string; count: number; revenue: number }[];
  topServices?: { serviceName: string; bookings: number; revenue: number }[];
};

export default function ReportsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<BookingSummary>(
    "/api/provider/reports/bookings/summary"
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Reports" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Reports" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const summary = data as BookingSummary;
  const totalBookings = summary?.totalBookings ?? 0;
  const totalRevenue = summary?.totalRevenue ?? 0;
  const avgValue = summary?.averageBookingValue ?? 0;
  const topServices = summary?.topServices ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Reports"
        subtitle="Analytics, activity & insights"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-xl border border-gray-200 bg-white p-4 mb-3">
          <Text className="text-sm text-gray-500">Last 30 days</Text>
          <View className="mt-2 flex-row flex-wrap gap-6">
            <View>
              <Text className="text-2xl font-bold text-gray-900">{totalBookings}</Text>
              <Text className="text-xs text-gray-500">Bookings</Text>
            </View>
            <View>
              <Text className="text-2xl font-bold text-gray-900">
                ZAR {(totalRevenue || 0).toLocaleString()}
              </Text>
              <Text className="text-xs text-gray-500">Revenue</Text>
            </View>
            <View>
              <Text className="text-2xl font-bold text-gray-900">
                ZAR {(avgValue || 0).toLocaleString()}
              </Text>
              <Text className="text-xs text-gray-500">Avg. booking</Text>
            </View>
          </View>
        </View>

        {topServices.length > 0 && (
          <View className="mb-3">
            <Text className="text-sm font-medium text-gray-700 mb-2">Top services</Text>
            {topServices.slice(0, 5).map((s, i) => (
              <View
                key={i}
                className="flex-row items-center justify-between rounded-xl border border-gray-200 bg-white p-3 mb-2"
              >
                <Text className="font-medium text-gray-900" numberOfLines={1}>
                  {s.serviceName}
                </Text>
                <View className="flex-row items-center gap-3">
                  <Text className="text-sm text-gray-500">{s.bookings} bookings</Text>
                  <Text className="text-sm font-medium text-gray-700">
                    ZAR {(s.revenue || 0).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <Text className="text-sm text-gray-600">
            For full reports, breakdowns by location, and exports, use the provider dashboard on the web.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

type BookingSummary = {
  totalBookings?: number;
  totalRevenue?: number;
  averageBookingValue?: number;
  statusBreakdown?: { status: string; count: number; revenue: number }[];
  topServices?: { serviceName: string; bookings: number; revenue: number }[];
};

export default function ReportsScreen() {
  const router = useRouter();
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const summaryUrl = selectedLocationId
    ? `/api/provider/reports/bookings/summary?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/reports/bookings/summary";
  const { data, loading, error, refresh } = useApi<BookingSummary>(summaryUrl);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Reports" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Reports" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Last 30 days</Text>
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap" }}>
            <View style={{ marginRight: 24, marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{totalBookings}</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Bookings</Text>
            </View>
            <View style={{ marginRight: 24, marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>
                ZAR {(totalRevenue || 0).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Revenue</Text>
            </View>
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>
                ZAR {(avgValue || 0).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Avg. booking</Text>
            </View>
          </View>
        </View>

        {topServices.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>Top services</Text>
            {topServices.slice(0, 5).map((s, i) => (
              <View
                key={i}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 12, marginBottom: 8 }}
              >
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                  {s.serviceName}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[500], marginRight: 12 }}>{s.bookings} bookings</Text>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
                    ZAR {(s.revenue || 0).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 16 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
            For full reports, breakdowns by location, and exports, use the provider dashboard on the web.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

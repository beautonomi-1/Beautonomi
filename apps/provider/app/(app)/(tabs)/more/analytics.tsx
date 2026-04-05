import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrencyShort } from "@/lib/format";
import { trackScreenView } from "@/lib/analytics";
import { twStyle } from "@/lib/twStyle";

/** Matches GET /api/provider/analytics response */
interface AnalyticsData {
  revenue: { total: number; thisMonth: number; lastMonth: number; growth: string };
  bookings: { total: number; thisMonth: number; lastMonth: number; upcoming: number; growth: string };
  customers: { total: number; repeat: number; new: number };
  services: { name: string; count: number; revenue: number }[];
  trends: { month: string; revenue: number; bookings: number }[];
}

const formatCurrency = formatCurrencyShort;

export default function AnalyticsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { screenPadding } = useResponsive();
  const { data, loading, error, refresh } = useApi<AnalyticsData>("/api/provider/analytics");

  useEffect(() => {
    trackScreenView("provider_analytics");
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Analytics" showBack />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Analytics" showBack />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const rev = data?.revenue ?? { total: 0, thisMonth: 0, lastMonth: 0, growth: "0" };
  const book = data?.bookings ?? { total: 0, thisMonth: 0, lastMonth: 0, upcoming: 0, growth: "0" };
  const cust = data?.customers ?? { total: 0, repeat: 0, new: 0 };

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Analytics" showBack />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4 flex-row flex-wrap")}>
          <View style={[twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginRight: 12, marginBottom: 12 }]}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-violet-50")}>
                <Ionicons name="trending-up-outline" size={20} color="#8b5cf6" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {formatCurrency(rev.thisMonth ?? 0)}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>Revenue this month</Text>
            {rev.growth !== "0" && (
              <Text style={twStyle(`mt-0.5 text-xs font-medium ${parseFloat(rev.growth) >= 0 ? "text-green-600" : "text-red-600"}`)}>
                {parseFloat(rev.growth) >= 0 ? "+" : ""}{rev.growth}% vs last month
              </Text>
            )}
          </View>
          <View style={[twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginRight: 12, marginBottom: 12 }]}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-indigo-50")}>
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {book.upcoming ?? 0}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>Upcoming bookings</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {book.thisMonth ?? 0} this month
            </Text>
          </View>
          <View style={twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4")}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-teal-50")}>
                <Ionicons name="people-outline" size={20} color="#14b8a6" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {cust.total ?? 0}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>Total customers</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {cust.repeat ?? 0} repeat · {cust.new ?? 0} new
            </Text>
          </View>
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}

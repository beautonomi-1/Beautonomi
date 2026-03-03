import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

interface DashboardData {
  total_bookings: number;
  confirmed_bookings: number;
  completed_bookings: number;
  pending_bookings: number;
  revenue_this_month: number;
  revenue_today: number;
  revenue_growth: number;
  available_balance: number;
  pending_payments_count: number;
  appointments_today: number;
  appointments_this_week: number;
  average_rating: number;
  total_reviews: number;
  completion_rate: number;
  gamification?: {
    total_points: number;
    current_badge: { name: string; color: string } | null;
    recent_transactions: { points: number; source: string; description: string | null; created_at: string }[];
  } | null;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `R${(amount / 1e6).toFixed(1)}m`;
  if (amount >= 1000) return `R${(amount / 1000).toFixed(1)}k`;
  return `R${amount.toFixed(0)}`;
}

export default function ActivityScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<DashboardData>("/api/provider/dashboard");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Activity" showBack />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Activity" showBack />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const d = data as DashboardData | null;
  const stats = d ?? ({} as DashboardData);
  const recent = stats.gamification?.recent_transactions ?? [];

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Activity" showBack />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        <View className="mb-4 flex-row flex-wrap gap-3">
          <View className="min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4">
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
              </View>
              <Text className="ml-2 text-2xl font-bold text-gray-900">
                {stats.appointments_today ?? 0}
              </Text>
            </View>
            <Text className="mt-1 text-xs text-gray-500">Appointments today</Text>
          </View>
          <View className="min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4">
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <Ionicons name="cash-outline" size={20} color="#059669" />
              </View>
              <Text className="ml-2 text-lg font-bold text-gray-900">
                {formatCurrency(stats.revenue_this_month ?? 0)}
              </Text>
            </View>
            <Text className="mt-1 text-xs text-gray-500">Revenue this month</Text>
            {(stats.revenue_growth ?? 0) !== 0 && (
              <Text
                className={`mt-0.5 text-xs font-medium ${(stats.revenue_growth ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {(stats.revenue_growth ?? 0) >= 0 ? "+" : ""}
                {stats.revenue_growth}% vs last month
              </Text>
            )}
          </View>
          <View className="min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4">
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                <Ionicons name="wallet-outline" size={20} color="#d97706" />
              </View>
              <Text className="ml-2 text-lg font-bold text-gray-900">
                {formatCurrency(stats.available_balance ?? 0)}
              </Text>
            </View>
            <Text className="mt-1 text-xs text-gray-500">Available balance</Text>
          </View>
          <View className="min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4">
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                <Ionicons name="star-outline" size={20} color="#e11d48" />
              </View>
              <Text className="ml-2 text-lg font-bold text-gray-900">
                {(stats.average_rating ?? 0).toFixed(1)}
              </Text>
            </View>
            <Text className="mt-1 text-xs text-gray-500">
              {stats.total_reviews ?? 0} reviews
            </Text>
          </View>
        </View>

        {/* Points & recent activity */}
        {stats.gamification && (
          <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-gray-900">
                Reward points
              </Text>
              <View className="flex-row items-center rounded-full bg-amber-50 px-2.5 py-1">
                <Ionicons name="trophy-outline" size={14} color="#b45309" />
                <Text className="ml-1 text-sm font-semibold text-amber-800">
                  {stats.gamification.total_points ?? 0} pts
                </Text>
              </View>
            </View>
            {stats.gamification.current_badge && (
              <Text className="mt-1 text-xs text-gray-500">
                Badge: {stats.gamification.current_badge.name}
              </Text>
            )}
          </View>
        )}

        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-gray-700">
            Recent activity
          </Text>
        </View>
        {recent.length === 0 ? (
          <View className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6">
            <Text className="text-center text-sm text-gray-500">
              No recent point activity. Complete bookings and grow your business to earn rewards.
            </Text>
          </View>
        ) : (
          <View className="rounded-2xl border border-gray-100 bg-white">
            {recent.slice(0, 10).map((tx, i) => (
              <View
                key={tx.created_at + i}
                className={`flex-row items-center justify-between border-gray-100 px-4 py-3 ${i > 0 ? "border-t" : ""}`}
              >
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900">
                    {tx.description || tx.source || "Points"}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    {new Date(tx.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-green-600">
                  +{tx.points}
                </Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </ScreenContainer>
  );
}

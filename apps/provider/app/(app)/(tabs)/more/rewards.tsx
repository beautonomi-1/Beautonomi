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

interface PointsTransaction {
  id: string;
  points: number;
  source: string;
  source_id?: string | null;
  description?: string | null;
  created_at: string;
}

interface GamificationResponse {
  points?: {
    total: number;
    lifetime: number;
    current_tier: number;
    last_calculated?: string | null;
  };
  current_badge?: {
    id: string;
    name: string;
    description?: string | null;
    tier: number;
    color?: string | null;
    earned_at?: string | null;
  } | null;
  transactions?: PointsTransaction[];
  provider_stats?: {
    total_bookings: number;
    review_count: number;
    rating_average: number;
    total_earnings: number;
  };
}

/** Content-only for use in Rewards hub (Points tab). */
export function RewardsPointsContent() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<GamificationResponse>(
    "/api/provider/gamification?limit=30"
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const points = data?.points ?? { total: 0, lifetime: 0, current_tier: 0 };
  const badge = data?.current_badge ?? null;
  const transactions = data?.transactions ?? [];
  const stats = data?.provider_stats;

  if (loading && !data) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-6 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-gray-200 bg-white p-4">
            <View className="mb-1 h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
              <Ionicons name="trophy-outline" size={18} color="#f59e0b" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">{points.total}</Text>
            <Text className="text-sm text-gray-500">Current points</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-gray-200 bg-white p-4">
            <View className="mb-1 h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <Ionicons name="flash-outline" size={18} color="#10b981" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">{points.lifetime}</Text>
            <Text className="text-sm text-gray-500">Lifetime points</Text>
          </View>
        </View>

        {badge && (
          <View className="mb-6 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
            <Text className="mb-2 text-sm font-semibold text-gray-700">Current badge</Text>
            <View className="flex-row items-center">
              <View
                className="h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: badge.color ? `${badge.color}30` : "#fef3c7" }}
              >
                <Ionicons name="ribbon-outline" size={24} color={badge.color ?? "#f59e0b"} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-semibold text-gray-900">{badge.name}</Text>
                {badge.description ? (
                  <Text className="mt-0.5 text-sm text-gray-600" numberOfLines={2}>
                    {badge.description}
                  </Text>
                ) : null}
                {badge.earned_at && (
                  <Text className="mt-1 text-xs text-gray-500">
                    Earned {new Date(badge.earned_at).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {stats && (stats.total_bookings > 0 || stats.review_count > 0) && (
          <View className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
            <Text className="mb-3 text-sm font-semibold text-gray-700">Activity</Text>
            <View className="flex-row flex-wrap gap-4">
              <View>
                <Text className="text-lg font-bold text-gray-900">{stats.total_bookings}</Text>
                <Text className="text-xs text-gray-500">Bookings</Text>
              </View>
              <View>
                <Text className="text-lg font-bold text-gray-900">{stats.review_count}</Text>
                <Text className="text-xs text-gray-500">Reviews</Text>
              </View>
              {typeof stats.rating_average === "number" && stats.rating_average > 0 && (
                <View>
                  <Text className="text-lg font-bold text-gray-900">
                    {stats.rating_average.toFixed(1)}
                  </Text>
                  <Text className="text-xs text-gray-500">Avg rating</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <Text className="mb-2 text-sm font-semibold text-gray-700">Recent points</Text>
        {transactions.length === 0 ? (
          <View className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
            <Text className="text-sm text-gray-500">No point transactions yet.</Text>
            <Text className="mt-1 text-xs text-gray-400">
              Complete bookings and get reviews to earn points.
            </Text>
          </View>
        ) : (
          <View className="rounded-xl border border-gray-200 bg-white">
            {transactions.slice(0, 20).map((t) => (
              <View
                key={t.id}
                className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3 last:border-b-0"
              >
                <View className="flex-1 min-w-0">
                  <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                    {t.description ?? t.source ?? "Points"}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    {new Date(t.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text
                  className={`text-sm font-semibold ${Number(t.points) >= 0 ? "text-emerald-600" : "text-gray-600"}`}
                >
                  {Number(t.points) >= 0 ? "+" : ""}{t.points}
                </Text>
              </View>
            ))}
          </View>
        )}
    </ScrollView>
  );
}

export default function RewardsScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Rewards" showBack subtitle="Points & achievements" />
      <RewardsPointsContent />
    </ScreenContainer>
  );
}

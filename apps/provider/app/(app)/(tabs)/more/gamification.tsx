import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";

interface Milestone {
  id: string;
  milestone_type: string;
  achieved_at: string;
  metadata?: Record<string, unknown> | null;
}

interface ProgressToNext {
  badge: { name: string; tier: number; requirements?: { points?: number } };
  current_points: number;
  required_points: number;
  points_needed: number;
  progress_percentage: number;
}

interface GamificationResponse {
  points?: { total: number; lifetime: number; current_tier: number };
  current_badge?: {
    id: string;
    name: string;
    description?: string | null;
    tier: number;
    color?: string | null;
    icon_url?: string | null;
  } | null;
  milestones?: Milestone[];
  progress_to_next_badge?: ProgressToNext | null;
  provider_stats?: { total_bookings: number; review_count: number };
}

/** Content-only for use in Rewards hub (Badges tab). */
export function GamificationBadgesContent() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<GamificationResponse>(
    "/api/provider/gamification"
  );
  const { execute: recalculate, loading: recalculating } = useApiMutation("post");
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);
  const handleRecalculate = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await recalculate("/api/provider/gamification", {});
    if (err) return;
    await refresh();
  }, [recalculate, refresh]);

  const points = data?.points ?? { total: 0, lifetime: 0, current_tier: 0 };
  const badge = data?.current_badge ?? null;
  const milestones = data?.milestones ?? [];
  const progress = data?.progress_to_next_badge ?? null;

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
        <View className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-medium text-gray-600">Total points</Text>
              <Text className="text-2xl font-bold text-gray-900">{points.total}</Text>
            </View>
            {badge && (
              <View
                className="flex-row items-center rounded-xl px-3 py-2"
                style={{ backgroundColor: badge.color ? `${badge.color}25` : "#d1fae5" }}
              >
                <Ionicons name="ribbon" size={20} color={badge.color ?? "#059669"} />
                <Text className="ml-2 font-semibold text-gray-800">{badge.name}</Text>
              </View>
            )}
          </View>
        </View>

        {progress && (
          <View className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
            <Text className="mb-2 text-sm font-semibold text-gray-700">Progress to next badge</Text>
            <Text className="text-sm text-gray-600">
              {progress.badge.name} — {progress.current_points} / {progress.required_points} pts
            </Text>
            <View className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <View
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.min(100, progress.progress_percentage)}%` }}
              />
            </View>
            <Text className="mt-1 text-xs text-gray-500">
              {progress.points_needed} points to go
            </Text>
          </View>
        )}

        {milestones.length > 0 && (
          <View className="mb-6">
            <Text className="mb-2 text-sm font-semibold text-gray-700">Milestones</Text>
            <View className="rounded-xl border border-gray-200 bg-white">
              {milestones.slice(0, 15).map((m) => (
                <View
                  key={m.id}
                  className="flex-row items-center border-b border-gray-100 px-4 py-3 last:border-b-0"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                    <Ionicons name="flag-outline" size={18} color="#059669" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-medium text-gray-900 capitalize">
                      {String(m.milestone_type).replace(/_/g, " ")}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {new Date(m.achieved_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {!badge && points.total === 0 && milestones.length === 0 && (
          <View className="mb-6 rounded-2xl border border-gray-100 bg-gray-50/50 p-6">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Ionicons name="ribbon-outline" size={28} color="#10b981" />
            </View>
            <Text className="text-center font-medium text-gray-900">No badges yet</Text>
            <Text className="mt-1 text-center text-sm text-gray-500">
              Earn points from bookings and reviews to unlock badges and milestones.
            </Text>
          </View>
        )}

        <ActionButton
          label={recalculating ? "Recalculating…" : "Recalculate points"}
          onPress={handleRecalculate}
          loading={recalculating}
          fullWidth
        />
      </ScrollView>
  );
}

export default function GamificationScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Badges & Gamification"
        showBack
        subtitle="Points, badges & milestones"
      />
      <GamificationBadgesContent />
    </ScreenContainer>
  );
}

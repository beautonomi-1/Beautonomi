import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";

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

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

/** Content-only for use in Rewards hub (Badges tab). */
export function GamificationBadgesContent() {
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<GamificationResponse>(
    "/api/provider/gamification"
  );
  const { execute: recalculate, loading: recalculating } = useApiMutation("post");
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  const handleRecalculate = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await recalculate("/api/provider/gamification", {});
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    await refresh();
  }, [recalculate, refresh]);

  const points = data?.points ?? { total: 0, lifetime: 0, current_tier: 0 };
  const badge = data?.current_badge ?? null;
  const milestones = data?.milestones ?? [];
  const progress = data?.progress_to_next_badge ?? null;

  if (loading && !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: "#a7f3d0", backgroundColor: "rgba(236,253,245,0.5)", padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>Total points</Text>
              <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{points.total}</Text>
            </View>
            {badge && (
              <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: badge.color ? `${badge.color}25` : "#d1fae5" }}>
                <Ionicons name="ribbon" size={20} color={badge.color ?? "#059669"} />
                <Text style={{ marginLeft: 8, fontWeight: "600", color: Colors.gray[800] }}>{badge.name}</Text>
              </View>
            )}
          </View>
        </View>

        {progress && (
          <View style={{ marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Progress to next badge</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
              {progress.badge.name} — {progress.current_points} / {progress.required_points} pts
            </Text>
            <View style={{ marginTop: 8, height: 8, overflow: "hidden", borderRadius: 9999, backgroundColor: Colors.gray[100] }}>
              <View style={{ height: "100%", borderRadius: 9999, backgroundColor: "#10b981", width: `${Math.min(100, progress.progress_percentage)}%` }} />
            </View>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{progress.points_needed} points to go</Text>
          </View>
        )}

        {milestones.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Milestones</Text>
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}>
              {milestones.slice(0, 15).map((m, idx) => (
                <View
                  key={m.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderBottomWidth: idx < Math.min(15, milestones.length) - 1 ? 1 : 0,
                    borderBottomColor: Colors.gray[100],
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <View style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#d1fae5" }}>
                    <Ionicons name="flag-outline" size={18} color="#059669" />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontWeight: "500", color: Colors.gray[900], textTransform: "capitalize" }}>
                      {String(m.milestone_type).replace(/_/g, " ")}
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{formatDateSafe(m.achieved_at)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {!badge && points.total === 0 && milestones.length === 0 && (
          <View style={{ marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", padding: 24 }}>
            <View style={{ marginBottom: 12, height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#d1fae5" }}>
              <Ionicons name="ribbon-outline" size={28} color="#10b981" />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "500", color: Colors.gray[900] }}>No badges yet</Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
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

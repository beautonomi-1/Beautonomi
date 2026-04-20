import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { formatCurrency } from "@/lib/format";

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
    icon_url?: string | null;
    earned_at?: string | null;
    expires_at?: string | null;
  } | null;
  transactions?: PointsTransaction[];
  provider_stats?: {
    total_bookings: number;
    review_count: number;
    rating_average: number;
    /** Net provider earnings from ledger (aligned with GET /api/provider/gamification). */
    total_earnings?: number;
  };
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

/** Content-only for use in Rewards hub (Points tab). */
export function RewardsPointsContent() {
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<GamificationResponse>(
    "/api/provider/gamification?limit=30"
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const points = data?.points ?? { total: 0, lifetime: 0, current_tier: 0 };
  const badge = data?.current_badge ?? null;
  const transactions = data?.transactions ?? [];
  const stats = data?.provider_stats;

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
      <View style={{ marginBottom: 24, flexDirection: "row" }}>
          <View style={{ flex: 1, marginRight: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ marginBottom: 4, height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#fef3c7" }}>
              <Ionicons name="trophy-outline" size={18} color="#f59e0b" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{points.total}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Current points</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ marginBottom: 4, height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#d1fae5" }}>
              <Ionicons name="flash-outline" size={18} color="#10b981" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{points.lifetime}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Lifetime points</Text>
          </View>
        </View>

        {badge && (
          <View style={{ marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: "#fef3c7", backgroundColor: "rgba(255,251,235,0.5)", padding: 16 }}>
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Current badge</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{ height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: badge.color ? `${badge.color}30` : "#fef3c7", overflow: "hidden" }}
              >
                {badge.icon_url ? (
                  <Image source={{ uri: badge.icon_url }} style={{ width: 40, height: 40 }} contentFit="contain" accessibilityIgnoresInvertColors />
                ) : (
                  <Ionicons name="ribbon-outline" size={24} color={badge.color ?? "#f59e0b"} />
                )}
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{badge.name}</Text>
                {badge.description ? (
                  <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }} numberOfLines={2}>
                    {badge.description}
                  </Text>
                ) : null}
                {badge.earned_at ? (
                  <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
                    Earned {formatDateSafe(badge.earned_at)}
                    {badge.expires_at ? ` · Until ${formatDateSafe(badge.expires_at)}` : ""}
                  </Text>
                ) : badge.expires_at ? (
                  <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Until {formatDateSafe(badge.expires_at)}</Text>
                ) : null}
              </View>
            </View>
          </View>
        )}

        {stats &&
          (stats.total_bookings > 0 ||
            stats.review_count > 0 ||
            (typeof stats.rating_average === "number" && stats.rating_average > 0) ||
            (typeof stats.total_earnings === "number" && stats.total_earnings > 0)) && (
          <View style={{ marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}>
            <Text style={{ marginBottom: 12, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Activity</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <View style={{ marginRight: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{stats.total_bookings}</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Bookings</Text>
              </View>
              <View style={{ marginRight: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{stats.review_count}</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Reviews</Text>
              </View>
              {typeof stats.rating_average === "number" && stats.rating_average > 0 && (
                <View style={{ marginRight: 16, marginBottom: 16 }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
                    {stats.rating_average.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Avg rating</Text>
                </View>
              )}
              {typeof stats.total_earnings === "number" && stats.total_earnings > 0 && (
                <View style={{ marginRight: 16, marginBottom: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }} numberOfLines={1}>
                    {formatCurrency(stats.total_earnings)}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Net earnings</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Recent points</Text>
        {transactions.length === 0 ? (
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", padding: 16 }}>
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>No point transactions yet.</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[400] }}>
              Complete bookings and get reviews to earn points.
            </Text>
          </View>
        ) : (
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}>
            {transactions.slice(0, 20).map((t, idx) => (
              <View
                key={t.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottomWidth: idx < 19 ? 1 : 0,
                  borderBottomColor: Colors.gray[100],
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                    {t.description ?? t.source ?? "Points"}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                    {formatDateSafe(t.created_at)}
                  </Text>
                </View>
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: Number(t.points) >= 0 ? "#059669" : Colors.gray[600] }}
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

/** Legacy route: same experience as More → Rewards & badges (points + badges tabs). */
export default function RewardsScreen() {
  return <Redirect href="/(app)/(tabs)/more/rewards-hub" />;
}

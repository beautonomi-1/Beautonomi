import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

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
  const { screenPadding } = useResponsive();
  const { selectedLocationId } = useProvider();
  const dashboardUrl = selectedLocationId
    ? `/api/provider/dashboard?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/dashboard";
  const { data, loading, error, refresh } = useApi<DashboardData>(dashboardUrl);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Activity" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Activity" showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        <View style={{ marginBottom: 16, flexDirection: "row", flexWrap: "wrap" }}>
          <View style={{ minWidth: "45%", flex: 1, marginRight: 12, marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#eef2ff" }}>
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
              </View>
              <Text style={{ marginLeft: 8, fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>
                {stats.appointments_today ?? 0}
              </Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Appointments today</Text>
          </View>
          <View style={{ minWidth: "45%", flex: 1, marginRight: 12, marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#ecfdf5" }}>
                <Ionicons name="cash-outline" size={20} color="#059669" />
              </View>
              <Text style={{ marginLeft: 8, fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
                {formatCurrency(stats.revenue_this_month ?? 0)}
              </Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Revenue this month</Text>
            {(stats.revenue_growth ?? 0) !== 0 && (
              <Text
                style={{ marginTop: 2, fontSize: 12, fontWeight: "500", color: (stats.revenue_growth ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}
              >
                {(stats.revenue_growth ?? 0) >= 0 ? "+" : ""}
                {stats.revenue_growth}% vs last month
              </Text>
            )}
          </View>
          <View style={{ minWidth: "45%", flex: 1, marginRight: 12, marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fffbeb" }}>
                <Ionicons name="wallet-outline" size={20} color="#d97706" />
              </View>
              <Text style={{ marginLeft: 8, fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
                {formatCurrency(stats.available_balance ?? 0)}
              </Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>Available balance</Text>
          </View>
          <View style={{ minWidth: "45%", flex: 1, marginRight: 12, marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fff1f2" }}>
                <Ionicons name="star-outline" size={20} color="#e11d48" />
              </View>
              <Text style={{ marginLeft: 8, fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>
                {(stats.average_rating ?? 0).toFixed(1)}
              </Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
              {stats.total_reviews ?? 0} reviews
            </Text>
          </View>
        </View>

        {/* Points & recent activity */}
        {stats.gamification && (
          <View style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                Reward points
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 9999, backgroundColor: "#fffbeb", paddingHorizontal: 10, paddingVertical: 4 }}>
                <Ionicons name="trophy-outline" size={14} color="#b45309" />
                <Text style={{ marginLeft: 4, fontSize: 14, fontWeight: "600", color: "#92400e" }}>
                  {stats.gamification.total_points ?? 0} pts
                </Text>
              </View>
            </View>
            {stats.gamification.current_badge && (
              <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
                Badge: {stats.gamification.current_badge.name}
              </Text>
            )}
          </View>
        )}

        <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>
            Recent activity
          </Text>
        </View>
        {recent.length === 0 ? (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", padding: 24 }}>
            <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              No recent point activity. Complete bookings and grow your business to earn rewards.
            </Text>
          </View>
        ) : (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white }}>
            {recent.slice(0, 10).map((tx, i) => (
              <View
                key={tx.created_at + i}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.gray[100], paddingHorizontal: 16, paddingVertical: 12 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                    {tx.description || tx.source || "Points"}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                    {new Date(tx.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#16a34a" }}>
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

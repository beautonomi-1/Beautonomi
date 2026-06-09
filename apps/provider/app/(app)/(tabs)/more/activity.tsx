import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, formatTimeAgo } from "@/lib/format";
import { Colors } from "@/constants/colors";
import { getProviderActivityIcon } from "@/lib/provider-activity-icons";
import { twStyle } from "@/lib/twStyle";

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

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  created_at: string;
  data?: { booking_id?: string; product_order_id?: string; client_name?: string; amount?: number };
}

interface ActivityFeedPayload {
  activities: ActivityItem[];
  basis?: Record<string, string>;
  timezone?: string;
  window?: { fromYmd: string; toYmd: string };
}

function unwrapActivityFeed(data: ActivityFeedPayload | ActivityItem[] | null | undefined): ActivityItem[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  return data.activities ?? [];
}


export default function ActivityScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [feedLimit, setFeedLimit] = useState(25);
  const { screenPadding } = useResponsive();
  const { selectedLocationId } = useProvider();

  const dashboardUrl = selectedLocationId
    ? `/api/provider/dashboard?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/dashboard";

  const activityFeedUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(feedLimit));
    if (selectedLocationId) p.set("location_id", selectedLocationId);
    return `/api/provider/activity?${p.toString()}`;
  }, [selectedLocationId, feedLimit]);

  const { data, loading, error, refresh } = useApi<DashboardData>(dashboardUrl);
  const {
    data: feedPayload,
    loading: feedLoading,
    error: feedError,
    refresh: refreshFeed,
  } = useApi<ActivityFeedPayload | ActivityItem[]>(activityFeedUrl);

  const feedMeta = useMemo(() => {
    if (feedPayload == null || Array.isArray(feedPayload)) return null;
    return {
      basis: feedPayload.basis,
      timezone: feedPayload.timezone,
      window: feedPayload.window,
    };
  }, [feedPayload]);

  const recent = unwrapActivityFeed(feedPayload);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshFeed()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshFeed]);

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

  const stats = data ?? ({} as DashboardData);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Activity"
        showBack
        subtitle={
          selectedLocationId
            ? "Operational timeline (not a balance sheet) · filtered branch where noted"
            : "Operational timeline — bookings, ledger, reviews (not a balance sheet)"
        }
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {feedMeta?.window?.fromYmd ? (
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>
            Feed window {feedMeta.window.fromYmd} → {feedMeta.window.toYmd}
            {feedMeta.timezone ? ` · ${feedMeta.timezone.replace(/_/g, " ")}` : ""}
          </Text>
        ) : null}

        {/* KPI snapshot — same dashboard definitions */}
        <View style={twStyle("mb-4 flex-row flex-wrap")}>
          <View
            style={[
              twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"),
              { marginRight: 12, marginBottom: 12 },
            ]}
          >
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-indigo-50")}>
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
              </View>
              <Text style={twStyle("ml-2 text-2xl font-bold text-gray-900")}>{stats.appointments_today ?? 0}</Text>
            </View>
            <Text style={twStyle("mt-2 text-xs leading-4 text-gray-500")}>
              Appointments today · scheduled in your calendar day
            </Text>
          </View>
          <View
            style={[
              twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"),
              { marginRight: 12, marginBottom: 12 },
            ]}
          >
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-emerald-50")}>
                <Ionicons name="cash-outline" size={20} color="#059669" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {formatCurrency(stats.revenue_this_month ?? 0)}
              </Text>
            </View>
            <Text style={twStyle("mt-2 text-xs leading-4 text-gray-500")}>
              Ledger net this month (provider_earnings) — dashboard scope
            </Text>
            {(stats.revenue_growth ?? 0) !== 0 ? (
              <Text
                style={twStyle(
                  `mt-1 text-xs font-medium ${(stats.revenue_growth ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`,
                )}
              >
                {(stats.revenue_growth ?? 0) >= 0 ? "+" : ""}
                {stats.revenue_growth}% vs prior month
              </Text>
            ) : null}
          </View>
          <View
            style={[
              twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"),
              { marginRight: 12, marginBottom: 12 },
            ]}
          >
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-amber-50")}>
                <Ionicons name="wallet-outline" size={20} color="#d97706" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {formatCurrency(stats.available_balance ?? 0)}
              </Text>
            </View>
            <Text style={twStyle("mt-2 text-xs leading-4 text-gray-500")}>
              Available to withdraw (after holds) · payout settings apply
            </Text>
          </View>
          <View style={twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4")}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-rose-50")}>
                <Ionicons name="star-outline" size={20} color="#e11d48" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {(stats.average_rating ?? 0).toFixed(1)}
              </Text>
            </View>
            <Text style={twStyle("mt-2 text-xs text-gray-500")}>{stats.total_reviews ?? 0} reviews</Text>
          </View>
        </View>

        {stats.gamification ? (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/rewards-hub" as never);
            }}
            style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}
            accessibilityRole="button"
            accessibilityLabel="Open rewards and badges"
          >
            <View style={twStyle("flex-row items-center justify-between")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>Reward points</Text>
              <View style={twStyle("flex-row items-center rounded-full bg-amber-50 px-3 py-1")}>
                <Ionicons name="trophy-outline" size={14} color="#b45309" />
                <Text style={twStyle("ml-1 text-sm font-semibold text-amber-900")}>
                  {stats.gamification.total_points ?? 0} pts
                </Text>
              </View>
            </View>
            {stats.gamification.current_badge ? (
              <Text style={twStyle("mt-2 text-xs text-gray-500")}>Badge: {stats.gamification.current_badge.name}</Text>
            ) : null}
            <Text style={twStyle("mt-3 text-xs leading-4 text-gray-500")}>
              Points are separate from the business timeline below — tap for milestones & badges.
            </Text>
            <View style={twStyle("mt-2 flex-row items-center")}>
              <Text style={twStyle("flex-1 text-sm font-semibold text-primary")}>View rewards</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </View>
          </TouchableOpacity>
        ) : null}

        {feedMeta?.basis && Object.keys(feedMeta.basis).length > 0 ? (
          <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
            <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-indigo-900")}>How this feed works</Text>
            {Object.entries(feedMeta.basis).map(([k, v]) => (
              <Text key={k} style={twStyle("mt-2 text-xs leading-5 text-indigo-950")}>
                <Text style={twStyle("font-semibold capitalize text-indigo-950")}>{k.replace(/_/g, " ")}: </Text>
                {v}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={twStyle("mb-2 text-sm font-semibold text-gray-800")}>Recent timeline</Text>
        <Text style={twStyle("mb-3 text-xs leading-4 text-gray-500")}>
          Newest first · appointments, retail, ledger earnings, refunds, payouts, reviews
        </Text>

        {feedLoading && recent.length === 0 ? (
          <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-10")}>
            <Ionicons name="hourglass-outline" size={28} color="#9ca3af" />
            <Text style={twStyle("mt-2 text-sm text-gray-500")}>Loading timeline…</Text>
          </View>
        ) : feedError && recent.length === 0 ? (
          <TouchableOpacity
            onPress={() => void refreshFeed()}
            style={twStyle("items-center rounded-2xl border border-red-100 bg-red-50 py-8")}
          >
            <Ionicons name="alert-circle-outline" size={26} color="#dc2626" />
            <Text style={twStyle("mt-2 text-center text-sm text-red-700")}>Could not load timeline · tap to retry</Text>
          </TouchableOpacity>
        ) : recent.length === 0 ? (
          <View style={twStyle("rounded-2xl border border-gray-100 bg-gray-50/80 px-6 py-10")}>
            <Text style={twStyle("text-center text-sm leading-5 text-gray-500")}>
              No items in this window. Events appear when bookings are created, ledger rows settle, payouts post, or reviews
              arrive.
            </Text>
          </View>
        ) : (
          <View style={twStyle("overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
            {recent.map((item, idx) => {
              const iconInfo = getProviderActivityIcon(item.type);
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (item.data?.booking_id) {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/(app)/(tabs)/bookings/${item.data.booking_id}` as never);
                      return;
                    }
                    if (item.data?.product_order_id) {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(
                        `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(item.data.product_order_id)}` as never,
                      );
                    }
                  }}
                  style={twStyle(
                    `flex-row items-center px-4 py-3 ${idx < recent.length - 1 ? "border-b border-gray-50" : ""}`,
                  )}
                >
                  <View
                    style={[
                      twStyle("h-10 w-10 items-center justify-center rounded-xl"),
                      { backgroundColor: iconInfo.bg },
                    ]}
                  >
                    <Ionicons name={iconInfo.name} size={18} color={iconInfo.color} />
                  </View>
                  <View style={twStyle("ml-3 flex-1 min-w-0")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>{formatTimeAgo(item.created_at)}</Text>
                  </View>
                  {item.data?.amount != null ? (
                    <Text style={twStyle("ml-2 shrink-0 text-sm font-semibold text-gray-900")}>
                      {formatCurrency(item.data.amount)}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {recent.length >= feedLimit && feedLimit < 100 ? (
          <TouchableOpacity
            onPress={() => setFeedLimit((n) => Math.min(n + 25, 100))}
            disabled={feedLoading}
            activeOpacity={0.75}
            style={twStyle(
              `mt-3 flex-row items-center justify-center rounded-2xl border border-gray-200 bg-white py-3 ${feedLoading ? "opacity-60" : ""}`,
            )}
            accessibilityRole="button"
            accessibilityLabel="Load more activity"
          >
            <Ionicons name="chevron-down" size={16} color={Colors.primary} />
            <Text style={twStyle("ml-1 text-sm font-semibold text-primary")}>
              {feedLoading ? "Loading…" : "Load more"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

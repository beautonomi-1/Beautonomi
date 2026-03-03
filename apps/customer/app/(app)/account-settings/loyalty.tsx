/**
 * Customer Loyalty Points — full experience with balance, history, milestones, redemption.
 * Uses /api/me/loyalty-points for enriched data.
 */
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { haptic } from "@/lib/haptics";

interface Milestone {
  id: string;
  name: string;
  points_required: number;
  reward_description: string;
  completed: boolean;
}

interface Transaction {
  id: string;
  description: string;
  points: number;
  type: "earn" | "redeem" | "expire";
  created_at: string;
}

interface LoyaltyData {
  points_balance?: number;
  balance?: { available?: number };
  points?: number;
  lifetime_points?: number;
  redemption_rate?: number;
  redemption_currency?: string;
  points_per_currency_unit?: number;
  earning_rate_description?: string;
  next_milestone?: Milestone | null;
  milestones?: Milestone[];
  history?: Transaction[];
  can_redeem?: boolean;
  minimum_redemption?: number;
  referral_code?: string;
}

type Tab = "overview" | "history" | "milestones";

/** Animated progress bar that smoothly fills to a target percentage */
function AnimatedProgressBar({
  progress,
  color = "bg-amber-500",
}: {
  progress: number;
  color?: string;
}) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.min(100, Math.max(0, progress)), {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as any,
  }));

  return (
    <View className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
      <Animated.View
        className={`h-2.5 ${color} rounded-full`}
        style={animatedStyle}
      />
    </View>
  );
}

export default function LoyaltyScreen() {
  useScreenTracking("Loyalty");
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get<LoyaltyData>("/api/me/loyalty-points");
      if (res.error) {
        const fallback = await api.get<LoyaltyData>("/api/me/loyalty");
        if (fallback.error) setError(fallback.error.message || "Failed to load");
        else setData(fallback.data);
      } else {
        setData(res.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const points = data?.points_balance ?? data?.balance?.available ?? data?.points ?? 0;
  const lifetimePoints = data?.lifetime_points ?? points;
  const rate = data?.redemption_rate ?? 0;
  const currency = data?.redemption_currency ?? "ZAR";
  const earnDesc = data?.earning_rate_description ?? "Earn points with every booking";
  const canRedeem = data?.can_redeem && points > 0 && points >= (data?.minimum_redemption ?? 0);
  const minRedeem = data?.minimum_redemption ?? 100;

  async function handleRedeem() {
    if (!canRedeem) {
      haptic.warning();
      Alert.alert(
        "Not Enough Points",
        `You need at least ${minRedeem} points to redeem. Keep booking to earn more!`,
      );
      return;
    }
    Alert.alert(
      "Redeem Points",
      `Redeem ${points} points for ${currency} ${(points * rate).toFixed(2)} wallet credit?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Redeem",
          onPress: async () => {
            haptic.medium();
            setRedeeming(true);
            try {
              const res = await api.post("/api/me/loyalty/redeem", { points });
              if (res.error) {
                haptic.error();
                Alert.alert("Error", res.error.message || "Redemption failed");
              } else {
                haptic.success();
                Alert.alert("Success", "Points redeemed to your wallet!");
                load(true);
              }
            } catch (e) {
              haptic.error();
              Alert.alert("Error", e instanceof Error ? e.message : "Redemption failed");
            } finally {
              setRedeeming(false);
            }
          },
        },
      ],
    );
  }

  async function handleShareReferral() {
    haptic.medium();
    const code = data?.referral_code ?? "BEAUTONOMI";
    try {
      await Share.share({
        message: `Join me on Beautonomi and we both earn bonus loyalty points! Use my referral code: ${code}\n\nDownload: https://beautonomi.com/download`,
      });
      haptic.success();
    } catch {
      // user cancelled share
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "history", label: "History" },
    { key: "milestones", label: "Milestones" },
  ];

  return (
    <ScreenFrame
      loading={loading}
      error={error}
      onRetry={() => load()}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      <View className="flex-1">
        {/* Points Card */}
        <View className="rounded-2xl bg-amber-50 p-6 items-center mb-4">
          <Text className="text-sm text-amber-700 font-medium uppercase tracking-wide">
            Your Points
          </Text>
          <Text className="text-4xl font-bold text-amber-900 mt-1">
            {points.toLocaleString()}
          </Text>
          {rate > 0 && (
            <Text className="text-sm text-amber-700 mt-1">
              Worth {currency} {(points * rate).toFixed(2)}
            </Text>
          )}
          <Text className="text-xs text-amber-600 mt-2">{earnDesc}</Text>

          {/* Redeem button */}
          <TouchableOpacity
            onPress={handleRedeem}
            disabled={!canRedeem || redeeming}
            className={`mt-4 px-6 py-2.5 rounded-full ${canRedeem ? "bg-amber-600" : "bg-amber-300"}`}
            accessibilityRole="button"
            accessibilityLabel="Redeem points"
            accessibilityState={{ disabled: !canRedeem }}
          >
            {redeeming ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-semibold text-sm">
                {canRedeem ? "Redeem to Wallet" : `Need ${minRedeem}+ to redeem`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 rounded-xl bg-gray-50 p-3 items-center">
            <Text className="text-xs text-gray-500">Lifetime Earned</Text>
            <Text className="text-lg font-bold text-gray-900">{lifetimePoints.toLocaleString()}</Text>
          </View>
          <View className="flex-1 rounded-xl bg-gray-50 p-3 items-center">
            <Text className="text-xs text-gray-500">Available</Text>
            <Text className="text-lg font-bold text-amber-600">{points.toLocaleString()}</Text>
          </View>
        </View>

        {/* Share & Earn referral button */}
        <TouchableOpacity
          onPress={handleShareReferral}
          className="flex-row items-center justify-center bg-indigo-50 rounded-xl p-3.5 mb-4 border border-indigo-100"
          accessibilityRole="button"
          accessibilityLabel="Share referral code and earn bonus points"
        >
          <Ionicons name="share-social-outline" size={18} color="#6366f1" />
          <Text className="ml-2 text-sm font-semibold text-indigo-700">Share & Earn Bonus Points</Text>
        </TouchableOpacity>

        {/* Tab bar */}
        <View className="flex-row mb-4 rounded-xl bg-gray-100 p-1">
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => { setTab(t.key); haptic.light(); }}
              className={`flex-1 py-2 rounded-lg ${tab === t.key ? "bg-white" : ""}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
            >
              <Text
                className={`text-center text-sm font-medium ${
                  tab === t.key ? "text-gray-900" : "text-gray-500"
                }`}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        {tab === "overview" && (
          <View className="gap-3">
            {/* Next milestone progress — animated */}
            {data?.next_milestone && (
              <View className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <Text className="text-sm font-semibold text-amber-900 mb-1">
                  Next Milestone
                </Text>
                <Text className="text-base font-bold text-gray-900">
                  {data.next_milestone.name}
                </Text>
                <Text className="text-xs text-gray-600 mt-0.5">
                  {data.next_milestone.reward_description}
                </Text>
                <View className="mt-3">
                  <AnimatedProgressBar
                    progress={(lifetimePoints / data.next_milestone.points_required) * 100}
                  />
                </View>
                <Text className="text-xs text-gray-500 mt-1 text-right">
                  {lifetimePoints} / {data.next_milestone.points_required} pts
                </Text>
              </View>
            )}

            {/* How to earn */}
            <View className="rounded-xl bg-gray-50 p-4">
              <Text className="text-sm font-semibold text-gray-900 mb-3">How to Earn Points</Text>
              {[
                { icon: "calendar-outline" as const, label: "Complete a booking", desc: "Earn points on every visit" },
                { icon: "star-outline" as const, label: "Leave a review", desc: "Share your experience" },
                { icon: "people-outline" as const, label: "Refer a friend", desc: "Both of you earn bonus points" },
              ].map((item, i) => (
                <View key={i} className="flex-row items-center mb-3 last:mb-0">
                  <View className="w-10 h-10 rounded-full bg-amber-100 items-center justify-center">
                    <Ionicons name={item.icon} size={18} color="#92400e" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-medium text-gray-900">{item.label}</Text>
                    <Text className="text-xs text-gray-500">{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {tab === "history" && (
          <View>
            {(!data?.history || data.history.length === 0) ? (
              <View className="py-12 items-center">
                <Ionicons name="receipt-outline" size={40} color="#d1d5db" />
                <Text className="text-gray-400 mt-3">No transactions yet</Text>
                <Text className="text-xs text-gray-400 mt-1">Points will appear here after your first booking</Text>
              </View>
            ) : (
              data.history.map((tx) => (
                <View key={tx.id} className="flex-row items-center py-3 border-b border-gray-100">
                  <View className={`w-8 h-8 rounded-full items-center justify-center ${
                    tx.type === "earn" ? "bg-green-100" : tx.type === "redeem" ? "bg-blue-100" : "bg-red-100"
                  }`}>
                    <Ionicons
                      name={tx.type === "earn" ? "add" : tx.type === "redeem" ? "gift-outline" : "time-outline"}
                      size={16}
                      color={tx.type === "earn" ? "#16a34a" : tx.type === "redeem" ? "#2563eb" : "#dc2626"}
                    />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-sm text-gray-900">{tx.description}</Text>
                    <Text className="text-xs text-gray-400">{formatDate(tx.created_at)}</Text>
                  </View>
                  <Text className={`text-sm font-semibold ${
                    tx.type === "earn" ? "text-green-600" : tx.type === "redeem" ? "text-blue-600" : "text-red-500"
                  }`}>
                    {tx.type === "earn" ? "+" : "-"}{Math.abs(tx.points)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === "milestones" && (
          <View>
            {(!data?.milestones || data.milestones.length === 0) ? (
              <View className="py-12 items-center">
                <Ionicons name="trophy-outline" size={40} color="#d1d5db" />
                <Text className="text-gray-400 mt-3">No milestones available</Text>
              </View>
            ) : (
              data.milestones.map((m) => {
                const milestoneProgress = m.completed
                  ? 100
                  : Math.min(100, (lifetimePoints / m.points_required) * 100);
                return (
                  <View key={m.id} className={`py-3 border-b border-gray-100 ${m.completed ? "opacity-80" : ""}`}>
                    <View className="flex-row items-center">
                      <View className={`w-10 h-10 rounded-full items-center justify-center ${
                        m.completed ? "bg-green-100" : "bg-gray-100"
                      }`}>
                        {m.completed ? (
                          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                        ) : (
                          <Ionicons name="trophy-outline" size={18} color="#9ca3af" />
                        )}
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className={`text-sm font-medium ${m.completed ? "text-green-800" : "text-gray-900"}`}>
                          {m.name}
                        </Text>
                        <Text className="text-xs text-gray-500">{m.reward_description}</Text>
                        <Text className="text-xs text-gray-400 mt-0.5">
                          {m.completed ? "Completed" : `${m.points_required.toLocaleString()} pts required`}
                        </Text>
                      </View>
                    </View>
                    {!m.completed && (
                      <View className="mt-2 ml-13">
                        <AnimatedProgressBar
                          progress={milestoneProgress}
                          color="bg-amber-400"
                        />
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>
    </ScreenFrame>
  );
}

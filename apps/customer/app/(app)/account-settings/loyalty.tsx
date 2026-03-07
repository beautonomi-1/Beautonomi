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
import { Colors } from "@/constants/colors";

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

function AnimatedProgressBar({ progress, color = "#F59E0B" }: { progress: number; color?: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(Math.min(100, Math.max(0, progress)), { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [progress, width]);
  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value}%` as any }));
  return (
    <View style={{ height: 10, backgroundColor: Colors.gray[200], borderRadius: 9999, overflow: "hidden" }}>
      <Animated.View style={[animatedStyle, { height: 10, backgroundColor: color, borderRadius: 9999 }]} />
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
      <View style={{ flex: 1 }}>
        <View style={{ borderRadius: 16, backgroundColor: "#FFFBEB", padding: 24, alignItems: "center", marginBottom: 16 }}>
          <Text style={{ fontSize: 14, color: "#B45309", fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.5 }}>Your Points</Text>
          <Text style={{ fontSize: 36, fontWeight: "700", color: "#78350F", marginTop: 4 }}>{points.toLocaleString()}</Text>
          {rate > 0 && (
            <Text style={{ fontSize: 14, color: "#B45309", marginTop: 4 }}>Worth {currency} {(points * rate).toFixed(2)}</Text>
          )}
          <Text style={{ fontSize: 12, color: "#D97706", marginTop: 8 }}>{earnDesc}</Text>
          <TouchableOpacity
            onPress={handleRedeem}
            disabled={!canRedeem || redeeming}
            style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 9999, backgroundColor: canRedeem ? "#D97706" : "#FCD34D" }}
            accessibilityRole="button"
            accessibilityLabel="Redeem points"
            accessibilityState={{ disabled: !canRedeem }}
          >
            {redeeming ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 14 }}>{canRedeem ? "Redeem to Wallet" : `Need ${minRedeem}+ to redeem`}</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", marginBottom: 16 }}>
          <View style={{ flex: 1, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12, alignItems: "center", marginRight: 12 }}>
            <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Lifetime Earned</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{lifetimePoints.toLocaleString()}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Available</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#D97706" }}>{points.toLocaleString()}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleShareReferral}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#EEF2FF", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#C7D2FE" }}
          accessibilityRole="button"
          accessibilityLabel="Share referral code and earn bonus points"
        >
          <Ionicons name="share-social-outline" size={18} color="#6366f1" />
          <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "600", color: "#4338CA" }}>Share & Earn Bonus Points</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", marginBottom: 16, borderRadius: 12, backgroundColor: Colors.gray[100], padding: 4 }}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => { setTab(t.key); haptic.light(); }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: tab === t.key ? Colors.white : "transparent" }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
            >
              <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: tab === t.key ? Colors.gray[900] : Colors.gray[500] }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "overview" && (
          <View>
            {data?.next_milestone && (
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#FCD34D", backgroundColor: "rgba(255,251,235,0.5)", padding: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#78350F", marginBottom: 4 }}>Next Milestone</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{data.next_milestone.name}</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[600], marginTop: 2 }}>{data.next_milestone.reward_description}</Text>
                <View style={{ marginTop: 12 }}>
                  <AnimatedProgressBar progress={(lifetimePoints / data.next_milestone.points_required) * 100} />
                </View>
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4, textAlign: "right" }}>{lifetimePoints} / {data.next_milestone.points_required} pts</Text>
              </View>
            )}
            <View style={{ borderRadius: 12, backgroundColor: Colors.gray[50], padding: 16, marginTop: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>How to Earn Points</Text>
              {[
                { icon: "calendar-outline" as const, label: "Complete a booking", desc: "Earn points on every visit" },
                { icon: "star-outline" as const, label: "Leave a review", desc: "Share your experience" },
                { icon: "people-outline" as const, label: "Refer a friend", desc: "Both of you earn bonus points" },
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: i < 2 ? 12 : 0 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={item.icon} size={18} color="#92400e" />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>{item.label}</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {tab === "history" && (
          <View>
            {(!data?.history || data.history.length === 0) ? (
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <Ionicons name="receipt-outline" size={40} color={Colors.gray[300]} />
                <Text style={{ color: Colors.gray[400], marginTop: 12 }}>No transactions yet</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 4 }}>Points will appear here after your first booking</Text>
              </View>
            ) : (
              data.history.map((tx) => (
                <View key={tx.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: tx.type === "earn" ? "#DCFCE7" : tx.type === "redeem" ? "#DBEAFE" : "#FEE2E2" }}>
                    <Ionicons name={tx.type === "earn" ? "add" : tx.type === "redeem" ? "gift-outline" : "time-outline"} size={16} color={tx.type === "earn" ? "#16a34a" : tx.type === "redeem" ? "#2563eb" : "#dc2626"} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{tx.description}</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[400] }}>{formatDate(tx.created_at)}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: tx.type === "earn" ? "#16a34a" : tx.type === "redeem" ? "#2563eb" : "#dc2626" }}>{tx.type === "earn" ? "+" : "-"}{Math.abs(tx.points)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === "milestones" && (
          <View>
            {(!data?.milestones || data.milestones.length === 0) ? (
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <Ionicons name="trophy-outline" size={40} color={Colors.gray[300]} />
                <Text style={{ color: Colors.gray[400], marginTop: 12 }}>No milestones available</Text>
              </View>
            ) : (
              data.milestones.map((m) => {
                const milestoneProgress = m.completed ? 100 : Math.min(100, (lifetimePoints / m.points_required) * 100);
                return (
                  <View key={m.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], opacity: m.completed ? 0.8 : 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: m.completed ? "#DCFCE7" : Colors.gray[100] }}>
                        {m.completed ? <Ionicons name="checkmark-circle" size={20} color="#16a34a" /> : <Ionicons name="trophy-outline" size={18} color={Colors.gray[400]} />}
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "500", color: m.completed ? "#166534" : Colors.gray[900] }}>{m.name}</Text>
                        <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{m.reward_description}</Text>
                        <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>{m.completed ? "Completed" : `${m.points_required.toLocaleString()} pts required`}</Text>
                      </View>
                    </View>
                    {!m.completed && (
                      <View style={{ marginTop: 8, marginLeft: 52 }}>
                        <AnimatedProgressBar progress={milestoneProgress} color="#FBBF24" />
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

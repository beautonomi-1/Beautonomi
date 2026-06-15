import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { stripHtmlToPlainText } from "@/lib/htmlPlainText";

const ACCENT = "#FF0077";

interface Plan {
  id: string;
  name: string;
  description?: string | null;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
  features?: unknown;
  feature_bullets?: string[];
  is_free?: boolean;
}

interface Subscription {
  id: string;
  status: string;
  expires_at: string | null;
  cancelled_at?: string | null;
  billing_period?: "monthly" | "yearly" | null;
  paystack_sync_pending?: boolean | null;
  paystack_sync_note?: string | null;
  plan?: Plan | null;
}

function featureLines(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function currentPlanBullets(sub: Subscription | null): string[] {
  if (!sub?.plan) return [];
  const b = sub.plan.feature_bullets;
  const raw =
    Array.isArray(b) && b.length > 0
      ? b.filter((x) => typeof x === "string" && x.trim())
      : featureLines(sub.plan.features);
  return raw.map((s) => stripHtmlToPlainText(s).trim()).filter(Boolean);
}

function currentSubscriptionPriceLine(sub: Subscription | null): string | null {
  if (!sub?.plan) return null;
  const p = sub.plan;
  const cur = sub.billing_period ?? "monthly";
  if (p.is_free) return "Free";
  if (cur === "yearly" && p.price_yearly != null) {
    return `${formatCurrency(Number(p.price_yearly), p.currency ?? "ZAR")}/year`;
  }
  if (p.price_monthly != null) {
    return `${formatCurrency(Number(p.price_monthly), p.currency ?? "ZAR")}/month`;
  }
  return null;
}

function statusLabel(sub: Subscription): string {
  if (sub.cancelled_at) return "Cancelling";
  const s = sub.status;
  if (s === "active") return "Active";
  if (s === "expired") return "Expired";
  if (s === "past_due") return "Past due";
  if (s === "trial" || s === "trialing") return "Trial";
  if (s === "inactive") return "Inactive";
  if (s === "cancelled") return "Cancelled";
  return s;
}

/** Content-only for use in Settings hub tab. */
export function SubscriptionContent() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Subscription | null>("/api/provider/subscription");
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && data === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
        <LoadingState />
      </View>
    );
  }
  if (error && data === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }
  const sub = data ?? null;
  const plan = sub?.plan && !Array.isArray(sub.plan)
    ? (sub.plan as Plan)
    : Array.isArray(sub?.plan) && (sub.plan as Plan[]).length
      ? (sub.plan as Plan[])[0]
      : null;
  const status = sub?.status ?? "none";
  const isCancelled = Boolean(sub?.cancelled_at);
  const bullets = sub ? currentPlanBullets(sub) : [];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          marginBottom: 20,
          width: 64,
          height: 64,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 32,
          backgroundColor: "#fff1f7",
          borderWidth: 1,
          borderColor: "#fce7f3",
        }}
      >
        <Ionicons name="diamond-outline" size={32} color={ACCENT} />
      </View>
      <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900] }}>Plan & billing</Text>
      <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 22, color: Colors.gray[600] }}>
        Same plans and features as our public pricing. Open Subscription for upgrades, billing period changes, and renewals.
      </Text>

      {sub?.paystack_sync_pending ? (
        <View
          style={[
            twStyle("mt-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-4"),
          ]}
        >
          <Text style={twStyle("text-sm font-semibold text-amber-900")}>Billing sync needed</Text>
          <Text style={twStyle("mt-1 text-xs leading-5 text-amber-900")}>
            {(sub.paystack_sync_note ?? "").trim() ||
              "Complete billing alignment in the full subscription screen if you pay by card."}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          twStyle("mt-6 flex-row items-center justify-center rounded-full py-4"),
          { backgroundColor: ACCENT },
        ]}
        onPress={() => router.push("/(app)/(tabs)/more/settings/subscription" as never)}
        activeOpacity={0.9}
      >
        <Ionicons name="settings-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={twStyle("text-base font-bold text-white")}>Manage plan & billing</Text>
      </TouchableOpacity>

      {!sub ? (
        <View
          style={[
            twStyle("mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-5"),
          ]}
        >
          <Text style={twStyle("text-base font-semibold text-gray-800")}>No active subscription</Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>
            Tap the button above to choose a plan or activate the free tier. All marketing features from the website are listed on the full subscription screen.
          </Text>
        </View>
      ) : (
        <View
          style={[
            twStyle("mt-8 overflow-hidden rounded-2xl border-2 p-5"),
            { borderColor: "#fce7f3", backgroundColor: "#fffafb" },
          ]}
        >
          <View style={twStyle("flex-row items-start justify-between")}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={twStyle("text-xl font-bold text-gray-900")}>
                {plan?.name ?? "Plan"}
              </Text>
              {plan?.description ? (
                <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>
                  {stripHtmlToPlainText(plan.description)}
                </Text>
              ) : null}
              {currentSubscriptionPriceLine(sub) ? (
                <Text style={twStyle("mt-3 text-2xl font-bold text-gray-900")}>
                  {currentSubscriptionPriceLine(sub)}
                </Text>
              ) : null}
              {sub.cancelled_at ? (
                <Text style={twStyle("mt-2 text-sm text-amber-800")}>
                  Cancelling — access until{" "}
                  {sub.expires_at ? formatDate(sub.expires_at) : "period end"}
                </Text>
              ) : (
                <Text style={twStyle("mt-2 text-sm text-gray-600")}>
                  {sub.expires_at
                    ? status === "active"
                      ? `Renews ${formatDate(sub.expires_at)}`
                      : status === "expired"
                        ? `Expired ${formatDate(sub.expires_at)}`
                        : `Access until ${formatDate(sub.expires_at)}`
                    : null}
                </Text>
              )}
            </View>
            <View
              style={twStyle(
                `rounded-full px-3 py-1.5 ${isCancelled ? "bg-amber-100" : status === "active" ? "bg-green-100" : "bg-gray-100"}`
              )}
            >
              <Text
                style={twStyle(
                  `text-xs font-semibold ${isCancelled ? "text-amber-900" : status === "active" ? "text-green-800" : "text-gray-700"}`
                )}
              >
                {statusLabel(sub)}
              </Text>
            </View>
          </View>

          {bullets.length > 0 ? (
            <View style={twStyle("mt-5 border-t border-pink-100 pt-4")}>
              <Text style={twStyle("mb-3 text-xs font-bold uppercase tracking-wider text-gray-500")}>
                What&apos;s included
              </Text>
              {bullets.map((line, i) => (
                <View key={`${i}-${line.slice(0, 24)}`} style={twStyle("mb-3 flex-row items-start")}>
                  <Ionicons name="checkmark-circle" size={20} color={ACCENT} style={{ marginTop: 0, marginRight: 10 }} />
                  <Text style={twStyle("flex-1 text-[15px] leading-[22px] text-gray-800")}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

export default function SubscriptionScreen() {
  return <Redirect href="/(app)/(tabs)/more/billing?tab=subscription" />;
}

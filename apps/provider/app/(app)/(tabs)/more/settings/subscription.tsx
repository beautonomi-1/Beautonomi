/**
 * Subscription screen – view plan, upgrade, cancel, renew.
 * Uses GET /api/provider/subscription, /subscription/plans, POST cancel, renew, initialize-payment, upgrade
 * (paid: upgrade first when Paystack auth exists, else initialize-payment — same as provider web).
 * Plan feature bullets match public /pricing (pricing_plan_features), not raw subscription_plans.features JSON.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert, AppState, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter, useFocusEffect } from "expo-router";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { stripHtmlToPlainText } from "@/lib/htmlPlainText";

const ACCENT = "#FF0077";

interface Plan {
  id: string;
  plan_id: string;
  name: string;
  description?: string | null;
  amount: number;
  currency: string;
  interval: string;
  billing_period: string;
  features: string[];
  is_popular?: boolean;
  is_free?: boolean;
}

interface Subscription {
  id: string;
  status: string;
  expires_at: string | null;
  cancelled_at: string | null;
  auto_renew: boolean;
  plan_id: string;
  billing_period?: "monthly" | "yearly" | null;
  plan?: {
    id: string;
    name: string;
    description?: string | null;
    price_monthly?: number | null;
    price_yearly?: number | null;
    currency: string;
    features?: unknown;
    feature_bullets?: string[];
    is_free?: boolean;
  };
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

function isFreeTierSubscription(sub: Subscription | null): boolean {
  if (!sub?.plan) return true;
  return sub.plan.is_free === true;
}

function isSamePlanOption(sub: Subscription | null, plan: Plan): boolean {
  if (!sub) return false;
  if (sub.plan_id !== plan.plan_id) return false;
  const bp = sub.billing_period ?? "monthly";
  return bp === plan.billing_period;
}

function formatOptionPrice(plan: Plan): string {
  if (plan.is_free || plan.amount === 0) return "Free";
  const period = plan.billing_period === "yearly" ? "year" : "month";
  return `${formatCurrency(plan.amount, plan.currency)}/${period}`;
}

/** Price line for the member’s current subscription (respects billing_period). */
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

function getPlanCtaLabel(plan: Plan, sub: Subscription | null): string {
  if (isSamePlanOption(sub, plan)) return "";
  if (plan.is_free || plan.amount === 0) return "Activate free";
  if (isFreeTierSubscription(sub)) return "Upgrade";
  if (sub && sub.plan_id === plan.plan_id && sub.billing_period !== plan.billing_period) {
    return plan.billing_period === "yearly" ? "Switch to yearly billing" : "Switch to monthly billing";
  }
  return "Switch plan";
}

function statusLabel(sub: Subscription): string {
  if (sub.cancelled_at) return "Cancelling";
  const s = sub.status;
  if (s === "active") return "Active";
  if (s === "expired") return "Expired";
  if (s === "past_due") return "Past due";
  if (s === "trial") return "Trial";
  return s;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);
  const {
    data: subscription,
    loading,
    error,
    refresh,
  } = useApi<Subscription | null>("/api/provider/subscription");
  const { data: plans, error: plansError } = useApi<Plan[]>("/api/provider/subscription/plans");
  const { execute: postAction } = useApiMutation("post");

  const monthlyPlans = useMemo(
    () => (plans ?? []).filter((p) => p.billing_period === "monthly"),
    [plans]
  );
  const yearlyPlans = useMemo(
    () => (plans ?? []).filter((p) => p.billing_period === "yearly"),
    [plans]
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        refresh();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refresh]);

  // §Provider-audit 2026-04 (round 9): refresh whenever the screen regains
  // focus. Paystack checkout opens via `pushInAppBrowser` which stays in the
  // app process, so `AppState` never fires inactive→active and the
  // subscription status could stay stale after a completed upgrade until
  // the user pulled to refresh.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  async function handleCancel() {
    Alert.alert(
      "Cancel subscription",
      "Your plan will remain active until the end of the current period. After that you will be moved to the free plan.",
      [
        { text: "Keep subscription", style: "cancel" },
        {
          text: "Cancel subscription",
          style: "destructive",
          onPress: async () => {
            const { error: err } = await postAction("/api/provider/subscription/cancel", {});
            if (err) Alert.alert("Error", err);
            else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
              Alert.alert("Done", "Subscription will be cancelled at the end of the period.");
            }
          },
        },
      ]
    );
  }

  async function handleRenew() {
    const { error: err, data } = await postAction("/api/provider/subscription/renew", { in_app: true });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    const d = data as { payment_url?: string; is_free?: boolean; message?: string };
    if (d?.is_free) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Done", d.message ?? "Plan renewed.");
      refresh();
      return;
    }
    const url = d?.payment_url;
    if (url) {
      pushInAppBrowser(router, url, "Renew subscription");
    } else {
      Alert.alert("No payment link", "Unable to start renewal. Please try again or contact support.");
    }
    refresh();
  }

  async function handleUpgrade(planId: string) {
    const selectedPlan = plans?.find((p) => p.id === planId);
    if (!selectedPlan) return;
    const billingPeriod = selectedPlan.billing_period || "monthly";
    const barePlanId = selectedPlan.plan_id || planId;

    setUpgradingId(planId);
    try {
      if (selectedPlan.is_free || selectedPlan.amount === 0) {
        const { error: err, data } = await postAction("/api/provider/subscription/upgrade", {
          plan_id: barePlanId,
          billing_period: billingPeriod,
        });
        if (err) {
          Alert.alert("Error", err);
          return;
        }
        if ((data as { is_free?: boolean; subscription_id?: string })?.is_free || (data as { subscription_id?: string })?.subscription_id) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Success", "Free plan activated!");
          refresh();
          return;
        }
        Alert.alert("Could not activate plan", "Please try again or contact support.");
        return;
      }

      // Paid plans: match provider web — try Paystack subscription upgrade when authorization exists,
      // otherwise initialize a checkout (first payment or new card).
      const { error: upErr, data: upData } = await postAction("/api/provider/subscription/upgrade", {
        plan_id: barePlanId,
        billing_period: billingPeriod,
      });
      if (upErr) {
        Alert.alert("Error", upErr);
        return;
      }
      const upgraded = upData as {
        is_free?: boolean;
        subscription_id?: string;
        requires_payment?: boolean;
        payment_url?: string;
        authorization_url?: string;
      };
      if (upgraded?.is_free) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Plan updated!");
        refresh();
        return;
      }
      if (upgraded?.subscription_id && !upgraded?.requires_payment) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Subscription updated!");
        refresh();
        return;
      }
      const upUrl = upgraded?.authorization_url ?? upgraded?.payment_url;
      if (upUrl) {
        pushInAppBrowser(router, upUrl, "Subscription checkout");
        refresh();
        return;
      }

      const { error: err, data } = await postAction("/api/provider/subscription/initialize-payment", {
        plan_id: barePlanId,
        billing_period: billingPeriod,
        in_app: true,
      });
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      const d = data as { authorization_url?: string; payment_url?: string; requires_payment?: boolean };
      const url = d?.authorization_url ?? d?.payment_url;
      if (d?.requires_payment && url) {
        pushInAppBrowser(router, url, "Subscription checkout");
        refresh();
        return;
      }
      if (url) {
        pushInAppBrowser(router, url, "Subscription checkout");
      } else {
        Alert.alert("No payment link", "Unable to start checkout. Please try again or contact support.");
      }
      refresh();
    } finally {
      setUpgradingId(null);
    }
  }

  if (loading && subscription === undefined && !error) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading subscription..." />
      </ScreenContainer>
    );
  }

  if (error && !subscription) {
    return (
      <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
        <ScreenHeader title="Subscription" showBack subtitle="Plan & billing" />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const paidSubscriber = subscription && !isFreeTierSubscription(subscription);
  const showRenew =
    subscription &&
    subscription.status === "active" &&
    !subscription.cancelled_at &&
    Boolean(subscription.expires_at) &&
    paidSubscriber;
  const showCancel =
    subscription && subscription.status === "active" && !subscription.cancelled_at && paidSubscriber;

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Subscription" showBack subtitle="Plan & billing" />

      {/* Hero intro */}
      <View style={{ marginBottom: 8, marginTop: 4 }}>
        <Text style={twStyle("text-base leading-6 text-gray-600")}>
          Same plans and features as our public pricing. Switch or change billing period anytime.
        </Text>
      </View>

      {/* Current plan */}
      <SectionHeader title="Your plan" />
      {!subscription ? (
        <View
          style={twStyle("mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-5")}
        >
          <Text style={twStyle("text-base font-medium text-gray-800")}>No subscription on file</Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>
            Choose a plan below to unlock paid features. You can start with the free tier anytime.
          </Text>
        </View>
      ) : (
        <View
          style={[
            twStyle("mb-6 overflow-hidden rounded-2xl border-2 p-5"),
            { borderColor: "#fce7f3", backgroundColor: "#fffafb" },
          ]}
        >
          <View style={twStyle("flex-row items-start justify-between")}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={twStyle("text-xl font-bold text-gray-900")}>
                {subscription.plan?.name ?? "Plan"}
              </Text>
              {subscription.plan?.description ? (
                <Text style={twStyle("mt-2 text-sm leading-5 text-gray-600")}>{subscription.plan.description}</Text>
              ) : null}
              {currentSubscriptionPriceLine(subscription) ? (
                <Text style={twStyle("mt-3 text-2xl font-bold text-gray-900")}>
                  {currentSubscriptionPriceLine(subscription)}
                </Text>
              ) : null}
              {subscription.cancelled_at ? (
                <Text style={twStyle("mt-2 text-sm text-amber-800")}>
                  Cancelling — access until{" "}
                  {subscription.expires_at ? formatDate(subscription.expires_at) : "period end"}
                </Text>
              ) : (
                <>
                  <Text style={twStyle("mt-2 text-sm text-gray-600")}>
                    {subscription.expires_at
                      ? `Renews ${formatDate(subscription.expires_at)}`
                      : null}
                  </Text>
                </>
              )}
            </View>
            <View
              style={twStyle(
                `rounded-full px-3 py-1.5 ${subscription.cancelled_at ? "bg-amber-100" : "bg-green-100"}`
              )}
            >
              <Text
                style={twStyle(
                  `text-xs font-semibold ${subscription.cancelled_at ? "text-amber-900" : "text-green-800"}`
                )}
              >
                {statusLabel(subscription)}
              </Text>
            </View>
          </View>

          {currentPlanBullets(subscription).length > 0 ? (
            <View style={twStyle("mt-5 border-t border-pink-100 pt-4")}>
              <Text style={twStyle("mb-3 text-xs font-bold uppercase tracking-wider text-gray-500")}>
                What&apos;s included
              </Text>
              {currentPlanBullets(subscription).map((line, i) => (
                <View key={`${i}-${line.slice(0, 12)}`} style={twStyle("mb-3 flex-row items-start")}>
                  <Ionicons name="checkmark-circle" size={20} color={ACCENT} style={{ marginTop: 0, marginRight: 10 }} />
                  <Text style={twStyle("flex-1 text-[15px] leading-[22px] text-gray-800")}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {showCancel ? (
            <TouchableOpacity
              style={twStyle("mt-4 rounded-2xl border border-red-200 bg-white py-3")}
              onPress={handleCancel}
              activeOpacity={0.85}
            >
              <Text style={twStyle("text-center text-sm font-semibold text-red-600")}>Cancel subscription</Text>
            </TouchableOpacity>
          ) : null}
          {subscription.cancelled_at ? (
            <View style={twStyle("mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4")}>
              <Text style={twStyle("text-center text-sm leading-5 text-amber-900")}>
                You keep access until the date above. No further charges after that.
              </Text>
            </View>
          ) : null}
          {showRenew ? (
            <TouchableOpacity
              style={[twStyle("mt-3 rounded-2xl py-3.5"), { backgroundColor: ACCENT }]}
              onPress={handleRenew}
              activeOpacity={0.9}
            >
              <Text style={twStyle("text-center text-sm font-semibold text-white")}>
                Renew or update payment method
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Available plans */}
      <SectionHeader title="All plans" />
      {plans && plans.length > 0 ? (
        <View style={twStyle("pb-4")}>
          {monthlyPlans.length > 0 ? (
            <Text style={twStyle("mb-3 text-xs font-bold uppercase tracking-wider text-gray-400")}>
              Billed monthly
            </Text>
          ) : null}
          {monthlyPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              subscription={subscription}
              upgradingId={upgradingId}
              onUpgrade={handleUpgrade}
            />
          ))}

          {yearlyPlans.length > 0 ? (
            <Text style={twStyle("mb-3 mt-6 text-xs font-bold uppercase tracking-wider text-gray-400")}>
              Billed yearly
            </Text>
          ) : null}
          {yearlyPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              subscription={subscription}
              upgradingId={upgradingId}
              onUpgrade={handleUpgrade}
            />
          ))}
        </View>
      ) : plansError ? (
        <ErrorState message="Could not load plans. Pull down to retry." onRetry={refresh} />
      ) : (
        <EmptyState icon="pricetag-outline" title="No plans" description="Subscription plans will appear here." />
      )}

      <View style={twStyle("h-10")} />
    </ScreenContainer>
  );
}

function PlanCard({
  plan,
  subscription,
  upgradingId,
  onUpgrade,
}: {
  plan: Plan;
  subscription: Subscription | null;
  upgradingId: string | null;
  onUpgrade: (id: string) => void;
}) {
  const isCurrent = isSamePlanOption(subscription, plan);
  const cta = getPlanCtaLabel(plan, subscription);
  const loading = upgradingId === plan.id;

  return (
    <View
      style={[
        twStyle("mb-4 overflow-hidden rounded-2xl border-2 bg-white p-5"),
        plan.is_popular
          ? { borderColor: ACCENT, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
          : { borderColor: "#f3f4f6" },
      ]}
    >
      <View style={twStyle("flex-row flex-wrap items-start justify-between gap-2")}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={twStyle("flex-row flex-wrap items-center gap-2")}>
            <Text style={twStyle("text-lg font-bold text-gray-900")}>{plan.name}</Text>
            {plan.is_popular ? (
              <View style={{ borderRadius: 9999, backgroundColor: "#fce7f3", paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: ACCENT }}>Most popular</Text>
              </View>
            ) : null}
            {isCurrent ? (
              <View style={{ borderRadius: 9999, backgroundColor: "#f3f4f6", paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#4b5563" }}>Current</Text>
              </View>
            ) : null}
          </View>
          <Text style={twStyle("mt-2 text-3xl font-bold text-gray-900")}>
            {plan.is_free || plan.amount === 0 ? "Free" : formatOptionPrice(plan)}
          </Text>
          {plan.description ? (
            <Text style={twStyle("mt-3 text-sm leading-5 text-gray-600")}>{plan.description}</Text>
          ) : null}
        </View>
      </View>

      {Array.isArray(plan.features) && plan.features.length > 0 ? (
        <View style={twStyle("mt-5 border-t border-gray-100 pt-4")}>
          {plan.features.map((f, i) => (
            <View key={`${plan.id}-f-${i}`} style={twStyle("mb-3 flex-row items-start")}>
              <Ionicons name="checkmark-circle" size={20} color={ACCENT} style={{ marginRight: 10 }} />
              <Text style={twStyle("flex-1 text-[15px] leading-[22px] text-gray-800")}>
                {stripHtmlToPlainText(f)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!isCurrent && cta ? (
        <TouchableOpacity
          style={[
            twStyle("mt-5 flex-row items-center justify-center rounded-full py-4"),
            {
              backgroundColor: plan.is_popular ? ACCENT : "#111827",
              opacity: loading ? 0.7 : 1,
            },
          ]}
          onPress={() => onUpgrade(plan.id)}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
          ) : null}
          <Text style={twStyle("text-base font-bold text-white")}>{loading ? "Please wait…" : cta}</Text>
        </TouchableOpacity>
      ) : isCurrent ? (
        <View style={twStyle("mt-5 rounded-full bg-gray-100 py-3")}>
          <Text style={twStyle("text-center text-sm font-semibold text-gray-600")}>This is your current plan</Text>
        </View>
      ) : null}
    </View>
  );
}

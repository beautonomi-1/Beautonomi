/**
 * Subscription screen – view plan, upgrade, cancel, renew.
 * Uses GET /api/provider/subscription, /subscription/plans, POST cancel, renew, initialize-payment, upgrade.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Alert, AppState } from "react-native";
import * as Linking from "expo-linking";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

interface Plan {
  id: string;
  plan_id: string;
  name: string;
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
  plan?: {
    id: string;
    name: string;
    price_monthly?: number;
    price_yearly?: number;
    currency: string;
    features: string[] | unknown;
  };
}

function featureLabel(f: unknown): string {
  if (typeof f === "string") return f;
  if (f && typeof f === "object") {
    const obj = f as Record<string, unknown>;
    for (const key of ["name", "label", "title", "description"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    if ("enabled" in obj) {
      const keys = Object.keys(obj).filter((k) => k !== "enabled");
      if (keys.length > 0 && typeof obj[keys[0]] === "string") return obj[keys[0]] as string;
      return keys[0] ?? (obj.enabled ? "Enabled" : "Disabled");
    }
    return JSON.stringify(f);
  }
  return String(f ?? "");
}

export default function SubscriptionScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const appState = useRef(AppState.currentState);
  const {
    data: subscription,
    loading,
    error,
    refresh,
  } = useApi<Subscription | null>("/api/provider/subscription");
  const { data: plans } = useApi<Plan[]>("/api/provider/subscription/plans");
  const { execute: postAction } = useApiMutation("post");

  // Refresh when app comes to foreground (e.g. after paying in browser and returning to app)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        refresh();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refresh]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
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
            const { error: err } = await postAction(
              "/api/provider/subscription/cancel",
              {}
            );
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
    const { error: err, data } = await postAction(
      "/api/provider/subscription/renew",
      { in_app: true }
    );
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    const url = (data as { payment_url?: string })?.payment_url;
    if (url) {
      await Linking.openURL(url);
    } else {
      Alert.alert("No payment link", "Unable to start renewal. Please try again or contact support.");
    }
    refresh();
  }

  async function handleUpgrade(planId: string) {
    const selectedPlan = plans?.find((p) => p.id === planId);
    const billingPeriod = selectedPlan?.billing_period || "monthly";
    const barePlanId = selectedPlan?.plan_id || planId;

    // Free plan: activate via upgrade API directly (no payment needed)
    if (selectedPlan?.is_free || selectedPlan?.amount === 0) {
      const { error: err, data } = await postAction(
        "/api/provider/subscription/upgrade",
        { plan_id: barePlanId, billing_period: billingPeriod }
      );
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      if ((data as any)?.is_free || (data as any)?.subscription_id) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Free plan activated!");
        refresh();
        return;
      }
    }

    const { error: err, data } = await postAction(
      "/api/provider/subscription/initialize-payment",
      { plan_id: barePlanId, billing_period: billingPeriod, in_app: true }
    );
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    if ((data as any)?.requires_payment) {
      const url = (data as { authorization_url?: string; payment_url?: string })?.authorization_url ?? (data as { payment_url?: string })?.payment_url;
      if (url) {
        await Linking.openURL(url);
      } else {
        Alert.alert("No payment link", "Unable to start upgrade. Please try again or contact support.");
      }
      refresh();
      return;
    }
    const url = (data as { authorization_url?: string; payment_url?: string })?.authorization_url ?? (data as { payment_url?: string })?.payment_url;
    if (url) {
      await Linking.openURL(url);
    } else {
      Alert.alert("No payment link", "Unable to start upgrade. Please try again or contact support.");
    }
    refresh();
  }

  if (loading && subscription === undefined && !error) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading subscription..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Subscription"
        showBack
        subtitle="Plan & billing"
      />

      {/* Current plan */}
      <SectionHeader title="Current plan" />
      {!subscription ? (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("text-sm text-gray-600")}>No active subscription</Text>
          <Text style={twStyle("mt-1 text-xs text-gray-400")}>
            You are on the free tier. Upgrade below to unlock more features.
          </Text>
        </View>
      ) : (
        <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <View>
              <Text style={twStyle("text-lg font-semibold text-gray-900")}>
                {(subscription.plan as Subscription["plan"])?.name ?? "Plan"}
              </Text>
              {subscription.cancelled_at ? (
                <Text style={twStyle("mt-0.5 text-sm text-gray-700")}>
                  Cancelled — access until{" "}
                  {subscription.expires_at ? formatDate(subscription.expires_at) : "end of billing period"}
                </Text>
              ) : (
                <>
                  <Text style={twStyle("mt-0.5 text-sm text-gray-600")}>
                    Status: {subscription.status}
                  </Text>
                  {subscription.expires_at ? (
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                      Active — renews {formatDate(subscription.expires_at)}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
            <View
              style={twStyle(
                `rounded-full px-3 py-1 ${subscription.cancelled_at ? "bg-amber-100" : "bg-indigo-100"}`
              )}
            >
              <Text
                style={twStyle(
                  `text-sm font-medium ${subscription.cancelled_at ? "text-amber-800" : "text-indigo-700"}`
                )}
              >
                {subscription.cancelled_at ? "Cancelled" : subscription.status}
              </Text>
            </View>
          </View>
          {subscription.status === "active" && !subscription.cancelled_at && (
            <TouchableOpacity
              style={twStyle("mt-3 rounded-xl border border-red-200 bg-white py-2")}
              onPress={handleCancel}
            >
              <Text style={twStyle("text-center text-sm font-medium text-red-600")}>
                Cancel subscription
              </Text>
            </TouchableOpacity>
          )}
          {subscription.cancelled_at && (
            <View style={twStyle("mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3")}>
              <Text style={twStyle("text-xs text-amber-700 text-center")}>
                You still have access until the date above; no further renewal charges apply.
              </Text>
            </View>
          )}
          {subscription.status === "active" && !subscription.cancelled_at && subscription.expires_at && (
            <TouchableOpacity
              style={twStyle("mt-2 rounded-xl bg-indigo-600 py-2")}
              onPress={handleRenew}
            >
              <Text style={twStyle("text-center text-sm font-medium text-white")}>
                Renew / update payment
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Plans (upgrade) */}
      <SectionHeader title="Plans" />
      {plans && plans.length > 0 ? (
        <View>
          {plans.map((plan, idx) => (
            <View
              key={plan.id}
              style={[twStyle(`rounded-2xl border bg-white p-4 ${
                plan.is_popular ? "border-indigo-200" : "border-gray-100"
              }`), idx > 0 ? { marginTop: 12 } : undefined]}
            >
              <View style={twStyle("flex-row items-center justify-between")}>
                <View>
                  <View style={twStyle("flex-row items-center")}>
                    <Text style={[twStyle("text-base font-semibold text-gray-900"), { marginRight: 8 }]}>
                      {plan.name}
                    </Text>
                    {plan.is_popular && (
                      <View style={twStyle("rounded-full bg-indigo-100 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-medium text-indigo-700")}>
                          Popular
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={twStyle("mt-0.5 text-sm text-gray-500")}>
                    {plan.is_free || plan.amount === 0
                      ? "Free"
                      : `${formatCurrency(plan.amount, plan.currency)}/${plan.billing_period === "yearly" ? "year" : "month"}`}
                  </Text>
                </View>
                {(subscription?.plan as Subscription["plan"])?.id !== plan.plan_id && (
                  <ActionButton
                    label={plan.is_free || plan.amount === 0 ? "Activate" : "Upgrade"}
                    variant="secondary"
                    size="sm"
                    onPress={() => handleUpgrade(plan.id)}
                  />
                )}
              </View>
              {Array.isArray(plan.features) && plan.features.length > 0 && (
                <View style={twStyle("mt-2 border-t border-gray-50 pt-2")}>
                  {plan.features.slice(0, 3).map((f, i) => (
                    <Text key={i} style={twStyle("text-xs text-gray-600")}>
                      • {featureLabel(f)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          icon="pricetag-outline"
          title="No plans"
          description="Subscription plans will appear here"
        />
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}

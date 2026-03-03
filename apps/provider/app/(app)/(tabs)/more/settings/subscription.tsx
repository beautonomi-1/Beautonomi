/**
 * Subscription screen – view plan, upgrade, cancel, renew.
 * Uses GET /api/provider/subscription, /subscription/plans, POST cancel, renew, initialize-payment, upgrade.
 */
import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";

interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  features: string[];
  is_popular?: boolean;
}

interface Subscription {
  id: string;
  status: string;
  expires_at: string | null;
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

export default function SubscriptionScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const {
    data: subscription,
    loading,
    error,
    refresh,
  } = useApi<Subscription | null>("/api/provider/subscription");
  const { data: plans } = useApi<Plan[]>("/api/provider/subscription/plans");
  const { execute: postAction } = useApiMutation("post");

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
      {}
    );
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    const url = (data as { payment_url?: string })?.payment_url;
    if (url) {
      await Linking.openURL(url);
    }
    refresh();
  }

  async function handleUpgrade(planId: string) {
    const { error: err, data } = await postAction(
      "/api/provider/subscription/initialize-payment",
      { plan_id: planId, billing_period: "monthly" }
    );
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    const url = (data as { authorization_url?: string; payment_url?: string })?.authorization_url ?? (data as { payment_url?: string })?.payment_url;
    if (url) {
      await Linking.openURL(url);
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
        <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
          <Text className="text-sm text-gray-600">No active subscription</Text>
          <Text className="mt-1 text-xs text-gray-400">
            You are on the free tier. Upgrade below to unlock more features.
          </Text>
        </View>
      ) : (
        <View className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-semibold text-gray-900">
                {(subscription.plan as Subscription["plan"])?.name ?? "Plan"}
              </Text>
              <Text className="mt-0.5 text-sm text-gray-600">
                Status: {subscription.status}
              </Text>
              {subscription.expires_at && (
                <Text className="mt-0.5 text-xs text-gray-500">
                  Renews: {formatDate(subscription.expires_at)}
                </Text>
              )}
            </View>
            <View className="rounded-full bg-indigo-100 px-3 py-1">
              <Text className="text-sm font-medium text-indigo-700">
                {subscription.status}
              </Text>
            </View>
          </View>
          {subscription.status === "active" && (
            <TouchableOpacity
              className="mt-3 rounded-xl border border-red-200 bg-white py-2"
              onPress={handleCancel}
            >
              <Text className="text-center text-sm font-medium text-red-600">
                Cancel subscription
              </Text>
            </TouchableOpacity>
          )}
          {subscription.status === "active" && subscription.expires_at && (
            <TouchableOpacity
              className="mt-2 rounded-xl bg-indigo-600 py-2"
              onPress={handleRenew}
            >
              <Text className="text-center text-sm font-medium text-white">
                Renew / update payment
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Plans (upgrade) */}
      <SectionHeader title="Plans" />
      {plans && plans.length > 0 ? (
        <View className="gap-3">
          {plans.map((plan) => (
            <View
              key={plan.id}
              className={`rounded-2xl border bg-white p-4 ${
                plan.is_popular ? "border-indigo-200" : "border-gray-100"
              }`}
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-semibold text-gray-900">
                      {plan.name}
                    </Text>
                    {plan.is_popular && (
                      <View className="rounded-full bg-indigo-100 px-2 py-0.5">
                        <Text className="text-[10px] font-medium text-indigo-700">
                          Popular
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="mt-0.5 text-sm text-gray-500">
                    {formatCurrency(plan.amount, plan.currency)}/{plan.interval}
                  </Text>
                </View>
                {(subscription?.plan as Subscription["plan"])?.id !== plan.id && (
                  <ActionButton
                    label="Upgrade"
                    variant="secondary"
                    size="sm"
                    onPress={() => handleUpgrade(plan.id)}
                  />
                )}
              </View>
              {Array.isArray(plan.features) && plan.features.length > 0 && (
                <View className="mt-2 border-t border-gray-50 pt-2">
                  {plan.features.slice(0, 3).map((f, i) => (
                    <Text key={i} className="text-xs text-gray-600">
                      • {String(f)}
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

      <View className="h-8" />
    </ScreenContainer>
  );
}

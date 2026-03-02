import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

interface Plan {
  id: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
  features?: unknown;
}

interface Subscription {
  id: string;
  status: string;
  expires_at: string | null;
  plan?: Plan | null;
}

/** Content-only for use in Settings hub tab. */
export function SubscriptionContent() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Subscription | null>("/api/provider/subscription");
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && data === undefined) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && data === undefined) {
    return (
      <View className="flex-1 justify-center px-4">
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
  const expiresAt = sub?.expires_at ? new Date(sub.expires_at) : null;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-6 h-16 w-16 items-center justify-center rounded-full bg-purple-50">
        <Ionicons name="diamond-outline" size={32} color="#a855f7" />
      </View>
      <Text className="text-lg font-semibold text-gray-900">Plan & billing</Text>
      <Text className="mt-2 text-sm text-gray-600">
        Your current subscription. Upgrades and payment methods are managed in the provider portal.
      </Text>

      {!sub ? (
        <View className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <Text className="font-medium text-gray-700">No active subscription</Text>
          <Text className="mt-1 text-sm text-gray-500">
            Subscribe in the provider portal to unlock all features.
          </Text>
        </View>
      ) : (
        <View className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-gray-900">
              {plan?.name ?? "Plan"}
            </Text>
            <View
              className={`rounded-full px-2.5 py-1 ${
                status === "active"
                  ? "bg-green-100"
                  : status === "expired"
                    ? "bg-red-100"
                    : "bg-gray-100"
              }`}
            >
              <Text
                className={`text-xs font-medium capitalize ${
                  status === "active"
                    ? "text-green-800"
                    : status === "expired"
                      ? "text-red-800"
                      : "text-gray-700"
                }`}
              >
                {status}
              </Text>
            </View>
          </View>
          {plan?.price_monthly != null && (
            <Text className="mt-2 text-sm text-gray-600">
              {plan.currency} {plan.price_monthly.toFixed(2)}/month
              {plan.price_yearly != null && (
                <> · {plan.currency} {plan.price_yearly.toFixed(2)}/year</>
              )}
            </Text>
          )}
          {expiresAt && (
            <Text className="mt-1 text-xs text-gray-500">
              {status === "active" ? "Renews " : "Expired "}
              {expiresAt.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

export default function SubscriptionScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Subscription" showBack />
      <SubscriptionContent />
    </ScreenContainer>
  );
}

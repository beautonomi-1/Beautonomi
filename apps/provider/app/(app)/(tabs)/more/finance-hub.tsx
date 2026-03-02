import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type Earnings = { total_earnings?: number; pending_payouts?: number; available_balance?: number; this_month?: number };
type FinanceResponse = { earnings?: Earnings; transactions?: unknown[] };

export default function FinanceHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<FinanceResponse>("/api/provider/finance");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Finance" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Finance" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const earnings = (data as FinanceResponse)?.earnings;
  const total = earnings?.total_earnings ?? 0;
  const pending = earnings?.pending_payouts ?? 0;
  const available = earnings?.available_balance ?? 0;
  const currency = "ZAR";

  return (
    <ScreenContainer>
      <ScreenHeader title="Finance" subtitle="Earnings and payouts" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
          <Text className="text-sm text-gray-500">Total earnings</Text>
          <Text className="mt-1 text-2xl font-bold text-gray-900">
            {currency} {typeof total === "number" ? total.toLocaleString() : "—"}
          </Text>
          {(pending > 0 || available > 0) && (
            <View className="mt-2">
              {available > 0 && <Text className="text-sm text-green-700">Available: {currency} {available.toLocaleString()}</Text>}
              {pending > 0 && <Text className="text-sm text-amber-700">Pending: {currency} {pending.toLocaleString()}</Text>}
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/finance-billing-hub" as never)}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
          activeOpacity={0.8}
        >
          <Text className="text-sm text-gray-600">
            Invoices, payroll, payouts, billing history, gift cards — all in the app.
          </Text>
          <Text className="mt-2 text-sm font-medium text-indigo-600">Finance & billing →</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

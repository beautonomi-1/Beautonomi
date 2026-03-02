import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type Transaction = {
  id: string;
  transaction_type: string;
  amount?: number;
  net?: number;
  created_at: string;
  description?: string | null;
};

type FinanceResponse = {
  earnings?: { total_earnings?: number };
  transactions?: Transaction[];
};

export default function TransactionsHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<FinanceResponse>("/api/provider/finance");

  const transactions: Transaction[] = (data as FinanceResponse)?.transactions ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Transactions & history" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Transactions & history" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Transactions & history"
        subtitle="Payments, fees & sales"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {transactions.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="swap-horizontal-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No transactions yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Transactions will appear here
            </Text>
          </View>
        ) : (
          <View className="pb-4">
            {transactions.map((t) => {
              const net = t.net ?? t.amount ?? 0;
              const isNegative = net < 0;
              return (
                <View
                  key={t.id}
                  className="mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
                >
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900 capitalize">
                      {(t.transaction_type ?? "").replace(/_/g, " ")}
                    </Text>
                    {t.description && (
                      <Text className="text-sm text-gray-500" numberOfLines={1}>
                        {t.description}
                      </Text>
                    )}
                    <Text className="mt-1 text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleString()}
                    </Text>
                  </View>
                  <Text
                    className={`text-base font-semibold ${isNegative ? "text-red-600" : "text-gray-900"}`}
                  >
                    {isNegative ? "" : "+"}ZAR {Math.abs(net).toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

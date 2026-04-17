import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

type Transaction = {
  id: string;
  transaction_type: string;
  amount?: number;
  net?: number;
  date: string;
  created_at?: string;
  description?: string | null;
};

type FinanceResponse = {
  earnings?: { total_earnings?: number };
  transactions?: Transaction[];
};

function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function TransactionsHubScreen() {
  const router = useRouter();
  const tenantCurrency = getTenantDefaultCurrency();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<FinanceResponse>("/api/provider/finance");

  const transactions: Transaction[] = (data as FinanceResponse)?.transactions ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Transactions & history" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Transactions & history" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {transactions.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="swap-horizontal-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No transactions yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Transactions will appear here
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {transactions.map((t) => {
              const net = t.net ?? t.amount ?? 0;
              const isNegative = net < 0;
              const typeLabel =
                t.transaction_type === "walk_in_additional_charge"
                  ? "Walk-in add-on"
                  : (t.transaction_type ?? "").replace(/_/g, " ");
              return (
                <View
                  key={t.id}
                  style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "500", color: Colors.gray[900], textTransform: "capitalize" }}>
                      {typeLabel}
                    </Text>
                    {t.description && (
                      <Text style={{ fontSize: 14, color: Colors.gray[500] }} numberOfLines={1}>
                        {t.description}
                      </Text>
                    )}
                    <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[400] }}>
                      {formatDateTimeSafe(t.date ?? t.created_at)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: isNegative ? "#dc2626" : Colors.gray[900] }}>
                    {isNegative ? "" : "+"}{tenantCurrency} {Math.abs(net).toLocaleString()}
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

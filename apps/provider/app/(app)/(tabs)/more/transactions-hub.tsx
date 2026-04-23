import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

/**
 * §Provider-audit 2026-04 (B1): when we replaced the "Transaction history"
 * bottom tab with the new Bookings tab we needed a first-class home for
 * sales inside More. This hub now leads with quick links to the rich
 * sales tabs before showing the generic finance transaction feed.
 */
type ShortcutRow = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  route: string;
  color: string;
  bg: string;
};

const SHORTCUTS: ShortcutRow[] = [
  {
    icon: "card-outline",
    label: "Transaction history",
    subtitle: "Appointments, products & add-ons",
    route: "/(app)/(tabs)/sales",
    color: "#0d9488",
    bg: "#ccfbf1",
  },
  {
    icon: "bar-chart-outline",
    label: "Sales by date range",
    subtitle: "Breakdown with CSV export",
    route: "/(app)/(tabs)/more/sales-history",
    color: "#6366f1",
    bg: "#e0e7ff",
  },
  {
    icon: "cash-outline",
    label: "Payouts",
    subtitle: "Withdrawals & pending balance",
    route: "/(app)/(tabs)/more/payouts",
    color: "#d97706",
    bg: "#fef3c7",
  },
];

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
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const financeUrl = selectedLocationId
    ? `/api/provider/finance?range=month&location_id=${encodeURIComponent(selectedLocationId)}`
    : `/api/provider/finance?range=month`;
  const { data, loading, error, refresh } = useApi<FinanceResponse>(financeUrl);

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
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 }}>
          {SHORTCUTS.map((s) => (
            <TouchableOpacity
              key={s.route}
              onPress={() => router.push(s.route as never)}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 14 }}
              accessibilityRole="button"
              accessibilityLabel={s.label}
            >
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: s.bg, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Ionicons name={s.icon} size={20} color={s.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{s.label}</Text>
                <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>{s.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], letterSpacing: 0.5 }}>
            RECENT TRANSACTIONS
          </Text>
        </View>
        {transactions.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="swap-horizontal-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No transactions yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Transactions will appear here
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16, paddingHorizontal: 16 }}>
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

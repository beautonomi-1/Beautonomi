import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatCurrency } from "@/lib/format";
import { hubTransactionTypeTitle, ledgerRowDisplaySign } from "@/lib/providerLedgerDisplay";
import { HUB_RETURN_SUFFIX, useProviderStackBack } from "@/lib/provider-tab-navigation";

const FINANCE_RANGE_OPTIONS: { label: string; value: "week" | "month" | "year" | "all" }[] = [
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
  { label: "All", value: "all" },
];

function recentListCaption(range: string): string {
  switch (range) {
    case "week":
      return "Last 7 days";
    case "year":
      return "Last 12 months";
    case "all":
      return "All time";
    default:
      return "Month to date";
  }
}

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
    icon: "list-outline",
    label: "Finance ledger",
    subtitle: "Fees, payouts, tips, filters & CSV export",
    route: `/(app)/(tabs)/more/transactions${HUB_RETURN_SUFFIX}`,
    color: "#2563eb",
    bg: "#dbeafe",
  },
  {
    icon: "card-outline",
    label: "Walk-in & POS sales",
    subtitle: "Appointments, products & add-ons",
    route: `/(app)/(tabs)/sales${HUB_RETURN_SUFFIX}`,
    color: "#0d9488",
    bg: "#ccfbf1",
  },
  {
    icon: "storefront-outline",
    label: "Retail walk-in",
    subtitle: "In-person product sales from your catalogue",
    route: `/(app)/(tabs)/more/walk-in-sale${HUB_RETURN_SUFFIX}`,
    color: "#c2410c",
    bg: "#ffedd5",
  },
  {
    icon: "bar-chart-outline",
    label: "Sales by date range",
    subtitle: "Breakdown with CSV export",
    route: `/(app)/(tabs)/more/sales-history${HUB_RETURN_SUFFIX}`,
    color: "#6366f1",
    bg: "#e0e7ff",
  },
  {
    icon: "cash-outline",
    label: "Payouts",
    subtitle: "Withdrawals & pending balance",
    route: `/(app)/(tabs)/more/payouts${HUB_RETURN_SUFFIX}`,
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
  currency?: string | null;
};

type FinanceResponse = {
  earnings?: { total_earnings?: number };
  transactions?: Transaction[];
  transactions_total?: number;
};

function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function TransactionsHubScreen() {
  const router = useRouter();
  const handleBack = useProviderStackBack();
  const tenantCurrency = getTenantDefaultCurrency();
  const { provider } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<"week" | "month" | "year" | "all">("month");
  const [txLimit, setTxLimit] = useState(50);
  const showAllLocationsHint = (provider?.locations?.length ?? 0) > 1;
  /** Org-wide ledger snapshot: do not pass `location_id` — finance filters drop payouts and other non-booking rows when scoped to a branch, which made this hub look empty or wrong for multi-location businesses. */
  const financeUrl = `/api/provider/finance?range=${range}&tx_limit=${txLimit}`;
  const { data, loading, error, refresh } = useApi<FinanceResponse>(financeUrl);

  const transactions: Transaction[] = (data as FinanceResponse)?.transactions ?? [];
  const transactionsTotal = (data as FinanceResponse)?.transactions_total ?? transactions.length;
  const canLoadMoreTx = transactions.length < transactionsTotal && txLimit < 200;
  const periodCaption = recentListCaption(range);

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
        <ScreenHeader title="Transactions & history" showBack onBack={handleBack} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Transactions & history" showBack onBack={handleBack} />
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
        showBack
        onBack={handleBack}
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
              onPress={() => router.navigate(s.route as never)}
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
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], letterSpacing: 0.5 }}>
            RECENT TRANSACTIONS
          </Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: Colors.gray[600] }}>{periodCaption}</Text>
          <View style={{ marginTop: 10 }}>
            <FilterChipGroup
              options={FINANCE_RANGE_OPTIONS}
              selected={range}
              onSelect={(v) => {
                setTxLimit(50);
                setRange(v as "week" | "month" | "year" | "all");
              }}
            />
          </View>
          {showAllLocationsHint ? (
            <Text style={{ marginTop: 10, fontSize: 13, color: Colors.gray[500] }}>
              All locations — switch branch in the header to filter sales elsewhere.
            </Text>
          ) : null}
        </View>
        {loading && data && !refreshing ? (
          <View style={{ paddingVertical: 40, paddingHorizontal: 16, alignItems: "center" }}>
            <ActivityIndicator color={Colors.gray[500]} />
            <Text style={{ marginTop: 12, fontSize: 13, color: Colors.gray[500] }}>Updating…</Text>
          </View>
        ) : transactions.length === 0 ? (
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
              const sign = ledgerRowDisplaySign({
                transaction_type: t.transaction_type,
                net: t.net,
                amount: t.amount,
              });
              const isDebit = sign < 0;
              const typeLabel = hubTransactionTypeTitle(t.transaction_type ?? "");
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
                  <Text style={{ fontSize: 16, fontWeight: "600", color: isDebit ? "#dc2626" : "#15803d" }}>
                    {isDebit ? "−" : "+"}
                    {formatCurrency(Math.abs(net), t.currency || tenantCurrency)}
                  </Text>
                </View>
              );
            })}
            {canLoadMoreTx ? (
              <TouchableOpacity
                onPress={() => setTxLimit((n) => Math.min(n + 50, 200))}
                disabled={loading}
                activeOpacity={0.75}
                style={{
                  marginTop: 4,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  backgroundColor: Colors.white,
                  paddingVertical: 14,
                  opacity: loading ? 0.6 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Load more transactions"
              >
                <Ionicons name="chevron-down" size={16} color={Colors.primary} />
                <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.primary }}>
                  {loading ? "Loading…" : `Load more (${transactions.length} of ${transactionsTotal})`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

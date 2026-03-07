import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

interface FinanceEarnings {
  total_earnings: number;
  pending_payouts: number;
  available_balance: number;
  this_month: number;
  last_month: number;
  growth_percentage: number;
  bookings_earnings_total: number;
  gift_card_sales_this_period: number;
  membership_sales_this_period: number;
  travel_fees_total: number;
  travel_fees_this_period: number;
  refunds_total: number;
}

interface FinanceTransaction {
  id: string;
  booking_id: string | null;
  transaction_type: string;
  type: string;
  date: string;
  amount: number;
  net: number;
  fees: number;
  commission: number;
  currency: string;
  status: string;
  description: string;
}

interface FinanceData {
  earnings: FinanceEarnings;
  transactions: FinanceTransaction[];
}

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}R${(abs / 1e6).toFixed(2)}m`;
  if (abs >= 1_000) return `${sign}R${(abs / 1000).toFixed(2)}k`;
  return `${sign}R${abs.toFixed(2)}`;
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    provider_earnings: "Earnings",
    refund: "Refund",
    tip: "Tip",
    travel_fee: "Travel fee",
    membership_sale: "Membership",
    gift_card_sale: "Gift card",
  };
  return map[type] || type;
}

const RANGE_OPTIONS: { value: "week" | "month" | "year"; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

/** Content-only for use in Finance hub (Overview tab). */
export function FinanceOverviewContent() {
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<"week" | "month" | "year">("month");
  const { screenPadding } = useResponsive();
  const { selectedLocationId } = useProvider();
  const url = `/api/provider/finance?range=${range}${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data, loading, error, refresh } = useApi<FinanceData>(url);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  const earnings = data?.earnings ?? ({} as FinanceEarnings);
  const transactions = data?.transactions ?? [];

  return (
    <>
      <View style={twStyle("mb-3 flex-row flex-wrap px-4")}>
        {RANGE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setRange(opt.value)}
            style={[twStyle(`rounded-full px-3.5 py-2 ${range === opt.value ? "bg-emerald-600" : "bg-gray-100"}`), { marginRight: 8, marginBottom: 8 }]}
          >
            <Text
              style={twStyle(`text-sm font-medium ${range === opt.value ? "text-white" : "text-gray-700"}`)}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-emerald-50/50 p-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-600")}>Available balance</Text>
          <Text style={twStyle("mt-1 text-2xl font-bold text-gray-900")}>
            {formatCurrency(earnings.available_balance ?? 0)}
          </Text>
          {(earnings.pending_payouts ?? 0) > 0 && (
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              Pending payouts: {formatCurrency(earnings.pending_payouts)}
            </Text>
          )}
        </View>

        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginRight: 12 }]}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>This month</Text>
            <Text style={twStyle("mt-1 text-lg font-bold text-gray-900")}>
              {formatCurrency(earnings.this_month ?? 0)}
            </Text>
            {(earnings.growth_percentage ?? 0) !== 0 && (
              <Text
                style={twStyle(`mt-0.5 text-xs font-medium ${(earnings.growth_percentage ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`)}
              >
                {(earnings.growth_percentage ?? 0) >= 0 ? "+" : ""}
                {earnings.growth_percentage}% vs last month
              </Text>
            )}
          </View>
          <View style={twStyle("flex-1 rounded-2xl border border-gray-100 bg-white p-4")}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>Total earnings</Text>
            <Text style={twStyle("mt-1 text-lg font-bold text-gray-900")}>
              {formatCurrency(earnings.total_earnings ?? 0)}
            </Text>
          </View>
        </View>

        <View style={twStyle("mb-2 flex-row items-center justify-between")}>
          <Text style={twStyle("text-sm font-semibold text-gray-700")}>Transactions</Text>
          {transactions.length > 0 && (
            <Text style={twStyle("text-xs text-gray-500")}>{transactions.length} in this {range}</Text>
          )}
        </View>
        {transactions.length === 0 ? (
          <View style={twStyle("rounded-2xl border border-gray-100 bg-gray-50/50 p-6")}>
            <Text style={twStyle("text-center text-sm text-gray-500")}>
              No transactions in this period.
            </Text>
          </View>
        ) : (
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {transactions.map((tx) => (
              <View
                key={tx.id}
                style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
              >
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                    {formatType(tx.transaction_type)}
                  </Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {new Date(tx.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Text
                  style={twStyle(`text-sm font-semibold ${tx.net >= 0 ? "text-green-600" : "text-red-600"}`)}
                >
                  {tx.net >= 0 ? "" : "−"}
                  {formatCurrency(Math.abs(tx.net))}
                </Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </>
  );
}

export default function FinanceScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Finance" showBack />
      <FinanceOverviewContent />
    </ScreenContainer>
  );
}

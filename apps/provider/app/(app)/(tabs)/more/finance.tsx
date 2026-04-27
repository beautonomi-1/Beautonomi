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
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

interface FinanceEarnings {
  total_earnings: number;
  pending_payouts: number;
  available_balance: number;
  this_month: number;
  last_month: number;
  growth_percentage: number;
  bookings_earnings_total: number;
  bookings_earnings_this_period?: number;
  product_sales_earnings_total?: number;
  product_sales_earnings_this_period?: number;
  platform_fees_deducted?: number;
  platform_fees_deducted_this_period?: number;
  gift_card_sales_this_period: number;
  membership_sales_this_period: number;
  travel_fees_total: number;
  travel_fees_this_period: number;
  refunds_total: number;
  refunds_this_period?: number;
  walk_in_additional_charges_total?: number;
  walk_in_additional_charges_this_period?: number;
  tips_total?: number;
  tips_this_period?: number;
  cancellation_fees_total?: number;
  cancellation_fees_this_period?: number;
  additional_charges_total?: number;
  additional_charges_this_period?: number;
}

interface FinanceTransaction {
  id: string;
  booking_id: string | null;
  transaction_type: string;
  /** API: booking | payout | refund | platform_fee (booking = provider earnings & similar credits) */
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

function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1e6).toFixed(2)}m`;
  if (abs >= 1_000) return `${sign}${currency}${(abs / 1000).toFixed(2)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    provider_earnings: "Earnings",
    refund: "Refund",
    tip: "Tip",
    travel_fee: "Travel fee",
    membership_sale: "Membership",
    gift_card_sale: "Gift card",
    walk_in_additional_charge: "Walk-in add-on",
    payout: "Payout",
    /** Ledger name for customer-paid Beautonomi fee on bookings (not provider revenue). */
    service_fee: "Platform fee",
    platform_fee: "Platform fee",
    tax: "Tax",
    additional_charge: "Additional charge",
    additional_charge_payment: "Add. charge payment",
    cancellation_fee: "Cancellation fee",
    deposit: "Deposit",
    booking_payment: "Booking payment",
    wallet_topup: "Wallet top-up",
    wallet_debit: "Wallet debit",
    commission: "Commission",
    product_sale: "Product sale",
    product_refund: "Product refund",
  };
  return map[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlatformRetainedFee(tx: FinanceTransaction): boolean {
  return (
    tx.transaction_type === "service_fee" ||
    tx.transaction_type === "platform_fee" ||
    tx.type === "platform_fee"
  );
}

const RANGE_OPTIONS: { value: "week" | "month" | "year" | "all"; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

/** Content-only for use in Finance hub (Overview tab). */
export function FinanceOverviewContent() {
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<"week" | "month" | "year" | "all">("month");
  const { screenPadding } = useResponsive();
  const { selectedLocationId } = useProvider();
  const currency = getTenantDefaultCurrency();
  const url = `/api/provider/finance?range=${range}${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data, loading, error, refresh } = useApi<FinanceData>(url);

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
  const rangeLabel =
    range === "week" ? "Last 7 days" :
    range === "month" ? "Month to date" :
    range === "year" ? "Last 12 months" :
    "All time";

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
          <Text style={twStyle("text-sm font-medium text-gray-600")}>All-time available to withdraw</Text>
          <Text style={twStyle("mt-1 text-2xl font-bold text-gray-900")}>
            {formatCurrency(earnings.available_balance ?? 0, currency)}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>
            Platform-held payoutable earnings minus completed payouts and pending requests.
          </Text>
          {(earnings.pending_payouts ?? 0) > 0 && (
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              Pending payouts: {formatCurrency(earnings.pending_payouts, currency)}
            </Text>
          )}
        </View>

        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginRight: 12 }]}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>
              {rangeLabel} earnings
            </Text>
            <Text style={twStyle("mt-1 text-lg font-bold text-gray-900")}>
              {formatCurrency(earnings.this_month ?? 0, currency)}
            </Text>
            {(earnings.growth_percentage ?? 0) !== 0 && (
              <Text
                style={twStyle(`mt-0.5 text-xs font-medium ${(earnings.growth_percentage ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`)}
              >
                {(earnings.growth_percentage ?? 0) >= 0 ? "+" : ""}
                {earnings.growth_percentage}% vs comparison period
              </Text>
            )}
          </View>
          <View style={twStyle("flex-1 rounded-2xl border border-gray-100 bg-white p-4")}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>Selected period total</Text>
            <Text style={twStyle("mt-1 text-lg font-bold text-gray-900")}>
              {formatCurrency(earnings.total_earnings ?? 0, currency)}
            </Text>
            <Text style={twStyle("mt-1 text-[10px] text-gray-500")}>
              Not the same basis as payout balance
            </Text>
          </View>
        </View>

        {/* Revenue Streams */}
        {((earnings.product_sales_earnings_total ?? 0) > 0 ||
          (earnings.tips_this_period ?? earnings.tips_total ?? 0) > 0 ||
          (earnings.cancellation_fees_this_period ?? earnings.cancellation_fees_total ?? 0) > 0 ||
          (earnings.additional_charges_this_period ?? earnings.additional_charges_total ?? 0) > 0 ||
          (earnings.walk_in_additional_charges_this_period ?? earnings.walk_in_additional_charges_total ?? 0) > 0 ||
          (earnings.gift_card_sales_this_period ?? 0) > 0 ||
          (earnings.membership_sales_this_period ?? 0) > 0 ||
          (earnings.refunds_this_period ?? earnings.refunds_total ?? 0) > 0) && (
          <>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>Revenue Streams ({rangeLabel})</Text>
            <View style={twStyle("mb-4 flex-row flex-wrap")}>
              {(earnings.product_sales_earnings_total ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-indigo-700")}>Product Sales</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-indigo-900")}>
                    {formatCurrency(earnings.product_sales_earnings_this_period ?? earnings.product_sales_earnings_total ?? 0, currency)}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-[10px] text-indigo-500")}>Incl. tax & shipping</Text>
                </View>
              )}
              {(earnings.tips_this_period ?? earnings.tips_total ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-emerald-700")}>Tips</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-emerald-900")}>
                    {formatCurrency(earnings.tips_this_period ?? earnings.tips_total ?? 0, currency)}
                  </Text>
                </View>
              )}
              {(earnings.cancellation_fees_this_period ?? earnings.cancellation_fees_total ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-amber-100 bg-amber-50/60 p-3 mb-2"), { width: "48%" }]}>
                  <Text style={twStyle("text-xs font-medium text-amber-700")}>Cancellation Fees</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-amber-900")}>
                    {formatCurrency(earnings.cancellation_fees_this_period ?? earnings.cancellation_fees_total ?? 0, currency)}
                  </Text>
                </View>
              )}
              {(earnings.additional_charges_this_period ?? earnings.additional_charges_total ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-blue-100 bg-blue-50/60 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-blue-700")}>Additional Charges</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-blue-900")}>
                    {formatCurrency(earnings.additional_charges_this_period ?? earnings.additional_charges_total ?? 0, currency)}
                  </Text>
                </View>
              )}
              {(earnings.gift_card_sales_this_period ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-pink-100 bg-pink-50/60 p-3 mb-2"), { width: "48%" }]}>
                  <Text style={twStyle("text-xs font-medium text-pink-700")}>Gift Card Sales</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-pink-900")}>
                    {formatCurrency(earnings.gift_card_sales_this_period, currency)}
                  </Text>
                </View>
              )}
              {(earnings.membership_sales_this_period ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-purple-100 bg-purple-50/60 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-purple-700")}>Membership Sales</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-purple-900")}>
                    {formatCurrency(earnings.membership_sales_this_period, currency)}
                  </Text>
                </View>
              )}
              {(earnings.refunds_this_period ?? earnings.refunds_total ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-red-100 bg-red-50/60 p-3 mb-2"), { width: "48%" }]}>
                  <Text style={twStyle("text-xs font-medium text-red-700")}>Refunds</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-red-900")}>
                    {formatCurrency(earnings.refunds_this_period ?? earnings.refunds_total ?? 0, currency)}
                  </Text>
                </View>
              )}
              {(earnings.walk_in_additional_charges_this_period ?? earnings.walk_in_additional_charges_total ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-gray-100 bg-gray-50/80 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-gray-600")}>Walk-in Add-ons</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-gray-800")}>
                    {formatCurrency(earnings.walk_in_additional_charges_this_period ?? earnings.walk_in_additional_charges_total ?? 0, currency)}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-[10px] text-gray-500")}>Not in payout balance</Text>
                </View>
              )}
            </View>
          </>
        )}

        <View style={twStyle("mb-2 flex-row items-center justify-between")}>
          <Text style={twStyle("text-sm font-semibold text-gray-700")}>Transactions</Text>
          {transactions.length > 0 && (
            <Text style={twStyle("text-xs text-gray-500")}>{transactions.length} in {rangeLabel.toLowerCase()}</Text>
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
            {transactions.map((tx) => {
              const platformFee = isPlatformRetainedFee(tx);
              const amountClass = platformFee
                ? "text-amber-700"
                : tx.net >= 0
                  ? "text-green-600"
                  : "text-red-600";
              return (
              <View
                key={tx.id}
                style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
              >
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                    {formatType(tx.transaction_type)}
                  </Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {formatDateTimeSafe(tx.date)}
                    {platformFee ? " · Retained by platform" : ""}
                  </Text>
                </View>
                <Text style={twStyle(`text-sm font-semibold ${amountClass}`)}>
                  {platformFee || tx.net < 0 ? "−" : ""}
                  {formatCurrency(Math.abs(tx.net), tx.currency || currency)}
                </Text>
              </View>
            );})}
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

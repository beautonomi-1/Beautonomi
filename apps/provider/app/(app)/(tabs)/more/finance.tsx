import { useCallback, useState } from "react";
import { Redirect } from "expo-router";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi, MONEY_SURFACE_STALE_TIME_MS } from "@/hooks/useApi";
import { useFocusRevalidate } from "@/hooks/useFocusRevalidate";
import { useResponsive } from "@/hooks/useResponsive";
import { SkeletonDashboard } from "@/components/ui/Skeleton";
import { FinanceReportError } from "@/components/finance/FinanceReportError";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatCurrency } from "@/lib/format";
import { formatLedgerTransactionType } from "@/lib/financeLabels";
import { PayoutReconciliationCard } from "@/components/PayoutReconciliationCard";
import { MoneyRangeChips, moneyRangeCaption, type MoneyRangeKey } from "@/components/finance/MoneyRangeChips";
import { Colors } from "@/constants/colors";

interface FinanceEarnings {
  total_earnings: number;
  recognized_revenue_total?: number;
  recognized_revenue_all_time?: number;
  period_provider_earnings?: number;
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
  membership_discounts_this_period?: number;
  loyalty_discounts_this_period?: number;
  promo_discounts_this_period?: number;
  membership_discounts_total?: number;
  loyalty_discounts_total?: number;
  promo_discounts_total?: number;
  payout_hold_days?: number;
  payout_reconciliation?: {
    recognized_payoutable_earnings: number;
    on_hold: number;
    excluded_provider_collected: number;
    already_paid_out: number;
    pending_payouts: number;
    available_balance: number;
  };
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
  transactions_total?: number;
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

function formatType(type: string): string {
  return formatLedgerTransactionType(type);
}

function isPlatformRetainedFee(tx: FinanceTransaction): boolean {
  return (
    tx.transaction_type === "service_fee" ||
    tx.transaction_type === "platform_fee" ||
    tx.type === "platform_fee"
  );
}


function periodMetric(value: number | undefined): number {
  return value ?? 0;
}

/** Content-only for use in Finance hub (Overview tab). */
export function FinanceOverviewContent({ locationId = null }: { locationId?: string | null } = {}) {
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<MoneyRangeKey>("month");
  const [txLimit, setTxLimit] = useState(50);
  const { screenPadding } = useResponsive();
  const currency = getTenantDefaultCurrency();
  /** Branch-scoped earnings when a location is selected; `transaction_feed=all` keeps the activity list org-wide (same as Transactions hub). */
  const url = `/api/provider/finance?range=${range}&transaction_feed=all&tx_limit=${txLimit}${
    locationId ? `&location_id=${encodeURIComponent(locationId)}` : ""
  }`;
  const { data, loading, error, errorCode, refresh, silentRefresh } = useApi<FinanceData>(url, {
    staleTimeMs: MONEY_SURFACE_STALE_TIME_MS,
    revalidateOnFocus: true,
  });
  useFocusRevalidate(silentRefresh);

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
      <View style={twStyle("flex-1 py-12")}>
        <SkeletonDashboard />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <FinanceReportError error={error} errorCode={errorCode} onRetry={refresh} />
      </View>
    );
  }

  const earnings = data?.earnings ?? ({} as FinanceEarnings);
  const transactions = data?.transactions ?? [];
  const transactionsTotal = data?.transactions_total ?? transactions.length;
  const canLoadMoreTx = transactions.length < transactionsTotal && txLimit < 200;
  const rangeLabel = moneyRangeCaption(range);

  return (
    <>
      <MoneyRangeChips
        value={range}
        onChange={(next) => {
          setTxLimit(50);
          setRange(next);
        }}
      />
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

        {earnings.payout_reconciliation ? (
          <PayoutReconciliationCard
            reconciliation={earnings.payout_reconciliation}
            currency={currency}
            payoutHoldDays={earnings.payout_hold_days}
          />
        ) : null}

        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginRight: 12 }]}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>
              {rangeLabel} — total earned (ledger)
            </Text>
            <Text style={twStyle("mt-1 text-lg font-bold text-gray-900")}>
              {formatCurrency(earnings.recognized_revenue_total ?? 0, currency)}
            </Text>
            {(earnings.growth_percentage ?? 0) !== 0 && range !== "all" && (
              <Text
                style={twStyle(`mt-0.5 text-xs font-medium ${(earnings.growth_percentage ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`)}
              >
                {(earnings.growth_percentage ?? 0) >= 0 ? "+" : ""}
                {earnings.growth_percentage}% vs comparison period
              </Text>
            )}
          </View>
          <View style={twStyle("flex-1 rounded-2xl border border-gray-100 bg-white p-4")}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>
              {rangeLabel} — provider earnings
            </Text>
            <Text style={twStyle("mt-1 text-lg font-bold text-gray-900")}>
              {formatCurrency(
                earnings.period_provider_earnings ?? earnings.this_month ?? earnings.total_earnings ?? 0,
                currency,
              )}
            </Text>
            <Text style={twStyle("mt-1 text-[10px] text-gray-500")}>
              All provider_earnings rows; tips and travel are listed separately below
            </Text>
          </View>
        </View>

        {/* Revenue Streams */}
        {((periodMetric(earnings.product_sales_earnings_this_period) > 0) ||
          (periodMetric(earnings.travel_fees_this_period) > 0) ||
          (periodMetric(earnings.tips_this_period) > 0) ||
          (periodMetric(earnings.cancellation_fees_this_period) > 0) ||
          (periodMetric(earnings.additional_charges_this_period) > 0) ||
          (periodMetric(earnings.walk_in_additional_charges_this_period) > 0) ||
          (periodMetric(earnings.gift_card_sales_this_period) > 0) ||
          (periodMetric(earnings.membership_sales_this_period) > 0) ||
          (periodMetric(earnings.refunds_this_period) > 0)) && (
          <>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>Revenue Streams ({rangeLabel})</Text>
            <View style={twStyle("mb-4 flex-row flex-wrap")}>
              {periodMetric(earnings.product_sales_earnings_this_period) > 0 && (
                <View style={[twStyle("rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-indigo-700")}>Product order earnings</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-indigo-900")}>
                    {formatCurrency(periodMetric(earnings.product_sales_earnings_this_period), currency)}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-[10px] text-indigo-500")}>Platform-held ecommerce net</Text>
                </View>
              )}
              {periodMetric(earnings.travel_fees_this_period) > 0 && (
                <View style={[twStyle("rounded-2xl border border-sky-100 bg-sky-50/60 p-3 mb-2"), { width: "48%" }]}>
                  <Text style={twStyle("text-xs font-medium text-sky-700")}>Travel fees</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-sky-900")}>
                    {formatCurrency(periodMetric(earnings.travel_fees_this_period), currency)}
                  </Text>
                </View>
              )}
              {periodMetric(earnings.tips_this_period) > 0 && (
                <View style={[twStyle("rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-emerald-700")}>Tips</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-emerald-900")}>
                    {formatCurrency(periodMetric(earnings.tips_this_period), currency)}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-[10px] text-emerald-500")}>
                    Ledger tip rows in {rangeLabel.toLowerCase()}
                  </Text>
                </View>
              )}
              {periodMetric(earnings.cancellation_fees_this_period) > 0 && (
                <View style={[twStyle("rounded-2xl border border-amber-100 bg-amber-50/60 p-3 mb-2"), { width: "48%" }]}>
                  <Text style={twStyle("text-xs font-medium text-amber-700")}>Cancellation Fees</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-amber-900")}>
                    {formatCurrency(periodMetric(earnings.cancellation_fees_this_period), currency)}
                  </Text>
                </View>
              )}
              {periodMetric(earnings.additional_charges_this_period) > 0 && (
                <View style={[twStyle("rounded-2xl border border-blue-100 bg-blue-50/60 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-blue-700")}>Additional Charges</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-blue-900")}>
                    {formatCurrency(periodMetric(earnings.additional_charges_this_period), currency)}
                  </Text>
                </View>
              )}
              {(earnings.gift_card_sales_this_period ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-pink-100 bg-pink-50/60 p-3 mb-2"), { width: "48%" }]}>
                  <Text style={twStyle("text-xs font-medium text-pink-700")}>Gift-card liability</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-pink-900")}>
                    {formatCurrency(earnings.gift_card_sales_this_period, currency)}
                  </Text>
                </View>
              )}
              {(earnings.membership_sales_this_period ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-purple-100 bg-purple-50/60 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-purple-700")}>Membership liability</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-purple-900")}>
                    {formatCurrency(earnings.membership_sales_this_period, currency)}
                  </Text>
                </View>
              )}
              {periodMetric(earnings.refunds_this_period) > 0 && (
                <View style={[twStyle("rounded-2xl border border-red-100 bg-red-50/60 p-3 mb-2"), { width: "48%" }]}>
                  <Text style={twStyle("text-xs font-medium text-red-700")}>Refunds</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-red-900")}>
                    {formatCurrency(periodMetric(earnings.refunds_this_period), currency)}
                  </Text>
                </View>
              )}
              {periodMetric(earnings.walk_in_additional_charges_this_period) > 0 && (
                <View style={[twStyle("rounded-2xl border border-gray-100 bg-gray-50/80 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-gray-600")}>Walk-in Add-ons</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-gray-800")}>
                    {formatCurrency(periodMetric(earnings.walk_in_additional_charges_this_period), currency)}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-[10px] text-gray-500")}>Not in payout balance</Text>
                </View>
              )}
            </View>
          </>
        )}

        {((earnings.membership_discounts_this_period ?? 0) > 0 ||
          (earnings.loyalty_discounts_this_period ?? 0) > 0 ||
          (earnings.promo_discounts_this_period ?? 0) > 0) && (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>
              Discounts on bookings ({rangeLabel})
            </Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              Already reflected in what the customer paid — not added on top of earnings.
            </Text>
            <View style={twStyle("flex-row flex-wrap")}>
              {(earnings.membership_discounts_this_period ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-slate-100 bg-slate-50/80 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-slate-700")}>Membership discount</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-slate-900")}>
                    {formatCurrency(earnings.membership_discounts_this_period ?? 0, currency)}
                  </Text>
                </View>
              )}
              {(earnings.loyalty_discounts_this_period ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-slate-100 bg-slate-50/80 p-3 mb-2"), { width: "48%" }]}>
                  <Text style={twStyle("text-xs font-medium text-slate-700")}>Loyalty discount</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-slate-900")}>
                    {formatCurrency(earnings.loyalty_discounts_this_period ?? 0, currency)}
                  </Text>
                </View>
              )}
              {(earnings.promo_discounts_this_period ?? 0) > 0 && (
                <View style={[twStyle("rounded-2xl border border-slate-100 bg-slate-50/80 p-3 mb-2"), { width: "48%", marginRight: "4%" }]}>
                  <Text style={twStyle("text-xs font-medium text-slate-700")}>Promo / coupon discount</Text>
                  <Text style={twStyle("mt-0.5 text-base font-semibold text-slate-900")}>
                    {formatCurrency(earnings.promo_discounts_this_period ?? 0, currency)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={twStyle("mb-2 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 mr-2")}>
            <Text style={twStyle("text-sm font-semibold text-gray-700")}>Transactions</Text>
            {locationId ? (
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>Recent activity across all locations</Text>
            ) : null}
          </View>
          {transactions.length > 0 && (
            <Text style={twStyle("text-xs text-gray-500 shrink-0")}>{transactions.length} in {rangeLabel.toLowerCase()}</Text>
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

        {canLoadMoreTx ? (
          <TouchableOpacity
            onPress={() => setTxLimit((n) => Math.min(n + 50, 200))}
            disabled={loading}
            activeOpacity={0.75}
            style={twStyle(
              `mt-3 flex-row items-center justify-center rounded-2xl border border-gray-200 bg-white py-3 ${loading ? "opacity-60" : ""}`,
            )}
            accessibilityRole="button"
            accessibilityLabel="Load more transactions"
          >
            <Ionicons name="chevron-down" size={16} color={Colors.primary} />
            <Text style={twStyle("ml-1 text-sm font-semibold text-primary")}>
              {loading ? "Loading…" : `Load more (${transactions.length} of ${transactionsTotal})`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </>
  );
}

export default function FinanceScreen() {
  return <Redirect href="/(app)/(tabs)/more/money?tab=overview" />;
}

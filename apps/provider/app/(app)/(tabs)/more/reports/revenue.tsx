import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import {
  getReportDateRange,
  formatReportRangeCaption,
  type ReportDateRangeKey,
} from "@/lib/reportDateRanges";
import { appendReportLocation } from "@/lib/reportLocationQuery";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";
import { ReportBasisFootnote } from "@/components/reports/ReportBasisFootnote";

const DATE_RANGES: { label: string; value: ReportDateRangeKey }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "3 Months", value: "3months" },
];

interface RevenueData {
  total_revenue: number;
  ledger_from_bookings?: number;
  ledger_from_product_orders?: number;
  cancellation_fees?: number;
  total_revenue_inclusive?: number;
  previous_revenue?: number;
  revenue_by_service: { service: string; revenue: number }[];
  revenue_by_staff: { staff: string; revenue: number }[];
  daily_trend: { date: string; revenue: number }[];
  avg_per_booking?: number;
  transaction_count?: number;
  bookings_with_ledger_earnings?: number;
  time_basis_note?: string;
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  reportBasis?: string;
  basis?: Record<string, string>;
}

function BarChart({
  data,
  labelKey,
  valueKey,
  color = "#22c55e",
  formatValue,
}: {
  data: Record<string, any>[];
  labelKey: string;
  valueKey: string;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const series = data.slice(-31);
  const maxVal = Math.max(...series.map((d) => d[valueKey] ?? 0), 1);
  const barSlot = 26;
  const gap = 6;
  const chartMinWidth = Math.max(series.length * (barSlot + gap), 280);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled">
      <View style={{ minWidth: chartMinWidth, height: 172, paddingTop: 8, flexDirection: "row", alignItems: "flex-end" }}>
        {series.map((item, i) => {
          const val = item[valueKey] ?? 0;
          const pct = Math.max((val / maxVal) * 100, 3);
          return (
            <View
              key={i}
              style={{
                width: barSlot,
                marginRight: i < series.length - 1 ? gap : 0,
                height: "100%",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <Text style={twStyle("mb-1 text-[9px] text-gray-500")} numberOfLines={1}>
                {formatValue ? formatValue(val) : val}
              </Text>
              <View style={[{ height: `${pct}%`, backgroundColor: color, minHeight: 4, width: "100%" }, twStyle("rounded-t-md")]} />
              <Text style={twStyle("mt-1 text-[9px] text-gray-400")} numberOfLines={1}>
                {String(item[labelKey]).slice(-5)}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function HorizontalBar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <View style={twStyle("py-2 border-b border-gray-50")}>
      <View style={twStyle("mb-1 flex-row justify-between")}>
        <Text style={twStyle("min-w-0 flex-1 text-sm text-gray-600")} numberOfLines={2}>
          {label}
        </Text>
        <Text style={twStyle("shrink-0 text-sm font-semibold text-gray-900")}>{formatCurrency(value)}</Text>
      </View>
      <View style={twStyle("h-2 rounded-full bg-gray-100")}>
        <View style={[{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }, twStyle("h-full rounded-full")]} />
      </View>
    </View>
  );
}

export default function RevenueReport() {
  const { selectedLocationId, provider } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const { from, to } = getReportDateRange(dateRange, { timezone: provider?.timezone });
  const rangeCaption = formatReportRangeCaption(from, to);
  const revenueReportUrl = appendReportLocation(`/api/provider/reports/revenue?from=${from}&to=${to}`, selectedLocationId);
  const { data, loading, error: dataError, timedOut, refresh } = useApi<RevenueData>(
    revenueReportUrl,
    { timeoutMs: 15000 }
  );
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const bookingsWithLedger = data.bookings_with_ledger_earnings ?? data.transaction_count;
    const text = [
      `Revenue overview (${from} → ${to}${data.timezone ? ` · ${data.timezone}` : ""})`,
      `Total ledger net: ${formatCurrency(data.total_revenue)}`,
      data.ledger_from_bookings != null ? `Booking-linked ledger: ${formatCurrency(data.ledger_from_bookings)}` : "",
      data.ledger_from_product_orders != null ? `Product-order ledger: ${formatCurrency(data.ledger_from_product_orders)}` : "",
      (data.cancellation_fees ?? 0) > 0 ? `Cancellation fees: ${formatCurrency(data.cancellation_fees ?? 0)}` : "",
      `Total incl. cancellation fees: ${formatCurrency(data.total_revenue_inclusive ?? data.total_revenue)}`,
      bookingsWithLedger != null ? `Bookings with ledger earnings: ${bookingsWithLedger}` : "",
      data.avg_per_booking ? `Avg booking-linked per earning booking: ${formatCurrency(data.avg_per_booking)}` : "",
      data.time_basis_note ? `Timing: ${data.time_basis_note}` : "",
      data.reportBasis ? `Full basis: ${data.reportBasis}` : "",
      "",
      "By service (booking-linked allocation only):",
      ...data.revenue_by_service.map((s) => `  ${s.service}: ${formatCurrency(s.revenue)}`),
      "",
      "By staff (booking-linked allocation only):",
      ...data.revenue_by_staff.map((s) => `  ${s.staff}: ${formatCurrency(s.revenue)}`),
    ].filter(Boolean).join("\n");
    await Share.share({ message: text, title: "Revenue overview" });
  }, [data, from, to]);

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Revenue" showBack subtitle="Ledger totals, splits, and booking-linked breakdowns" />

      <View style={twStyle("mb-3")}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", paddingBottom: 4 }}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[twStyle(`rounded-full px-4 py-2 ${dateRange === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`), { marginRight: 8 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDateRange(r.value); }}
            >
              <Text style={twStyle(`text-sm font-medium ${dateRange === r.value ? "text-white" : "text-gray-600"}`)}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={twStyle("text-xs text-gray-500")}>{rangeCaption}</Text>
        {data ? (
          <ReportBasisFootnote
            basisNote={data.time_basis_note}
            reportBasis={data.reportBasis ?? data.basis?.ledger_period}
            compact
          />
        ) : null}
      </View>

      {timedOut && !data && (
        <ErrorState
          message="Request is taking longer than usual. Check your connection and try again."
          onRetry={refresh}
          retryLabel="Retry"
        />
      )}

      {dataError && !data && <ErrorState message={dataError} onRetry={refresh} />}

      {loading && !data && !timedOut && !dataError && <ActivityIndicator style={twStyle("my-8")} color="#22c55e" />}

      {!loading && !data && !timedOut && !dataError && (
        <EmptyState icon="cash-outline" title="No revenue data" description="Ledger activity will appear once you have recognized earnings in this window" />
      )}

      {data && (
        <View>
          <View
            style={[
              twStyle("rounded-2xl border border-green-100 bg-green-50/90 p-5"),
              { marginBottom: 16, shadowColor: "#14532d", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
            ]}
          >
            <Text style={twStyle("text-center text-xs font-semibold uppercase tracking-wide text-green-800")}>Total ledger net</Text>
            <Text style={twStyle("mt-1 text-center text-[11px] leading-4 text-green-700")}>
              Provider earnings (ledger), incl. product orders — recognition time in your timezone
            </Text>
            <Text style={twStyle("mt-3 text-center text-3xl font-bold text-green-950")}>{formatCurrency(data.total_revenue)}</Text>
            {data.previous_revenue != null && data.previous_revenue > 0 && (
              <Text style={twStyle("mt-2 text-center text-xs text-green-700")}>
                {data.total_revenue >= data.previous_revenue ? "+" : ""}
                {(((data.total_revenue - data.previous_revenue) / data.previous_revenue) * 100).toFixed(1)}% vs prior equal-length window
              </Text>
            )}
            {data.time_basis_note ? (
              <Text style={twStyle("mt-3 text-center text-xs leading-4 text-green-800")}>{data.time_basis_note}</Text>
            ) : null}
          </View>

          {data.basis && Object.keys(data.basis).length > 0 ? (
            <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>Definitions</Text>
              {Object.entries(data.basis).map(([k, v]) => (
                <Text key={k} style={twStyle("mb-2 text-xs leading-5 text-gray-700")}>
                  <Text style={twStyle("font-semibold text-gray-900")}>
                    {k === "headline"
                      ? "Headline"
                      : k === "bookingsMix"
                        ? "Retail / orders"
                        : k === "breakdown"
                          ? "Service & staff tables"
                          : k === "avgPerBooking"
                            ? "Avg per booking"
                            : k === "dailyTrend"
                              ? "Daily chart"
                              : k}
                    :{" "}
                  </Text>
                  {v}
                </Text>
              ))}
            </View>
          ) : null}

          {(data.ledger_from_bookings != null || data.ledger_from_product_orders != null) && (
            <View style={twStyle("mb-3 flex-row gap-2")}>
              {data.ledger_from_bookings != null ? (
                <View style={twStyle("flex-1 rounded-xl border border-gray-100 bg-white px-3 py-3")}>
                  <Text style={twStyle("text-[11px] font-medium text-gray-500")}>Booking-linked ledger</Text>
                  <Text style={twStyle("mt-1 text-base font-semibold text-gray-900")}>{formatCurrency(data.ledger_from_bookings)}</Text>
                </View>
              ) : null}
              {data.ledger_from_product_orders != null ? (
                <View style={twStyle("flex-1 rounded-xl border border-gray-100 bg-white px-3 py-3")}>
                  <Text style={twStyle("text-[11px] font-medium text-gray-500")}>Product-order ledger</Text>
                  <Text style={twStyle("mt-1 text-base font-semibold text-gray-900")}>{formatCurrency(data.ledger_from_product_orders)}</Text>
                </View>
              ) : null}
            </View>
          )}

          <ReportResponsiveStatRow>
            {(data.bookings_with_ledger_earnings ?? data.transaction_count) != null ? (
              <StatCard
                title="Bookings w/ earnings"
                subtitle="Distinct bookings with ledger allocation"
                value={String(data.bookings_with_ledger_earnings ?? data.transaction_count)}
                icon="calendar-outline"
                iconColor="#3b82f6"
                iconBg="bg-blue-50"
                compact
              />
            ) : null}
            {data.avg_per_booking != null ? (
              <StatCard
                title="Avg booking-linked"
                subtitle="Among bookings above only"
                value={formatCurrency(data.avg_per_booking)}
                icon="trending-up-outline"
                iconColor="#22c55e"
                iconBg="bg-green-50"
                compact
              />
            ) : null}
          </ReportResponsiveStatRow>

          {((data.cancellation_fees ?? 0) > 0 || (data.total_revenue_inclusive ?? 0) > data.total_revenue) && (
            <View style={twStyle("mt-2")}>
              <ReportResponsiveStatRow>
                <StatCard title="Cancellation fees" value={formatCurrency(data.cancellation_fees ?? 0)} icon="close-circle-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
                <StatCard title="Total incl. fees" value={formatCurrency(data.total_revenue_inclusive ?? data.total_revenue)} icon="wallet-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
              </ReportResponsiveStatRow>
            </View>
          )}

          {data.daily_trend.length > 0 && (
            <View>
              <SectionHeader title="Daily ledger (recognition date)" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <BarChart data={data.daily_trend} labelKey="date" valueKey="revenue" color="#22c55e" formatValue={formatCurrency} />
              </View>
            </View>
          )}

          {data.revenue_by_service.length > 0 && (
            <View>
              <SectionHeader title="By service (booking-linked)" subtitle="Retail-only ledger is not allocated here" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
                {data.revenue_by_service.map((s, i) => (
                  <HorizontalBar
                    key={i}
                    label={s.service}
                    value={s.revenue}
                    maxValue={Math.max(...data.revenue_by_service.map((x) => x.revenue), 1)}
                    color="#22c55e"
                  />
                ))}
              </View>
            </View>
          )}

          {data.revenue_by_staff.length > 0 && (
            <View>
              <SectionHeader title="By staff (booking-linked)" subtitle="Same allocation rules as services" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
                {data.revenue_by_staff.map((s, i) => (
                  <HorizontalBar
                    key={i}
                    label={s.staff}
                    value={s.revenue}
                    maxValue={Math.max(...data.revenue_by_staff.map((x) => x.revenue), 1)}
                    color="#6366f1"
                  />
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity style={twStyle("rounded-xl bg-gray-100 py-3 px-4 flex-row items-center justify-center")} onPress={handleExport}>
            <Ionicons name="share-outline" size={18} color="#374151" />
            <Text style={twStyle("ml-2 text-sm font-medium text-gray-700")}>Export Report</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}

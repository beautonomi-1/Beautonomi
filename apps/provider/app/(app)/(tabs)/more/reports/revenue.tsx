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

const DATE_RANGES: { label: string; value: ReportDateRangeKey }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "3 Months", value: "3months" },
];

interface RevenueData {
  total_revenue: number;
  cancellation_fees?: number;
  total_revenue_inclusive?: number;
  previous_revenue?: number;
  revenue_by_service: { service: string; revenue: number }[];
  revenue_by_staff: { staff: string; revenue: number }[];
  daily_trend: { date: string; revenue: number }[];
  avg_per_booking?: number;
  transaction_count?: number;
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
  const { selectedLocationId } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const { from, to } = getReportDateRange(dateRange);
  const rangeCaption = formatReportRangeCaption(from, to);
  const revenueReportUrl = appendReportLocation(`/api/provider/reports/revenue?from=${from}&to=${to}`, selectedLocationId);
  const { data, loading, error: dataError, timedOut, refresh } = useApi<RevenueData>(
    revenueReportUrl,
    { timeoutMs: 15000 }
  );

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Revenue Report (${from} to ${to})`,
      `Total Revenue: ${formatCurrency(data.total_revenue)}`,
      data.transaction_count ? `Transactions: ${data.transaction_count}` : "",
      data.avg_per_booking ? `Avg per Booking: ${formatCurrency(data.avg_per_booking)}` : "",
      "",
      "By Service:",
      ...data.revenue_by_service.map((s) => `  ${s.service}: ${formatCurrency(s.revenue)}`),
      "",
      "By Staff:",
      ...data.revenue_by_staff.map((s) => `  ${s.staff}: ${formatCurrency(s.revenue)}`),
    ].filter(Boolean).join("\n");
    await Share.share({ message: text, title: "Revenue Report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Revenue" showBack subtitle="Income trends & breakdowns" />

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
        <EmptyState icon="cash-outline" title="No revenue data" description="Revenue data will appear once you have transactions" />
      )}

      {data && (
        <View>
          <View style={[twStyle("rounded-2xl bg-green-50 p-5 items-center"), { marginBottom: 16 }]}>
            <Text style={twStyle("text-sm text-green-700")}>Total Revenue</Text>
            <Text style={twStyle("text-3xl font-bold text-green-900 mt-1")}>{formatCurrency(data.total_revenue)}</Text>
            {data.previous_revenue != null && data.previous_revenue > 0 && (
              <Text style={twStyle("text-xs text-green-600 mt-1")}>
                {data.total_revenue >= data.previous_revenue ? "+" : ""}
                {(((data.total_revenue - data.previous_revenue) / data.previous_revenue) * 100).toFixed(1)}% vs previous period
              </Text>
            )}
          </View>

          <ReportResponsiveStatRow>
            {data.transaction_count != null ? (
              <StatCard title="Transactions" value={String(data.transaction_count)} icon="receipt-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
            ) : null}
            {data.avg_per_booking != null ? (
              <StatCard title="Avg / Booking" value={formatCurrency(data.avg_per_booking)} icon="trending-up-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
            ) : null}
          </ReportResponsiveStatRow>

          {((data.cancellation_fees ?? 0) > 0 || (data.total_revenue_inclusive ?? 0) > data.total_revenue) && (
            <View style={twStyle("mt-2")}>
              <ReportResponsiveStatRow>
                <StatCard title="Cancellation Fees" value={formatCurrency(data.cancellation_fees ?? 0)} icon="close-circle-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
                <StatCard title="Total (incl. fees)" value={formatCurrency(data.total_revenue_inclusive ?? data.total_revenue)} icon="wallet-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
              </ReportResponsiveStatRow>
            </View>
          )}

          {data.daily_trend.length > 0 && (
            <View>
              <SectionHeader title="Daily Revenue Trend" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <BarChart data={data.daily_trend} labelKey="date" valueKey="revenue" color="#22c55e" formatValue={formatCurrency} />
              </View>
            </View>
          )}

          {data.revenue_by_service.length > 0 && (
            <View>
              <SectionHeader title="Revenue by Service" />
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
              <SectionHeader title="Revenue by Staff" />
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

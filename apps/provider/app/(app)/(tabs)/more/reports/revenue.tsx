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

type DateRange = "today" | "week" | "month" | "last_month" | "3months";

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "3 Months", value: "3months" },
];

interface RevenueData {
  total_revenue: number;
  previous_revenue?: number;
  revenue_by_service: { service: string; revenue: number }[];
  revenue_by_staff: { staff: string; revenue: number }[];
  daily_trend: { date: string; revenue: number }[];
  avg_per_booking?: number;
  transaction_count?: number;
}

function getDateParams(range: DateRange) {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from = to;
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().split("T")[0];
  } else if (range === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    from = d.toISOString().split("T")[0];
  } else if (range === "last_month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from, to: endOfMonth.toISOString().split("T")[0] };
  } else if (range === "3months") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    from = d.toISOString().split("T")[0];
  }
  return { from, to };
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
  const maxVal = Math.max(...data.map((d) => d[valueKey] ?? 0), 1);
  return (
    <View style={[twStyle("flex-row items-end justify-between pt-2"), { height: 160 }]}>
      {data.slice(-14).map((item, i) => {
        const val = item[valueKey] ?? 0;
        const pct = Math.max((val / maxVal) * 100, 2);
        return (
          <View key={i} style={[twStyle("flex-1 items-center"), { height: "100%", justifyContent: "flex-end", marginRight: i < data.slice(-14).length - 1 ? 4 : 0 }]}>
            <Text style={twStyle("mb-1 text-[9px] text-gray-500")} numberOfLines={1}>
              {formatValue ? formatValue(val) : val}
            </Text>
            <View style={[{ height: `${pct}%`, backgroundColor: color, minHeight: 4 }, twStyle("w-full rounded-t-md")]} />
            <Text style={twStyle("mt-1 text-[9px] text-gray-400")} numberOfLines={1}>
              {String(item[labelKey]).slice(-5)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function HorizontalBar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <View style={twStyle("py-2 border-b border-gray-50")}>
      <View style={twStyle("flex-row justify-between mb-1")}>
        <Text style={twStyle("text-sm text-gray-600")} numberOfLines={1}>{label}</Text>
        <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(value)}</Text>
      </View>
      <View style={twStyle("h-2 rounded-full bg-gray-100")}>
        <View style={[{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }, twStyle("h-full rounded-full")]} />
      </View>
    </View>
  );
}

export default function RevenueReport() {
  const { selectedLocationId } = useProvider();
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const { from, to } = getDateParams(dateRange);
  const revenueReportUrl = `/api/provider/reports/revenue?from=${from}&to=${to}${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data, loading, error, timedOut, refresh } = useApi<RevenueData>(
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4")} contentContainerStyle={{ flexDirection: "row" }}>
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

      {timedOut && !data && (
        <ErrorState
          message="Request is taking longer than usual. Check your connection and try again."
          onRetry={refresh}
          retryLabel="Retry"
        />
      )}

      {error && !data && <ErrorState message={error} onRetry={refresh} />}

      {loading && !data && !timedOut && !error && <ActivityIndicator style={twStyle("my-8")} color="#22c55e" />}

      {!loading && !data && !timedOut && !error && (
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

          <View style={twStyle("flex-row")}>
            {data.transaction_count != null && (
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <StatCard title="Transactions" value={String(data.transaction_count)} icon="receipt-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
              </View>
            )}
            {data.avg_per_booking != null && (
              <View style={twStyle("flex-1")}>
                <StatCard title="Avg / Booking" value={formatCurrency(data.avg_per_booking)} icon="trending-up-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
              </View>
            )}
          </View>

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
                  <HorizontalBar key={i} label={s.service} value={s.revenue} maxValue={data.revenue_by_service[0]?.revenue || 1} color="#22c55e" />
                ))}
              </View>
            </View>
          )}

          {data.revenue_by_staff.length > 0 && (
            <View>
              <SectionHeader title="Revenue by Staff" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
                {data.revenue_by_staff.map((s, i) => (
                  <HorizontalBar key={i} label={s.staff} value={s.revenue} maxValue={data.revenue_by_staff[0]?.revenue || 1} color="#6366f1" />
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

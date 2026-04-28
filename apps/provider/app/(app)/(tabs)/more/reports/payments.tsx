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

interface PaymentsData {
  total_collected: number;
  total_refunded: number;
  cancellation_fees?: number;
  tips_collected?: number;
  net_revenue: number;
  by_method: { method: string; amount: number; count: number }[];
  recent_payouts: { date: string; amount: number; status: string }[];
  recent_refunds: { date: string; amount: number; reason?: string; booking_ref?: string }[];
}

const METHOD_COLORS: Record<string, string> = {
  card: "#3b82f6",
  cash: "#22c55e",
  wallet: "#8b5cf6",
  gift_card: "#ec4899",
  bank_transfer: "#0ea5e9",
};

export default function PaymentsReport() {
  const { selectedLocationId } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const { from, to } = getReportDateRange(dateRange);
  const rangeCaption = formatReportRangeCaption(from, to);
  const paymentsReportUrl = appendReportLocation(`/api/provider/reports/payments?from=${from}&to=${to}`, selectedLocationId);
  const { data, loading, error: dataError, refresh } = useApi<PaymentsData>(paymentsReportUrl);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Payment Report (${from} to ${to})`,
      `Total Collected: ${formatCurrency(data.total_collected)}`,
      `Total Refunded: ${formatCurrency(data.total_refunded)}`,
      `Net Revenue: ${formatCurrency(data.net_revenue)}`,
      "",
      "By Method:",
      ...data.by_method.map((m) => `  ${m.method}: ${formatCurrency(m.amount)} (${m.count} transactions)`),
    ].join("\n");
    await Share.share({ message: text, title: "Payment Report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Payments" showBack subtitle="Methods, payouts & refunds" />

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

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#0ea5e9" />}
      {!loading && dataError && !data && <ErrorState message={dataError} onRetry={refresh} />}
      {!loading && !data && !dataError && <EmptyState icon="card-outline" title="No payment data" description="Payment analytics will appear here" />}

      {data && (
        <View>
          <ReportResponsiveStatRow>
            <StatCard title="Collected" value={formatCurrency(data.total_collected)} icon="arrow-down-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
            <StatCard title="Refunded" value={formatCurrency(data.total_refunded)} icon="arrow-up-circle-outline" iconColor="#ef4444" iconBg="bg-red-50" compact />
          </ReportResponsiveStatRow>

          {((data.cancellation_fees ?? 0) > 0 || (data.tips_collected ?? 0) > 0) && (
            <View style={twStyle("mt-3")}>
              <ReportResponsiveStatRow>
                {(data.tips_collected ?? 0) > 0 ? (
                  <StatCard title="Tips" value={formatCurrency(data.tips_collected!)} icon="heart-outline" iconColor="#10b981" iconBg="bg-emerald-50" compact />
                ) : null}
                {(data.cancellation_fees ?? 0) > 0 ? (
                  <StatCard title="Cancellation Fees" value={formatCurrency(data.cancellation_fees!)} icon="close-circle-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
                ) : null}
              </ReportResponsiveStatRow>
            </View>
          )}

          <View style={[twStyle("rounded-2xl bg-sky-50 p-5 items-center"), { marginTop: 16, marginBottom: 16 }]}>
            <Text style={twStyle("text-sm text-sky-700")}>Net Revenue</Text>
            <Text style={twStyle("text-3xl font-bold text-sky-900 mt-1")}>{formatCurrency(data.net_revenue)}</Text>
          </View>

          {data.by_method.length > 0 && (
            <View>
              <SectionHeader title="Payment Methods" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                {data.by_method.map((m, i) => {
                const total = data.by_method.reduce((s, x) => s + x.amount, 0);
                const pct = total > 0 ? (m.amount / total) * 100 : 0;
                const color = METHOD_COLORS[m.method] || "#9ca3af";
                return (
                  <View key={i} style={i > 0 ? { marginTop: 12 } : undefined}>
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <View style={twStyle("flex-row items-center")}>
                        <View style={[{ backgroundColor: color }, twStyle("h-3 w-3 rounded-full mr-2")]} />
                        <Text style={twStyle("text-sm text-gray-600 capitalize")}>{m.method.replace(/_/g, " ")}</Text>
                      </View>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(m.amount)} ({m.count})</Text>
                    </View>
                    <View style={twStyle("h-2 rounded-full bg-gray-100")}>
                      <View style={[{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }, twStyle("h-full rounded-full")]} />
                    </View>
                  </View>
                );
              })}
              </View>
            </View>
          )}

          {data.recent_payouts.length > 0 && (
            <View>
              <SectionHeader title="Recent Payouts" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.recent_payouts.slice(0, 10).map((p, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-3 border-b border-gray-50")}>
                    <View>
                      <Text style={twStyle("text-sm text-gray-900")}>{formatCurrency(p.amount)}</Text>
                      <Text style={twStyle("text-xs text-gray-400")}>{p.date}</Text>
                    </View>
                    <View style={twStyle(`rounded-full px-2.5 py-1 ${p.status === "completed" ? "bg-green-100" : "bg-amber-100"}`)}>
                      <Text style={twStyle(`text-xs font-medium ${p.status === "completed" ? "text-green-700" : "text-amber-700"}`)}>{p.status}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.recent_refunds.length > 0 && (
            <View>
              <SectionHeader title="Recent Refunds" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.recent_refunds.slice(0, 10).map((r, i) => (
                  <View key={i} style={twStyle("py-3 border-b border-gray-50")}>
                    <View style={twStyle("flex-row justify-between")}>
                      <Text style={twStyle("text-sm font-medium text-red-600")}>{formatCurrency(r.amount)}</Text>
                      <Text style={twStyle("text-xs text-gray-400")}>{r.date}</Text>
                    </View>
                    {r.reason && <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>{r.reason}</Text>}
                  </View>
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

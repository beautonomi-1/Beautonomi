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
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
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

interface PaymentsData {
  total_collected: number;
  total_refunded: number;
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

function getDateParams(range: DateRange) {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from = to;
  if (range === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); from = d.toISOString().split("T")[0]; }
  else if (range === "month") { const d = new Date(now); d.setMonth(d.getMonth() - 1); from = d.toISOString().split("T")[0]; }
  else if (range === "last_month") {
    const d = new Date(now); d.setMonth(d.getMonth() - 1);
    from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
    return { from, to: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0] };
  }
  else if (range === "3months") { const d = new Date(now); d.setMonth(d.getMonth() - 3); from = d.toISOString().split("T")[0]; }
  return { from, to };
}

export default function PaymentsReport() {
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const { from, to } = getDateParams(dateRange);
  const { data, loading } = useApi<PaymentsData>(
    `/api/provider/reports/payments?from=${from}&to=${to}`
  );

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

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#0ea5e9" />}
      {!loading && !data && <EmptyState icon="card-outline" title="No payment data" description="Payment analytics will appear here" />}

      {data && (
        <View>
          <View style={twStyle("flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <StatCard title="Collected" value={formatCurrency(data.total_collected)} icon="arrow-down-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
            </View>
            <View style={twStyle("flex-1")}>
              <StatCard title="Refunded" value={formatCurrency(data.total_refunded)} icon="arrow-up-circle-outline" iconColor="#ef4444" iconBg="bg-red-50" compact />
            </View>
          </View>

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

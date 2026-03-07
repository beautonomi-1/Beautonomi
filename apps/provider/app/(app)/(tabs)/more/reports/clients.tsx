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
import { formatCurrency, formatPercentage } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type DateRange = "today" | "week" | "month" | "last_month" | "3months";

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "3 Months", value: "3months" },
];

interface ClientsData {
  new_clients: number;
  returning_clients: number;
  total_clients: number;
  retention_rate?: number;
  avg_lifetime_value?: number;
  top_clients: { name: string; spend: number; visits: number }[];
  growth: { month: string; count: number }[];
}

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

export default function ClientsReport() {
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const { from, to } = getDateParams(dateRange);
  const { data, loading } = useApi<ClientsData>(
    `/api/provider/reports/clients?from=${from}&to=${to}`
  );

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Client Report (${from} to ${to})`,
      `New Clients: ${data.new_clients}`,
      `Returning Clients: ${data.returning_clients}`,
      data.retention_rate != null ? `Retention Rate: ${formatPercentage(data.retention_rate)}` : "",
      data.avg_lifetime_value != null ? `Avg Lifetime Value: ${formatCurrency(data.avg_lifetime_value)}` : "",
      "",
      "Top Clients:",
      ...data.top_clients.slice(0, 10).map((c, i) => `  ${i + 1}. ${c.name}: ${formatCurrency(c.spend)} (${c.visits} visits)`),
    ].filter(Boolean).join("\n");
    await Share.share({ message: text, title: "Client Report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Clients" showBack subtitle="New, returning & top spenders" />

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

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#ec4899" />}
      {!loading && !data && <EmptyState icon="people-outline" title="No client data" description="Client analytics will appear here" />}

      {data && (
        <View>
          <View style={[twStyle("flex-row"), { marginBottom: 16 }]}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <StatCard title="New Clients" value={String(data.new_clients)} icon="person-add-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
            </View>
            <View style={twStyle("flex-1")}>
              <StatCard title="Returning" value={String(data.returning_clients)} icon="refresh-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
            </View>
          </View>

          <View style={twStyle("flex-row")}>
            {data.retention_rate != null && (
              <View style={twStyle("flex-1")}>
                <StatCard title="Retention Rate" value={formatPercentage(data.retention_rate)} icon="heart-outline" iconColor="#ec4899" iconBg="bg-pink-50" compact />
              </View>
            )}
            {data.avg_lifetime_value != null && (
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <StatCard title="Avg LTV" value={formatCurrency(data.avg_lifetime_value)} icon="diamond-outline" iconColor="#8b5cf6" iconBg="bg-violet-50" compact />
              </View>
            )}
          </View>

          {/* New vs Returning visual */}
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-3")}>New vs Returning</Text>
            <View style={twStyle("h-6 rounded-full bg-gray-100 flex-row overflow-hidden")}>
              {data.new_clients + data.returning_clients > 0 && (
                <>
                  <View
                    style={[{ width: `${(data.new_clients / (data.new_clients + data.returning_clients)) * 100}%` }, twStyle("h-full bg-green-500")]}
                  />
                  <View
                    style={[{ width: `${(data.returning_clients / (data.new_clients + data.returning_clients)) * 100}%` }, twStyle("h-full bg-indigo-500")]}
                  />
                </>
              )}
            </View>
            <View style={twStyle("flex-row justify-between mt-2")}>
              <View style={twStyle("flex-row items-center")}>
                <View style={twStyle("h-3 w-3 rounded-full bg-green-500 mr-1")} />
                <Text style={twStyle("text-xs text-gray-500")}>New ({data.new_clients})</Text>
              </View>
              <View style={twStyle("flex-row items-center")}>
                <View style={twStyle("h-3 w-3 rounded-full bg-indigo-500 mr-1")} />
                <Text style={twStyle("text-xs text-gray-500")}>Returning ({data.returning_clients})</Text>
              </View>
            </View>
          </View>

          {data.top_clients.length > 0 && (
            <View>
              <SectionHeader title="Top Clients by Spend" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.top_clients.slice(0, 10).map((c, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-3 border-b border-gray-50")}>
                    <View style={twStyle("flex-row items-center flex-1")}>
                      <View style={twStyle("h-8 w-8 rounded-full bg-pink-100 items-center justify-center mr-3")}>
                        <Text style={twStyle("text-sm font-bold text-pink-600")}>{i + 1}</Text>
                      </View>
                      <View style={twStyle("flex-1")}>
                        <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>{c.name}</Text>
                        <Text style={twStyle("text-xs text-gray-400")}>{c.visits} visits</Text>
                      </View>
                    </View>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(c.spend)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.growth.length > 0 && (
            <View>
              <SectionHeader title="Client Growth" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <View style={[twStyle("flex-row items-end justify-between"), { height: 140 }]}>
                  {data.growth.map((item, i) => {
                    const maxVal = Math.max(...data.growth.map((d) => d.count), 1);
                    const pct = Math.max((item.count / maxVal) * 100, 4);
                    return (
                      <View key={i} style={[twStyle("flex-1 items-center"), { height: "100%", justifyContent: "flex-end" }]}>
                        <Text style={twStyle("mb-1 text-[10px] font-medium text-gray-700")}>{item.count}</Text>
                        <View style={[{ height: `${pct}%`, backgroundColor: "#ec4899", minHeight: 4 }, twStyle("w-full rounded-t-md")]} />
                        <Text style={twStyle("mt-1 text-[10px] text-gray-400")}>{item.month.slice(-3)}</Text>
                      </View>
                    );
                  })}
                </View>
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

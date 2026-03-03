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

type DateRange = "today" | "week" | "month" | "last_month" | "3months";

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "3 Months", value: "3months" },
];

interface ServicesData {
  most_popular: { service: string; bookings: number }[];
  revenue_by_service: { service: string; revenue: number }[];
  avg_duration: { service: string; minutes: number }[];
  total_service_revenue?: number;
  avg_service_price?: number;
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

export default function ServicesReport() {
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const { from, to } = getDateParams(dateRange);
  const { data, loading } = useApi<ServicesData>(
    `/api/provider/reports/services?from=${from}&to=${to}`
  );

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Sales by Service Report (${from} to ${to})`,
      data.total_service_revenue != null ? `Total Service Revenue: ${formatCurrency(data.total_service_revenue)}` : "",
      "",
      "Most Popular (by bookings):",
      ...data.most_popular.map((s, i) => `  ${i + 1}. ${s.service}: ${s.bookings} bookings`),
      "",
      "Revenue by Service:",
      ...data.revenue_by_service.map((s) => `  ${s.service}: ${formatCurrency(s.revenue)}`),
    ].filter(Boolean).join("\n");
    await Share.share({ message: text, title: "Services Report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Sales by Service" showBack subtitle="Popularity, revenue & duration" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 8 }}>
        {DATE_RANGES.map((r) => (
          <TouchableOpacity
            key={r.value}
            className={`rounded-full px-4 py-2 ${dateRange === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDateRange(r.value); }}
          >
            <Text className={`text-sm font-medium ${dateRange === r.value ? "text-white" : "text-gray-600"}`}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && !data && <ActivityIndicator className="my-8" color="#f59e0b" />}
      {!loading && !data && <EmptyState icon="cut-outline" title="No service data" description="Service analytics will appear here" />}

      {data && (
        <View className="gap-4">
          <View className="flex-row gap-3">
            {data.total_service_revenue != null && (
              <View className="flex-1">
                <StatCard title="Service Revenue" value={formatCurrency(data.total_service_revenue)} icon="cash-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
              </View>
            )}
            {data.avg_service_price != null && (
              <View className="flex-1">
                <StatCard title="Avg Price" value={formatCurrency(data.avg_service_price)} icon="pricetag-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
              </View>
            )}
          </View>

          {data.most_popular.length > 0 && (
            <View>
              <SectionHeader title="Most Popular Services" />
              <View className="rounded-2xl border border-gray-100 bg-white p-4">
                <View className="flex-row items-end justify-between gap-1" style={{ height: 160 }}>
                  {data.most_popular.slice(0, 8).map((item, i) => {
                    const maxVal = Math.max(...data.most_popular.map((d) => d.bookings), 1);
                    const pct = Math.max((item.bookings / maxVal) * 100, 4);
                    return (
                      <View key={i} className="flex-1 items-center" style={{ height: "100%", justifyContent: "flex-end" }}>
                        <Text className="mb-1 text-[10px] font-medium text-gray-700">{item.bookings}</Text>
                        <View style={{ height: `${pct}%`, backgroundColor: "#f59e0b", minHeight: 4 }} className="w-full rounded-t-md" />
                        <Text className="mt-1 text-[8px] text-gray-400" numberOfLines={2} style={{ textAlign: "center" }}>
                          {item.service.slice(0, 10)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {data.revenue_by_service.length > 0 && (
            <View>
              <SectionHeader title="Revenue by Service" />
              <View className="rounded-2xl border border-gray-100 bg-white px-4 py-2">
                {data.revenue_by_service.map((s, i) => {
                  const maxVal = data.revenue_by_service[0]?.revenue || 1;
                  const pct = maxVal > 0 ? (s.revenue / maxVal) * 100 : 0;
                  return (
                    <View key={i} className="py-2 border-b border-gray-50">
                      <View className="flex-row justify-between mb-1">
                        <Text className="text-sm text-gray-600" numberOfLines={1}>{s.service}</Text>
                        <Text className="text-sm font-semibold text-gray-900">{formatCurrency(s.revenue)}</Text>
                      </View>
                      <View className="h-2 rounded-full bg-gray-100">
                        <View style={{ width: `${Math.max(pct, 1)}%` }} className="h-full rounded-full bg-amber-500" />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {data.avg_duration.length > 0 && (
            <View>
              <SectionHeader title="Average Duration" />
              <View className="rounded-2xl border border-gray-100 bg-white px-4 py-1">
                {data.avg_duration.map((s, i) => (
                  <View key={i} className="flex-row items-center justify-between py-2.5 border-b border-gray-50">
                    <Text className="text-sm text-gray-600">{s.service}</Text>
                    <View className="flex-row items-center">
                      <Ionicons name="time-outline" size={14} color="#9ca3af" />
                      <Text className="ml-1 text-sm font-semibold text-gray-900">{s.minutes} min</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity className="rounded-xl bg-gray-100 py-3 px-4 flex-row items-center justify-center" onPress={handleExport}>
            <Ionicons name="share-outline" size={18} color="#374151" />
            <Text className="ml-2 text-sm font-medium text-gray-700">Export Report</Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="h-8" />
    </ScreenContainer>
  );
}

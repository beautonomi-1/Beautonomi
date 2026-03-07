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
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatPercentage } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type DateRange = "today" | "week" | "month" | "last_month" | "3months";

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "3 Months", value: "3months" },
];

interface BookingsData {
  total_bookings: number;
  by_status: { status: string; count: number }[];
  by_day_of_week: { day: string; count: number }[];
  completion_rate: number;
  cancellation_count?: number;
  no_show_count?: number;
  avg_per_day?: number;
  cancellation_reasons?: { reason: string; count: number }[];
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

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#22c55e",
  completed: "#3b82f6",
  cancelled: "#ef4444",
  no_show: "#f59e0b",
  pending: "#9ca3af",
};

export default function BookingsReport() {
  const { selectedLocationId } = useProvider();
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const { from, to } = getDateParams(dateRange);
  const bookingsReportUrl = `/api/provider/reports/bookings?from=${from}&to=${to}${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data, loading } = useApi<BookingsData>(bookingsReportUrl);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Booking Report (${from} to ${to})`,
      `Total Bookings: ${data.total_bookings}`,
      `Completion Rate: ${formatPercentage(data.completion_rate)}`,
      data.cancellation_count != null ? `Cancellations: ${data.cancellation_count}` : "",
      data.no_show_count != null ? `No Shows: ${data.no_show_count}` : "",
      "",
      "By Status:",
      ...data.by_status.map((s) => `  ${s.status}: ${s.count}`),
    ].filter(Boolean).join("\n");
    await Share.share({ message: text, title: "Booking Report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Bookings" showBack subtitle="Booking analytics & trends" />

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

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#3b82f6" />}
      {!loading && !data && <EmptyState icon="calendar-outline" title="No bookings data" description="Booking analytics will appear here" />}

      {data && (
        <View>
          <View style={twStyle("flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <StatCard title="Total Bookings" value={String(data.total_bookings)} icon="calendar-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
            </View>
            <View style={twStyle("flex-1")}>
              <StatCard title="Completion Rate" value={formatPercentage(data.completion_rate)} icon="checkmark-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
            </View>
          </View>

          <View style={[twStyle("flex-row"), { marginTop: 16 }]}>
            {data.cancellation_count != null && (
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <StatCard title="Cancellations" value={String(data.cancellation_count)} icon="close-circle-outline" iconColor="#ef4444" iconBg="bg-red-50" compact />
              </View>
            )}
            {data.no_show_count != null && (
              <View style={twStyle("flex-1")}>
                <StatCard title="No Shows" value={String(data.no_show_count)} icon="eye-off-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
              </View>
            )}
          </View>

          {data.by_status.length > 0 && (
            <View>
              <SectionHeader title="Status Breakdown" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                {data.by_status.map((s, i) => {
                const total = data.by_status.reduce((sum, st) => sum + st.count, 0);
                const pct = total > 0 ? (s.count / total) * 100 : 0;
                const color = STATUS_COLORS[s.status] || "#9ca3af";
                return (
                  <View key={i} style={i > 0 ? { marginTop: 8 } : undefined}>
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <Text style={twStyle("text-sm text-gray-600 capitalize")}>{s.status.replace(/_/g, " ")}</Text>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{s.count} ({pct.toFixed(0)}%)</Text>
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

          {data.by_day_of_week.length > 0 && (
            <View>
              <SectionHeader title="By Day of Week" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <View style={[twStyle("flex-row items-end justify-between"), { height: 140 }]}>
                  {data.by_day_of_week.map((item, i) => {
                    const maxVal = Math.max(...data.by_day_of_week.map((d) => d.count), 1);
                    const pct = Math.max((item.count / maxVal) * 100, 4);
                    return (
                      <View key={i} style={[twStyle("flex-1 items-center"), { height: "100%", justifyContent: "flex-end", marginRight: i < data.by_day_of_week.length - 1 ? 4 : 0 }]}>
                        <Text style={twStyle("mb-1 text-[10px] font-medium text-gray-700")}>{item.count}</Text>
                        <View style={[{ height: `${pct}%`, backgroundColor: "#3b82f6", minHeight: 4 }, twStyle("w-full rounded-t-md")]} />
                        <Text style={twStyle("mt-1 text-[10px] text-gray-400")}>{item.day.slice(0, 3)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {data.cancellation_reasons && data.cancellation_reasons.length > 0 && (
            <View>
              <SectionHeader title="Cancellation Reasons" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
                {data.cancellation_reasons.map((r, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-2.5 border-b border-gray-50")}>
                    <Text style={twStyle("text-sm text-gray-600")}>{r.reason}</Text>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>{r.count}</Text>
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

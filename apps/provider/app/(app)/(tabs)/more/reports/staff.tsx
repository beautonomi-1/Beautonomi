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

interface StaffMember {
  name: string;
  bookings: number;
  revenue: number;
  rating: number;
  hours_worked?: number;
  commission?: number;
  completion_rate?: number;
}

interface StaffData {
  staff: StaffMember[];
  total_hours?: number;
  total_commission?: number;
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

export default function StaffReport() {
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const { from, to } = getDateParams(dateRange);
  const { data, loading } = useApi<StaffData>(
    `/api/provider/reports/staff?from=${from}&to=${to}`
  );

  const selected = data?.staff.find((s) => s.name === selectedStaff) || null;

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Staff Performance Report (${from} to ${to})`,
      "",
      ...data.staff.map((s) => [
        `${s.name}:`,
        `  Bookings: ${s.bookings}`,
        `  Revenue: ${formatCurrency(s.revenue)}`,
        `  Rating: ${s.rating.toFixed(1)}`,
        s.hours_worked != null ? `  Hours: ${s.hours_worked}h` : "",
        s.commission != null ? `  Commission: ${formatCurrency(s.commission)}` : "",
      ].filter(Boolean).join("\n")),
    ].join("\n");
    await Share.share({ message: text, title: "Staff Report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Staff" showBack subtitle="Performance, hours & commissions" />

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

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#6366f1" />}
      {!loading && (!data || data.staff.length === 0) && (
        <EmptyState icon="people-outline" title="No staff data" description="Staff performance data will appear here" />
      )}

      {data && data.staff.length > 0 && (
        <View>
          {/* Staff selector chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row" }}>
            <TouchableOpacity
              style={[twStyle(`rounded-full px-4 py-2 ${!selectedStaff ? "bg-indigo-600" : "border border-gray-200 bg-white"}`), { marginRight: 8 }]}
              onPress={() => setSelectedStaff(null)}
            >
              <Text style={twStyle(`text-sm font-medium ${!selectedStaff ? "text-white" : "text-gray-600"}`)}>All Staff</Text>
            </TouchableOpacity>
            {data.staff.map((s) => (
              <TouchableOpacity
                key={s.name}
                style={[twStyle(`rounded-full px-4 py-2 ${selectedStaff === s.name ? "bg-indigo-600" : "border border-gray-200 bg-white"}`), { marginRight: 8 }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedStaff(s.name); }}
              >
                <Text style={twStyle(`text-sm font-medium ${selectedStaff === s.name ? "text-white" : "text-gray-600"}`)}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Individual staff detail */}
          {selected && (
            <View style={[twStyle("rounded-2xl border border-indigo-100 bg-indigo-50 p-4"), { marginTop: 16 }]}>
              <Text style={twStyle("text-lg font-bold text-indigo-900 mb-3")}>{selected.name}</Text>
              <View style={twStyle("flex-row flex-wrap")}>
                <View style={[twStyle("flex-1 min-w-[45%] bg-white rounded-xl p-3"), { marginRight: 12, marginBottom: 12 }]}>
                  <Text style={twStyle("text-xs text-gray-500")}>Bookings</Text>
                  <Text style={twStyle("text-xl font-bold text-gray-900")}>{selected.bookings}</Text>
                </View>
                <View style={[twStyle("flex-1 min-w-[45%] bg-white rounded-xl p-3"), { marginRight: 12, marginBottom: 12 }]}>
                  <Text style={twStyle("text-xs text-gray-500")}>Revenue</Text>
                  <Text style={twStyle("text-xl font-bold text-gray-900")}>{formatCurrency(selected.revenue)}</Text>
                </View>
                <View style={[twStyle("flex-1 min-w-[45%] bg-white rounded-xl p-3"), { marginRight: 12, marginBottom: 12 }]}>
                  <Text style={twStyle("text-xs text-gray-500")}>Rating</Text>
                  <View style={twStyle("flex-row items-center")}>
                    <Ionicons name="star" size={16} color="#f59e0b" />
                    <Text style={twStyle("text-xl font-bold text-gray-900 ml-1")}>{selected.rating.toFixed(1)}</Text>
                  </View>
                </View>
                {selected.hours_worked != null && (
                  <View style={[twStyle("flex-1 min-w-[45%] bg-white rounded-xl p-3"), { marginRight: 12, marginBottom: 12 }]}>
                    <Text style={twStyle("text-xs text-gray-500")}>Hours Worked</Text>
                    <Text style={twStyle("text-xl font-bold text-gray-900")}>{selected.hours_worked}h</Text>
                  </View>
                )}
                {selected.commission != null && (
                  <View style={[twStyle("flex-1 min-w-[45%] bg-white rounded-xl p-3"), { marginRight: 12, marginBottom: 12 }]}>
                    <Text style={twStyle("text-xs text-gray-500")}>Commission</Text>
                    <Text style={twStyle("text-xl font-bold text-gray-900")}>{formatCurrency(selected.commission)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* All staff comparison */}
          {!selected && (
            <>
              <SectionHeader title="Bookings per Staff" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <View style={[twStyle("flex-row items-end justify-between"), { height: 140 }]}>
                  {data.staff.map((s, i) => {
                    const maxVal = Math.max(...data.staff.map((d) => d.bookings), 1);
                    const pct = Math.max((s.bookings / maxVal) * 100, 4);
                    return (
                      <View key={i} style={[twStyle("flex-1 items-center"), { height: "100%", justifyContent: "flex-end", marginRight: i < data.staff.length - 1 ? 4 : 0 }]}>
                        <Text style={twStyle("mb-1 text-[10px] font-medium text-gray-700")}>{s.bookings}</Text>
                        <View style={[{ height: `${pct}%`, backgroundColor: "#6366f1", minHeight: 4 }, twStyle("w-full rounded-t-md")]} />
                        <Text style={twStyle("mt-1 text-[9px] text-gray-400")} numberOfLines={1}>{s.name.split(' ')[0]}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <SectionHeader title="Revenue per Staff" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.staff.map((s, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-2.5 border-b border-gray-50")}>
                    <Text style={twStyle("text-sm text-gray-600")}>{s.name}</Text>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(s.revenue)}</Text>
                  </View>
                ))}
              </View>

              <SectionHeader title="Ratings" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.staff.map((s, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-2.5 border-b border-gray-50")}>
                    <Text style={twStyle("text-sm text-gray-600")}>{s.name}</Text>
                    <View style={twStyle("flex-row items-center")}>
                      <Ionicons name="star" size={14} color="#f59e0b" />
                      <Text style={twStyle("ml-1 text-sm font-semibold text-gray-900")}>{s.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
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

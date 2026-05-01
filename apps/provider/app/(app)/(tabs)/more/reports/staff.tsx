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
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import {
  getReportDateRange,
  formatReportRangeCaption,
  type ReportDateRangeKey,
} from "@/lib/reportDateRanges";
import { appendReportLocation } from "@/lib/reportLocationQuery";

const DATE_RANGES: { label: string; value: ReportDateRangeKey }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "3 Months", value: "3months" },
];

interface StaffMember {
  id?: string;
  name: string;
  bookings: number;
  revenue: number;
  rating: number;
  review_count?: number;
  hours_worked?: number;
  commission?: number;
  completion_rate?: number;
}

interface StaffData {
  staff: StaffMember[];
  total_hours?: number;
  total_commission?: number;
}

export default function StaffReport() {
  const { selectedLocationId, provider } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const { from, to } = getReportDateRange(dateRange, { timezone: provider?.timezone });
  const rangeCaption = formatReportRangeCaption(from, to);
  const staffReportUrl = appendReportLocation(`/api/provider/reports/staff?from=${from}&to=${to}`, selectedLocationId);
  const { data, loading, error: dataError, refresh } = useApi<StaffData>(staffReportUrl);

  // §Provider-audit 2026-04 (round 8): key selected staff by id when the
  // server provides one; fall back to name for compatibility with older
  // payloads. Previously keying by name caused the wrong row to be
  // selected (and the wrong one to highlight in the chip strip) whenever
  // two staff members shared a first name or full name.
  const selected =
    data?.staff.find((s) => (s.id ?? s.name) === selectedStaff) || null;

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Staff Performance Report (${from} to ${to})`,
      "",
      ...data.staff.map((s) => [
        `${s.name}:`,
        `  Bookings: ${s.bookings}`,
        `  Revenue: ${formatCurrency(s.revenue)}`,
        (s.review_count ?? 0) > 0
          ? `  Rating: ${s.rating.toFixed(1)} (${s.review_count ?? 0} reviews)`
          : "",
        s.hours_worked != null ? `  Hours: ${s.hours_worked}h` : "",
        s.commission != null ? `  Commission: ${formatCurrency(s.commission)}` : "",
      ].filter(Boolean).join("\n")),
    ].join("\n");
    await Share.share({ message: text, title: "Staff Report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Staff" showBack subtitle="Performance, hours & commissions" />

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

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#6366f1" />}
      {!loading && dataError && !data && <ErrorState message={dataError} onRetry={refresh} />}
      {!loading && !dataError && (!data || data.staff.length === 0) && (
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
            {data.staff.map((s) => {
              const key = s.id ?? s.name;
              const isSelected = selectedStaff === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[twStyle(`rounded-full px-4 py-2 ${isSelected ? "bg-indigo-600" : "border border-gray-200 bg-white"}`), { marginRight: 8 }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedStaff(key); }}
                >
                  <Text style={twStyle(`text-sm font-medium ${isSelected ? "text-white" : "text-gray-600"}`)}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
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
                    {(selected.review_count ?? 0) > 0 ? (
                      <>
                        <Ionicons name="star" size={16} color="#f59e0b" />
                        <Text style={twStyle("text-xl font-bold text-gray-900 ml-1")}>{selected.rating.toFixed(1)}</Text>
                        <Text style={twStyle("ml-1 text-xs text-gray-400")}>
                          ({selected.review_count})
                        </Text>
                      </>
                    ) : (
                      <Text style={twStyle("text-sm text-gray-400")}>No reviews yet</Text>
                    )}
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
                <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled">
                  <View style={{ flexDirection: "row", alignItems: "flex-end", height: 148, minWidth: Math.max(data.staff.length * 52, 280) }}>
                    {(() => {
                      const maxVal = Math.max(...data.staff.map((d) => d.bookings), 1);
                      return data.staff.map((s, i) => {
                      const pct = Math.max((s.bookings / maxVal) * 100, 4);
                      return (
                        <View
                          key={i}
                          style={{
                            width: 44,
                            marginRight: i < data.staff.length - 1 ? 8 : 0,
                            height: "100%",
                            justifyContent: "flex-end",
                            alignItems: "center",
                          }}
                        >
                          <Text style={twStyle("mb-1 text-[10px] font-medium text-gray-700")}>{s.bookings}</Text>
                          <View style={[{ height: `${pct}%`, backgroundColor: "#6366f1", minHeight: 4, width: "100%" }, twStyle("rounded-t-md")]} />
                          <Text style={twStyle("mt-1 max-w-[44px] text-center text-[9px] text-gray-400")} numberOfLines={2}>
                            {s.name.split(" ")[0]}
                          </Text>
                        </View>
                      );
                    });
                    })()}
                  </View>
                </ScrollView>
              </View>

              <SectionHeader title="Revenue per Staff" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.staff.map((s, i) => (
                  <View key={s.id ?? i} style={twStyle("flex-row items-center justify-between py-2.5 border-b border-gray-50")}>
                    <Text style={twStyle("text-sm text-gray-600")}>{s.name}</Text>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(s.revenue)}</Text>
                  </View>
                ))}
              </View>

              {/*
                §Provider-audit 2026-04 (round 8): only render the ratings
                section when at least one staff member has reviews in the
                selected range. Previously every staff row rendered as
                "★ 0.0" when no reviews existed (and before the simple
                report API was fixed, always), which looked like every
                team member had a one-star-rating emergency.
              */}
              {data.staff.some((s) => (s.review_count ?? 0) > 0) && (
                <>
                  <SectionHeader title="Ratings" />
                  <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                    {data.staff.map((s, i) => (
                      <View key={s.id ?? i} style={twStyle("flex-row items-center justify-between py-2.5 border-b border-gray-50")}>
                        <Text style={twStyle("text-sm text-gray-600")}>{s.name}</Text>
                        <View style={twStyle("flex-row items-center")}>
                          {(s.review_count ?? 0) > 0 ? (
                            <>
                              <Ionicons name="star" size={14} color="#f59e0b" />
                              <Text style={twStyle("ml-1 text-sm font-semibold text-gray-900")}>{s.rating.toFixed(1)}</Text>
                              <Text style={twStyle("ml-1 text-xs text-gray-400")}>
                                ({s.review_count})
                              </Text>
                            </>
                          ) : (
                            <Text style={twStyle("text-xs text-gray-400")}>—</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}
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

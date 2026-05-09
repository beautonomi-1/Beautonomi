import { useState, useCallback, useMemo } from "react";
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
import { StatCard } from "@/components/ui/StatCard";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";
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

interface StaffReportSummary {
  uniqueBookings: number;
  totalLedgerNet: number;
  staffWithActivity: number;
}

interface StaffData {
  staff: StaffMember[];
  summary?: StaffReportSummary;
  basisNote?: string;
}

export default function StaffReport() {
  const { selectedLocationId, provider } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const { from, to } = getReportDateRange(dateRange, { timezone: provider?.timezone });
  const rangeCaption = formatReportRangeCaption(from, to);
  const staffReportUrl = appendReportLocation(`/api/provider/reports/staff?from=${from}&to=${to}`, selectedLocationId);
  const { data, loading, error: dataError, refresh } = useApi<StaffData>(staffReportUrl);

  const selected = data?.staff.find((s) => (s.id ?? s.name) === selectedStaff) || null;

  const maxRevenue = useMemo(() => Math.max(...(data?.staff.map((s) => s.revenue) ?? [0]), 1), [data?.staff]);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Staff report (${from} to ${to})`,
      data.summary
        ? `Unique appointments: ${data.summary.uniqueBookings} · Ledger net: ${formatCurrency(data.summary.totalLedgerNet)}`
        : "",
      data.basisNote ? `\n${data.basisNote}\n` : "",
      "",
      ...data.staff.map((s) =>
        [
          `${s.name}:`,
          `  Appointments: ${s.bookings}`,
          `  Ledger net: ${formatCurrency(s.revenue)}`,
          (s.review_count ?? 0) > 0
            ? `  Rating: ${s.rating.toFixed(1)} (${s.review_count} reviews)`
            : "",
          s.completion_rate != null ? `  Completion: ${s.completion_rate.toFixed(0)}%` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ]
      .filter(Boolean)
      .join("\n");
    await Share.share({ message: text, title: "Staff report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Staff" showBack subtitle="Ledger net & visits by team member" />

      <View style={twStyle("mb-3")}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", paddingBottom: 4 }}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[twStyle(`rounded-full px-4 py-2 ${dateRange === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`), { marginRight: 8 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDateRange(r.value);
              }}
            >
              <Text style={twStyle(`text-sm font-medium ${dateRange === r.value ? "text-white" : "text-gray-600"}`)}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={twStyle("text-xs text-gray-500")}>{rangeCaption}</Text>
      </View>

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#7c3aed" />}
      {!loading && dataError && !data && <ErrorState message={dataError} onRetry={refresh} />}
      {!loading && !dataError && (!data || data.staff.length === 0) && (
        <EmptyState icon="people-outline" title="No staff data" description="Add team members or widen the date range" />
      )}

      {data && data.staff.length > 0 && (
        <View>
          <View style={twStyle("mb-4 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5")}>
            <Text style={twStyle("text-xs leading-5 text-violet-950")}>
              Revenue is ledger net (earnings, travel, tips) split by service line — not catalogue list price. Matches web Sales
              Summary.
            </Text>
          </View>

          {data.basisNote ? (
            <Text style={twStyle("mb-3 text-xs leading-5 text-gray-600")}>{data.basisNote}</Text>
          ) : null}

          {data.summary ? (
            <View style={twStyle("mb-4")}>
              <ReportResponsiveStatRow>
                <StatCard
                  title="Unique visits"
                  value={String(data.summary.uniqueBookings)}
                  icon="calendar-outline"
                  iconColor="#0d9488"
                  iconBg="bg-teal-50"
                  compact
                />
                <StatCard
                  title="Ledger net"
                  value={formatCurrency(data.summary.totalLedgerNet)}
                  icon="wallet-outline"
                  iconColor="#7c3aed"
                  iconBg="bg-violet-50"
                  compact
                />
                <StatCard
                  title="Active staff"
                  value={String(data.summary.staffWithActivity)}
                  icon="people-outline"
                  iconColor="#2563eb"
                  iconBg="bg-sky-50"
                  compact
                />
              </ReportResponsiveStatRow>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row" }}>
            <TouchableOpacity
              style={[twStyle(`rounded-full px-4 py-2 ${!selectedStaff ? "bg-violet-700" : "border border-gray-200 bg-white"}`), { marginRight: 8 }]}
              onPress={() => setSelectedStaff(null)}
            >
              <Text style={twStyle(`text-sm font-medium ${!selectedStaff ? "text-white" : "text-gray-600"}`)}>All staff</Text>
            </TouchableOpacity>
            {data.staff.map((s) => {
              const key = s.id ?? s.name;
              const isSelected = selectedStaff === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[twStyle(`rounded-full px-4 py-2 ${isSelected ? "bg-violet-700" : "border border-gray-200 bg-white"}`), { marginRight: 8 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedStaff(key);
                  }}
                >
                  <Text style={twStyle(`text-sm font-medium ${isSelected ? "text-white" : "text-gray-600"}`)}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selected && (
            <View style={[twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 p-4"), { marginTop: 16 }]}>
              <Text style={twStyle("mb-3 text-lg font-bold text-violet-950")}>{selected.name}</Text>
              <View style={twStyle("flex-row flex-wrap")}>
                <View style={[twStyle("mb-3 min-w-[45%] flex-1 rounded-xl bg-white p-3"), { marginRight: 12 }]}>
                  <Text style={twStyle("text-xs text-gray-500")}>Appointments</Text>
                  <Text style={twStyle("text-xl font-bold tabular-nums text-gray-900")}>{selected.bookings}</Text>
                </View>
                <View style={[twStyle("mb-3 min-w-[45%] flex-1 rounded-xl bg-white p-3")]}>
                  <Text style={twStyle("text-xs text-gray-500")}>Ledger net</Text>
                  <Text style={twStyle("text-xl font-bold tabular-nums text-gray-900")}>{formatCurrency(selected.revenue)}</Text>
                </View>
                <View style={[twStyle("mb-3 min-w-[45%] flex-1 rounded-xl bg-white p-3"), { marginRight: 12 }]}>
                  <Text style={twStyle("text-xs text-gray-500")}>Rating</Text>
                  <View style={twStyle("flex-row items-center")}>
                    {(selected.review_count ?? 0) > 0 ? (
                      <>
                        <Ionicons name="star" size={16} color="#f59e0b" />
                        <Text style={twStyle("ml-1 text-xl font-bold text-gray-900")}>{selected.rating.toFixed(1)}</Text>
                        <Text style={twStyle("ml-1 text-xs text-gray-400")}>({selected.review_count})</Text>
                      </>
                    ) : (
                      <Text style={twStyle("text-sm text-gray-400")}>No reviews</Text>
                    )}
                  </View>
                </View>
                {selected.completion_rate != null && (
                  <View style={[twStyle("mb-3 min-w-[45%] flex-1 rounded-xl bg-white p-3")]}>
                    <Text style={twStyle("text-xs text-gray-500")}>Completion</Text>
                    <Text style={twStyle("text-xl font-bold tabular-nums text-gray-900")}>{selected.completion_rate.toFixed(0)}%</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {!selected && (
            <>
              <SectionHeader title="Visits per staff" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled">
                  <View style={{ flexDirection: "row", alignItems: "flex-end", height: 160, minWidth: Math.max(data.staff.length * 52, 280) }}>
                    {(() => {
                      const maxVal = Math.max(...data.staff.map((d) => d.bookings), 1);
                      return data.staff.map((s, i) => {
                        const pct = Math.max((s.bookings / maxVal) * 100, 4);
                        return (
                          <View
                            key={s.id ?? i}
                            style={{
                              width: 44,
                              marginRight: i < data.staff.length - 1 ? 8 : 0,
                              height: "100%",
                              justifyContent: "flex-end",
                              alignItems: "center",
                            }}
                          >
                            <Text style={twStyle("mb-1 text-[10px] font-medium text-gray-700")}>{s.bookings}</Text>
                            <View style={[{ height: `${pct}%`, backgroundColor: "#0d9488", minHeight: 4, width: "100%" }, twStyle("rounded-t-md")]} />
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

              <SectionHeader title="Ledger net by staff" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
                {data.staff.map((s, i) => {
                  const pct = maxRevenue > 0 ? (s.revenue / maxRevenue) * 100 : 0;
                  return (
                    <View key={s.id ?? i} style={twStyle("border-b border-gray-50 py-3")}>
                      <View style={twStyle("mb-2 flex-row items-center justify-between gap-2")}>
                        <Text style={twStyle("min-w-0 flex-1 text-sm font-medium text-gray-800")} numberOfLines={2}>
                          {s.name}
                        </Text>
                        <Text style={twStyle("text-sm font-semibold tabular-nums text-violet-900")}>{formatCurrency(s.revenue)}</Text>
                      </View>
                      <View style={twStyle("h-2 overflow-hidden rounded-full bg-gray-100")}>
                        <View style={[{ width: `${Math.max(pct, 2)}%` }, twStyle("h-full rounded-full bg-violet-500")]} />
                      </View>
                    </View>
                  );
                })}
              </View>

              {data.staff.some((s) => (s.review_count ?? 0) > 0) && (
                <>
                  <SectionHeader title="Ratings" />
                  <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                    {data.staff.map((s, i) => (
                      <View key={s.id ?? i} style={twStyle("flex-row items-center justify-between border-b border-gray-50 py-2.5")}>
                        <Text style={twStyle("text-sm text-gray-600")}>{s.name}</Text>
                        <View style={twStyle("flex-row items-center")}>
                          {(s.review_count ?? 0) > 0 ? (
                            <>
                              <Ionicons name="star" size={14} color="#f59e0b" />
                              <Text style={twStyle("ml-1 text-sm font-semibold text-gray-900")}>{s.rating.toFixed(1)}</Text>
                              <Text style={twStyle("ml-1 text-xs text-gray-400")}>({s.review_count})</Text>
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

          <TouchableOpacity style={twStyle("mt-6 flex-row items-center justify-center rounded-xl bg-gray-100 py-3 px-4")} onPress={handleExport}>
            <Ionicons name="share-outline" size={18} color="#374151" />
            <Text style={twStyle("ml-2 text-sm font-medium text-gray-700")}>Export summary</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}

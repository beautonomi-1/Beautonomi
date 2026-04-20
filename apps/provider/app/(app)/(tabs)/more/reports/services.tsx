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
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";

const DATE_RANGES: { label: string; value: ReportDateRangeKey }[] = [
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

export default function ServicesReport() {
  const { selectedLocationId } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const { from, to } = getReportDateRange(dateRange);
  const rangeCaption = formatReportRangeCaption(from, to);
  const servicesReportUrl = `/api/provider/reports/services?from=${from}&to=${to}${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data, loading, error: dataError, refresh } = useApi<ServicesData>(servicesReportUrl);

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

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#f59e0b" />}
      {!loading && dataError && !data && <ErrorState message={dataError} onRetry={refresh} />}
      {!loading && !data && !dataError && <EmptyState icon="cut-outline" title="No service data" description="Service analytics will appear here" />}

      {data && (
        <View>
          {(data.total_service_revenue != null || data.avg_service_price != null) && (
            <View style={twStyle("mb-4")}>
              <ReportResponsiveStatRow>
                {data.total_service_revenue != null ? (
                  <StatCard title="Service Revenue" value={formatCurrency(data.total_service_revenue)} icon="cash-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
                ) : null}
                {data.avg_service_price != null ? (
                  <StatCard title="Avg Price" value={formatCurrency(data.avg_service_price)} icon="pricetag-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
                ) : null}
              </ReportResponsiveStatRow>
            </View>
          )}

          {data.most_popular.length > 0 && (
            <View>
              <SectionHeader title="Most Popular Services" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled">
                  <View style={{ flexDirection: "row", alignItems: "flex-end", height: 168, minWidth: Math.max(data.most_popular.length * 48, 280) }}>
                    {(() => {
                      const slice = data.most_popular.slice(0, 24);
                      const maxVal = Math.max(...slice.map((d) => d.bookings), 1);
                      return slice.map((item, i) => {
                        const pct = Math.max((item.bookings / maxVal) * 100, 4);
                        return (
                          <View
                            key={i}
                            style={{
                              width: 40,
                              marginRight: i < slice.length - 1 ? 8 : 0,
                              height: "100%",
                              justifyContent: "flex-end",
                              alignItems: "center",
                            }}
                          >
                            <Text style={twStyle("mb-1 text-[10px] font-medium text-gray-700")}>{item.bookings}</Text>
                            <View style={[{ height: `${pct}%`, backgroundColor: "#f59e0b", minHeight: 4, width: "100%" }, twStyle("rounded-t-md")]} />
                            <Text style={[twStyle("mt-1 text-[8px] text-gray-400"), { textAlign: "center", maxWidth: 40 }]} numberOfLines={3}>
                              {item.service}
                            </Text>
                          </View>
                        );
                      });
                    })()}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}

          {data.revenue_by_service.length > 0 && (
            <View>
              <SectionHeader title="Revenue by Service" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
                {data.revenue_by_service.map((s, i) => {
                  const maxVal = Math.max(...data.revenue_by_service.map((x) => x.revenue), 1);
                  const pct = maxVal > 0 ? (s.revenue / maxVal) * 100 : 0;
                  return (
                    <View key={i} style={twStyle("py-2 border-b border-gray-50")}>
                      <View style={twStyle("mb-1 flex-row justify-between")}>
                        <Text style={twStyle("min-w-0 flex-1 text-sm text-gray-600")} numberOfLines={2}>
                          {s.service}
                        </Text>
                        <Text style={twStyle("shrink-0 text-sm font-semibold text-gray-900")}>{formatCurrency(s.revenue)}</Text>
                      </View>
                      <View style={twStyle("h-2 rounded-full bg-gray-100")}>
                        <View style={[{ width: `${Math.max(pct, 1)}%` }, twStyle("h-full rounded-full bg-amber-500")]} />
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
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.avg_duration.map((s, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-2.5 border-b border-gray-50")}>
                    <Text style={twStyle("text-sm text-gray-600")}>{s.service}</Text>
                    <View style={twStyle("flex-row items-center")}>
                      <Ionicons name="time-outline" size={14} color="#9ca3af" />
                      <Text style={twStyle("ml-1 text-sm font-semibold text-gray-900")}>{s.minutes} min</Text>
                    </View>
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

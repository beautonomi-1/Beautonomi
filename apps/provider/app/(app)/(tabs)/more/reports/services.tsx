import { useMemo, useState, useCallback } from "react";
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

/** Matches GET /api/provider/reports/sales/services (same ledger allocation as web Sales by service). */
interface SalesByServicePayload {
  totalServices: number;
  totalBookings: number;
  totalRevenue: number;
  averageServiceRevenue: number;
  allServices: {
    serviceId: string;
    serviceName: string;
    category: string;
    duration: number;
    bookings: number;
    revenue: number;
    averageRevenuePerBooking?: number;
    averagePrice?: number;
  }[];
  basisNote?: string;
}

export default function ServicesReport() {
  const { selectedLocationId, provider } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const { from, to } = getReportDateRange(dateRange, { timezone: provider?.timezone });
  const rangeCaption = formatReportRangeCaption(from, to);
  const url = appendReportLocation(`/api/provider/reports/sales/services?from=${from}&to=${to}`, selectedLocationId);
  const { data: raw, loading, error: dataError, refresh } = useApi<SalesByServicePayload>(url);

  const charts = useMemo(() => {
    if (!raw?.allServices?.length) {
      return {
        most_popular: [] as { service: string; bookings: number }[],
        revenue_by_service: [] as { service: string; revenue: number }[],
        avg_duration: [] as { service: string; minutes: number }[],
        maxRev: 1,
      };
    }
    const list = raw.allServices;
    const most_popular = [...list]
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 24)
      .map((s) => ({ service: s.serviceName, bookings: s.bookings }));
    const revenue_by_service = [...list].sort((a, b) => b.revenue - a.revenue).map((s) => ({
      service: s.serviceName,
      revenue: s.revenue,
    }));
    const avg_duration = list.map((s) => ({
      service: s.serviceName,
      minutes: s.duration ?? 0,
    }));
    const maxRev = Math.max(...revenue_by_service.map((x) => x.revenue), 1);
    return { most_popular, revenue_by_service, avg_duration, maxRev };
  }, [raw]);

  const handleExport = useCallback(async () => {
    if (!raw) return;
    const text = [
      `Sales by Service (${from} to ${to})`,
      `Ledger net allocated: ${formatCurrency(raw.totalRevenue)}`,
      `Completed appointments: ${raw.totalBookings}`,
      `Distinct offerings: ${raw.totalServices}`,
      raw.basisNote ? `\n${raw.basisNote}\n` : "",
      "Most popular (visits):",
      ...charts.most_popular.map((s, i) => `  ${i + 1}. ${s.service}: ${s.bookings} visits`),
      "",
      "Revenue by service (ledger):",
      ...charts.revenue_by_service.map((s) => `  ${s.service}: ${formatCurrency(s.revenue)}`),
    ]
      .filter(Boolean)
      .join("\n");
    await Share.share({ message: text, title: "Sales by Service" });
  }, [raw, from, to, charts]);

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Sales by Service"
        showBack
        subtitle="Ledger net per offering — completed visits"
      />

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

      {loading && !raw && <ActivityIndicator style={twStyle("my-8")} color="#7c3aed" />}
      {!loading && dataError && !raw && <ErrorState message={dataError} onRetry={refresh} />}
      {!loading && !raw && !dataError && (
        <EmptyState icon="cut-outline" title="No service data" description="Service analytics will appear here" />
      )}

      {raw && (
        <View>
          <View style={twStyle("mb-4 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5")}>
            <Text style={twStyle("text-xs leading-5 text-violet-950")}>
              Revenue is recognized provider earnings net of refund clawbacks — same basis as Sales Summary — split by service line price share.
            </Text>
          </View>

          <ReportResponsiveStatRow>
            <StatCard title="Ledger allocated" value={formatCurrency(raw.totalRevenue)} icon="wallet-outline" iconColor="#059669" iconBg="bg-emerald-50" compact />
            <StatCard title="Completed visits" value={String(raw.totalBookings)} icon="calendar-outline" iconColor="#7c3aed" iconBg="bg-violet-50" compact />
            <StatCard title="Offerings" value={String(raw.totalServices)} icon="grid-outline" iconColor="#0ea5e9" iconBg="bg-sky-50" compact />
            <StatCard title="Avg / offering" value={formatCurrency(raw.averageServiceRevenue)} icon="pricetag-outline" iconColor="#d97706" iconBg="bg-amber-50" compact />
          </ReportResponsiveStatRow>

          {charts.most_popular.length > 0 && (
            <View style={twStyle("mt-4")}>
              <SectionHeader title="Most booked services" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled">
                  <View style={{ flexDirection: "row", alignItems: "flex-end", height: 168, minWidth: Math.max(charts.most_popular.length * 48, 280) }}>
                    {(() => {
                      const slice = charts.most_popular;
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
                            <View style={[{ height: `${pct}%`, backgroundColor: "#7c3aed", minHeight: 4, width: "100%" }, twStyle("rounded-t-md")]} />
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

          {charts.revenue_by_service.length > 0 && (
            <View style={twStyle("mt-4")}>
              <SectionHeader title="Ledger net by service" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
                {charts.revenue_by_service.map((s, i) => {
                  const pct = charts.maxRev > 0 ? (s.revenue / charts.maxRev) * 100 : 0;
                  return (
                    <View key={i} style={twStyle("border-b border-gray-50 py-2")}>
                      <View style={twStyle("mb-1 flex-row justify-between")}>
                        <Text style={twStyle("min-w-0 flex-1 text-sm text-gray-700")} numberOfLines={2}>
                          {s.service}
                        </Text>
                        <Text style={twStyle("shrink-0 text-sm font-semibold tabular-nums text-gray-900")}>{formatCurrency(s.revenue)}</Text>
                      </View>
                      <View style={twStyle("h-2 rounded-full bg-gray-100")}>
                        <View style={[{ width: `${Math.max(pct, 1)}%` }, twStyle("h-full rounded-full bg-violet-500")]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {charts.avg_duration.some((d) => d.minutes > 0) && (
            <View style={twStyle("mt-4")}>
              <SectionHeader title="Duration (catalog)" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {charts.avg_duration
                  .filter((s) => s.minutes > 0)
                  .map((s, i) => (
                    <View key={i} style={twStyle("flex-row items-center justify-between border-b border-gray-50 py-2.5")}>
                      <Text style={twStyle("flex-1 text-sm text-gray-600")} numberOfLines={2}>
                        {s.service}
                      </Text>
                      <View style={twStyle("flex-row items-center")}>
                        <Ionicons name="time-outline" size={14} color="#9ca3af" />
                        <Text style={twStyle("ml-1 text-sm font-semibold text-gray-900")}>{s.minutes} min</Text>
                      </View>
                    </View>
                  ))}
              </View>
            </View>
          )}

          {raw.basisNote ? (
            <Text style={twStyle("mt-4 text-xs leading-5 text-gray-500")}>{raw.basisNote}</Text>
          ) : null}

          <TouchableOpacity
            style={twStyle("mt-6 flex-row items-center justify-center rounded-xl bg-gray-100 py-3 px-4")}
            onPress={handleExport}
          >
            <Ionicons name="share-outline" size={18} color="#374151" />
            <Text style={twStyle("ml-2 text-sm font-medium text-gray-700")}>Export summary</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}

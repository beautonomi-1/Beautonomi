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
import { useTranslation } from "@beautonomi/i18n";
import { useApi, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FinanceReportError } from "@/components/finance/FinanceReportError";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCurrency, formatPercentage, formatStatusLabel } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import {
  getReportDateRange,
  formatReportRangeCaption,
  type ReportDateRangeKey,
} from "@/lib/reportDateRanges";
import { appendReportLocation } from "@/lib/reportLocationQuery";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";
import { ReportBasisFootnote } from "@/components/reports/ReportBasisFootnote";

const DATE_RANGES: { labelKey: "rangeToday" | "rangeThisWeek" | "rangeThisMonth" | "rangeLastMonth" | "range3Months"; value: ReportDateRangeKey }[] = [
  { labelKey: "rangeToday", value: "today" },
  { labelKey: "rangeThisWeek", value: "week" },
  { labelKey: "rangeThisMonth", value: "month" },
  { labelKey: "rangeLastMonth", value: "last_month" },
  { labelKey: "range3Months", value: "3months" },
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
  channel_breakdown?: {
    channel: string;
    count: number;
    recognized_revenue: number;
    percentage: number;
  }[];
  channelBasisNote?: string;
  basisNote?: string;
  reportBasis?: string;
}

const CHANNEL_KEYS: Record<string, string> = {
  online: "channelOnline",
  walk_in: "channelWalkIn",
  provider: "channelProvider",
  unknown: "channelUnknown",
};

const CHANNEL_COLORS: Record<string, string> = {
  online: "#3b82f6",
  walk_in: "#f59e0b",
  provider: "#8b5cf6",
  unknown: "#9ca3af",
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#22c55e",
  completed: "#3b82f6",
  cancelled: "#ef4444",
  no_show: "#f59e0b",
  pending: "#9ca3af",
};

const DAY_SHORT_KEYS: Record<string, string> = {
  monday: "dayMon",
  tuesday: "dayTue",
  wednesday: "dayWed",
  thursday: "dayThu",
  friday: "dayFri",
  saturday: "daySat",
  sunday: "daySun",
  mon: "dayMon",
  tue: "dayTue",
  wed: "dayWed",
  thu: "dayThu",
  fri: "dayFri",
  sat: "daySat",
  sun: "daySun",
};

export default function BookingsReport() {
  const { t } = useTranslation();
  const br = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.bookingsReport." + key, opts) as string,
    [t],
  );
  const channelLabel = useCallback(
    (channel: string) => (CHANNEL_KEYS[channel] ? br(CHANNEL_KEYS[channel]) : channel),
    [br],
  );
  const dayShort = useCallback(
    (day: string) => {
      const key = DAY_SHORT_KEYS[day.toLowerCase()];
      return key ? br(key) : day.slice(0, 3);
    },
    [br],
  );
  const { selectedLocationId, provider } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const { from, to } = getReportDateRange(dateRange, { timezone: provider?.timezone });
  const rangeCaption = formatReportRangeCaption(from, to);
  const bookingsReportUrl = appendReportLocation(`/api/provider/reports/bookings?from=${from}&to=${to}`, selectedLocationId);
  const { data, loading, error: dataError, errorCode: dataErrorCode, refresh } = useApi<BookingsData>(bookingsReportUrl, {
    timeoutMs: MONEY_SURFACE_TIMEOUT_MS,
  });
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      br("exportHeading", { from, to }),
      br("exportTotal", { count: data.total_bookings }),
      br("exportCompletion", { rate: formatPercentage(data.completion_rate) }),
      data.cancellation_count != null ? br("exportCancellations", { count: data.cancellation_count }) : "",
      data.no_show_count != null ? br("exportNoShows", { count: data.no_show_count }) : "",
      "",
      br("exportByStatus"),
      ...data.by_status.map((s) => `  ${s.status}: ${s.count}`),
      "",
      ...(data.channel_breakdown?.length
        ? [
            br("exportByChannel"),
            ...data.channel_breakdown.map((c) =>
              br("exportChannelLine", {
                channel: channelLabel(c.channel),
                count: c.count,
                amount: formatCurrency(c.recognized_revenue),
              }),
            ),
          ]
        : []),
    ].filter(Boolean).join("\n");
    await Share.share({ message: text, title: br("exportTitle") });
  }, [br, channelLabel, data, from, to]);

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title={br("title")} showBack subtitle={br("subtitle")} />

      <View style={twStyle("mb-3")}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", paddingBottom: 4 }}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[twStyle(`rounded-full px-4 py-2 ${dateRange === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`), { marginEnd: 8 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDateRange(r.value); }}
            >
              <Text style={twStyle(`text-sm font-medium ${dateRange === r.value ? "text-white" : "text-gray-600"}`)}>{br(r.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={twStyle("text-xs text-gray-500")}>{rangeCaption}</Text>
        <ReportBasisFootnote
          basisNote={data?.channelBasisNote ?? data?.basisNote}
          reportBasis={data?.reportBasis}
          compact
        />
      </View>

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#3b82f6" />}
      {!loading && dataError && !data && (
        <FinanceReportError error={dataError} errorCode={dataErrorCode} onRetry={refresh} />
      )}
      {!loading && !data && !dataError && <EmptyState icon="calendar-outline" title={br("emptyTitle")} description={br("emptyDescription")} />}

      {data && (
        <View>
          <ReportResponsiveStatRow>
            <StatCard title={br("totalBookings")} value={String(data.total_bookings)} icon="calendar-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
            <StatCard title={br("completionRate")} value={formatPercentage(data.completion_rate)} icon="checkmark-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
          </ReportResponsiveStatRow>

          {(data.cancellation_count != null || data.no_show_count != null) && (
            <View style={twStyle("mt-3")}>
              <ReportResponsiveStatRow>
                {data.cancellation_count != null ? (
                  <StatCard title={br("cancellations")} value={String(data.cancellation_count)} icon="close-circle-outline" iconColor="#ef4444" iconBg="bg-red-50" compact />
                ) : null}
                {data.no_show_count != null ? (
                  <StatCard title={br("noShows")} value={String(data.no_show_count)} icon="eye-off-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
                ) : null}
              </ReportResponsiveStatRow>
            </View>
          )}

          {data.by_status.length > 0 && (
            <View>
              <SectionHeader title={br("statusBreakdown")} />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                {data.by_status.map((s, i) => {
                const total = data.by_status.reduce((sum, st) => sum + st.count, 0);
                const pct = total > 0 ? (s.count / total) * 100 : 0;
                const color = STATUS_COLORS[s.status] || "#9ca3af";
                return (
                  <View key={i} style={i > 0 ? { marginTop: 8 } : undefined}>
                    <View style={twStyle("flex-row justify-between mb-1")}>
                      <Text style={twStyle("text-sm text-gray-600")}>{formatStatusLabel(s.status)}</Text>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{br("statusCountPct", { count: s.count, pct: pct.toFixed(0) })}</Text>
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

          {data.channel_breakdown && data.channel_breakdown.length > 0 && (
            <View>
              <SectionHeader title={br("byChannel")} />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                {data.channel_breakdown.map((c, i) => {
                  const color = CHANNEL_COLORS[c.channel] || "#9ca3af";
                  return (
                    <View key={c.channel} style={i > 0 ? { marginTop: 10 } : undefined}>
                      <View style={twStyle("flex-row justify-between mb-1")}>
                        <Text style={twStyle("text-sm text-gray-600")}>
                          {channelLabel(c.channel)}
                        </Text>
                        <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                          {br("statusCountPct", { count: c.count, pct: c.percentage.toFixed(0) })}
                        </Text>
                      </View>
                      <Text style={twStyle("text-xs text-gray-500 mb-1")}>
                        {br("recognized", { amount: formatCurrency(c.recognized_revenue) })}
                      </Text>
                      <View style={twStyle("h-2 rounded-full bg-gray-100")}>
                        <View
                          style={[
                            { width: `${Math.max(c.percentage, 1)}%`, backgroundColor: color },
                            twStyle("h-full rounded-full"),
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {data.by_day_of_week.length > 0 && (
            <View>
              <SectionHeader title={br("byDayOfWeek")} />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
                <View style={[twStyle("flex-row items-end justify-between"), { height: 140 }]}>
                  {data.by_day_of_week.map((item, i) => {
                    const maxVal = Math.max(...data.by_day_of_week.map((d) => d.count), 1);
                    const pct = Math.max((item.count / maxVal) * 100, 4);
                    return (
                      <View key={i} style={[twStyle("flex-1 items-center"), { height: "100%", justifyContent: "flex-end", marginEnd: i < data.by_day_of_week.length - 1 ? 4 : 0 }]}>
                        <Text style={twStyle("mb-1 text-[10px] font-medium text-gray-700")}>{item.count}</Text>
                        <View style={[{ height: `${pct}%`, backgroundColor: "#3b82f6", minHeight: 4 }, twStyle("w-full rounded-t-md")]} />
                        <Text style={twStyle("mt-1 text-[10px] text-gray-400")}>{dayShort(item.day)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {data.cancellation_reasons && data.cancellation_reasons.length > 0 && (
            <View>
              <SectionHeader title={br("cancellationReasons")} />
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
            <Text style={twStyle("ms-2 text-sm font-medium text-gray-700")}>{br("exportReport")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}

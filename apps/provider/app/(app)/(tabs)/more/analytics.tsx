import { useCallback, useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCurrency } from "@/lib/format";
import { trackScreenView } from "@/lib/analytics";
import { twStyle } from "@/lib/twStyle";

/** Matches GET /api/provider/analytics */
export interface AnalyticsData {
  period?: string;
  timezone?: string;
  windows?: {
    current: { fromYmd: string; toYmd: string };
    previous: { fromYmd: string; toYmd: string };
  };
  basis?: Record<string, string>;
  trends_meta?: { bucket: string; buckets_count: number; description: string };
  revenue: {
    total: number;
    all_time?: number;
    thisMonth: number;
    current_period?: number;
    lastMonth: number;
    previous_period?: number;
    growth: string;
    period?: string;
  };
  earnings_breakdown?: {
    basis?: string;
    all_time?: {
      recognized_revenue_net?: number;
      service_earnings?: number;
      service_earnings_net: number;
      tips_net: number;
      cancellation_fees: number;
      refunds: number;
      platform_fees_retained: number;
    };
    current_period?: {
      start: string;
      end: string;
      period?: string;
      recognized_revenue_net?: number;
      service_earnings?: number;
      service_earnings_net: number;
      tips_net: number;
      cancellation_fees: number;
      refunds: number;
      platform_fees_retained: number;
    };
  };
  expenses?: {
    total: number;
    this_month: number;
    all_time?: number;
    current_period?: number;
    note?: string;
  };
  bookings: { total: number; thisMonth: number; lastMonth: number; upcoming: number; growth: string };
  customers: { total: number; repeat: number; new: number; single_booking?: number };
  services: { name: string; count: number; revenue: number }[];
  trends: { month: string; revenue: number; bookings: number }[];
}

const PERIOD_IDS = ["week", "month", "year"] as const;
const PERIOD_LABEL_KEYS = {
  week: "periodWeek",
  month: "periodMonth",
  year: "periodYear",
} as const;

function periodRevenueKey(period: string): "revenueThisWeek" | "revenueThisYear" | "revenueThisMonth" {
  if (period === "week") return "revenueThisWeek";
  if (period === "year") return "revenueThisYear";
  return "revenueThisMonth";
}

function periodCompareKey(period: string): "vsPreviousWeek" | "vsPreviousYear" | "vsLastMonth" {
  if (period === "week") return "vsPreviousWeek";
  if (period === "year") return "vsPreviousYear";
  return "vsLastMonth";
}

function trendsSectionKey(period: string): "trends12Weeks" | "trends5Years" | "trends12Months" {
  if (period === "week") return "trends12Weeks";
  if (period === "year") return "trends5Years";
  return "trends12Months";
}

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const an = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.analytics.${key}`, opts) as string,
    [t],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"week" | "month" | "year">("month");
  const { screenPadding } = useResponsive();
  const { selectedLocationId } = useProvider();
  const periodOptions = useMemo(
    () => PERIOD_IDS.map((id) => ({ id, label: an(PERIOD_LABEL_KEYS[id]) })),
    [an],
  );

  const analyticsUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("period", period);
    if (selectedLocationId) p.set("location_id", selectedLocationId);
    return `/api/provider/analytics?${p.toString()}`;
  }, [period, selectedLocationId]);

  const { data, loading, error, refresh } = useApi<AnalyticsData>(analyticsUrl, { staleTimeMs: 0 });

  useEffect(() => {
    trackScreenView("provider_analytics");
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={an("title")} showBack />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={an("title")} showBack />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const rev = data?.revenue ?? { total: 0, thisMonth: 0, lastMonth: 0, growth: "0" };
  const book = data?.bookings ?? { total: 0, thisMonth: 0, lastMonth: 0, upcoming: 0, growth: "0" };
  const cust = data?.customers ?? { total: 0, repeat: 0, new: 0, single_booking: 0 };
  const singleBooking = cust.single_booking ?? cust.new;
  const apiPeriod = (data?.period ?? rev.period ?? "month") as string;
  const eb = data?.earnings_breakdown;
  const curEb = eb?.current_period;
  const allEb = eb?.all_time;
  const exp = data?.expenses;
  const services = Array.isArray(data?.services) ? data!.services : [];
  const trends = Array.isArray(data?.trends) ? data!.trends : [];
  const growthNum = parseFloat(rev.growth);
  const hasGrowth = rev.growth !== "0" && rev.growth !== "New" && !Number.isNaN(growthNum);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={an("title")}
        showBack
        subtitle={selectedLocationId ? an("subtitleLocation") : an("subtitleAll")}
      />
      <View style={{ paddingHorizontal: screenPadding, paddingTop: 8, paddingBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 8 }}>
          {periodOptions.map((p) => {
            const active = period === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPeriod(p.id);
                }}
                style={twStyle(
                  `rounded-full px-4 py-2 ${active ? "bg-gray-900" : "border border-gray-200 bg-white"}`,
                )}
                accessibilityLabel={an("periodA11y", { label: p.label })}
                accessibilityState={{ selected: active }}
              >
                <Text style={twStyle(`text-sm font-medium ${active ? "text-white" : "text-gray-600"}`)}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {data?.windows?.current?.fromYmd && data?.windows?.current?.toYmd ? (
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>
            {data.windows.current.fromYmd} → {data.windows.current.toYmd}
            {data.timezone ? ` · ${data.timezone.replace(/_/g, " ")}` : ""}
          </Text>
        ) : null}
      </View>
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4 flex-row flex-wrap")}>
          <View style={[twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginEnd: 12, marginBottom: 12 }]}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-violet-50")}>
                <Ionicons name="trending-up-outline" size={20} color="#8b5cf6" />
              </View>
              <Text style={twStyle("ms-2 text-lg font-bold text-gray-900")}>
                {formatCurrency(rev.current_period ?? rev.thisMonth ?? 0)}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              {an("ledgerNetPeriod", { label: an(periodRevenueKey(apiPeriod)) })}
            </Text>
            {hasGrowth && (
              <Text
                style={twStyle(
                  `mt-0.5 text-xs font-medium ${growthNum >= 0 ? "text-green-600" : "text-red-600"}`,
                )}
              >
                {an("growthVs", {
                  growth: `${growthNum >= 0 ? "+" : ""}${rev.growth}`,
                  compare: an(periodCompareKey(apiPeriod)),
                })}
              </Text>
            )}
            {rev.growth === "New" ? (
              <Text style={twStyle("mt-0.5 text-xs text-emerald-600")}>{an("newPeriodActivity")}</Text>
            ) : null}
          </View>
          <View style={[twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginEnd: 12, marginBottom: 12 }]}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-indigo-50")}>
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
              </View>
              <Text style={twStyle("ms-2 text-lg font-bold text-gray-900")}>
                {book.upcoming ?? 0}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>{an("upcomingScheduled")}</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {an("scheduledInPeriod", { count: book.thisMonth ?? 0 })}
            </Text>
          </View>
          <View style={twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4")}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-teal-50")}>
                <Ionicons name="people-outline" size={20} color="#14b8a6" />
              </View>
              <Text style={twStyle("ms-2 text-lg font-bold text-gray-900")}>
                {cust.total ?? 0}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>{an("distinctCustomers")}</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {an("customersBreakdown", { repeat: cust.repeat ?? 0, single: singleBooking })}
            </Text>
          </View>
        </View>

        {data?.basis && Object.keys(data.basis).length > 0 ? (
          <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
            <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-indigo-900")}>{an("facts")}</Text>
            {Object.entries(data.basis).map(([k, v]) => (
              <Text key={k} style={twStyle("mt-2 text-xs leading-5 text-indigo-950")}>
                <Text style={twStyle("font-semibold capitalize text-indigo-950")}>{k.replace(/_/g, " ")}: </Text>
                {v}
              </Text>
            ))}
          </View>
        ) : null}

        {rev.all_time != null && (
          <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>{an("allTimeLedgerNet")}</Text>
            <Text style={twStyle("mt-1 text-xl font-bold text-gray-900")}>{formatCurrency(rev.all_time)}</Text>
            <Text style={twStyle("mt-1 text-xs text-gray-400")}>
              {an("allTimeLedgerHint")}
            </Text>
          </View>
        )}

        {(curEb || allEb) && (
          <>
            <SectionHeader title={an("earningsAndFees")} />
            {curEb ? (
              <View style={twStyle("mb-3 rounded-2xl border border-gray-100 bg-white p-4")}>
                <Text style={twStyle("text-xs font-semibold text-gray-700")}>{an("thisPeriod")}</Text>
                <View style={twStyle("mt-2 gap-2")}>
                  {[
                    [an("recognizedRevenueNet"), curEb.recognized_revenue_net ?? curEb.service_earnings_net],
                    [an("serviceEarnings"), curEb.service_earnings ?? 0],
                    [an("tipsNet"), curEb.tips_net],
                    [an("cancellationFees"), curEb.cancellation_fees],
                    [an("refundsInclNegative"), curEb.refunds],
                    [an("platformFeesRetained"), curEb.platform_fees_retained],
                  ].map(([label, v]) => (
                    <View key={String(label)} style={twStyle("flex-row justify-between")}>
                      <Text style={twStyle("flex-1 pe-2 text-sm text-gray-600")}>{label}</Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatCurrency(Number(v))}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {allEb ? (
              <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
                <Text style={twStyle("text-xs font-semibold text-gray-700")}>{an("allTimeLedger")}</Text>
                <View style={twStyle("mt-2 gap-2")}>
                  {[
                    [an("recognizedRevenueNet"), allEb.recognized_revenue_net ?? allEb.service_earnings_net],
                    [an("serviceEarnings"), allEb.service_earnings ?? 0],
                    [an("tipsNet"), allEb.tips_net],
                    [an("cancellationFees"), allEb.cancellation_fees],
                    [an("refunds"), allEb.refunds],
                    [an("platformFeesRetained"), allEb.platform_fees_retained],
                  ].map(([label, v]) => (
                    <View key={String(label)} style={twStyle("flex-row justify-between")}>
                      <Text style={twStyle("flex-1 pe-2 text-sm text-gray-600")}>{label}</Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatCurrency(Number(v))}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {eb?.basis ? (
              <Text style={twStyle("mb-4 text-xs leading-4 text-gray-500")}>{eb.basis}</Text>
            ) : null}
          </>
        )}

        {exp && (
          <>
            <SectionHeader title={an("expenses")} />
            <View style={twStyle("mb-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4")}>
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-700")}>{an("thisPeriod")}</Text>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {formatCurrency(exp.current_period ?? exp.this_month ?? 0)}
                </Text>
              </View>
              <View style={twStyle("mt-2 flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-700")}>{an("allTime")}</Text>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {formatCurrency(exp.all_time ?? exp.total ?? 0)}
                </Text>
              </View>
              {exp.note ? <Text style={twStyle("mt-2 text-xs text-gray-500")}>{exp.note}</Text> : null}
            </View>
          </>
        )}

        {services.length > 0 ? (
          <>
            <SectionHeader
              title={an("topOfferings")}
              subtitle={an("topOfferingsSubtitle")}
            />
            <View style={twStyle("mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
              {services.map((s, i) => (
                <View
                  key={`${s.name}-${i}`}
                  style={twStyle(
                    `flex-row items-center justify-between border-b border-gray-100 px-4 py-3 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/80"}`,
                  )}
                >
                  <View style={twStyle("me-2 flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={2}>
                      {s.name}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{an("bookingsLineTotal", { count: s.count })}</Text>
                  </View>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(s.revenue)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            icon="cube-outline"
            title={an("noOfferingsTitle")}
            description={an("noOfferingsDesc")}
          />
        )}

        {trends.length > 0 ? (
          <>
            <SectionHeader
              title={an(trendsSectionKey(apiPeriod))}
              subtitle={data?.trends_meta?.description ?? an("trendsSubtitleFallback")}
            />
            <View style={twStyle("mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
              {trends.map((t, i) => (
                <View
                  key={`${t.month}-${i}`}
                  style={twStyle(
                    `flex-row items-center justify-between border-b border-gray-100 px-4 py-3 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/80"}`,
                  )}
                >
                  <Text style={twStyle("text-sm font-medium text-gray-800")}>{t.month}</Text>
                  <View style={twStyle("items-end")}>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(t.revenue)}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{an("bookingsCount", { count: t.bookings })}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            icon="stats-chart-outline"
            title={an("noTrendTitle")}
            description={an("noTrendDesc")}
          />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

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
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
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

const PERIODS: { id: "week" | "month" | "year"; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

function periodRevenueLabel(period: string): string {
  if (period === "week") return "Revenue this week";
  if (period === "year") return "Revenue this year";
  return "Revenue this month";
}

function periodCompareLabel(period: string): string {
  if (period === "week") return "vs previous week";
  if (period === "year") return "vs previous year";
  return "vs last month";
}

function trendsSectionTitle(period: string): string {
  if (period === "week") return "Trends (12 weeks)";
  if (period === "year") return "Trends (5 years)";
  return "Trends (12 months)";
}

export default function AnalyticsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"week" | "month" | "year">("month");
  const { screenPadding } = useResponsive();
  const { selectedLocationId } = useProvider();

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
        <ScreenHeader title="Analytics" showBack />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Analytics" showBack />
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
        title="Analytics"
        showBack
        subtitle={
          selectedLocationId
            ? "Ledger & counts · selected location"
            : "Ledger & counts · all locations"
        }
      />
      <View style={{ paddingHorizontal: screenPadding, paddingTop: 8, paddingBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 8 }}>
          {PERIODS.map((p) => {
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
                accessibilityLabel={`Period ${p.label}`}
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
          <View style={[twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginRight: 12, marginBottom: 12 }]}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-violet-50")}>
                <Ionicons name="trending-up-outline" size={20} color="#8b5cf6" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {formatCurrency(rev.current_period ?? rev.thisMonth ?? 0)}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>Ledger net · {periodRevenueLabel(apiPeriod)}</Text>
            {hasGrowth && (
              <Text
                style={twStyle(
                  `mt-0.5 text-xs font-medium ${growthNum >= 0 ? "text-green-600" : "text-red-600"}`,
                )}
              >
                {growthNum >= 0 ? "+" : ""}
                {rev.growth}%{` ${periodCompareLabel(apiPeriod)}`}
              </Text>
            )}
            {rev.growth === "New" ? (
              <Text style={twStyle("mt-0.5 text-xs text-emerald-600")}>New period activity</Text>
            ) : null}
          </View>
          <View style={[twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4"), { marginRight: 12, marginBottom: 12 }]}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-indigo-50")}>
                <Ionicons name="calendar-outline" size={20} color="#6366f1" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {book.upcoming ?? 0}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>Upcoming (scheduled)</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {book.thisMonth ?? 0} created in period
            </Text>
          </View>
          <View style={twStyle("min-w-[45%] flex-1 rounded-2xl border border-gray-100 bg-white p-4")}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-teal-50")}>
                <Ionicons name="people-outline" size={20} color="#14b8a6" />
              </View>
              <Text style={twStyle("ml-2 text-lg font-bold text-gray-900")}>
                {cust.total ?? 0}
              </Text>
            </View>
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>Distinct customers</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {cust.repeat ?? 0} repeat · {singleBooking} single-booking
            </Text>
          </View>
        </View>

        {data?.basis && Object.keys(data.basis).length > 0 ? (
          <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
            <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-indigo-900")}>Facts</Text>
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
            <Text style={twStyle("text-xs font-medium text-gray-500")}>All-time ledger net</Text>
            <Text style={twStyle("mt-1 text-xl font-bold text-gray-900")}>{formatCurrency(rev.all_time)}</Text>
            <Text style={twStyle("mt-1 text-xs text-gray-400")}>
              Sum of provider_earnings in finance_transactions (platform-settled). Cash walk-ins may be absent.
            </Text>
          </View>
        )}

        {(curEb || allEb) && (
          <>
            <SectionHeader title="Earnings and fees" />
            {curEb ? (
              <View style={twStyle("mb-3 rounded-2xl border border-gray-100 bg-white p-4")}>
                <Text style={twStyle("text-xs font-semibold text-gray-700")}>This period</Text>
                <View style={twStyle("mt-2 gap-2")}>
                  {[
                    ["Service earnings (net)", curEb.service_earnings_net],
                    ["Tips (net)", curEb.tips_net],
                    ["Cancellation fees", curEb.cancellation_fees],
                    ["Refunds (incl. negative earnings)", curEb.refunds],
                    ["Platform fees retained", curEb.platform_fees_retained],
                  ].map(([label, v]) => (
                    <View key={String(label)} style={twStyle("flex-row justify-between")}>
                      <Text style={twStyle("flex-1 pr-2 text-sm text-gray-600")}>{label}</Text>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatCurrency(Number(v))}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {allEb ? (
              <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
                <Text style={twStyle("text-xs font-semibold text-gray-700")}>All time (ledger)</Text>
                <View style={twStyle("mt-2 gap-2")}>
                  {[
                    ["Service earnings (net)", allEb.service_earnings_net],
                    ["Tips (net)", allEb.tips_net],
                    ["Cancellation fees", allEb.cancellation_fees],
                    ["Refunds", allEb.refunds],
                    ["Platform fees retained", allEb.platform_fees_retained],
                  ].map(([label, v]) => (
                    <View key={String(label)} style={twStyle("flex-row justify-between")}>
                      <Text style={twStyle("flex-1 pr-2 text-sm text-gray-600")}>{label}</Text>
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
            <SectionHeader title="Expenses" />
            <View style={twStyle("mb-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4")}>
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-700")}>This period</Text>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {formatCurrency(exp.current_period ?? exp.this_month ?? 0)}
                </Text>
              </View>
              <View style={twStyle("mt-2 flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-700")}>All time</Text>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  {formatCurrency(exp.all_time ?? exp.total ?? 0)}
                </Text>
              </View>
              {exp.note ? <Text style={twStyle("mt-2 text-xs text-gray-500")}>{exp.note}</Text> : null}
            </View>
          </>
        )}

        {services.length > 0 && (
          <>
            <SectionHeader
              title="Top offerings"
              subtitle="Ledger net by offering (scheduled in period) — matches Sales by service"
            />
            <View style={twStyle("mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
              {services.map((s, i) => (
                <View
                  key={`${s.name}-${i}`}
                  style={twStyle(
                    `flex-row items-center justify-between border-b border-gray-100 px-4 py-3 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/80"}`,
                  )}
                >
                  <View style={twStyle("mr-2 flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={2}>
                      {s.name}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{s.count} bookings · line total</Text>
                  </View>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(s.revenue)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {trends.length > 0 && (
          <>
            <SectionHeader
              title={trendsSectionTitle(apiPeriod)}
              subtitle={data?.trends_meta?.description ?? "Ledger vs bookings created per bucket"}
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
                    <Text style={twStyle("text-xs text-gray-500")}>{t.bookings} bookings</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

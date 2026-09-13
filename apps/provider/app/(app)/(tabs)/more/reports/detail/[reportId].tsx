/**
 * Native report detail: GET `/api/provider/reports/...` with the same query contracts as the web portal.
 */
import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { formatInTimeZone } from "date-fns-tz";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActiveLocationChip } from "@/components/reports/ActiveLocationChip";
import { ErrorState } from "@/components/ui/ErrorState";
import { FinanceReportError } from "@/components/finance/FinanceReportError";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { SalesSummaryReportView } from "@/features/reports/SalesSummaryReportView";
import { RevenueTrendsReportView } from "@/features/reports/RevenueTrendsReportView";
import { BookingStatusReportView } from "@/features/reports/BookingStatusReportView";
import { OccupancyReportView } from "@/features/reports/OccupancyReportView";
import { CancellationsReportView } from "@/features/reports/CancellationsReportView";
import { ClientSummaryReportView } from "@/features/reports/ClientSummaryReportView";
import { ClientRetentionReportView } from "@/features/reports/ClientRetentionReportView";
import { PaymentSummaryReportView } from "@/features/reports/PaymentSummaryReportView";
import { EndOfDayReportView } from "@/features/reports/EndOfDayReportView";
import { RefundsReportView } from "@/features/reports/RefundsReportView";
import { PaymentMethodsReportView } from "@/features/reports/PaymentMethodsReportView";
import { PayoutsReportView } from "@/features/reports/PayoutsReportView";
import { YocoReconciliationReportView } from "@/features/reports/YocoReconciliationReportView";
import { PaystackReconciliationReportView } from "@/features/reports/PaystackReconciliationReportView";
import { InventoryReportView } from "@/features/reports/InventoryReportView";
import { ProductSalesReportView } from "@/features/reports/ProductSalesReportView";
import { TopProductsReportView } from "@/features/reports/TopProductsReportView";
import { PackageSalesReportView } from "@/features/reports/PackageSalesReportView";
import { PackageUsageReportView } from "@/features/reports/PackageUsageReportView";
import { MembershipReportView } from "@/features/reports/MembershipReportView";
import { PerformanceDashboardReportView } from "@/features/reports/PerformanceDashboardReportView";
import { PeriodComparisonReportView } from "@/features/reports/PeriodComparisonReportView";
import {
  StaffCommissionReportView,
  StaffHoursReportView,
  NoShowsReportView,
  NewClientsReportView,
  ClientLifetimeValueReportView,
} from "@/features/reports/GenericFormattedReportViews";
import {
  REPORT_DETAIL_REGISTRY,
  type ReportDetailDefinition,
} from "@/features/reports/reportDetailRegistry";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";
import {
  getReportDateRange,
  formatReportRangeCaption,
  resolveReportTimezone,
  type ReportDateRangeKey,
} from "@/lib/reportDateRanges";
import { shareReportAsCsv } from "@/lib/reportExportCsv";
import { appendReportLocation } from "@/lib/reportLocationQuery";
import { useTranslation } from "@beautonomi/i18n";

const DATE_RANGE_KEYS: { labelKey: string; value: ReportDateRangeKey }[] = [
  { labelKey: "rangeToday", value: "today" },
  { labelKey: "rangeThisWeek", value: "week" },
  { labelKey: "rangeThisMonth", value: "month" },
  { labelKey: "rangeLastMonth", value: "last_month" },
  { labelKey: "range3Months", value: "3months" },
];

/** Occupancy API 400s for windows >31 days — only offer sub-31-day presets for that report. */
const OCCUPANCY_DATE_RANGE_KEYS: { labelKey: string; value: ReportDateRangeKey }[] = [
  { labelKey: "rangeToday", value: "today" },
  { labelKey: "rangeThisWeek", value: "week" },
  { labelKey: "rangeThisMonth", value: "month" },
  { labelKey: "rangeLastMonth", value: "last_month" },
];

const PERIOD_MQY_KEYS = [
  { labelKey: "periodMonth", value: "month" },
  { labelKey: "periodQuarter", value: "quarter" },
  { labelKey: "periodYear", value: "year" },
];

const PERIOD_DMWY_KEYS = [
  { labelKey: "periodDay", value: "day" },
  { labelKey: "periodWeek", value: "week" },
  { labelKey: "periodMonth", value: "month" },
  { labelKey: "periodYear", value: "year" },
];

function buildReportUrl(
  def: Pick<ReportDetailDefinition, "apiPath" | "query" | "extraSearch">,
  opts: {
    from: string;
    to: string;
    period: string;
    date: string;
    locationId: string | null;
  },
): string {
  const extra = def.extraSearch
    ? def.extraSearch({
        from: opts.from,
        to: opts.to,
        period: opts.period,
        date: opts.date,
      })
    : "";

  switch (def.query) {
    case "none":
      return appendReportLocation(`/api/provider/reports/${def.apiPath}`, opts.locationId);
    case "fromTo":
      return `${appendReportLocation(`/api/provider/reports/${def.apiPath}?from=${opts.from}&to=${opts.to}`, opts.locationId)}${extra}`;
    case "periodMQY":
      return appendReportLocation(`/api/provider/reports/${def.apiPath}?period=${encodeURIComponent(opts.period)}`, opts.locationId);
    case "periodDMWY":
      return appendReportLocation(`/api/provider/reports/${def.apiPath}?period=${encodeURIComponent(opts.period)}`, opts.locationId);
    case "singleDate":
      return appendReportLocation(`/api/provider/reports/${def.apiPath}?date=${encodeURIComponent(opts.date)}`, opts.locationId);
    default:
      return `/api/provider/reports/${def.apiPath}`;
  }
}

export default function ReportDetailScreen() {
  const { t } = useTranslation();
  const rd = (key: string) => t(`provider.mobile.screens.reportDetail.${key}`) as string;
  const router = useRouter();
  const { reportId: rawId } = useLocalSearchParams<{ reportId: string | string[] }>();
  const reportId = Array.isArray(rawId) ? rawId[0] : rawId;
  const def = reportId ? REPORT_DETAIL_REGISTRY[reportId] : undefined;

  const { selectedLocationId, provider } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const [periodMQY, setPeriodMQY] = useState("month");
  const [periodDMWY, setPeriodDMWY] = useState("month");
  // End-of-day defaults to "today" in the business timezone (not the device's),
  // so a provider travelling/abroad still lands on their own trading day.
  const [eodDate, setEodDate] = useState(() =>
    formatInTimeZone(new Date(), resolveReportTimezone(provider?.timezone), "yyyy-MM-dd"),
  );

  const { from, to } = useMemo(
    () => getReportDateRange(dateRange, { timezone: provider?.timezone }),
    [dateRange, provider?.timezone],
  );
  const rangeCaption = useMemo(() => formatReportRangeCaption(from, to), [from, to]);

  const path = useMemo(() => {
    if (!def) return "";
    return buildReportUrl(def, {
      from,
      to,
      period: def.query === "periodDMWY" ? periodDMWY : periodMQY,
      date: eodDate,
      locationId: selectedLocationId,
    });
  }, [def, from, to, periodMQY, periodDMWY, eodDate, selectedLocationId]);

  const { data, loading, error, errorCode, refresh } = useApi<unknown>(path, {
    enabled: !!def && !!path,
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

  const handleShare = useCallback(async () => {
    if (data == null || !reportId) return;
    try {
      await shareReportAsCsv(String(reportId), def?.title ?? rd("reportFallback"), data);
    } catch {
      Alert.alert(rd("exportFailedTitle"), rd("exportFailedBody"));
    }
  }, [data, def?.title, reportId, t]);

  if (!reportId || !def) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={rd("reportFallback")} showBack />
        <ErrorState message={rd("unknownReport")} onRetry={() => router.back()} retryLabel={rd("back")} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title={def.title}
        showBack
        subtitle={def.subtitle}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void handleShare();
            }}
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            accessibilityLabel={rd("exportA11y")}
          >
            <Ionicons name="share-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      <ActiveLocationChip />

      {def.query === "fromTo" && (
        <View style={twStyle("mb-2")}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", paddingBottom: 4 }}>
            {(reportId === "occupancy" ? OCCUPANCY_DATE_RANGE_KEYS : DATE_RANGE_KEYS).map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[twStyle(`rounded-full px-4 py-2 ${dateRange === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`), { marginEnd: 8 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDateRange(r.value);
                }}
              >
                <Text style={twStyle(`text-sm font-medium ${dateRange === r.value ? "text-white" : "text-gray-600"}`)}>{rd(r.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={twStyle("text-xs text-gray-500")}>{rangeCaption}</Text>
        </View>
      )}

      {def.query === "periodMQY" && (
        <View style={twStyle("mb-4")}>
          <FilterChipGroup options={PERIOD_MQY_KEYS.map((r) => ({ label: rd(r.labelKey), value: r.value }))} selected={periodMQY} onSelect={setPeriodMQY} />
        </View>
      )}

      {def.query === "periodDMWY" && (
        <View style={twStyle("mb-4")}>
          <FilterChipGroup options={PERIOD_DMWY_KEYS.map((r) => ({ label: rd(r.labelKey), value: r.value }))} selected={periodDMWY} onSelect={setPeriodDMWY} />
        </View>
      )}

      {def.query === "singleDate" && (
        <View style={twStyle("mb-4 flex-row flex-wrap items-center gap-2")}>
          <Text style={twStyle("text-sm text-gray-600")}>{rd("dateLabel")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {DATE_RANGE_KEYS.map((r) => (
              <TouchableOpacity
                key={r.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const d = getReportDateRange(r.value, { timezone: provider?.timezone });
                  setEodDate(d.to);
                }}
                style={[twStyle("me-2 rounded-full border border-gray-200 bg-white px-3 py-1.5")]}
              >
                <Text style={twStyle("text-xs text-gray-700")}>{rd(r.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color={Colors.primary} />}
      {error && !data ? (
        <FinanceReportError
          error={error}
          errorCode={errorCode}
          onRetry={refresh}
          permissionMessage={rd("permissionMessage")}
        />
      ) : null}

      {data != null && !loading &&
        (reportId === "sales-summary" ? (
          <SalesSummaryReportView data={data} />
        ) : reportId === "revenue-trends" ? (
          <RevenueTrendsReportView data={data} />
        ) : reportId === "booking-status" ? (
          <BookingStatusReportView data={data} />
        ) : reportId === "occupancy" ? (
          <OccupancyReportView data={data} />
        ) : reportId === "cancellations" ? (
          <CancellationsReportView data={data} />
        ) : reportId === "client-summary" ? (
          <ClientSummaryReportView data={data} />
        ) : reportId === "client-retention" ? (
          <ClientRetentionReportView data={data} />
        ) : reportId === "payment-summary" ? (
          <PaymentSummaryReportView data={data} />
        ) : reportId === "end-of-day" ? (
          <EndOfDayReportView data={data} />
        ) : reportId === "refunds" ? (
          <RefundsReportView data={data} />
        ) : reportId === "payment-methods" ? (
          <PaymentMethodsReportView data={data} />
        ) : reportId === "payouts" ? (
          <PayoutsReportView data={data} />
        ) : reportId === "yoco-reconciliation" ? (
          <YocoReconciliationReportView data={data} />
        ) : reportId === "paystack-terminal-reconciliation" ? (
          <PaystackReconciliationReportView data={data} />
        ) : reportId === "inventory" ? (
          <InventoryReportView data={data} />
        ) : reportId === "product-sales" ? (
          <ProductSalesReportView data={data} />
        ) : reportId === "top-products" ? (
          <TopProductsReportView data={data} />
        ) : reportId === "package-sales" ? (
          <PackageSalesReportView data={data} />
        ) : reportId === "package-usage" ? (
          <PackageUsageReportView data={data} />
        ) : reportId === "membership-sales" ? (
          <MembershipReportView data={data} />
        ) : reportId === "performance-dashboard" ? (
          <PerformanceDashboardReportView data={data} />
        ) : reportId === "comparison" ? (
          <PeriodComparisonReportView data={data} />
        ) : reportId === "staff-commission" ? (
          <StaffCommissionReportView data={data} />
        ) : reportId === "staff-hours" ? (
          <StaffHoursReportView data={data} />
        ) : reportId === "no-shows" ? (
          <NoShowsReportView data={data} />
        ) : reportId === "new-clients" ? (
          <NewClientsReportView data={data} />
        ) : reportId === "client-lifetime-value" ? (
          <ClientLifetimeValueReportView data={data} />
        ) : (
          <ReportPayloadView data={data} />
        ))}
    </ScreenContainer>
  );
}

import { useEffect, useState, useCallback, useMemo } from "react";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, TouchableOpacity, FlatList, Alert, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, MONEY_SURFACE_STALE_TIME_MS, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { useFocusRevalidate } from "@/hooks/useFocusRevalidate";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { FinanceReportError } from "@/components/finance/FinanceReportError";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { getReportDateRange, formatReportRangeCaption, type ReportDateRangeKey } from "@/lib/reportDateRanges";
import { MoneyRangeChips, moneyRangeCaption, type MoneyRangeKey } from "@/components/finance/MoneyRangeChips";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";
import { ReportBasisFootnote } from "@/components/reports/ReportBasisFootnote";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

type SalesHistorySource = "booking" | "product_order" | "pos";

interface SalesHistoryRow {
  id: string;
  source: SalesHistorySource;
  subtype: string;
  ref_number: string;
  sort_date: string;
  customer_name: string | null;
  gross_total: number;
  platform_fee: number;
  commission: number;
  provider_net: number;
  tip: number;
  tax: number;
  travel_fee: number;
  cancellation_fee: number;
  discount_contra: number;
  refunds: number;
  payment_status: string | null;
  currency: string;
  location_id: string | null;
}

interface SalesHistoryApiResponse {
  data: SalesHistoryRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  totals: {
    total_gross: number;
    total_provider_net: number;
    total_platform_fee: number;
    total_commission: number;
  };
  truncated_ledger?: boolean;
  default_range_months?: number | null;
  basis?: string;
}


const SOURCE_FILTER_KEYS: { labelKey: string; value: SalesHistorySource | "all" }[] = [
  { labelKey: "filterAll", value: "all" },
  { labelKey: "filterBookings", value: "booking" },
  { labelKey: "filterProducts", value: "product_order" },
  { labelKey: "filterPos", value: "pos" },
];

function getDateRange(filter: MoneyRangeKey, timezone?: string | null): { from?: string; to?: string } {
  return getReportDateRange(filter as ReportDateRangeKey, { timezone });
}

function sourceLabel(s: SalesHistorySource, sh: (key: string) => string): string {
  if (s === "booking") return sh("sourceBooking");
  if (s === "product_order") return sh("sourceProductOrder");
  return sh("sourcePos");
}

function subtypeLabel(sub: string, sh: (key: string) => string): string {
  if (sub === "custom") return sh("subtypeCustom");
  if (sub === "group") return sh("subtypeGroup");
  return sh("subtypeStandard");
}

export function SalesHistoryContent({
  embedded = false,
  locationId = null,
}: { embedded?: boolean; locationId?: string | null } = {}) {
  const { t } = useTranslation();
  const sh = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.salesHistory.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const handleBack = useProviderStackBack();
  useResponsive();
  const { provider } = useProvider();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<MoneyRangeKey>("month");
  const [sourceFilter, setSourceFilter] = useState<SalesHistorySource | "all">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SalesHistoryRow | null>(null);
  const [page, setPage] = useState(1);
  const sourceFilters = useMemo(
    () => SOURCE_FILTER_KEYS.map((f) => ({ label: sh(f.labelKey), value: f.value })),
    [sh],
  );

  useEffect(() => {
    const trimmed = search.trim();
    const timer = setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFilter, locationId, sourceFilter]);

  const dateRange = useMemo(() => {
    if (dateFilter === "all") return { from: undefined as string | undefined, to: undefined as string | undefined };
    return getDateRange(dateFilter, provider?.timezone);
  }, [dateFilter, provider?.timezone]);
  const dateRangeCaption = useMemo(() => {
    if (dateFilter === "all") return null;
    if (!dateRange.from || !dateRange.to) return null;
    return formatReportRangeCaption(dateRange.from, dateRange.to);
  }, [dateFilter, dateRange.from, dateRange.to]);

  const params = useMemo(() => {
    const parts: string[] = [`page=${page}`, "limit=25"];
    if (debouncedSearch) parts.push(`search=${encodeURIComponent(debouncedSearch)}`);
    if (dateFilter !== "all" && dateRange.from) parts.push(`date_from=${dateRange.from}`);
    if (dateFilter !== "all" && dateRange.to) parts.push(`date_to=${dateRange.to}`);
    if (locationId) parts.push(`location_id=${locationId}`);
    if (sourceFilter !== "all") parts.push(`source=${sourceFilter}`);
    return parts.join("&");
  }, [page, debouncedSearch, dateFilter, dateRange, locationId, sourceFilter]);

  const { data: salesPayload, loading, error: salesError, errorCode, refresh, silentRefresh } =
    useApi<SalesHistoryApiResponse>(`/api/provider/sales-history?${params}`, {
      staleTimeMs: MONEY_SURFACE_STALE_TIME_MS,
      revalidateOnFocus: true,
      timeoutMs: MONEY_SURFACE_TIMEOUT_MS,
    });
  useFocusRevalidate(silentRefresh);

  const sales = useMemo(() => salesPayload?.data ?? [], [salesPayload?.data]);

  const { execute: exportSales, loading: exporting } = useApiPost<
    Record<string, unknown>,
    { csv?: string; filename?: string; truncated_ledger?: boolean }
  >("/api/provider/sales-history/export");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const stats = useMemo(() => {
    const t = salesPayload?.totals;
    const hasRangeTotals = Boolean(t);
    return {
      count: salesPayload?.total ?? sales.length,
      hasRangeTotals,
      gross: hasRangeTotals ? t!.total_gross : null,
      net: hasRangeTotals ? t!.total_provider_net : null,
      platform: hasRangeTotals ? t!.total_platform_fee : null,
      commission: hasRangeTotals ? t!.total_commission : null,
    };
  }, [sales, salesPayload]);

  async function handleExportCsv() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const body: Record<string, unknown> = {
      source: sourceFilter,
      search: debouncedSearch || undefined,
      location_id: locationId || undefined,
    };
    if (dateRange.from) body.date_from = dateRange.from;
    if (dateRange.to) body.date_to = dateRange.to;
    const { data, error } = await exportSales(body);
    if (error) {
      Alert.alert(sh("exportFailed"), error);
      return;
    }
    if (data?.csv) {
      await Share.share({
        title: data.filename ?? sh("exportTitle"),
        message: data.truncated_ledger
          ? `${data.filename ?? sh("exportTitle")}\n\n${data.csv}\n\n${sh("exportTruncatedNote")}`
          : `${data.filename ?? sh("exportTitle")}\n\n${data.csv}`,
      });
    } else {
      Alert.alert(sh("exportAlertTitle"), sh("exportNoCsv"));
    }
  }

  const content = (
      <>
      {!embedded ? (
        <ScreenHeader
          title={sh("title")}
          showBack
          onBack={handleBack}
          subtitle={sh("subtitle", { count: stats.count })}
          rightAction={
            <TouchableOpacity
              style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
              onPress={handleExportCsv}
              disabled={exporting}
              accessibilityLabel={sh("exportCsvA11y")}
            >
              <Ionicons name="download-outline" size={18} color="#374151" />
            </TouchableOpacity>
          }
        />
      ) : (
        <View style={twStyle("mb-2 flex-row items-center justify-end px-4")}>
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExportCsv}
            disabled={exporting}
            accessibilityLabel={sh("exportCsvA11y")}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        </View>
      )}

      {salesPayload?.default_range_months && dateFilter === "all" ? (
        <View style={twStyle("mx-4 mb-2 rounded-lg bg-amber-50 px-3 py-2 border border-amber-100")}>
          <Text style={twStyle("text-xs text-amber-900")}>
            {sh("defaultRangeBanner", { months: salesPayload.default_range_months })}
          </Text>
        </View>
      ) : null}

      {salesPayload?.truncated_ledger ? (
        <View style={twStyle("mx-4 mb-2 rounded-lg bg-orange-50 px-3 py-2")}>
          <Text style={twStyle("text-xs text-orange-900")}>
            {sh("truncatedLedger")}
          </Text>
        </View>
      ) : null}

      {salesPayload?.basis ? (
        <View style={twStyle("mx-4 mb-2")}>
          <ReportBasisFootnote basisNote={salesPayload.basis} compact />
        </View>
      ) : null}

      <View style={twStyle("mb-4")}>
        <ReportResponsiveStatRow>
          <StatCard title={sh("statCount")} value={String(stats.count)} icon="list-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
          {stats.hasRangeTotals ? (
            <>
              <StatCard title={sh("statGross")} value={formatCurrency(stats.gross!)} icon="cash-outline" iconColor="#0d9488" iconBg="bg-teal-50" compact />
              <StatCard
                title={sh("statNetToYou")}
                value={formatCurrency(stats.net!)}
                icon="wallet-outline"
                iconColor="#15803d"
                iconBg="bg-green-50"
                compact
              />
              <StatCard
                title={sh("statPlatformFees")}
                value={formatCurrency(stats.platform!)}
                icon="shield-outline"
                iconColor="#c2410c"
                iconBg="bg-orange-50"
                compact
              />
            </>
          ) : null}
        </ReportResponsiveStatRow>
        {!stats.hasRangeTotals && sales.length > 0 ? (
          <Text style={twStyle("px-4 text-xs text-gray-500")}>
            {sh("rangeTotalsUnavailable")}
          </Text>
        ) : null}
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder={sh("searchPlaceholder")} />

      <View style={twStyle("my-2")}>
        <MoneyRangeChips value={dateFilter} onChange={setDateFilter} />
        <View style={twStyle("mt-2 px-4")}>
          <FilterChipGroup
            options={sourceFilters}
            selected={sourceFilter}
            onSelect={(v) => setSourceFilter(v as SalesHistorySource | "all")}
          />
        </View>
        {dateRangeCaption ? (
          <Text style={twStyle("mt-2 px-4 text-xs text-gray-500")}>
            {dateFilter === "all" && salesPayload?.default_range_months
              ? sh("lastMonthsDefault", { months: salesPayload.default_range_months })
              : dateRangeCaption}
          </Text>
        ) : dateFilter === "all" && salesPayload?.default_range_months ? (
          <Text style={twStyle("mt-2 px-4 text-xs text-gray-500")}>
            {sh("lastMonthsDefault", { months: salesPayload.default_range_months })}
          </Text>
        ) : (
          <Text style={twStyle("mt-2 px-4 text-xs text-gray-500")}>{moneyRangeCaption(dateFilter)}</Text>
        )}
      </View>

      {loading && !sales.length && !salesError ? (
        <SkeletonList rows={5} />
      ) : salesError ? (
        <FinanceReportError error={salesError} errorCode={errorCode} onRetry={refresh} />
      ) : sales.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={sh("emptyTitle")}
          description={sh("emptyDescription")}
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          {...verticalFlatListPerf}
          data={sales}
          keyExtractor={(s: SalesHistoryRow) => `${s.source}-${s.id}`}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: row }: { item: SalesHistoryRow }) => (
            <TouchableOpacity
              style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}
              onPress={() => setSelectedSale(row)}
              activeOpacity={0.7}
            >
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1 pe-2")}>
                  <Text style={twStyle("text-xs font-medium uppercase text-gray-500")}>
                    {sourceLabel(row.source, sh)}
                    {row.source === "booking" ? ` · ${subtypeLabel(row.subtype, sh)}` : ""}
                  </Text>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>{row.ref_number}</Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {row.customer_name ?? sh("walkIn")} · {formatDate(row.sort_date)}
                  </Text>
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-base font-bold text-gray-900")}>{formatCurrency(row.gross_total)}</Text>
                  <Text style={twStyle("mt-1 text-[10px] text-gray-500")}>
                    {sh("netAndFee", { net: formatCurrency(row.provider_net), fee: formatCurrency(row.platform_fee) })}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {salesPayload && salesPayload.total_pages > 1 && (
        <View style={twStyle("flex-row items-center justify-center py-3")}>
          <TouchableOpacity
            disabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            style={[twStyle(`rounded-lg px-4 py-2 ${page <= 1 ? "bg-gray-100" : "bg-gray-200"}`), { marginEnd: 16 }]}
          >
            <Text style={twStyle(`text-sm font-medium ${page <= 1 ? "text-gray-400" : "text-gray-700"}`)}>{sh("prev")}</Text>
          </TouchableOpacity>
          <Text style={[twStyle("text-sm text-gray-500"), { marginEnd: 16 }]}>
            {sh("pageOf", { page, total: salesPayload.total_pages })}
          </Text>
          <TouchableOpacity
            disabled={page >= salesPayload.total_pages}
            onPress={() => setPage((p) => p + 1)}
            style={twStyle(`rounded-lg px-4 py-2 ${page >= salesPayload.total_pages ? "bg-gray-100" : "bg-gray-200"}`)}
          >
            <Text
              style={twStyle(
                `text-sm font-medium ${page >= salesPayload.total_pages ? "text-gray-400" : "text-gray-700"}`,
              )}
            >
              {sh("next")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <BottomSheet visible={!!selectedSale} onClose={() => setSelectedSale(null)} title={selectedSale?.ref_number ?? ""}>
        {selectedSale && (
          <View>
            <Text style={twStyle("text-xs text-gray-500 mb-2")}>
              {sourceLabel(selectedSale.source, sh)}
              {selectedSale.source === "booking" ? ` · ${subtypeLabel(selectedSale.subtype, sh)}` : ""}
            </Text>
            <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-4 mb-3")}>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>{sh("gross")}</Text>
                <Text style={twStyle("text-sm font-semibold")}>{formatCurrency(selectedSale.gross_total)}</Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>{sh("platformFeesRetained")}</Text>
                <Text style={twStyle("text-sm font-semibold text-amber-800")}>
                  {formatCurrency(selectedSale.platform_fee)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>{sh("platformCommission")}</Text>
                <Text style={twStyle("text-sm font-semibold text-orange-800")}>
                  {formatCurrency(selectedSale.commission)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>{sh("tipsLedger")}</Text>
                <Text style={twStyle("text-sm font-semibold")}>{formatCurrency(selectedSale.tip)}</Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>{sh("taxLedger")}</Text>
                <Text style={twStyle("text-sm font-semibold")}>{formatCurrency(selectedSale.tax)}</Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>{sh("travelLedger")}</Text>
                <Text style={twStyle("text-sm font-semibold")}>
                  {formatCurrency(selectedSale.travel_fee ?? 0)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>{sh("cancellationFees")}</Text>
                <Text style={twStyle("text-sm font-semibold")}>
                  {formatCurrency(selectedSale.cancellation_fee ?? 0)}
                </Text>
              </View>
              {(selectedSale.discount_contra ?? 0) > 0 ? (
                <View style={twStyle("flex-row justify-between mb-2")}>
                  <Text style={twStyle("text-sm text-gray-600")}>{sh("discountsContra")}</Text>
                  <Text style={twStyle("text-sm font-semibold text-purple-800")}>
                    {formatCurrency(selectedSale.discount_contra)}
                  </Text>
                </View>
              ) : null}
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>{sh("refundsLedger")}</Text>
                <Text style={twStyle("text-sm font-semibold text-red-700")}>
                  {formatCurrency(selectedSale.refunds ?? 0)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between border-t border-gray-200 pt-2 mt-1")}>
                <Text style={twStyle("text-base font-bold text-gray-900")}>{sh("netToYou")}</Text>
                <Text style={twStyle("text-base font-bold text-green-800")}>
                  {formatCurrency(selectedSale.provider_net)}
                </Text>
              </View>
            </View>
            <Text style={twStyle("text-xs text-gray-500")}>
              {sh("detailFootnote")}
            </Text>
          </View>
        )}
      </BottomSheet>
      </>
  );

  if (embedded) {
    return <View style={twStyle("flex-1")}>{content}</View>;
  }

  return <ScreenContainer scrollable={false}>{content}</ScreenContainer>;
}

export default function SalesHistoryScreen() {
  return <Redirect href="/(app)/(tabs)/more/money?tab=sales" />;
}

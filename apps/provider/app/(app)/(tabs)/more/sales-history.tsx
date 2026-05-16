import { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, FlatList, Alert, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { getReportDateRange, formatReportRangeCaption, type ReportDateRangeKey } from "@/lib/reportDateRanges";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";
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
}

const DATE_FILTERS = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
];

const SOURCE_FILTERS: { label: string; value: SalesHistorySource | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Bookings", value: "booking" },
  { label: "Products", value: "product_order" },
  { label: "POS", value: "pos" },
];

function getDateRange(filter: string, timezone?: string | null): { from?: string; to?: string } {
  if (filter === "all") return {};
  if (filter === "today" || filter === "week" || filter === "month") {
    return getReportDateRange(filter as ReportDateRangeKey, { timezone });
  }
  return {};
}

function sourceLabel(s: SalesHistorySource): string {
  if (s === "booking") return "Booking";
  if (s === "product_order") return "Product order";
  return "POS";
}

function subtypeLabel(sub: string): string {
  if (sub === "custom") return "Custom";
  if (sub === "group") return "Group";
  return "Standard";
}

const TRANSACTIONS_HUB_HREF = "/(app)/(tabs)/more/transactions-hub" as const;
const FROM_TRANSACTIONS_HUB = "transactions-hub";

export default function SalesHistoryScreen() {
  const router = useRouter();
  const { from: fromParam } = useLocalSearchParams<{ from?: string }>();
  const fromTransactionsHub =
    typeof fromParam === "string"
      ? fromParam === FROM_TRANSACTIONS_HUB
      : Array.isArray(fromParam)
        ? fromParam[0] === FROM_TRANSACTIONS_HUB
        : false;
  useResponsive();
  const { selectedLocationId, provider } = useProvider();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<SalesHistorySource | "all">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SalesHistoryRow | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const trimmed = search.trim();
    const timer = setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFilter, selectedLocationId, sourceFilter]);

  const dateRange = useMemo(() => getDateRange(dateFilter, provider?.timezone), [dateFilter, provider?.timezone]);
  const dateRangeCaption = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return null;
    return formatReportRangeCaption(dateRange.from, dateRange.to);
  }, [dateRange.from, dateRange.to]);

  const params = useMemo(() => {
    const parts: string[] = [`page=${page}`, "limit=25"];
    if (debouncedSearch) parts.push(`search=${encodeURIComponent(debouncedSearch)}`);
    if (dateRange.from) parts.push(`date_from=${dateRange.from}`);
    if (dateRange.to) parts.push(`date_to=${dateRange.to}`);
    if (selectedLocationId) parts.push(`location_id=${selectedLocationId}`);
    if (sourceFilter !== "all") parts.push(`source=${sourceFilter}`);
    return parts.join("&");
  }, [page, debouncedSearch, dateRange, selectedLocationId, sourceFilter]);

  const { data: salesPayload, loading, error: salesError, refresh } = useApi<SalesHistoryApiResponse>(
    `/api/provider/sales-history?${params}`,
  );

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
    return {
      count: salesPayload?.total ?? sales.length,
      gross: t?.total_gross ?? sales.reduce((s, r) => s + r.gross_total, 0),
      net: t?.total_provider_net ?? sales.reduce((s, r) => s + r.provider_net, 0),
      platform: t?.total_platform_fee ?? sales.reduce((s, r) => s + r.platform_fee, 0),
      commission: t?.total_commission ?? sales.reduce((s, r) => s + r.commission, 0),
    };
  }, [sales, salesPayload]);

  async function handleExportCsv() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const body: Record<string, unknown> = {
      source: sourceFilter,
      search: debouncedSearch || undefined,
      location_id: selectedLocationId || undefined,
    };
    if (dateRange.from) body.date_from = dateRange.from;
    if (dateRange.to) body.date_to = dateRange.to;
    const { data, error } = await exportSales(body);
    if (error) {
      Alert.alert("Export failed", error);
      return;
    }
    if (data?.csv) {
      await Share.share({
        title: data.filename ?? "Sales history",
        message: data.truncated_ledger
          ? `${data.filename ?? "Sales history"}\n\n${data.csv}\n\nNote: ledger scan hit safety cap — CSV may be incomplete.`
          : `${data.filename ?? "Sales history"}\n\n${data.csv}`,
      });
    } else {
      Alert.alert("Export", "No CSV returned.");
    }
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Sales history"
        showBack
        onBack={
          fromTransactionsHub
            ? () => {
                router.push(TRANSACTIONS_HUB_HREF as never);
              }
            : undefined
        }
        subtitle={`${stats.count} rows`}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExportCsv}
            disabled={exporting}
            accessibilityLabel="Export CSV"
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      {salesPayload?.default_range_months ? (
        <View style={twStyle("mx-4 mb-2 rounded-lg bg-amber-50 px-3 py-2 border border-amber-100")}>
          <Text style={twStyle("text-xs text-amber-900")}>
            No date filter: showing last {salesPayload.default_range_months} months of ledger-linked sales (POS uses the
            same window).
          </Text>
        </View>
      ) : null}

      {salesPayload?.truncated_ledger ? (
        <View style={twStyle("mx-4 mb-2 rounded-lg bg-orange-50 px-3 py-2")}>
          <Text style={twStyle("text-xs text-orange-900")}>
            Ledger scan hit the safety cap — totals may be incomplete. Narrow the date range for full accuracy.
          </Text>
        </View>
      ) : null}

      <View style={twStyle("mb-4")}>
        <ReportResponsiveStatRow>
          <StatCard title="Count" value={String(stats.count)} icon="list-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
          <StatCard title="Gross" value={formatCurrency(stats.gross)} icon="cash-outline" iconColor="#0d9488" iconBg="bg-teal-50" compact />
          <StatCard
            title="Net to you"
            value={formatCurrency(stats.net)}
            icon="wallet-outline"
            iconColor="#15803d"
            iconBg="bg-green-50"
            compact
          />
          <StatCard
            title="Platform fees"
            value={formatCurrency(stats.platform)}
            icon="shield-outline"
            iconColor="#c2410c"
            iconBg="bg-orange-50"
            compact
          />
        </ReportResponsiveStatRow>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search ref or client..." />

      <View style={twStyle("my-2 px-4")}>
        <FilterChipGroup options={DATE_FILTERS} selected={dateFilter} onSelect={setDateFilter} />
        <View style={twStyle("mt-2")}>
          <FilterChipGroup
            options={SOURCE_FILTERS}
            selected={sourceFilter}
            onSelect={(v) => setSourceFilter(v as SalesHistorySource | "all")}
          />
        </View>
        {dateRangeCaption ? <Text style={twStyle("mt-2 text-xs text-gray-500")}>{dateRangeCaption}</Text> : null}
      </View>

      {loading && !sales.length && !salesError ? (
        <SkeletonList rows={5} />
      ) : salesError && !salesPayload ? (
        <ErrorState message="Could not load sales history. Pull down to retry." onRetry={refresh} />
      ) : sales.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No sales in this range"
          description="Try another date range, source filter, or search. Bookings and shop orders need a payment in the selected period."
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
                <View style={twStyle("flex-1 pr-2")}>
                  <Text style={twStyle("text-xs font-medium uppercase text-gray-500")}>
                    {sourceLabel(row.source)}
                    {row.source === "booking" ? ` · ${subtypeLabel(row.subtype)}` : ""}
                  </Text>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>{row.ref_number}</Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {row.customer_name ?? "Walk-in"} · {formatDate(row.sort_date)}
                  </Text>
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-base font-bold text-gray-900")}>{formatCurrency(row.gross_total)}</Text>
                  <Text style={twStyle("mt-1 text-[10px] text-gray-500")}>
                    Net {formatCurrency(row.provider_net)} · Fee {formatCurrency(row.platform_fee)}
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
            style={[twStyle(`rounded-lg px-4 py-2 ${page <= 1 ? "bg-gray-100" : "bg-gray-200"}`), { marginRight: 16 }]}
          >
            <Text style={twStyle(`text-sm font-medium ${page <= 1 ? "text-gray-400" : "text-gray-700"}`)}>Prev</Text>
          </TouchableOpacity>
          <Text style={[twStyle("text-sm text-gray-500"), { marginRight: 16 }]}>
            Page {page} of {salesPayload.total_pages}
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
              Next
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <BottomSheet visible={!!selectedSale} onClose={() => setSelectedSale(null)} title={selectedSale?.ref_number ?? ""}>
        {selectedSale && (
          <View>
            <Text style={twStyle("text-xs text-gray-500 mb-2")}>
              {sourceLabel(selectedSale.source)}
              {selectedSale.source === "booking" ? ` · ${subtypeLabel(selectedSale.subtype)}` : ""}
            </Text>
            <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-4 mb-3")}>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Gross</Text>
                <Text style={twStyle("text-sm font-semibold")}>{formatCurrency(selectedSale.gross_total)}</Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Platform fees (retained)</Text>
                <Text style={twStyle("text-sm font-semibold text-amber-800")}>
                  {formatCurrency(selectedSale.platform_fee)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Platform commission (%)</Text>
                <Text style={twStyle("text-sm font-semibold text-orange-800")}>
                  {formatCurrency(selectedSale.commission)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Tips (ledger)</Text>
                <Text style={twStyle("text-sm font-semibold")}>{formatCurrency(selectedSale.tip)}</Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Tax (ledger)</Text>
                <Text style={twStyle("text-sm font-semibold")}>{formatCurrency(selectedSale.tax)}</Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Travel (ledger)</Text>
                <Text style={twStyle("text-sm font-semibold")}>
                  {formatCurrency(selectedSale.travel_fee ?? 0)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Cancellation fees</Text>
                <Text style={twStyle("text-sm font-semibold")}>
                  {formatCurrency(selectedSale.cancellation_fee ?? 0)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between mb-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Refunds (ledger)</Text>
                <Text style={twStyle("text-sm font-semibold text-red-700")}>
                  {formatCurrency(selectedSale.refunds ?? 0)}
                </Text>
              </View>
              <View style={twStyle("flex-row justify-between border-t border-gray-200 pt-2 mt-1")}>
                <Text style={twStyle("text-base font-bold text-gray-900")}>Net to you</Text>
                <Text style={twStyle("text-base font-bold text-green-800")}>
                  {formatCurrency(selectedSale.provider_net)}
                </Text>
              </View>
            </View>
            <Text style={twStyle("text-xs text-gray-500")}>
              Figures for bookings and product orders come from your finance ledger in the selected period. POS rows show
              gross as net (cash / in-person).
            </Text>
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}

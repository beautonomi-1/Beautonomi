import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
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

interface SaleItem {
  id: string;
  type?: string;
  name?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Sale {
  id: string;
  ref_number: string;
  client_name: string | null;
  date: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string;
  team_member_id: string | null;
  team_member_name: string | null;
}

interface SalesResponse {
  data: Sale[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const DATE_FILTERS = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
];

function getDateRange(filter: string): { from?: string; to?: string } {
  if (filter === "all") return {};
  if (filter === "today" || filter === "week" || filter === "month") {
    return getReportDateRange(filter as ReportDateRangeKey);
  }
  return {};
}

function paymentIcon(method: string): keyof typeof Ionicons.glyphMap {
  if (method === "card" || method === "yoco") return "card-outline";
  if (method === "cash") return "cash-outline";
  return "wallet-outline";
}

export default function SalesHistoryScreen() {
  useResponsive();
  const { selectedLocationId } = useProvider();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [page, setPage] = useState(1);

  // §Provider-audit 2026-04 (round 6): debounce search so each keystroke
  // doesn't spawn a `/api/provider/sales` fetch (and cancel the previous).
  useEffect(() => {
    const trimmed = search.trim();
    const timer = setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // §Provider-audit 2026-04 (round 6): reset to page 1 whenever the
  // filter set changes. Previously, changing the date filter while on
  // page 3 would request page 3 of the new result set — often empty —
  // and show the empty state even though page 1 had data.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFilter, selectedLocationId]);

  const dateRange = useMemo(() => getDateRange(dateFilter), [dateFilter]);
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
    return parts.join("&");
  }, [page, debouncedSearch, dateRange, selectedLocationId]);

  const { data: salesData, loading, error: salesError, refresh } = useApi<SalesResponse>(
    `/api/provider/sales?${params}`
  );

  const sales = useMemo(() => salesData?.data ?? [], [salesData?.data]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const stats = useMemo(() => {
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    return { count: salesData?.total ?? sales.length, revenue: totalRevenue };
  }, [sales, salesData]);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Sales History"
        showBack
        subtitle={`${stats.count} sales`}
      />

      {/* Stats row */}
      <View style={twStyle("mb-4")}>
        <ReportResponsiveStatRow>
          <StatCard
            title="Total Sales"
            value={String(stats.count)}
            icon="receipt-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            compact
          />
          <StatCard
            title="Revenue"
            value={formatCurrency(stats.revenue)}
            icon="cash-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
        </ReportResponsiveStatRow>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by ref or client..." />

      <View style={twStyle("my-3")}>
        <FilterChipGroup options={DATE_FILTERS} selected={dateFilter} onSelect={setDateFilter} />
        {dateRangeCaption ? (
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>{dateRangeCaption}</Text>
        ) : null}
      </View>

      {loading && !sales.length && !salesError ? (
        <SkeletonList rows={5} />
      ) : salesError && !salesData ? (
        <ErrorState message="Could not load sales. Pull down to retry." onRetry={refresh} />
      ) : sales.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No sales found"
          description="Completed service sales will appear here"
        />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(s: Sale) => s.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: sale }: { item: Sale }) => (
            <TouchableOpacity
              style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}
              onPress={() => setSelectedSale(sale)}
              activeOpacity={0.7}
            >
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {sale.ref_number}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {sale.client_name ?? "Walk-in"} · {formatDate(sale.date)}
                  </Text>
                  {sale.team_member_name && (
                    <Text style={twStyle("text-xs text-gray-400")}>by {sale.team_member_name}</Text>
                  )}
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-base font-bold text-gray-900")}>
                    {formatCurrency(sale.total)}
                  </Text>
                  <View style={twStyle("mt-1 flex-row items-center")}>
                    <Ionicons name={paymentIcon(sale.payment_method)} size={12} color="#6b7280" />
                    <Text style={twStyle("ml-1 text-[10px] capitalize text-gray-500")}>
                      {sale.payment_method}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Items preview */}
              <View style={twStyle("mt-2")}>
                {sale.items.slice(0, 3).map((item: SaleItem, i: number) => (
                  <Text key={i} style={twStyle("text-xs text-gray-500")} numberOfLines={1}>
                    {item.quantity}× {item.name ?? "Item"} — {formatCurrency(item.total)}
                  </Text>
                ))}
                {sale.items.length > 3 && (
                  <Text style={twStyle("text-xs text-indigo-500")}>+{sale.items.length - 3} more items</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Pagination */}
      {salesData && salesData.total_pages > 1 && (
        <View style={twStyle("flex-row items-center justify-center py-3")}>
          <TouchableOpacity
            disabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            style={[twStyle(`rounded-lg px-4 py-2 ${page <= 1 ? "bg-gray-100" : "bg-gray-200"}`), { marginRight: 16 }]}
          >
            <Text style={twStyle(`text-sm font-medium ${page <= 1 ? "text-gray-400" : "text-gray-700"}`)}>Prev</Text>
          </TouchableOpacity>
          <Text style={[twStyle("text-sm text-gray-500"), { marginRight: 16 }]}>
            Page {page} of {salesData.total_pages}
          </Text>
          <TouchableOpacity
            disabled={page >= salesData.total_pages}
            onPress={() => setPage((p) => p + 1)}
            style={twStyle(`rounded-lg px-4 py-2 ${page >= salesData.total_pages ? "bg-gray-100" : "bg-gray-200"}`)}
          >
            <Text style={twStyle(`text-sm font-medium ${page >= salesData.total_pages ? "text-gray-400" : "text-gray-700"}`)}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sale detail sheet */}
      <BottomSheet
        visible={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        title={`Sale ${selectedSale?.ref_number ?? ""}`}
      >
        {selectedSale && (
          <View>
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-500")}>{formatDate(selectedSale.date)}</Text>
              <View style={twStyle("flex-row items-center rounded-full bg-gray-100 px-3 py-1")}>
                <Ionicons name={paymentIcon(selectedSale.payment_method)} size={14} color="#6b7280" />
                <Text style={twStyle("ml-1 text-xs capitalize text-gray-600")}>{selectedSale.payment_method}</Text>
              </View>
            </View>

            {selectedSale.client_name && (
              <View style={twStyle("mb-3 flex-row items-center")}>
                <Ionicons name="person-outline" size={16} color="#6b7280" />
                <Text style={twStyle("ml-2 text-sm text-gray-700")}>{selectedSale.client_name}</Text>
              </View>
            )}

            {selectedSale.team_member_name && (
              <View style={twStyle("mb-3 flex-row items-center")}>
                <Ionicons name="people-outline" size={16} color="#6b7280" />
                <Text style={twStyle("ml-2 text-sm text-gray-700")}>{selectedSale.team_member_name}</Text>
              </View>
            )}

            {/* Line items */}
            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50")}>
              {selectedSale.items.map((item, i) => (
                <View
                  key={i}
                  style={twStyle(`flex-row items-center justify-between px-4 py-3 ${
                    i < selectedSale.items.length - 1 ? "border-b border-gray-200" : ""
                  }`)}
                >
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("text-sm text-gray-900")}>
                      {item.name ?? "Item"}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </Text>
                  </View>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {formatCurrency(item.total)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Totals */}
            <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4")}>
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-500")}>Subtotal</Text>
                <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(selectedSale.subtotal)}</Text>
              </View>
              {selectedSale.tax > 0 && (
                <View style={twStyle("mt-1.5 flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Tax</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(selectedSale.tax)}</Text>
                </View>
              )}
              <View style={twStyle("mt-2 border-t border-gray-100 pt-2 flex-row justify-between")}>
                <Text style={twStyle("text-base font-bold text-gray-900")}>Total</Text>
                <Text style={twStyle("text-base font-bold text-gray-900")}>{formatCurrency(selectedSale.total)}</Text>
              </View>
            </View>
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}

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

interface ProductItem {
  name: string;
  units_sold: number;
  revenue: number;
  current_stock?: number;
}

interface ProductsData {
  total_product_revenue: number;
  total_units_sold: number;
  top_products: ProductItem[];
  low_stock: { name: string; stock: number; reorder_point: number }[];
  package_usage?: { name: string; active: number; redeemed: number }[];
  package_revenue?: number;
}

export default function ProductsReport() {
  const { selectedLocationId } = useProvider();
  const [dateRange, setDateRange] = useState<ReportDateRangeKey>("month");
  const { from, to } = getReportDateRange(dateRange);
  const rangeCaption = formatReportRangeCaption(from, to);
  const productsReportUrl = `/api/provider/reports/products?from=${from}&to=${to}${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data, loading, error: dataError, refresh } = useApi<ProductsData>(productsReportUrl);

  const handleExport = useCallback(async () => {
    if (!data) return;
    const text = [
      `Product & Inventory Report (${from} to ${to})`,
      `Total Product Revenue: ${formatCurrency(data.total_product_revenue)}`,
      `Total Units Sold: ${data.total_units_sold}`,
      "",
      "Top Products:",
      ...data.top_products.slice(0, 10).map((p, i) => `  ${i + 1}. ${p.name}: ${p.units_sold} sold, ${formatCurrency(p.revenue)}`),
      "",
      data.low_stock.length > 0 ? "Low Stock Alerts:" : "",
      ...data.low_stock.map((p) => `  ${p.name}: ${p.stock} left (reorder at ${p.reorder_point})`),
    ].filter(Boolean).join("\n");
    await Share.share({ message: text, title: "Product Report" });
  }, [data, from, to]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Products" showBack subtitle="Top sellers, stock & packages" />

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

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color="#8b5cf6" />}
      {!loading && dataError && !data && <ErrorState message={dataError} onRetry={refresh} />}
      {!loading && !data && !dataError && <EmptyState icon="bag-outline" title="No product data" description="Product analytics will appear here" />}

      {data && (
        <View>
          <View style={twStyle("mb-4")}>
            <ReportResponsiveStatRow>
              <StatCard title="Product Revenue" value={formatCurrency(data.total_product_revenue)} icon="cash-outline" iconColor="#8b5cf6" iconBg="bg-violet-50" compact />
              <StatCard title="Units Sold" value={String(data.total_units_sold)} icon="cube-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
            </ReportResponsiveStatRow>
          </View>

          {data.top_products.length > 0 && (
            <View>
              <SectionHeader title="Top Selling Products" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.top_products.slice(0, 10).map((p, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-3 border-b border-gray-50")}>
                    <View style={twStyle("flex-row items-center flex-1")}>
                      <View style={twStyle("h-8 w-8 rounded-full bg-violet-100 items-center justify-center mr-3")}>
                        <Text style={twStyle("text-sm font-bold text-violet-600")}>{i + 1}</Text>
                      </View>
                      <View style={twStyle("flex-1")}>
                        <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>{p.name}</Text>
                        <Text style={twStyle("text-xs text-gray-400")}>{p.units_sold} sold{p.current_stock != null ? ` · ${p.current_stock} in stock` : ""}</Text>
                      </View>
                    </View>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(p.revenue)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.low_stock.length > 0 && (
            <View>
              <SectionHeader title="Low Stock Alerts" />
              <View style={twStyle("rounded-2xl border border-red-100 bg-red-50 px-4 py-2")}>
                {data.low_stock.map((p, i) => (
                  <View key={i} style={twStyle("flex-row items-center justify-between py-2.5 border-b border-red-100")}>
                    <View style={twStyle("flex-row items-center")}>
                      <Ionicons name="warning-outline" size={16} color="#ef4444" />
                      <Text style={twStyle("text-sm text-red-900 ml-2")}>{p.name}</Text>
                    </View>
                    <Text style={twStyle("text-sm font-semibold text-red-700")}>{p.stock} left</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.package_usage && data.package_usage.length > 0 && (
            <View>
              <SectionHeader title="Package Usage" />
              <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-1")}>
                {data.package_usage.map((p, i) => (
                  <View key={i} style={twStyle("py-3 border-b border-gray-50")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>{p.name}</Text>
                    <View style={twStyle("flex-row mt-1")}>
                      <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 16 }]}>Active: <Text style={twStyle("font-medium text-gray-700")}>{p.active}</Text></Text>
                      <Text style={twStyle("text-xs text-gray-500")}>Redeemed: <Text style={twStyle("font-medium text-gray-700")}>{p.redeemed}</Text></Text>
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

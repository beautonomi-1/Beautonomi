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
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCurrency } from "@/lib/format";

type DateRange = "today" | "week" | "month" | "last_month" | "3months";

const DATE_RANGES: { label: string; value: DateRange }[] = [
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

function getDateParams(range: DateRange) {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from = to;
  if (range === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); from = d.toISOString().split("T")[0]; }
  else if (range === "month") { const d = new Date(now); d.setMonth(d.getMonth() - 1); from = d.toISOString().split("T")[0]; }
  else if (range === "last_month") {
    const d = new Date(now); d.setMonth(d.getMonth() - 1);
    from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
    return { from, to: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0] };
  }
  else if (range === "3months") { const d = new Date(now); d.setMonth(d.getMonth() - 3); from = d.toISOString().split("T")[0]; }
  return { from, to };
}

export default function ProductsReport() {
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const { from, to } = getDateParams(dateRange);
  const { data, loading } = useApi<ProductsData>(
    `/api/provider/reports/products?from=${from}&to=${to}`
  );

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 8 }}>
        {DATE_RANGES.map((r) => (
          <TouchableOpacity
            key={r.value}
            className={`rounded-full px-4 py-2 ${dateRange === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDateRange(r.value); }}
          >
            <Text className={`text-sm font-medium ${dateRange === r.value ? "text-white" : "text-gray-600"}`}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && !data && <ActivityIndicator className="my-8" color="#8b5cf6" />}
      {!loading && !data && <EmptyState icon="bag-outline" title="No product data" description="Product analytics will appear here" />}

      {data && (
        <View className="gap-4">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <StatCard title="Product Revenue" value={formatCurrency(data.total_product_revenue)} icon="cash-outline" iconColor="#8b5cf6" iconBg="bg-violet-50" compact />
            </View>
            <View className="flex-1">
              <StatCard title="Units Sold" value={String(data.total_units_sold)} icon="cube-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
            </View>
          </View>

          {data.top_products.length > 0 && (
            <View>
              <SectionHeader title="Top Selling Products" />
              <View className="rounded-2xl border border-gray-100 bg-white px-4 py-1">
                {data.top_products.slice(0, 10).map((p, i) => (
                  <View key={i} className="flex-row items-center justify-between py-3 border-b border-gray-50">
                    <View className="flex-row items-center flex-1">
                      <View className="h-8 w-8 rounded-full bg-violet-100 items-center justify-center mr-3">
                        <Text className="text-sm font-bold text-violet-600">{i + 1}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>{p.name}</Text>
                        <Text className="text-xs text-gray-400">{p.units_sold} sold{p.current_stock != null ? ` · ${p.current_stock} in stock` : ""}</Text>
                      </View>
                    </View>
                    <Text className="text-sm font-semibold text-gray-900">{formatCurrency(p.revenue)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.low_stock.length > 0 && (
            <View>
              <SectionHeader title="Low Stock Alerts" />
              <View className="rounded-2xl border border-red-100 bg-red-50 px-4 py-2">
                {data.low_stock.map((p, i) => (
                  <View key={i} className="flex-row items-center justify-between py-2.5 border-b border-red-100">
                    <View className="flex-row items-center">
                      <Ionicons name="warning-outline" size={16} color="#ef4444" />
                      <Text className="text-sm text-red-900 ml-2">{p.name}</Text>
                    </View>
                    <Text className="text-sm font-semibold text-red-700">{p.stock} left</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {data.package_usage && data.package_usage.length > 0 && (
            <View>
              <SectionHeader title="Package Usage" />
              <View className="rounded-2xl border border-gray-100 bg-white px-4 py-1">
                {data.package_usage.map((p, i) => (
                  <View key={i} className="py-3 border-b border-gray-50">
                    <Text className="text-sm font-medium text-gray-900">{p.name}</Text>
                    <View className="flex-row gap-4 mt-1">
                      <Text className="text-xs text-gray-500">Active: <Text className="font-medium text-gray-700">{p.active}</Text></Text>
                      <Text className="text-xs text-gray-500">Redeemed: <Text className="font-medium text-gray-700">{p.redeemed}</Text></Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity className="rounded-xl bg-gray-100 py-3 px-4 flex-row items-center justify-center" onPress={handleExport}>
            <Ionicons name="share-outline" size={18} color="#374151" />
            <Text className="ml-2 text-sm font-medium text-gray-700">Export Report</Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="h-8" />
    </ScreenContainer>
  );
}

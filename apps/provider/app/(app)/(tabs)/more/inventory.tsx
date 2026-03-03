import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

interface InventoryProduct {
  id: string;
  name: string;
  category?: string | null;
  retail_price: number;
  quantity?: number;
  low_stock_level?: number;
  track_stock_quantity?: boolean;
  is_active?: boolean;
}

interface InventoryResponse {
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  totalStockValue: number;
  lowStockProducts: InventoryProduct[];
  outOfStockProducts: InventoryProduct[];
  categoryBreakdown: { category: string; count: number; stockValue: number }[];
  allProducts?: InventoryProduct[];
}

/** Content-only for use in Products hub (Inventory tab). */
export function InventoryContent() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refresh } = useApi<InventoryResponse>(
    "/api/provider/reports/products/inventory"
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  const totalProducts = data?.totalProducts ?? 0;
  const totalStockValue = data?.totalStockValue ?? 0;
  const lowStock = data?.lowStockProducts ?? [];
  const outOfStock = data?.outOfStockProducts ?? [];
  const categories = data?.categoryBreakdown ?? [];

  return (
    <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-6 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-gray-200 bg-white p-4">
            <View className="mb-1 h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <Ionicons name="cube-outline" size={18} color="#059669" />
            </View>
            <Text className="text-2xl font-bold text-gray-900">{totalProducts}</Text>
            <Text className="text-sm text-gray-500">Total products</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-gray-200 bg-white p-4">
            <View className="mb-1 h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <Ionicons name="cash-outline" size={18} color="#2563eb" />
            </View>
            <Text className="text-lg font-bold text-gray-900">
              R {Number(totalStockValue).toFixed(0)}
            </Text>
            <Text className="text-sm text-gray-500">Stock value</Text>
          </View>
        </View>

        {outOfStock.length > 0 && (
          <View className="mb-4">
            <Text className="mb-2 text-sm font-semibold text-red-700">Out of stock</Text>
            <View className="rounded-xl border border-red-100 bg-red-50/50 p-3">
              {outOfStock.slice(0, 10).map((p) => (
                <View key={p.id} className="flex-row items-center justify-between py-2 border-b border-red-100/50 last:border-b-0">
                  <Text className="flex-1 text-sm font-medium text-gray-900" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text className="text-xs text-red-600">0 left</Text>
                </View>
              ))}
              {outOfStock.length > 10 && (
                <Text className="pt-1 text-xs text-gray-500">+{outOfStock.length - 10} more</Text>
              )}
            </View>
          </View>
        )}

        {lowStock.length > 0 && (
          <View className="mb-4">
            <Text className="mb-2 text-sm font-semibold text-amber-700">Low stock</Text>
            <View className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
              {lowStock.slice(0, 10).map((p) => (
                <View key={p.id} className="flex-row items-center justify-between py-2 border-b border-amber-100/50 last:border-b-0">
                  <Text className="flex-1 text-sm font-medium text-gray-900" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text className="text-xs text-amber-700">
                    {Number(p.quantity ?? 0)} (alert ≤{Number(p.low_stock_level ?? 5)})
                  </Text>
                </View>
              ))}
              {lowStock.length > 10 && (
                <Text className="pt-1 text-xs text-gray-500">+{lowStock.length - 10} more</Text>
              )}
            </View>
          </View>
        )}

        {categories.length > 0 && (
          <View className="mb-4">
            <Text className="mb-2 text-sm font-semibold text-gray-700">By category</Text>
            <View className="rounded-xl border border-gray-200 bg-white">
              {categories.slice(0, 15).map((c) => (
                <View key={c.category} className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3 last:border-b-0">
                  <Text className="text-sm font-medium text-gray-900">{c.category}</Text>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-xs text-gray-500">{c.count} items</Text>
                    <Text className="text-sm font-medium text-gray-700">
                      R {Number(c.stockValue).toFixed(0)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {totalProducts === 0 && (
          <View className="items-center rounded-2xl border border-gray-100 bg-gray-50/50 p-8">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Ionicons name="archive-outline" size={28} color="#059669" />
            </View>
            <Text className="text-center font-medium text-gray-900">No inventory data</Text>
            <Text className="mt-1 text-center text-sm text-gray-500">
              Add products in Products & Inventory to track stock here.
            </Text>
          </View>
        )}
      </ScrollView>
  );
}

export default function InventoryScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Inventory Manager" showBack subtitle="Stock levels & alerts" />
      <InventoryContent />
    </ScreenContainer>
  );
}

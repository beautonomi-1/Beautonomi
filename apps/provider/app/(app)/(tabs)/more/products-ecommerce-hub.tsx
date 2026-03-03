import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  retail_price?: number;
  stock_quantity?: number;
};

type ProductsResponse = {
  products?: Product[];
  total?: number;
};

export default function ProductsEcommerceHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<ProductsResponse>(
    "/api/provider/products?limit=100"
  );

  const products: Product[] = (data as ProductsResponse)?.products ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Products & e-commerce" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Products & e-commerce" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Products & e-commerce"
        subtitle="Inventory, orders & sales"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4 gap-3">
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/products-hub" as never)}
              className="flex-1 flex-row items-center rounded-xl border border-gray-200 bg-white p-4"
              activeOpacity={0.7}
            >
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-violet-100">
                <Ionicons name="cube-outline" size={22} color="#8b5cf6" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-gray-900">Products & inventory</Text>
                <Text className="text-xs text-gray-500">Manage catalog & stock</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/product-orders" as never)}
              className="flex-1 flex-row items-center rounded-xl border border-gray-200 bg-white p-4"
              activeOpacity={0.7}
            >
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-teal-100">
                <Ionicons name="receipt-outline" size={22} color="#0d9488" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-gray-900">Product orders</Text>
                <Text className="text-xs text-gray-500">View & fulfill orders</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/settings/shipping-config" as never)}
            className="flex-row items-center rounded-xl border border-gray-200 bg-white p-4"
            activeOpacity={0.7}
          >
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <Ionicons name="car-outline" size={22} color="#475569" />
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-gray-900">Shipping & collection</Text>
              <Text className="text-xs text-gray-500">Delivery and collection options</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>
        {products.length === 0 ? (
          <View className="py-8 px-4 items-center">
            <Ionicons name="cube-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No products yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500 mb-4">
              Add your first product in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/product-form" as never)}
              className="rounded-xl bg-violet-600 px-6 py-3"
              activeOpacity={0.8}
            >
              <Text className="font-semibold text-white">Add product</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="pb-4">
            <Text className="mb-2 px-1 text-sm font-medium text-gray-500">Recent products</Text>
            {products.slice(0, 10).map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => router.push({ pathname: "/(app)/(tabs)/more/product-form", params: { id: p.id } } as never)}
                className="mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
                activeOpacity={0.7}
              >
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900">{p.name}</Text>
                  {p.sku && (
                    <Text className="mt-0.5 text-xs text-gray-500">SKU: {p.sku}</Text>
                  )}
                </View>
                <View className="items-end">
                  {typeof p.retail_price === "number" && (
                    <Text className="font-medium text-gray-700">
                      ZAR {p.retail_price.toLocaleString()}
                    </Text>
                  )}
                  {p.stock_quantity != null && (
                    <Text className="text-xs text-gray-500">Stock: {p.stock_quantity}</Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color="#9ca3af" style={{ marginTop: 4 }} />
                </View>
              </TouchableOpacity>
            ))}
            {products.length > 10 && (
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/products-hub" as never)}
                className="rounded-xl border border-gray-200 bg-gray-50 py-3"
                activeOpacity={0.7}
              >
                <Text className="text-center font-medium text-violet-600">View all products</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

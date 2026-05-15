import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, DeviceEventEmitter } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { formatCurrency } from "@/lib/format";
import { PROVIDER_PRODUCTS_CATALOG_CHANGED } from "@/lib/provider-products-catalog-events";

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  retail_price?: number;
  quantity?: number;
  stock_quantity?: number;
  effective_quantity?: number;
  has_variants?: boolean;
  variants?: { retail_price?: number; quantity?: number }[];
};

function hubStockQty(p: Product): number | undefined {
  if (typeof p.effective_quantity === "number") return p.effective_quantity;
  if (p.has_variants && p.variants?.length) {
    return p.variants.reduce((s, v) => s + (Number(v.quantity) || 0), 0);
  }
  const q = p.quantity ?? p.stock_quantity;
  return q !== undefined ? Number(q) : undefined;
}

function hubPriceLabel(p: Product): string {
  if (p.has_variants && p.variants?.length) {
    const min = Math.min(...p.variants.map((v) => Number(v.retail_price ?? 0)));
    return `From ${formatCurrency(min)}`;
  }
  if (typeof p.retail_price === "number") return formatCurrency(p.retail_price);
  return "—";
}

type ProductsResponse = {
  products?: Product[];
  total?: number;
};

type ProviderNavCounts = {
  active_product_orders?: number;
  open_return_requests?: number;
};

/** Flat payload from GET /api/provider/products/metrics (not nested under `metrics`). */
type ProductMetricsPayload = {
  totalProducts?: number;
  lowStockProducts?: number;
  outOfStockProducts?: number;
  totalInventoryValue?: number;
};

export default function ProductsEcommerceHubScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<ProductsResponse>(
    "/api/provider/products?limit=100"
  );
  const { data: metricsData, refresh: refreshMetrics } = useApi<ProductMetricsPayload>(
    "/api/provider/products/metrics"
  );
  const { data: navCounts, refresh: refreshNavCounts } = useApi<ProviderNavCounts>(
    "/api/provider/nav-counts",
    { staleTimeMs: 15_000 }
  );

  const products: Product[] = (data as ProductsResponse)?.products ?? [];
  const activeOrdersCount = navCounts?.active_product_orders ?? 0;
  const openReturnsCount = navCounts?.open_return_requests ?? 0;
  const totalNeedAction = activeOrdersCount + openReturnsCount;
  const lowStockCount =
    metricsData?.lowStockProducts ??
    products.filter((p) => {
      const q = hubStockQty(p) ?? 0;
      return q > 0 && q <= 3;
    }).length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshMetrics(), refreshNavCounts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshMetrics, refreshNavCounts]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROVIDER_PRODUCTS_CATALOG_CHANGED, () => {
      void refresh();
      void refreshMetrics();
      void refreshNavCounts();
    });
    return () => sub.remove();
  }, [refresh, refreshMetrics, refreshNavCounts]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Products & e-commerce" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Products & e-commerce" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Quick metrics row ── */}
        <View style={{ flexDirection: "row", marginBottom: 16, gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: "#F0FDF4", borderRadius: 14, padding: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: "#166534" }}>{products.length}</Text>
            <Text style={{ fontSize: 11, color: "#15803D", fontWeight: "600", marginTop: 2 }}>Products</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/orders-hub" as never)}
            style={{ flex: 1, backgroundColor: totalNeedAction > 0 ? "#FFF7ED" : "#F9FAFB", borderRadius: 14, padding: 14, alignItems: "center", borderWidth: totalNeedAction > 0 ? 1.5 : 1, borderColor: totalNeedAction > 0 ? "#FED7AA" : Colors.gray[200] }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${totalNeedAction} items need attention. Tap to view orders and returns.`}
          >
            <Text style={{ fontSize: 22, fontWeight: "800", color: totalNeedAction > 0 ? "#C2410C" : Colors.gray[700] }}>
              {totalNeedAction}
            </Text>
            <Text style={{ fontSize: 11, color: totalNeedAction > 0 ? "#C2410C" : Colors.gray[500], fontWeight: "600", marginTop: 2, textAlign: "center" }}>
              Needs action{totalNeedAction > 0 ? " ⚡" : ""}
            </Text>
            <Text style={{ fontSize: 9, color: Colors.gray[400], marginTop: 1 }}>
              Tap → Orders Hub
            </Text>
          </TouchableOpacity>
          {lowStockCount > 0 ? (
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/products-hub" as never)}
              style={{ flex: 1, backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1.5, borderColor: "#FECACA" }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 22, fontWeight: "800", color: "#DC2626" }}>{lowStockCount}</Text>
              <Text style={{ fontSize: 11, color: "#DC2626", fontWeight: "600", marginTop: 2 }}>Low stock ⚠️</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Nav tiles ── */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/products-hub" as never)}
              style={{ flex: 1, minWidth: "45%", marginHorizontal: 6, marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              activeOpacity={0.7}
            >
              <View style={{ marginRight: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#ede9fe" }}>
                <Ionicons name="cube-outline" size={22} color="#8b5cf6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Products & inventory</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                  {products.length > 0 ? `${products.length} products` : "Catalog & stock"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/walk-in-sale" as never)}
              style={{ flex: 1, minWidth: "45%", marginHorizontal: 6, marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              activeOpacity={0.7}
            >
              <View style={{ marginRight: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#fff7ed" }}>
                <Ionicons name="cart-outline" size={22} color="#f97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Walk-in sale</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Quick in-person sales</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/orders-hub" as never)}
              style={{ flex: 1, minWidth: "45%", marginHorizontal: 6, marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: totalNeedAction > 0 ? "#FED7AA" : Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              activeOpacity={0.7}
            >
              <View style={{ marginRight: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#ccfbf1" }}>
                <Ionicons name="receipt-outline" size={22} color="#0d9488" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Orders & returns</Text>
                <Text style={{ fontSize: 12, color: totalNeedAction > 0 ? "#C2410C" : Colors.gray[500] }}>
                  {totalNeedAction > 0 ? `${activeOrdersCount} orders, ${openReturnsCount} returns` : "Fulfill orders & refunds"}
                </Text>
              </View>
              {totalNeedAction > 0 && (
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", marginRight: 4 }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{totalNeedAction > 9 ? "9+" : totalNeedAction}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/settings/shipping-config" as never)}
              style={{ flex: 1, minWidth: "45%", marginHorizontal: 6, marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              activeOpacity={0.7}
            >
              <View style={{ marginRight: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#f1f5f9" }}>
                <Ionicons name="car-outline" size={22} color="#475569" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Shipping & collection</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Delivery options</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>
        {products.length === 0 ? (
          <View style={{ paddingVertical: 32, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="cube-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No products yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
              Add your first product in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/product-form" as never)}
              style={{ borderRadius: 12, backgroundColor: "#7c3aed", paddingHorizontal: 24, paddingVertical: 12 }}
              activeOpacity={0.8}
            >
              <Text style={{ fontWeight: "600", color: Colors.white }}>Add product</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>Recent products</Text>
              <TouchableOpacity onPress={() => router.push("/(app)/(tabs)/more/product-form" as never)}>
                <Text style={{ fontSize: 13, color: "#8b5cf6", fontWeight: "600" }}>+ Add product</Text>
              </TouchableOpacity>
            </View>
            {products.slice(0, 10).map((p) => {
              const stock = hubStockQty(p);
              return (
              <TouchableOpacity
                key={p.id}
                onPress={() => router.push({ pathname: "/(app)/(tabs)/more/product-form", params: { id: p.id } } as never)}
                style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{p.name}</Text>
                  {p.sku && (
                    <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>SKU: {p.sku}</Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>{hubPriceLabel(p)}</Text>
                  {stock !== undefined && (
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Stock: {stock}</Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color="#9ca3af" style={{ marginTop: 4 }} />
                </View>
              </TouchableOpacity>
              );
            })}
            {products.length > 10 && (
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/products-hub" as never)}
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingVertical: 12 }}
                activeOpacity={0.7}
              >
                <Text style={{ textAlign: "center", fontWeight: "500", color: "#7c3aed" }}>View all products</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

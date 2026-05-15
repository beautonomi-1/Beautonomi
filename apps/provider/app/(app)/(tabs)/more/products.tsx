import { useCallback, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, RefreshControl, DeviceEventEmitter } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { displayRetailPriceMin, effectiveStockQuantity } from "@/lib/product-inventory-metrics";
import { formatCurrency } from "@/lib/format";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import {
  PROVIDER_PRODUCTS_CATALOG_CHANGED,
  emitProviderProductsCatalogChanged,
} from "@/lib/provider-products-catalog-events";

interface ProductVariant {
  id?: string;
  option_values?: Record<string, string>;
  retail_price: number;
  quantity?: number;
  supply_price?: number;
  sku?: string | null;
  low_stock_level?: number;
}

interface Product {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  retail_price: number;
  quantity?: number;
  low_stock_level?: number;
  category?: string | null;
  short_description?: string | null;
  brand?: string | null;
  supplier?: string | null;
  has_variants?: boolean;
  variant_option_types?: { name: string; values: string[] }[];
  variants?: ProductVariant[];
  /** Merged primary + extra URLs from API */
  image_urls?: string[] | null;
  tax_rate?: number | null;
  track_stock_quantity?: boolean;
  /** Sum of variant qty or base quantity (GET /api/provider/products) */
  effective_quantity?: number;
  retail_sales_enabled?: boolean;
  is_active?: boolean;
}

interface ProductsResponse {
  products?: Product[];
  total?: number;
  page?: number;
  total_pages?: number;
}

interface ProductMetricsResponse {
  totalProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalInventoryValue: number;
}

const UNCATEGORIZED_PRODUCT_LABEL = "Uncategorized";
const EMPTY_PRODUCTS: Product[] = [];

function productCategorySectionTitle(p: Product): string {
  const t = (p.category ?? "").trim();
  return t.length > 0 ? t : UNCATEGORIZED_PRODUCT_LABEL;
}

/** Content-only for use in Products hub (Products tab). */
export function ProductsContent() {
  const router = useRouter();

  const { data: productsData, loading: loadingList, error, refresh: refreshList } = useApi<ProductsResponse>(
    "/api/provider/products?limit=200"
  );
  const { data: metricsData, refresh: refreshMetrics } = useApi<ProductMetricsResponse>("/api/provider/products/metrics");
  const { execute: deleteProduct } = useApiMutation("delete");

  const onRefresh = useCallback(() => {
    refreshList();
    refreshMetrics();
  }, [refreshList, refreshMetrics]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROVIDER_PRODUCTS_CATALOG_CHANGED, () => {
      void refreshList();
      void refreshMetrics();
    });
    return () => sub.remove();
  }, [refreshList, refreshMetrics]);

  const goToAddProduct = useCallback(() => {
    router.push("/(app)/(tabs)/more/product-form" as never);
  }, [router]);

  const goToEditProduct = useCallback(
    (p: Product) => {
      router.push({ pathname: "/(app)/(tabs)/more/product-form", params: { id: p.id } } as never);
    },
    [router]
  );

  const handleDelete = (p: Product) => {
    Alert.alert(
      "Delete product",
      `Delete "${p.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error: err } = await deleteProduct(`/api/provider/products/${p.id}`);
            if (err) Alert.alert("Error", err);
            else {
              emitProviderProductsCatalogChanged();
            }
          },
        },
      ]
    );
  };

  const displayProducts = productsData?.products ?? EMPTY_PRODUCTS;

  const productSections = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of displayProducts) {
      const label = productCategorySectionTitle(p);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(p);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === UNCATEGORIZED_PRODUCT_LABEL) return 1;
      if (b === UNCATEGORIZED_PRODUCT_LABEL) return -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    return keys.map((title) => ({ title, products: map.get(title)! }));
  }, [displayProducts]);

  const productDisplayPrice = (p: Product): string => {
    const row = {
      has_variants: p.has_variants,
      retail_price: p.retail_price,
      quantity: p.quantity,
      variants: p.variants?.map((v) => ({ quantity: v.quantity, retail_price: v.retail_price })),
    };
    const min = displayRetailPriceMin(row);
    if (p.has_variants && p.variants?.length) {
      return `From ${formatCurrency(min)}`;
    }
    return formatCurrency(min);
  };

  const productStockLabel = (p: Product): string => {
    if (p.track_stock_quantity === false) return "Stock not tracked";
    const q =
      typeof p.effective_quantity === "number"
        ? p.effective_quantity
        : effectiveStockQuantity({
            has_variants: p.has_variants,
            quantity: p.quantity,
            variants: p.variants?.map((v) => ({ quantity: v.quantity, retail_price: v.retail_price })),
          });
    return `${q} in stock`;
  };

  const retailCount = displayProducts.filter((p) => p.retail_sales_enabled !== false).length;
  const internalCount = displayProducts.filter((p) => p.retail_sales_enabled === false).length;
  const lowOutCombined =
    (metricsData?.lowStockProducts ?? 0) + (metricsData?.outOfStockProducts ?? 0);

  const isLoading = loadingList;

  if (error && !productsData) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={onRefresh} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#1a1f3c" />
      }
    >
      {isLoading && displayProducts.length === 0 ? (
        <View style={{ paddingVertical: 48 }}>
          <LoadingState />
        </View>
      ) : displayProducts.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 64 }}>
          <View
            style={{
              marginBottom: 16,
              height: 64,
              width: 64,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              backgroundColor: "#ede9fe",
            }}
          >
            <Ionicons name="cube-outline" size={32} color="#8b5cf6" />
          </View>
          <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>No products yet</Text>
          <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500], lineHeight: 20 }}>
            Open the full product editor to add images, long description, variants, tax, retail vs internal-only, stock rules,
            and more — the same screen you use when editing existing products.
          </Text>
          <TouchableOpacity
            onPress={goToAddProduct}
            style={{
              marginTop: 24,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: "#8b5cf6",
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.white }}>Add product</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ marginBottom: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View
              style={{
                flex: 1,
                minWidth: "45%",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Active products</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{metricsData?.totalProducts ?? "—"}</Text>
              <Text style={{ fontSize: 10, color: Colors.gray[400], marginTop: 2 }}>Same basis as web metrics</Text>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: "45%",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Retail / Internal</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#db2777" }}>{retailCount} retail</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[600] }}>{internalCount} internal-only</Text>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: "45%",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Stock value (est.)</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }} numberOfLines={1}>
                {formatCurrency(metricsData?.totalInventoryValue ?? 0)}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: "45%",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Low / out</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#dc2626" }}>{lowOutCombined}</Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>matches platform metrics</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={goToAddProduct}
            style={{
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#c4b5fd",
              backgroundColor: "#f5f3ff",
              paddingVertical: 12,
            }}
          >
            <Ionicons name="add" size={18} color="#8b5cf6" />
            <Text style={{ marginLeft: 8, fontWeight: "500", color: "#6d28d9" }}>Add product</Text>
          </TouchableOpacity>
          <Text style={{ marginBottom: 12, fontSize: 14, color: Colors.gray[500] }}>
            {displayProducts.length} product{displayProducts.length !== 1 ? "s" : ""} loaded — tap the pencil to edit in the full form
          </Text>
          {productSections.map(({ title, products }) => (
            <View key={title} style={{ marginBottom: 20 }}>
              <View
                style={{
                  marginBottom: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  borderLeftWidth: 4,
                  borderLeftColor: "#8b5cf6",
                  paddingLeft: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: Colors.gray[600],
                  }}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: "500", color: Colors.gray[400] }}>
                  {products.length} item{products.length !== 1 ? "s" : ""}
                </Text>
              </View>
              {products.map((p) => {
                const thumb = p.image_urls?.[0];
                return (
                  <View
                    key={p.id}
                    style={{
                      marginBottom: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: Colors.gray[100],
                      backgroundColor: Colors.white,
                      padding: 12,
                    }}
                  >
                    {thumb ? (
                      <Image
                        source={{ uri: thumb }}
                        style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12, backgroundColor: Colors.gray[100] }}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          marginRight: 12,
                          backgroundColor: "#f3f4f6",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="cube-outline" size={22} color="#9ca3af" />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {p.retail_sales_enabled === false && (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: Colors.gray[200] }}>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: Colors.gray[700] }}>INTERNAL</Text>
                          </View>
                        )}
                        {p.is_active === false && (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#fee2e2" }}>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: "#b91c1c" }}>INACTIVE</Text>
                          </View>
                        )}
                        {p.has_variants ? (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#ede9fe" }}>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: "#6d28d9" }}>VARIANTS</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ marginTop: 2, fontSize: 13, color: Colors.gray[600] }}>{productDisplayPrice(p)}</Text>
                      <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>{productStockLabel(p)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => goToEditProduct(p)}
                      style={{
                        marginRight: 8,
                        height: 36,
                        width: 36,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        backgroundColor: Colors.gray[100],
                      }}
                      accessibilityLabel="Edit product in full form"
                      accessibilityRole="button"
                    >
                      <Ionicons name="create-outline" size={18} color="#6b7280" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(p)}
                      style={{
                        height: 36,
                        width: 36,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        backgroundColor: "#fee2e2",
                      }}
                      accessibilityLabel="Delete product"
                      accessibilityRole="button"
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

export default function ProductsScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Products" showBack subtitle="Product catalog" />
      <ProductsContent />
    </ScreenContainer>
  );
}

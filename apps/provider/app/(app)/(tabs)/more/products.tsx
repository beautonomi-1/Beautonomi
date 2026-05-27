import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  DeviceEventEmitter,
} from "react-native";
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
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import {
  PROVIDER_PRODUCTS_CATALOG_CHANGED,
  emitProviderProductsCatalogChanged,
} from "@/lib/provider-products-catalog-events";
import { groupProductsIntoSections } from "@/features/products/groupProductsIntoSections";
import type { ProductItem } from "@/features/products/types";
import { StockAdjustSheet } from "@/features/products/StockAdjustSheet";
import { BarcodeLookupModal } from "@/features/products/BarcodeLookup";

interface ProductsResponse {
  products?: ProductItem[];
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

type FilterKey = "all" | "active" | "inactive" | "low_stock" | "out_of_stock";

const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "low_stock", label: "Low stock" },
  { key: "out_of_stock", label: "Out of stock" },
];

const EMPTY: ProductItem[] = [];

function stockBadge(p: ProductItem): "low" | "out" | null {
  if (p.track_stock_quantity === false) return null;
  const q =
    typeof p.effective_quantity === "number"
      ? p.effective_quantity
      : effectiveStockQuantity({
          has_variants: p.has_variants,
          quantity: p.quantity,
          variants: p.variants?.map((v) => ({ quantity: v.quantity, retail_price: v.retail_price })),
        });
  const low = Number(p.low_stock_level) || 5;
  if (q <= 0) return "out";
  if (q <= low) return "low";
  return null;
}

export function ProductsContent() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [page, setPage] = useState(1);
  const [menuProduct, setMenuProduct] = useState<ProductItem | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<ProductItem | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filter]);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("include_inactive", "true");
    params.set("page", String(page));
    params.set("limit", "20");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filter === "inactive") params.set("include_inactive", "true");
    if (filter === "low_stock") params.set("has_low_stock", "true");
    if (filter === "out_of_stock") params.set("out_of_stock", "true");
    return `/api/provider/products?${params.toString()}`;
  }, [debouncedSearch, filter, page]);

  const { data: productsData, loading: loadingList, error, refresh: refreshList } = useApi<ProductsResponse>(queryUrl);
  const { data: metricsData, refresh: refreshMetrics } = useApi<ProductMetricsResponse>("/api/provider/products/metrics");
  const { execute: deleteProduct } = useApiMutation("delete");
  const { execute: patchProduct } = useApiMutation("patch");
  const { execute: createProduct } = useApiMutation("post");

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

  let displayProducts = productsData?.products ?? EMPTY;
  if (filter === "active") {
    displayProducts = displayProducts.filter((p) => p.is_active !== false);
  } else if (filter === "inactive") {
    displayProducts = displayProducts.filter((p) => p.is_active === false);
  }

  const sections = useMemo(() => groupProductsIntoSections(displayProducts), [displayProducts]);

  const handleDelete = (p: ProductItem) => {
    Alert.alert("Delete product", `Delete "${p.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error: err, data } = await deleteProduct(`/api/provider/products/${p.id}`);
          if (err?.includes("PRODUCT_HAS_BOOKINGS") || (data as { error?: { code?: string } })?.error?.code === "PRODUCT_HAS_BOOKINGS") {
            Alert.alert(
              "Cannot delete",
              "This product is linked to bookings. Archive it instead?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Archive",
                  onPress: async () => {
                    const { error: archErr } = await deleteProduct(`/api/provider/products/${p.id}?archive=true`);
                    if (archErr) Alert.alert("Error", archErr);
                    else emitProviderProductsCatalogChanged();
                  },
                },
              ],
            );
            return;
          }
          if (err) Alert.alert("Error", err);
          else emitProviderProductsCatalogChanged();
        },
      },
    ]);
  };

  const handleDuplicate = async (p: ProductItem) => {
    const { error: err } = await createProduct("/api/provider/products", {
      name: `${p.name} (copy)`,
      category: p.category,
      brand: p.brand,
      retail_price: p.retail_price,
      supply_price: p.supply_price,
      quantity: 0,
      is_active: false,
      retail_sales_enabled: p.retail_sales_enabled,
      image_urls: p.image_urls ?? [],
    });
    if (err) Alert.alert("Error", err);
    else emitProviderProductsCatalogChanged();
  };

  const toggleActive = async (p: ProductItem) => {
    const { error: err } = await patchProduct(`/api/provider/products/${p.id}`, {
      is_active: p.is_active === false,
    });
    if (err) Alert.alert("Error", err);
    else emitProviderProductsCatalogChanged();
  };

  const productDisplayPrice = (p: ProductItem) => {
    const min = displayRetailPriceMin({
      has_variants: p.has_variants,
      retail_price: p.retail_price,
      quantity: p.quantity,
      variants: p.variants?.map((v) => ({ quantity: v.quantity, retail_price: v.retail_price })),
    });
    return p.has_variants && (p.variants?.length ?? 0) > 0 ? `From ${formatCurrency(min)}` : formatCurrency(min);
  };

  const productStockLabel = (p: ProductItem) => {
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

  const totalPages = productsData?.total_pages ?? 1;

  if (error && !productsData) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
        <ErrorState message={error} onRetry={onRefresh} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loadingList} onRefresh={onRefresh} tintColor="#1a1f3c" />}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, SKU, barcode…" />
            </View>
            <TouchableOpacity
              onPress={() => setBarcodeOpen(true)}
              style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#ede9fe" }}
            >
              <Ionicons name="barcode-outline" size={22} color="#6d28d9" />
            </TouchableOpacity>
          </View>
          <FilterChipGroup
            options={FILTER_CHIPS.map((c) => ({ label: c.label, value: c.key }))}
            selected={filter}
            onSelect={(k) => setFilter(k as FilterKey)}
          />
        </View>

        {loadingList && displayProducts.length === 0 ? (
          <LoadingState />
        ) : displayProducts.length === 0 ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ color: Colors.gray[500] }}>No products match your filters.</Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/product-form" as never)}
              style={{ marginTop: 16, backgroundColor: "#8b5cf6", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Add product</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{ marginBottom: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], padding: 12 }}>
                <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Active products</Text>
                <Text style={{ fontSize: 18, fontWeight: "700" }}>{metricsData?.totalProducts ?? "—"}</Text>
              </View>
              <View style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], padding: 12 }}>
                <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Low / out</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#dc2626" }}>
                  {(metricsData?.lowStockProducts ?? 0) + (metricsData?.outOfStockProducts ?? 0)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/product-form" as never)}
              style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "#c4b5fd", backgroundColor: "#f5f3ff", paddingVertical: 12 }}
            >
              <Ionicons name="add" size={18} color="#8b5cf6" />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: "#6d28d9" }}>Add product</Text>
            </TouchableOpacity>

            {sections.map((section) => (
              <View key={section.sectionKey} style={{ marginBottom: 20 }}>
                <Text style={{ marginBottom: 10, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: Colors.gray[600] }}>
                  {section.title} · {section.items.length}
                </Text>
                {section.items.map((p) => {
                  const thumb = p.image_urls?.[0];
                  const badge = stockBadge(p);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => router.push(`/(app)/(tabs)/more/products/${p.id}` as never)}
                      style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 12 }}
                    >
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }} contentFit="cover" />
                      ) : (
                        <View style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="cube-outline" size={22} color="#9ca3af" />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                          <Text style={{ fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>{p.name}</Text>
                          {p.is_active === false && <Text style={{ fontSize: 10, fontWeight: "700", color: "#b45309" }}>INACTIVE</Text>}
                          {p.retail_sales_enabled === false && <Text style={{ fontSize: 10, fontWeight: "700", color: Colors.gray[500] }}>INTERNAL</Text>}
                          {p.has_variants && <Text style={{ fontSize: 10, fontWeight: "700", color: "#4338ca" }}>VARIANTS</Text>}
                          {badge === "low" && <Text style={{ fontSize: 10, fontWeight: "700", color: "#ca8a04" }}>LOW</Text>}
                          {badge === "out" && <Text style={{ fontSize: 10, fontWeight: "700", color: "#dc2626" }}>OUT</Text>}
                        </View>
                        <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{productDisplayPrice(p)}</Text>
                        <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{productStockLabel(p)}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setMenuProduct(p)} style={{ padding: 8 }}>
                        <Ionicons name="ellipsis-vertical" size={20} color="#6b7280" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {totalPages > 1 && (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 8 }}>
                <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                  <Text style={{ color: page <= 1 ? Colors.gray[300] : "#6366f1" }}>Previous</Text>
                </TouchableOpacity>
                <Text style={{ color: Colors.gray[600] }}>Page {page} / {totalPages}</Text>
                <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
                  <Text style={{ color: page >= totalPages ? Colors.gray[300] : "#6366f1" }}>Next</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={!!menuProduct} onClose={() => setMenuProduct(null)} title={menuProduct?.name ?? "Product"}>
        {menuProduct && (
          <View>
            {[
              { label: "Edit", onPress: () => { setMenuProduct(null); router.push({ pathname: "/(app)/(tabs)/more/product-form", params: { id: menuProduct.id } } as never); } },
              {
                label: "Adjust stock",
                onPress: () => {
                  if (menuProduct.has_variants && (menuProduct.variants?.length ?? 0) > 1) {
                    Alert.alert("Variants", "Open the product to adjust stock per variant.");
                    return;
                  }
                  setMenuProduct(null);
                  setAdjustProduct(menuProduct);
                },
              },
              { label: "Duplicate", onPress: () => { setMenuProduct(null); void handleDuplicate(menuProduct); } },
              { label: menuProduct.is_active === false ? "Activate" : "Deactivate", onPress: () => { setMenuProduct(null); void toggleActive(menuProduct); } },
              { label: "Delete", destructive: true, onPress: () => { setMenuProduct(null); handleDelete(menuProduct); } },
            ].map((action) => (
              <TouchableOpacity
                key={action.label}
                onPress={action.onPress}
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
              >
                <Text style={{ fontSize: 16, color: action.destructive ? "#dc2626" : Colors.gray[900] }}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </BottomSheet>

      <StockAdjustSheet visible={!!adjustProduct} product={adjustProduct} onClose={() => setAdjustProduct(null)} onSuccess={onRefresh} />
      <BarcodeLookupModal visible={barcodeOpen} onClose={() => setBarcodeOpen(false)} />
    </>
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

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { displayRetailPriceMin, effectiveStockQuantity } from "@/lib/product-inventory-metrics";
import { api } from "@/lib/api-client";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatCurrency } from "@/lib/format";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

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

type VariantRow = {
  option_values: Record<string, string>;
  sku: string;
  quantity: number;
  supply_price: number;
  retail_price: number;
  low_stock_level: number;
};

const UNCATEGORIZED_PRODUCT_LABEL = "Uncategorized";
const EMPTY_PRODUCTS: Product[] = [];

function productCategorySectionTitle(p: Product): string {
  const t = (p.category ?? "").trim();
  return t.length > 0 ? t : UNCATEGORIZED_PRODUCT_LABEL;
}

const defaultForm = {
  name: "",
  retail_price: "",
  category: "",
  sku: "",
  quantity: "",
  low_stock_level: "5",
  short_description: "",
  barcode: "",
  brand: "",
  supplier: "",
  // §Provider-audit 2026-04 (follow-up): the full `product-form.tsx`
  // surfaces tax rate and the "track stock quantity" toggle. The quick
  // modal previously hid these, forcing providers to bounce to the full
  // form any time they wanted tax-exempt stock-less items (e.g. custom
  // made-to-order additions). Expose them here too; default values mirror
  // the POST /api/provider/products defaults.
  tax_rate: "0",
  track_stock_quantity: true,
  hasVariants: false,
  variantOptionName: "",
  variantOptionValues: "",
  variantRows: [] as VariantRow[],
};

/** Content-only for use in Products hub (Products tab). */
export function ProductsContent() {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [loadingProduct, setLoadingProduct] = useState(false);

  const { data: productsData, loading: loadingList, error, refresh: refreshList } = useApi<ProductsResponse>(
    "/api/provider/products?limit=200"
  );
  const { data: metricsData, refresh: refreshMetrics } = useApi<ProductMetricsResponse>("/api/provider/products/metrics");
  const { execute: postProduct, loading: creating } = useApiMutation("post");
  const { execute: patchProduct, loading: updating } = useApiMutation("patch");
  const { execute: deleteProduct } = useApiMutation("delete");

  const fetchCategorySuggestions = useCallback(
    async (query: string) => {
      const res = await api.get<{ value: string; label: string }[]>(
        `/api/provider/products/suggestions?field=category&q=${encodeURIComponent(query)}`
      );
      if (res.error || !res.data) return [];
      return Array.isArray(res.data) ? res.data : [];
    },
    []
  );
  const fetchBrandSuggestions = useCallback(
    async (query: string) => {
      const res = await api.get<{ value: string; label: string }[]>(
        `/api/provider/products/suggestions?field=brand&q=${encodeURIComponent(query)}`
      );
      if (res.error || !res.data) return [];
      return Array.isArray(res.data) ? res.data : [];
    },
    []
  );
  const fetchSupplierSuggestions = useCallback(
    async (query: string) => {
      const res = await api.get<{ value: string; label: string }[]>(
        `/api/provider/products/suggestions?field=supplier&q=${encodeURIComponent(query)}`
      );
      if (res.error || !res.data) return [];
      return Array.isArray(res.data) ? res.data : [];
    },
    []
  );

  const isSaving = creating || updating;

  const onRefresh = useCallback(() => {
    refreshList();
    refreshMetrics();
  }, [refreshList, refreshMetrics]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const openEdit = async (p: Product) => {
    setEditingProduct(p);
    const hasVariants = Boolean(p.has_variants && (p.variants?.length ?? 0) > 0);
    if (hasVariants && (!p.variant_option_types?.length || !p.variants?.length)) {
      setLoadingProduct(true);
      try {
        const res = await api.get<{ variants?: ProductVariant[]; variant_option_types?: { name: string; values: string[] }[] }>(
          `/api/provider/products/${p.id}`
        );
        const detail = res.data && typeof res.data === "object" ? res.data : {};
        const fullProduct: Product = { ...p, ...detail };
        const optTypes = fullProduct.variant_option_types ?? p.variant_option_types ?? [];
        const vars = fullProduct.variants ?? p.variants ?? [];
        setForm({
          name: fullProduct.name ?? p.name ?? "",
          retail_price: "",
          category: fullProduct.category ?? p.category ?? "",
          sku: "",
          quantity: "",
          low_stock_level: "5",
          short_description: fullProduct.short_description ?? p.short_description ?? "",
          barcode: fullProduct.barcode ?? p.barcode ?? "",
          brand: fullProduct.brand ?? p.brand ?? "",
          supplier: fullProduct.supplier ?? p.supplier ?? "",
          tax_rate: String(fullProduct.tax_rate ?? p.tax_rate ?? 0),
          track_stock_quantity: (fullProduct.track_stock_quantity ?? p.track_stock_quantity) !== false,
          hasVariants: true,
          variantOptionName: optTypes[0]?.name ?? "Option",
          variantOptionValues: (optTypes[0]?.values ?? []).join(", "),
          variantRows: vars.map((v: ProductVariant) => ({
            option_values: v.option_values ?? {},
            sku: v.sku ?? "",
            quantity: v.quantity ?? 0,
            supply_price: v.supply_price ?? 0,
            retail_price: v.retail_price ?? 0,
            low_stock_level: v.low_stock_level ?? 5,
          })),
        });
      } catch {
        setForm({
          name: p.name ?? "",
          retail_price: "",
          category: p.category ?? "",
          sku: "",
          quantity: "",
          low_stock_level: "5",
          short_description: p.short_description ?? "",
          barcode: p.barcode ?? "",
          brand: "",
          supplier: "",
          tax_rate: String(p.tax_rate ?? 0),
          track_stock_quantity: p.track_stock_quantity !== false,
          hasVariants: true,
          variantOptionName: "Option",
          variantOptionValues: "",
          variantRows: (p.variants ?? []).map((v) => ({
            option_values: v.option_values ?? {},
            sku: v.sku ?? "",
            quantity: v.quantity ?? 0,
            supply_price: v.supply_price ?? 0,
            retail_price: v.retail_price ?? 0,
            low_stock_level: 5,
          })),
        });
      } finally {
        setLoadingProduct(false);
      }
    } else if (hasVariants) {
      const optTypes = p.variant_option_types ?? [];
      const vars = p.variants ?? [];
      setForm({
        name: p.name ?? "",
        retail_price: "",
        category: p.category ?? "",
        sku: "",
        quantity: "",
        low_stock_level: "5",
        short_description: p.short_description ?? "",
        barcode: p.barcode ?? "",
        brand: p.brand ?? "",
        supplier: p.supplier ?? "",
        tax_rate: String(p.tax_rate ?? 0),
        track_stock_quantity: p.track_stock_quantity !== false,
        hasVariants: true,
        variantOptionName: optTypes[0]?.name ?? "Option",
        variantOptionValues: (optTypes[0]?.values ?? []).join(", "),
        variantRows: vars.map((v) => ({
          option_values: v.option_values ?? {},
          sku: v.sku ?? "",
          quantity: v.quantity ?? 0,
          supply_price: v.supply_price ?? 0,
          retail_price: v.retail_price ?? 0,
          low_stock_level: v.low_stock_level ?? 5,
        })),
      });
    } else {
      setForm({
        name: p.name ?? "",
        retail_price: String(p.retail_price ?? ""),
        category: p.category ?? "",
        sku: p.sku ?? "",
        quantity: String(p.quantity ?? ""),
        low_stock_level: String(p.low_stock_level ?? 5),
        short_description: p.short_description ?? "",
        barcode: p.barcode ?? "",
        brand: "",
        supplier: "",
        tax_rate: String(p.tax_rate ?? 0),
        track_stock_quantity: p.track_stock_quantity !== false,
        hasVariants: false,
        variantOptionName: "",
        variantOptionValues: "",
        variantRows: [],
      });
    }
    setFormOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert("Required", "Product name is required.");
      return;
    }

    const withVariants = form.hasVariants && form.variantRows.length > 0;
    if (withVariants) {
      const invalid = form.variantRows.some(
        (r) => r.retail_price === undefined || Number(r.retail_price) < 0
      );
      if (invalid) {
        Alert.alert("Required", `Each variant must have a retail price (${getTenantDefaultCurrency()}).`);
        return;
      }
    } else {
      const retailPrice = parseFloat(form.retail_price);
      if (Number.isNaN(retailPrice) || retailPrice < 0) {
        Alert.alert("Required", "Enter a valid retail price.");
        return;
      }
    }

    // §Provider-audit 2026-04 (C2 CRITICAL): the quick add/edit modal used
    // to collect `barcode` in the form but never forwarded it to the API,
    // silently dropping scans. Forward it alongside SKU for both create
    // and update paths (matches the full `product-form.tsx` flow).
    const barcodeTrim = form.barcode.trim();
    // §Provider-audit 2026-04 (follow-up): forward tax_rate + track_stock_quantity
    // from the quick modal — both are accepted by POST/PATCH /api/provider/products
    // but were silently dropped by the old modal.
    const taxRateTrim = form.tax_rate.trim();
    const taxRateNumber = taxRateTrim === "" ? undefined : Number(taxRateTrim);
    const taxRatePayload =
      taxRateNumber !== undefined && Number.isFinite(taxRateNumber) && taxRateNumber >= 0
        ? taxRateNumber
        : undefined;
    if (editingProduct) {
      const payload: Record<string, unknown> = {
        name,
        category: form.category.trim() || undefined,
        short_description: form.short_description.trim() || undefined,
        brand: form.brand.trim() || undefined,
        supplier: form.supplier.trim() || undefined,
        barcode: barcodeTrim || undefined,
        tax_rate: taxRatePayload,
        track_stock_quantity: form.track_stock_quantity,
      };
      if (withVariants) {
        const optionName = form.variantOptionName.trim() || "Option";
        const values = form.variantOptionValues.split(",").map((v) => v.trim()).filter(Boolean);
        payload.has_variants = true;
        payload.variant_option_types = [{ name: optionName, values }];
        payload.variants = form.variantRows.map((r) => ({
          option_values: r.option_values,
          sku: r.sku.trim() || undefined,
          quantity: r.quantity ?? 0,
          low_stock_level: r.low_stock_level ?? 5,
          supply_price: r.supply_price ?? 0,
          retail_price: Number(r.retail_price),
        }));
      } else {
        payload.has_variants = false;
        payload.retail_price = parseFloat(form.retail_price);
        payload.sku = form.sku.trim() || undefined;
        payload.quantity = form.quantity.trim() ? parseInt(form.quantity, 10) : undefined;
        payload.low_stock_level = form.low_stock_level.trim() ? parseInt(form.low_stock_level, 10) : undefined;
      }
      const { error: err } = await patchProduct(`/api/provider/products/${editingProduct.id}`, payload);
      if (err) {
        Alert.alert("Error", err);
        return;
      }
    } else {
      const payload: Record<string, unknown> = {
        name,
        category: form.category.trim() || undefined,
        short_description: form.short_description.trim() || undefined,
        brand: form.brand.trim() || undefined,
        supplier: form.supplier.trim() || undefined,
        barcode: barcodeTrim || undefined,
        tax_rate: taxRatePayload,
        track_stock_quantity: form.track_stock_quantity,
      };
      if (withVariants) {
        const optionName = form.variantOptionName.trim() || "Option";
        const values = form.variantOptionValues.split(",").map((v) => v.trim()).filter(Boolean);
        payload.has_variants = true;
        payload.variant_option_types = [{ name: optionName, values }];
        payload.variants = form.variantRows.map((r) => ({
          option_values: r.option_values,
          sku: r.sku.trim() || undefined,
          quantity: r.quantity ?? 0,
          low_stock_level: r.low_stock_level ?? 5,
          supply_price: r.supply_price ?? 0,
          retail_price: Number(r.retail_price),
        }));
      } else {
        payload.retail_price = parseFloat(form.retail_price);
        payload.sku = form.sku.trim() || undefined;
        payload.quantity = form.quantity.trim() ? parseInt(form.quantity, 10) : undefined;
        payload.low_stock_level = form.low_stock_level.trim() ? parseInt(form.low_stock_level, 10) : undefined;
      }
      const { error: err } = await postProduct("/api/provider/products", payload);
      if (err) {
        Alert.alert("Error", err);
        return;
      }
    }
    setFormOpen(false);
    refreshList();
    refreshMetrics();
  };

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
              refreshList();
              refreshMetrics();
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
    <>
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
            <View style={{ marginBottom: 16, height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#ede9fe" }}>
              <Ionicons name="cube-outline" size={32} color="#8b5cf6" />
            </View>
            <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>No products yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Add your first product in one step. Name and price are all you need; the rest is optional.
            </Text>
            <TouchableOpacity
              onPress={openCreate}
              style={{ marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#8b5cf6", paddingHorizontal: 24, paddingVertical: 12 }}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.white }}>Add product</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{ marginBottom: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 12 }}>
                <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Active products</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{metricsData?.totalProducts ?? "—"}</Text>
                <Text style={{ fontSize: 10, color: Colors.gray[400], marginTop: 2 }}>Same basis as web metrics</Text>
              </View>
              <View style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 12 }}>
                <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Retail / Internal</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#db2777" }}>{retailCount} retail</Text>
                <Text style={{ fontSize: 12, color: Colors.gray[600] }}>{internalCount} internal-only</Text>
              </View>
              <View style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 12 }}>
                <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Stock value (est.)</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }} numberOfLines={1}>
                  {formatCurrency(metricsData?.totalInventoryValue ?? 0)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: "45%", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 12 }}>
                <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Low / out</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#dc2626" }}>{lowOutCombined}</Text>
                <Text style={{ fontSize: 11, color: Colors.gray[500] }}>matches platform metrics</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={openCreate}
              style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "#c4b5fd", backgroundColor: "#f5f3ff", paddingVertical: 12 }}
            >
              <Ionicons name="add" size={18} color="#8b5cf6" />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: "#6d28d9" }}>Add product</Text>
            </TouchableOpacity>
            <Text style={{ marginBottom: 12, fontSize: 14, color: Colors.gray[500] }}>
              {displayProducts.length} product{displayProducts.length !== 1 ? "s" : ""} loaded
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
                        onPress={() => openEdit(p)}
                        style={{
                          marginRight: 8,
                          height: 36,
                          width: 36,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 8,
                          backgroundColor: Colors.gray[100],
                        }}
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

      {/* Single consolidated Add/Edit form – everything on one screen, no leaving */}
      <Modal visible={formOpen} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          style={{ flex: 1, backgroundColor: Colors.white }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
        >
          <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.gray[100], paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>
                {editingProduct ? "Edit product" : "New product"}
              </Text>
              <TouchableOpacity onPress={() => setFormOpen(false)} style={{ padding: 8 }}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            {editingProduct && (
              <TouchableOpacity
                onPress={() => {
                  setFormOpen(false);
                  setEditingProduct(null);
                  router.push({ pathname: "/(app)/(tabs)/more/product-form", params: { id: editingProduct.id } } as never);
                }}
                style={{ flexDirection: "row", alignItems: "center", marginTop: 4, paddingVertical: 4 }}
              >
                <Ionicons name="open-outline" size={16} color="#6d28d9" />
                <Text style={{ marginLeft: 6, fontSize: 14, color: "#6d28d9", fontWeight: "500" }}>Edit in full form</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 16 }}
            contentContainerStyle={{ paddingBottom: 220 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {loadingProduct ? (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <LoadingState />
              </View>
            ) : (
              <>
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Name *</Text>
            <TextInput
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Shampoo 250ml"
              placeholderTextColor="#9ca3af"
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            />

            <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Has variants (e.g. sizes)</Text>
              <Switch
                value={form.hasVariants}
                onValueChange={(v) => setForm((f) => ({ ...f, hasVariants: v, variantRows: v ? f.variantRows : [] }))}
                trackColor={{ false: "#d1d5db", true: "#8b5cf6" }}
                thumbColor="#fff"
              />
            </View>

            {!form.hasVariants && (
              <>
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Retail price ({getTenantDefaultCurrency()}) *</Text>
            <TextInput
              value={form.retail_price}
              onChangeText={(v) => setForm((f) => ({ ...f, retail_price: v }))}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            />
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>SKU</Text>
            <TextInput
              value={form.sku}
              onChangeText={(v) => setForm((f) => ({ ...f, sku: v }))}
              placeholder="Leave blank to auto-generate"
              placeholderTextColor="#9ca3af"
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            />
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Quantity in stock</Text>
            <TextInput
              value={form.quantity}
              onChangeText={(v) => setForm((f) => ({ ...f, quantity: v }))}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            />
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Low stock alert at</Text>
            <TextInput
              value={form.low_stock_level}
              onChangeText={(v) => setForm((f) => ({ ...f, low_stock_level: v }))}
              placeholder="5"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            />
            {/* §Provider-audit 2026-04 (follow-up): track-stock toggle lives inside
                the non-variant branch because variants manage their own quantity.
                Disabling this prevents any "sold out" treatment on the customer PDP. */}
            <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Track stock quantity</Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>Turn off for unlimited / made-to-order items.</Text>
              </View>
              <Switch
                value={form.track_stock_quantity}
                onValueChange={(v) => setForm((f) => ({ ...f, track_stock_quantity: v }))}
                trackColor={{ false: "#d1d5db", true: "#8b5cf6" }}
                thumbColor="#fff"
              />
            </View>
              </>
            )}
            {/* §Provider-audit 2026-04 (follow-up): tax rate applies to both
                variant and non-variant products (it is a product-level column). */}
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Tax rate (%)</Text>
            <TextInput
              value={form.tax_rate}
              onChangeText={(v) => setForm((f) => ({ ...f, tax_rate: v }))}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            />
            <Text style={{ marginTop: -8, marginBottom: 16, fontSize: 12, color: Colors.gray[500] }}>
              Leave at 0 for tax-free items. Use the full product form for reference-list options.
            </Text>

            {form.hasVariants && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Option name (e.g. Size)</Text>
                <TextInput
                  value={form.variantOptionName}
                  onChangeText={(v) => setForm((f) => ({ ...f, variantOptionName: v }))}
                  placeholder="Size"
                  placeholderTextColor="#9ca3af"
                  style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                />
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Option values</Text>
                <View style={{ marginBottom: 12 }}>
                  <ChipCombobox
                    value={form.variantOptionValues.split(",").map((v) => v.trim()).filter(Boolean)}
                    onChange={(arr) => setForm((f) => ({ ...f, variantOptionValues: arr.join(", ") }))}
                    staticSuggestions={[
                      { value: "250ml", label: "250ml" },
                      { value: "500ml", label: "500ml" },
                      { value: "1L", label: "1L" },
                      { value: "S", label: "S" },
                      { value: "M", label: "M" },
                      { value: "L", label: "L" },
                    ]}
                    placeholder="e.g. 250ml, 500ml or tap suggestions"
                    accessibilityLabel="Option values"
                  />
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const name = (form.variantOptionName.trim() || "Option").trim();
                    const values = form.variantOptionValues.split(",").map((v) => v.trim()).filter(Boolean);
                    if (!values.length) {
                      Alert.alert("Add values", "Add at least one option value (tap a suggestion or type and press Add).");
                      return;
                    }
                    const rows: VariantRow[] = values.map((val) => ({
                      option_values: { [name]: val },
                      sku: "",
                      quantity: 0,
                      supply_price: 0,
                      retail_price: 0,
                      low_stock_level: 5,
                    }));
                    setForm((f) => ({ ...f, variantRows: rows }));
                  }}
                  style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: "#c4b5fd", backgroundColor: "#f5f3ff", paddingVertical: 12, alignItems: "center" }}
                >
                  <Text style={{ fontWeight: "500", color: "#6d28d9" }}>Generate variants</Text>
                </TouchableOpacity>
                {form.variantRows.length > 0 && (
                  <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], overflow: "hidden" }}>
                    {form.variantRows.map((row, idx) => (
                      <View key={idx} style={{ borderBottomWidth: idx < form.variantRows.length - 1 ? 1 : 0, borderBottomColor: Colors.gray[200], padding: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500], marginBottom: 8 }}>{Object.values(row.option_values).join(", ")}</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                          <View style={{ flex: 1, minWidth: 80, marginRight: 8, marginBottom: 8 }}>
                            <Text style={{ fontSize: 12, color: Colors.gray[500] }}>SKU</Text>
                            <TextInput
                              value={row.sku}
                              onChangeText={(v) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], sku: v };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                              placeholder="Auto"
                              placeholderTextColor="#9ca3af"
                              style={{ borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14 }}
                            />
                          </View>
                          <View style={{ width: 64, marginRight: 8, marginBottom: 8 }}>
                            <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Qty</Text>
                            <TextInput
                              value={String(row.quantity)}
                              onChangeText={(v) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], quantity: parseInt(v, 10) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                              keyboardType="number-pad"
                              placeholderTextColor="#9ca3af"
                              style={{ borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14 }}
                            />
                          </View>
                          <View style={{ width: 80 }}>
                            <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Supply price</Text>
                            <TextInput
                              value={row.supply_price ? String(row.supply_price) : ""}
                              onChangeText={(v) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], supply_price: parseFloat(v) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor="#9ca3af"
                              style={{ borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14 }}
                            />
                          </View>
                          <View style={{ width: 80 }}>
                            <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Retail price *</Text>
                            <TextInput
                              value={row.retail_price ? String(row.retail_price) : ""}
                              onChangeText={(v) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], retail_price: parseFloat(v) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor="#9ca3af"
                              style={{ borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14 }}
                            />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Category</Text>
            <View style={{ marginBottom: 16 }}>
              <ChipCombobox
                singleSelect
                value={form.category || null}
                onChange={(v) => setForm((f) => ({ ...f, category: v ?? "" }))}
                fetchSuggestions={fetchCategorySuggestions}
                staticSuggestions={[]}
                placeholder="e.g. Hair care"
                accessibilityLabel="Category"
              />
            </View>
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Short description</Text>
            <TextInput
              value={form.short_description}
              onChangeText={(v) => setForm((f) => ({ ...f, short_description: v }))}
              placeholder="Optional"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={2}
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900], minHeight: 80 }}
            />
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Barcode</Text>
            <TextInput
              value={form.barcode}
              onChangeText={(v) => setForm((f) => ({ ...f, barcode: v }))}
              placeholder="Optional"
              placeholderTextColor="#9ca3af"
              style={{ marginBottom: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            />
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Brand</Text>
            <View style={{ marginBottom: 16 }}>
              <ChipCombobox
                singleSelect
                value={form.brand || null}
                onChange={(v) => setForm((f) => ({ ...f, brand: v ?? "" }))}
                fetchSuggestions={fetchBrandSuggestions}
                staticSuggestions={[]}
                placeholder="Optional"
                accessibilityLabel="Brand"
              />
            </View>
            <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Supplier</Text>
            <View style={{ marginBottom: 24 }}>
              <ChipCombobox
                singleSelect
                value={form.supplier || null}
                onChange={(v) => setForm((f) => ({ ...f, supplier: v ?? "" }))}
                fetchSuggestions={fetchSupplierSuggestions}
                staticSuggestions={[]}
                placeholder="Optional"
                accessibilityLabel="Supplier"
              />
            </View>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={{ alignItems: "center", borderRadius: 12, backgroundColor: "#8b5cf6", paddingVertical: 14 }}
            >
              <Text style={{ fontWeight: "600", color: Colors.white }}>
                {isSaving ? "Saving…" : editingProduct ? "Update product" : "Create product"}
              </Text>
            </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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

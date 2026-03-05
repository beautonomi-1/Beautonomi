import { useCallback, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

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
}

interface ProductsResponse {
  products?: Product[];
  total?: number;
  page?: number;
  total_pages?: number;
}

type VariantRow = {
  option_values: Record<string, string>;
  sku: string;
  quantity: number;
  supply_price: number;
  retail_price: number;
  low_stock_level: number;
};

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
  hasVariants: false,
  variantOptionName: "",
  variantOptionValues: "",
  variantRows: [] as VariantRow[],
};

/** Content-only for use in Products hub (Products tab). */
export function ProductsContent() {
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [loadingProduct, setLoadingProduct] = useState(false);

  const { data: productsData, loading: loadingList, error, refresh: refreshList } = useApi<ProductsResponse>("/api/provider/products");
  const { execute: postProduct, loading: creating } = useApiMutation("post");
  const { execute: patchProduct, loading: updating } = useApiMutation("patch");
  const { execute: deleteProduct } = useApiMutation("delete");

  const isSaving = creating || updating;

  const onRefresh = useCallback(() => {
    refreshList();
  }, [refreshList]);

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
        const data = res.data as any;
        const fullProduct = data ?? p;
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
          barcode: "",
          brand: fullProduct.brand ?? p.brand ?? "",
          supplier: fullProduct.supplier ?? p.supplier ?? "",
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
          barcode: "",
          brand: "",
          supplier: "",
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
        barcode: "",
        brand: p.brand ?? "",
        supplier: p.supplier ?? "",
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
        barcode: "",
        brand: "",
        supplier: "",
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
        Alert.alert("Required", "Each variant must have a retail price (R).");
        return;
      }
    } else {
      const retailPrice = parseFloat(form.retail_price);
      if (Number.isNaN(retailPrice) || retailPrice < 0) {
        Alert.alert("Required", "Enter a valid retail price.");
        return;
      }
    }

    if (editingProduct) {
      const payload: Record<string, unknown> = {
        name,
        category: form.category.trim() || undefined,
        short_description: form.short_description.trim() || undefined,
        brand: form.brand.trim() || undefined,
        supplier: form.supplier.trim() || undefined,
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
            else refreshList();
          },
        },
      ]
    );
  };

  const displayProducts = productsData?.products ?? [];

  const productDisplayPrice = (p: Product): string => {
    if (p.has_variants && p.variants?.length) {
      const min = Math.min(...p.variants.map((v) => Number(v.retail_price ?? 0)));
      return `From R ${min.toFixed(2)}`;
    }
    return `R ${Number(p.retail_price).toFixed(2)}`;
  };

  const isLoading = loadingList;

  if (error && !productsData) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={onRefresh} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#1a1f3c" />
        }
      >
        {isLoading && displayProducts.length === 0 ? (
          <View className="py-12">
            <LoadingState />
          </View>
        ) : displayProducts.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6 py-16">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-violet-100">
              <Ionicons name="cube-outline" size={32} color="#8b5cf6" />
            </View>
            <Text className="text-center text-lg font-semibold text-gray-900">No products yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Add your first product in one step. Name and price are all you need; the rest is optional.
            </Text>
            <TouchableOpacity
              onPress={openCreate}
              className="mt-6 flex-row items-center justify-center rounded-xl bg-[#8b5cf6] px-6 py-3"
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text className="ml-2 font-medium text-white">Add product</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="px-4">
            <TouchableOpacity
              onPress={openCreate}
              className="mb-3 flex-row items-center justify-center rounded-xl border border-violet-200 bg-violet-50 py-3"
            >
              <Ionicons name="add" size={18} color="#8b5cf6" />
              <Text className="ml-2 font-medium text-violet-700">Add product</Text>
            </TouchableOpacity>
            <Text className="mb-3 text-sm text-gray-500">
              {displayProducts.length} product{displayProducts.length !== 1 ? "s" : ""}
            </Text>
            {displayProducts.map((p) => (
              <View
                key={p.id}
                className="mb-3 flex-row items-center rounded-xl border border-gray-100 bg-white p-4"
              >
                <View className="flex-1 min-w-0">
                  <Text className="font-medium text-gray-900" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text className="mt-0.5 text-sm text-gray-600">
                    {productDisplayPrice(p)}
                    {p.category ? ` · ${p.category}` : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => openEdit(p)}
                  className="mr-2 h-9 w-9 items-center justify-center rounded-lg bg-gray-100"
                >
                  <Ionicons name="create-outline" size={18} color="#6b7280" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(p)}
                  className="h-9 w-9 items-center justify-center rounded-lg bg-red-50"
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Single consolidated Add/Edit form – everything on one screen, no leaving */}
      <Modal visible={formOpen} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 bg-white"
        >
          <View className="border-b border-gray-100 px-4 py-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-gray-900">
              {editingProduct ? "Edit product" : "New product"}
            </Text>
            <TouchableOpacity onPress={() => setFormOpen(false)} className="p-2">
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
            {loadingProduct ? (
              <View className="py-8 items-center">
                <LoadingState />
              </View>
            ) : (
              <>
            <Text className="mb-1.5 text-sm font-medium text-gray-700">Name *</Text>
            <TextInput
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Shampoo 250ml"
              placeholderTextColor="#9ca3af"
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />

            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-sm font-medium text-gray-700">Has variants (e.g. sizes)</Text>
              <Switch
                value={form.hasVariants}
                onValueChange={(v) => setForm((f) => ({ ...f, hasVariants: v, variantRows: v ? f.variantRows : [] }))}
                trackColor={{ false: "#d1d5db", true: "#8b5cf6" }}
                thumbColor="#fff"
              />
            </View>

            {!form.hasVariants && (
              <>
            <Text className="mb-1.5 text-sm font-medium text-gray-700">Retail price (R) *</Text>
            <TextInput
              value={form.retail_price}
              onChangeText={(v) => setForm((f) => ({ ...f, retail_price: v }))}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />

            <Text className="mb-1.5 text-sm font-medium text-gray-700">SKU</Text>
            <TextInput
              value={form.sku}
              onChangeText={(v) => setForm((f) => ({ ...f, sku: v }))}
              placeholder="Leave blank to auto-generate"
              placeholderTextColor="#9ca3af"
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />

            <Text className="mb-1.5 text-sm font-medium text-gray-700">Quantity in stock</Text>
            <TextInput
              value={form.quantity}
              onChangeText={(v) => setForm((f) => ({ ...f, quantity: v }))}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />

            <Text className="mb-1.5 text-sm font-medium text-gray-700">Low stock alert at</Text>
            <TextInput
              value={form.low_stock_level}
              onChangeText={(v) => setForm((f) => ({ ...f, low_stock_level: v }))}
              placeholder="5"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />
              </>
            )}

            {form.hasVariants && (
              <View className="mb-4">
                <Text className="mb-1.5 text-sm font-medium text-gray-700">Option name (e.g. Size)</Text>
                <TextInput
                  value={form.variantOptionName}
                  onChangeText={(v) => setForm((f) => ({ ...f, variantOptionName: v }))}
                  placeholder="Size"
                  placeholderTextColor="#9ca3af"
                  className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                />
                <Text className="mb-1.5 text-sm font-medium text-gray-700">Option values (comma-separated)</Text>
                <TextInput
                  value={form.variantOptionValues}
                  onChangeText={(v) => setForm((f) => ({ ...f, variantOptionValues: v }))}
                  placeholder="250ml, 500ml"
                  placeholderTextColor="#9ca3af"
                  className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                />
                <TouchableOpacity
                  onPress={() => {
                    const name = (form.variantOptionName.trim() || "Option").trim();
                    const values = form.variantOptionValues.split(",").map((v) => v.trim()).filter(Boolean);
                    if (!values.length) {
                      Alert.alert("Add values", "Enter at least one option value (e.g. 250ml, 500ml).");
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
                  className="mb-3 rounded-xl border border-violet-300 bg-violet-50 py-3 items-center"
                >
                  <Text className="font-medium text-violet-700">Generate variants</Text>
                </TouchableOpacity>
                {form.variantRows.length > 0 && (
                  <View className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                    {form.variantRows.map((row, idx) => (
                      <View key={idx} className="border-b border-gray-200 p-3 last:border-b-0">
                        <Text className="text-xs font-medium text-gray-500 mb-2">
                          {Object.values(row.option_values).join(", ")}
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          <View className="flex-1 min-w-[80]">
                            <Text className="text-xs text-gray-500">SKU</Text>
                            <TextInput
                              value={row.sku}
                              onChangeText={(v) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], sku: v };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                              placeholder="Auto"
                              placeholderTextColor="#9ca3af"
                              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                            />
                          </View>
                          <View className="w-16">
                            <Text className="text-xs text-gray-500">Qty</Text>
                            <TextInput
                              value={String(row.quantity)}
                              onChangeText={(v) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], quantity: parseInt(v, 10) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                              keyboardType="number-pad"
                              placeholderTextColor="#9ca3af"
                              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                            />
                          </View>
                          <View className="w-20">
                            <Text className="text-xs text-gray-500">Supply R</Text>
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
                              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                            />
                          </View>
                          <View className="w-20">
                            <Text className="text-xs text-gray-500">Retail R *</Text>
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
                              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                            />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            <Text className="mb-1.5 text-sm font-medium text-gray-700">Category</Text>
            <TextInput
              value={form.category}
              onChangeText={(v) => setForm((f) => ({ ...f, category: v }))}
              placeholder="e.g. Hair care"
              placeholderTextColor="#9ca3af"
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />

            <Text className="mb-1.5 text-sm font-medium text-gray-700">Short description</Text>
            <TextInput
              value={form.short_description}
              onChangeText={(v) => setForm((f) => ({ ...f, short_description: v }))}
              placeholder="Optional"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={2}
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 min-h-[80px]"
            />

            <Text className="mb-1.5 text-sm font-medium text-gray-700">Barcode</Text>
            <TextInput
              value={form.barcode}
              onChangeText={(v) => setForm((f) => ({ ...f, barcode: v }))}
              placeholder="Optional"
              placeholderTextColor="#9ca3af"
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />

            <Text className="mb-1.5 text-sm font-medium text-gray-700">Brand</Text>
            <TextInput
              value={form.brand}
              onChangeText={(v) => setForm((f) => ({ ...f, brand: v }))}
              placeholder="Optional"
              placeholderTextColor="#9ca3af"
              className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />

            <Text className="mb-1.5 text-sm font-medium text-gray-700">Supplier</Text>
            <TextInput
              value={form.supplier}
              onChangeText={(v) => setForm((f) => ({ ...f, supplier: v }))}
              placeholder="Optional"
              placeholderTextColor="#9ca3af"
              className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            />

            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              className="items-center rounded-xl bg-[#8b5cf6] py-3.5"
            >
              <Text className="font-semibold text-white">
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

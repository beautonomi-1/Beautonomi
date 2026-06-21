import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, Switch, Alert, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import { emitProviderProductsCatalogChanged } from "@/lib/provider-products-catalog-events";
import { buildProductPayload } from "@/features/products/buildProductPayload";
import { validateProductForm } from "@/features/products/validateProductForm";
import { computeMarkupFromPrices, computeRetailFromMarkup } from "@/features/products/markupCalc";
import { ProductGalleryUpload } from "@/features/products/ProductGalleryUpload";
import { VariantMatrixEditor } from "@/features/products/VariantMatrixEditor";
import { BarcodeScannerModal } from "@/features/products/BarcodeScannerModal";
import { Ionicons } from "@expo/vector-icons";

interface ProductVariantRow {
  id?: string;
  option_values?: Record<string, string>;
  retail_price: number;
  quantity?: number;
  supply_price?: number;
  sku?: string | null;
  barcode?: string | null;
  low_stock_level?: number;
  reorder_quantity?: number;
  markup?: number | null;
  image_url?: string | null;
  measure?: string | null;
  amount?: number | null;
}

interface Product {
  id: string;
  name: string;
  barcode?: string;
  brand?: string;
  measure?: string;
  amount?: number;
  short_description?: string;
  description?: string;
  category?: string;
  supplier?: string;
  sku?: string;
  quantity: number;
  low_stock_level?: number;
  reorder_quantity?: number;
  supply_price?: number;
  retail_price: number;
  retail_sales_enabled?: boolean;
  markup?: number;
  tax_rate?: number;
  team_member_commission_enabled?: boolean;
  track_stock_quantity?: boolean;
  receive_low_stock_notifications?: boolean;
  image_urls?: string[];
  is_active?: boolean;
  has_variants?: boolean;
  variant_option_types?: { name: string; values: string[] }[];
  variants?: ProductVariantRow[];
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label}</Text>
      <TextInput
        style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? "top" : "center"}
        accessibilityLabel={label}
      />
    </View>
  );
}

const MEASURE_OPTIONS = [
  { value: "ml", label: "Milliliters (ml)" },
  { value: "L", label: "Liters (L)" },
  { value: "g", label: "Grams (g)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "unit", label: "Unit" },
];

type VariantOptionTypeForm = { name: string; values: string[] };

type VariantFormRow = {
  option_values: Record<string, string>;
  sku: string;
  barcode: string;
  quantity: number;
  supply_price: number;
  retail_price: number;
  low_stock_level: number;
  reorder_quantity: number;
  markup: number;
  image_url: string;
  measure: string;
  amount: number;
};

const defaultForm = {
  name: "",
  barcode: "",
  brand: "",
  measure: "ml",
  amount: "",
  short_description: "",
  description: "",
  category: "",
  supplier: "",
  sku: "",
  image_urls: [] as string[],
  quantity: "0",
  low_stock_level: "5",
  reorder_quantity: "0",
  supply_price: "0",
  retail_price: "",
  retail_sales_enabled: true,
  markup: "",
  tax_rate: "0",
  team_member_commission_enabled: false,
  track_stock_quantity: true,
  receive_low_stock_notifications: false,
  is_active: true,
  hasVariants: false,
  /** One or more option dimensions (e.g. Size + Colour); values combine in a full matrix. */
  variantOptionTypes: [] as VariantOptionTypeForm[],
  variantRows: [] as VariantFormRow[],
};

export default function ProductFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = params.id;

  const { data: product, loading: loadingProduct, error: productError } = useApi<Product>(
    productId ? `/api/provider/products/${productId}` : "",
    { enabled: !!productId }
  );

  const { execute: createProduct, loading: creating } = useApiMutation("post");
  const { execute: updateProduct, loading: updating } = useApiMutation("patch");
  const { execute: deleteProduct, loading: deleting } = useApiMutation("delete");
  const { execute: postMutation } = useApiMutation("post");

  const { data: brandsData, refresh: refreshBrands } = useApi<{ name: string }[] | unknown>("/api/provider/brands");
  const { data: suppliersData, refresh: refreshSuppliers } = useApi<{ name: string }[] | unknown>("/api/provider/suppliers");
  const { data: categoriesData, refresh: refreshCategories } = useApi<{ id: string; name: string }[] | unknown>("/api/provider/product-categories");
  const { data: refData } = useApi<Record<string, { value: string; label: string }[]> | unknown>(
    "/api/provider/reference-data?type=product_unit,tax_rate"
  );

  const brands = Array.isArray(brandsData) ? brandsData : [];
  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];
  const categories = Array.isArray(categoriesData) ? categoriesData : [];
  const refObj = refData && typeof refData === "object" && !Array.isArray(refData) ? refData as Record<string, { value: string; label: string }[]> : {};
  const measureOptions = (refObj.product_unit?.length ? refObj.product_unit : MEASURE_OPTIONS).map((o) =>
    typeof o === "string" ? { value: o, label: o } : { value: o.value, label: o.label }
  );
  const taxOptions = refObj.tax_rate?.length ? refObj.tax_rate : [{ value: "0", label: "No tax" }, { value: "15", label: "15% VAT" }];

  const [form, setForm] = useState(defaultForm);
  const [brandSheetOpen, setBrandSheetOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [supplierSheetOpen, setSupplierSheetOpen] = useState(false);
  const [measureSheetOpen, setMeasureSheetOpen] = useState(false);
  const [taxSheetOpen, setTaxSheetOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [barcodeScanOpen, setBarcodeScanOpen] = useState(false);

  const handleCreateBrand = useCallback(async () => {
    const name = newBrandName.trim();
    if (!name) {
      Alert.alert("Validation", "Brand name is required.");
      return;
    }
    const { error } = await postMutation("/api/provider/brands", { name });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    setNewBrandName("");
    await refreshBrands();
    setForm((p) => ({ ...p, brand: name }));
    setBrandSheetOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newBrandName, postMutation, refreshBrands]);

  const handleCreateCategory = useCallback(async () => {
    const name = newCategoryName.trim();
    if (!name) {
      Alert.alert("Validation", "Category name is required.");
      return;
    }
    const { data: created, error } = await postMutation("/api/provider/product-categories", { name });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    const categoryName = (created as { name?: string } | null)?.name ?? name;
    setNewCategoryName("");
    await refreshCategories();
    setForm((p) => ({ ...p, category: categoryName }));
    setCategorySheetOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newCategoryName, postMutation, refreshCategories]);

  const handleCreateSupplier = useCallback(async () => {
    const name = newSupplierName.trim();
    if (!name) {
      Alert.alert("Validation", "Supplier name is required.");
      return;
    }
    const { error } = await postMutation("/api/provider/suppliers", { name });
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    setNewSupplierName("");
    await refreshSuppliers();
    setForm((p) => ({ ...p, supplier: name }));
    setSupplierSheetOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newSupplierName, postMutation, refreshSuppliers]);

  const generateSku = useCallback(() => {
    const ts = Date.now().toString().slice(-6);
    const prefix = form.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "") || "PROD";
    setForm((p) => ({ ...p, sku: `${prefix}-${ts}` }));
  }, [form.name]);

  useEffect(() => {
    if (product) {
      const hasV = Boolean(product.has_variants && (product.variants?.length ?? 0) > 0);
      const optTypes = product.variant_option_types ?? [];
      const variantOptionTypes: VariantOptionTypeForm[] =
        Array.isArray(optTypes) && optTypes.length > 0
          ? optTypes.map((t: { name?: string; values?: string[] }) => ({
              name: String(t?.name ?? ""),
              values: Array.isArray(t?.values) ? [...t.values] : [],
            }))
          : [{ name: "Size", values: [] }];
      const vars = product.variants ?? [];
      const urls = product.image_urls ?? [];
      setForm({
        ...defaultForm,
        name: product.name ?? "",
        barcode: product.barcode ?? "",
        brand: product.brand ?? "",
        measure: product.measure ?? "ml",
        amount: String(product.amount ?? ""),
        short_description: product.short_description ?? "",
        description: product.description ?? "",
        category: product.category ?? "",
        supplier: product.supplier ?? "",
        sku: product.sku ?? "",
        image_urls: urls,
        quantity: String(product.quantity ?? 0),
        low_stock_level: String(product.low_stock_level ?? 5),
        reorder_quantity: String(product.reorder_quantity ?? 0),
        supply_price: String(product.supply_price ?? 0),
        retail_price: String(product.retail_price ?? ""),
        retail_sales_enabled: product.retail_sales_enabled ?? true,
        markup: product.markup != null ? String(product.markup) : "",
        tax_rate: String(product.tax_rate ?? 0),
        team_member_commission_enabled: product.team_member_commission_enabled ?? false,
        track_stock_quantity: product.track_stock_quantity ?? true,
        receive_low_stock_notifications: product.receive_low_stock_notifications ?? false,
        is_active: product.is_active ?? true,
        hasVariants: hasV,
        variantOptionTypes,
        variantRows: hasV
          ? vars.map((v) => ({
              option_values: v.option_values ?? {},
              sku: v.sku ?? "",
              barcode: v.barcode ?? "",
              quantity: v.quantity ?? 0,
              supply_price: v.supply_price ?? 0,
              retail_price: v.retail_price ?? 0,
              low_stock_level: v.low_stock_level ?? 5,
              reorder_quantity: v.reorder_quantity ?? 0,
              markup: v.markup != null ? Number(v.markup) : 0,
              image_url: v.image_url ?? "",
              measure: v.measure ?? product.measure ?? "ml",
              amount: v.amount != null ? Number(v.amount) : 0,
            }))
          : [],
      });
    } else if (!productId) {
      setForm({ ...defaultForm });
    }
  }, [product, productId]);

  const handleDelete = () => {
    if (!productId) return;
    Alert.alert("Delete product", `Delete "${form.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error: err } = await deleteProduct(`/api/provider/products/${productId}`);
          if (err?.includes("booking")) {
            Alert.alert("Cannot delete", "Archive instead?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Archive",
                onPress: async () => {
                  await deleteProduct(`/api/provider/products/${productId}?archive=true`);
                  emitProviderProductsCatalogChanged();
                  router.back();
                },
              },
            ]);
            return;
          }
          if (err) Alert.alert("Error", err);
          else {
            emitProviderProductsCatalogChanged();
            router.back();
          }
        },
      },
    ]);
  };

  const isSaving = creating || updating;
  const isEdit = !!productId;

  const handleSave = async () => {
    const validationError = validateProductForm({
      name: form.name,
      hasVariants: form.hasVariants,
      variantRows: form.variantRows,
      retail_price: form.retail_price,
    });
    if (validationError) {
      Alert.alert("Validation", validationError);
      return;
    }

    if (form.hasVariants && form.variantRows.length === 0) {
      Alert.alert("Validation", "Generate at least one variant row before saving, or turn off Has variants.");
      return;
    }

    const { payload, withVariants } = buildProductPayload({
      ...form,
      image_urls: form.image_urls,
    });

    if (withVariants) {
      const validTypes = form.variantOptionTypes
        .map((t) => ({
          name: t.name.trim(),
          values: [...new Set(t.values.map((x) => x.trim()).filter(Boolean))],
        }))
        .filter((t) => t.name.length > 0 && t.values.length > 0);
      if (validTypes.length === 0) {
        Alert.alert(
          "Validation",
          "Add at least one option with a name and values. Use Generate variant matrix after editing options.",
        );
        return;
      }
    }

    if (isEdit && productId && !withVariants) {
      payload.variants = [];
    }

    if (isEdit && productId) {
      const { error } = await updateProduct(`/api/provider/products/${productId}`, payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      emitProviderProductsCatalogChanged();
      router.back();
    } else {
      const { error } = await createProduct("/api/provider/products", payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      emitProviderProductsCatalogChanged();
      router.back();
    }
  };

  if (productId && loadingProduct && !product) {
    return (
      <ScreenContainer>
        <ScreenHeader title={isEdit ? "Edit Product" : "Add Product"} />
        <LoadingState message="Loading product..." />
      </ScreenContainer>
    );
  }

  if (productId && productError && !product) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Edit Product" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center p-6")}>
          <Text style={twStyle("text-center text-gray-600")}>Product not found.</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={twStyle("mt-4")}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-indigo-600")}>Go back</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader
        title={isEdit ? "Edit Product" : "Add Product"}
        subtitle={
          isEdit
            ? product?.name
            : "Images, description, variants, tax, retail settings, and stock"
        }
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={twStyle("flex-1")}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={twStyle("px-1 pt-2")}>
            <FormField
              label="Product name *"
              value={form.name}
              onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
              placeholder="e.g. Shampoo 500ml"
            />
            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>SKU</Text>
                <TouchableOpacity
                  onPress={generateSku}
                  style={twStyle("py-1")}
                  accessibilityLabel="Generate SKU"
                  accessibilityRole="button"
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-600")}>Generate</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder="Leave empty to auto-generate"
                placeholderTextColor="#9ca3af"
                value={form.sku}
                onChangeText={(t) => setForm((p) => ({ ...p, sku: t }))}
                accessibilityLabel="SKU"
              />
            </View>
            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Barcode</Text>
                <TouchableOpacity
                  onPress={() => setBarcodeScanOpen(true)}
                  style={twStyle("flex-row items-center py-1")}
                  accessibilityLabel="Scan barcode"
                  accessibilityRole="button"
                >
                  <Ionicons name="barcode-outline" size={18} color="#4f46e5" />
                  <Text style={twStyle("ml-1 text-sm font-medium text-indigo-600")}>Scan</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder="Optional — scan packaging or type manually"
                placeholderTextColor="#9ca3af"
                value={form.barcode}
                onChangeText={(t) => setForm((p) => ({ ...p, barcode: t }))}
                accessibilityLabel="Barcode"
              />
            </View>

            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Category</Text>
                <TouchableOpacity
                  onPress={() => setCategorySheetOpen(true)}
                  style={twStyle("py-1")}
                  accessibilityLabel="Select or add product category"
                  accessibilityRole="button"
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-600")}>Select or add</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setCategorySheetOpen(true)}
                accessibilityLabel={`Product category, ${form.category || "Select product category"}`}
                accessibilityRole="button"
              >
                <Text style={twStyle(form.category ? "text-base text-gray-900" : "text-base text-gray-400")}>
                  {form.category || "Select product category"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Brand</Text>
                <TouchableOpacity
                  onPress={() => setBrandSheetOpen(true)}
                  style={twStyle("py-1")}
                  accessibilityLabel="Select or add brand"
                  accessibilityRole="button"
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-600")}>Select or add</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setBrandSheetOpen(true)}
                accessibilityLabel={`Brand, ${form.brand || "Select brand"}`}
                accessibilityRole="button"
              >
                <Text style={twStyle(form.brand ? "text-base text-gray-900" : "text-base text-gray-400")}>
                  {form.brand || "Select brand"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Supplier</Text>
                <TouchableOpacity
                  onPress={() => setSupplierSheetOpen(true)}
                  style={twStyle("py-1")}
                  accessibilityLabel="Select or add supplier"
                  accessibilityRole="button"
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-600")}>Select or add</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setSupplierSheetOpen(true)}
                accessibilityLabel={`Supplier, ${form.supplier || "Select supplier"}`}
                accessibilityRole="button"
              >
                <Text style={twStyle(form.supplier ? "text-base text-gray-900" : "text-base text-gray-400")}>
                  {form.supplier || "Select supplier"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Measure / unit</Text>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setMeasureSheetOpen(true)}
                accessibilityLabel={`Measure, ${measureOptions.find((o) => o.value === form.measure)?.label ?? form.measure ?? "Select measure"}`}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-base text-gray-900")}>
                  {measureOptions.find((o) => o.value === form.measure)?.label ?? form.measure ?? "Select measure"}
                </Text>
              </TouchableOpacity>
            </View>
            <FormField
              label="Amount (per unit)"
              value={form.amount}
              onChangeText={(t) => setForm((p) => ({ ...p, amount: t }))}
              placeholder="e.g. 500"
              keyboardType="decimal-pad"
            />
            <ProductGalleryUpload
              imageUrls={form.image_urls}
              onChange={(urls) => setForm((p) => ({ ...p, image_urls: urls }))}
            />

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Has variants (sizes, volumesâ€¦)</Text>
              <Switch
                value={form.hasVariants}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    hasVariants: v,
                    variantRows: v ? p.variantRows : [],
                    variantOptionTypes: v
                      ? p.variantOptionTypes.length > 0
                        ? p.variantOptionTypes
                        : [{ name: "Size", values: [] }]
                      : [],
                  }))
                }
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                thumbColor="#fff"
              />
            </View>

            {form.hasVariants && (
              <VariantMatrixEditor
                variantOptionTypes={form.variantOptionTypes}
                variantRows={form.variantRows}
                defaultMeasure={form.measure || "ml"}
                onChangeOptionTypes={(types) => setForm((p) => ({ ...p, variantOptionTypes: types }))}
                onChangeRows={(rows) => setForm((p) => ({ ...p, variantRows: rows }))}
              />
            )}

            {!form.hasVariants && (
              <>
            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>Pricing</Text>
            <View style={twStyle("mb-2 flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <FormField
                  label="Supply / cost price"
                  value={form.supply_price}
                  onChangeText={(t) => {
                    const supply = parseFloat(t) || 0;
                    const retail = parseFloat(form.retail_price) || 0;
                    setForm((p) => ({
                      ...p,
                      supply_price: t,
                      markup: String(computeMarkupFromPrices(supply, retail)),
                    }));
                  }}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={twStyle("flex-1")}>
                <FormField
                  label="Retail price *"
                  value={form.retail_price}
                  onChangeText={(t) => {
                    const retail = parseFloat(t) || 0;
                    const supply = parseFloat(form.supply_price) || 0;
                    setForm((p) => ({
                      ...p,
                      retail_price: t,
                      markup: String(computeMarkupFromPrices(supply, retail)),
                    }));
                  }}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <FormField
              label="Markup (%)"
              value={form.markup}
              onChangeText={(t) => {
                const markup = parseFloat(t) || 0;
                const supply = parseFloat(form.supply_price) || 0;
                setForm((p) => ({
                  ...p,
                  markup: t,
                  retail_price: String(computeRetailFromMarkup(supply, markup)),
                }));
              }}
              placeholder="Optional"
              keyboardType="decimal-pad"
            />
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Tax rate (%)</Text>
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                onPress={() => setTaxSheetOpen(true)}
              >
                <Text style={twStyle("text-base text-gray-900")}>
                  {taxOptions.find((o) => o.value === form.tax_rate)?.label ?? `${form.tax_rate}%`}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>Stock</Text>
            <View style={twStyle("mb-2 flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <FormField
                  label="Quantity"
                  value={form.quantity}
                  onChangeText={(t) => setForm((p) => ({ ...p, quantity: t }))}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </View>
              <View style={twStyle("flex-1")}>
                <FormField
                  label="Low stock level"
                  value={form.low_stock_level}
                  onChangeText={(t) => setForm((p) => ({ ...p, low_stock_level: t }))}
                  placeholder="5"
                  keyboardType="numeric"
                />
              </View>
              <View style={twStyle("flex-1")}>
                <FormField
                  label="Reorder qty"
                  value={form.reorder_quantity}
                  onChangeText={(t) => setForm((p) => ({ ...p, reorder_quantity: t }))}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </View>
            </View>
              </>
            )}

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Track stock</Text>
              <Switch
                value={form.track_stock_quantity}
                onValueChange={(v) => setForm((p) => ({ ...p, track_stock_quantity: v }))}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                thumbColor="#fff"
              />
            </View>
            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Retail sales enabled</Text>
              <Switch
                value={form.retail_sales_enabled}
                onValueChange={(v) => setForm((p) => ({ ...p, retail_sales_enabled: v }))}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                thumbColor="#fff"
              />
            </View>
            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Team commission</Text>
              <Switch
                value={form.team_member_commission_enabled}
                onValueChange={(v) => setForm((p) => ({ ...p, team_member_commission_enabled: v }))}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                thumbColor="#fff"
              />
            </View>
            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Low stock alerts</Text>
              <Switch
                value={form.receive_low_stock_notifications}
                onValueChange={(v) => setForm((p) => ({ ...p, receive_low_stock_notifications: v }))}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                thumbColor="#fff"
              />
            </View>
            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Active</Text>
              <Switch
                value={form.is_active}
                onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                thumbColor="#fff"
              />
            </View>

            <FormField
              label="Short description"
              value={form.short_description}
              onChangeText={(t) => setForm((p) => ({ ...p, short_description: t }))}
              placeholder="Brief description"
              multiline
            />
            <FormField
              label="Description"
              value={form.description}
              onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
              placeholder="Full description"
              multiline
            />
          </View>
        </ScrollView>

        <View style={twStyle("border-t border-gray-100 bg-white px-4 py-3")}>
          {isEdit && (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleting}
              style={twStyle("mb-3 items-center rounded-xl border border-red-200 py-3")}
            >
              <Text style={twStyle("font-medium text-red-600")}>{deleting ? "Deleting…" : "Delete product"}</Text>
            </TouchableOpacity>
          )}
          <ActionButton
            label={isSaving ? "Savingâ€¦" : isEdit ? "Save changes" : "Create product"}
            onPress={handleSave}
            loading={isSaving}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>

      {/* Brand: select or add */}
      <BottomSheet
        visible={brandSheetOpen}
        onClose={() => setBrandSheetOpen(false)}
        title="Brand"
        subtitle="Select or create a brand"
      >
        <ScrollView style={twStyle("max-h-80")} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={twStyle("border-b border-gray-100 py-3.5")}
            onPress={() => {
              setForm((p) => ({ ...p, brand: "" }));
              setBrandSheetOpen(false);
            }}
            accessibilityLabel="None"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-base text-gray-500")}>None</Text>
          </TouchableOpacity>
          {brands.map((b) => (
            <TouchableOpacity
              key={b.name}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setForm((p) => ({ ...p, brand: b.name }));
                setBrandSheetOpen(false);
              }}
              accessibilityLabel={b.name}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{b.name}</Text>
            </TouchableOpacity>
          ))}
          <View style={twStyle("mt-4 border-t border-gray-200 pt-4")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Add new brand</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              placeholder="Brand name"
              placeholderTextColor="#9ca3af"
              value={newBrandName}
              onChangeText={setNewBrandName}
            />
            <ActionButton label="Create & select" onPress={handleCreateBrand} fullWidth />
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Category: select or add */}
      <BottomSheet
        visible={categorySheetOpen}
        onClose={() => setCategorySheetOpen(false)}
        title="Product category"
        subtitle="Select or create a category"
      >
        <ScrollView style={twStyle("max-h-80")} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={twStyle("border-b border-gray-100 py-3.5")}
            onPress={() => {
              setForm((p) => ({ ...p, category: "" }));
              setCategorySheetOpen(false);
            }}
            accessibilityLabel="None"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-base text-gray-500")}>None</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setForm((p) => ({ ...p, category: c.name }));
                setCategorySheetOpen(false);
              }}
              accessibilityLabel={c.name}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{c.name}</Text>
            </TouchableOpacity>
          ))}
          <View style={twStyle("mt-4 border-t border-gray-200 pt-4")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Add new category</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              placeholder="Category name"
              placeholderTextColor="#9ca3af"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
            />
            <ActionButton label="Create & select" onPress={handleCreateCategory} fullWidth />
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Supplier: select or add */}
      <BottomSheet
        visible={supplierSheetOpen}
        onClose={() => setSupplierSheetOpen(false)}
        title="Supplier"
        subtitle="Select or create a supplier"
      >
        <ScrollView style={twStyle("max-h-80")} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={twStyle("border-b border-gray-100 py-3.5")}
            onPress={() => {
              setForm((p) => ({ ...p, supplier: "" }));
              setSupplierSheetOpen(false);
            }}
            accessibilityLabel="None"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-base text-gray-500")}>None</Text>
          </TouchableOpacity>
          {suppliers.map((s) => (
            <TouchableOpacity
              key={s.name}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setForm((p) => ({ ...p, supplier: s.name }));
                setSupplierSheetOpen(false);
              }}
              accessibilityLabel={s.name}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{s.name}</Text>
            </TouchableOpacity>
          ))}
          <View style={twStyle("mt-4 border-t border-gray-200 pt-4")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Add new supplier</Text>
            <TextInput
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              placeholder="Supplier name"
              placeholderTextColor="#9ca3af"
              value={newSupplierName}
              onChangeText={setNewSupplierName}
            />
            <ActionButton label="Create & select" onPress={handleCreateSupplier} fullWidth />
          </View>
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={measureSheetOpen}
        onClose={() => setMeasureSheetOpen(false)}
        title="Measure / unit"
        subtitle="Select unit of measure"
      >
        <ScrollView style={twStyle("max-h-80")}>
          {measureOptions.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setForm((p) => ({ ...p, measure: o.value }));
                setMeasureSheetOpen(false);
              }}
              accessibilityLabel={o.label}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={taxSheetOpen}
        onClose={() => setTaxSheetOpen(false)}
        title="Tax rate"
        subtitle="Select tax rate"
      >
        <ScrollView style={twStyle("max-h-80")}>
          {taxOptions.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setForm((p) => ({ ...p, tax_rate: o.value }));
                setTaxSheetOpen(false);
              }}
              accessibilityLabel={o.label}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>

      <BarcodeScannerModal
        visible={barcodeScanOpen}
        onClose={() => setBarcodeScanOpen(false)}
        title="Scan product barcode"
        onScanned={(code) => {
          setForm((p) => ({ ...p, barcode: code }));
          setBarcodeScanOpen(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
      />
    </ScreenContainer>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { twStyle } from "@/lib/twStyle";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { emitProviderProductsCatalogChanged } from "@/lib/provider-products-catalog-events";
import {
  launchCameraWithPermission,
  launchImageLibraryWithPermission,
} from "@/lib/native-permissions";

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

function optionValuesKey(ov: Record<string, string> | undefined): string {
  if (!ov || Object.keys(ov).length === 0) return "";
  const sorted = Object.keys(ov)
    .sort()
    .reduce(
      (acc, k) => {
        acc[k] = ov[k];
        return acc;
      },
      {} as Record<string, string>
    );
  return JSON.stringify(sorted);
}

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
  image_url: "",
  extra_image_urls: "",
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
  const [uploadingImage, setUploadingImage] = useState(false);

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

  const uploadImageAsset = useCallback(
    async (asset: { uri: string; mimeType?: string | null; fileName?: string | null }) => {
      setUploadingImage(true);
      try {
        const formData = new FormData();
        const name = asset.fileName || `photo-${Date.now()}.jpg`;
        const type = asset.mimeType || "image/jpeg";
        appendFormDataFileNative(formData, "file", { uri: asset.uri, type, name });
        formData.append("folder", "products");
        const res = await api.fetch<{ url?: string; path?: string }>("/api/upload", {
          method: "POST",
          body: formData,
        });
        const url = res.data?.url;
        if (res.error) {
          Alert.alert("Upload failed", res.error.message ?? "Could not upload image.");
          return;
        }
        if (url) {
          setForm((p) => ({ ...p, image_url: url }));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Alert.alert("Upload failed", "Could not get image URL from server.");
        }
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Failed to upload image.");
      } finally {
        setUploadingImage(false);
      }
    },
    []
  );

  const uploadVariantImageAtIndex = useCallback(
    async (rowIndex: number, asset: { uri: string; mimeType?: string | null; fileName?: string | null }) => {
      setUploadingImage(true);
      try {
        const formData = new FormData();
        const name = asset.fileName || `variant-${rowIndex}-${Date.now()}.jpg`;
        const type = asset.mimeType || "image/jpeg";
        appendFormDataFileNative(formData, "file", { uri: asset.uri, type, name });
        formData.append("folder", "products");
        const res = await api.fetch<{ url?: string }>("/api/upload", {
          method: "POST",
          body: formData,
        });
        const url = res.data?.url;
        if (res.error) {
          Alert.alert("Upload failed", res.error.message ?? "Could not upload image.");
          return;
        }
        if (url) {
          setForm((p) => {
            const next = [...p.variantRows];
            if (!next[rowIndex]) return p;
            next[rowIndex] = { ...next[rowIndex], image_url: url };
            return { ...p, variantRows: next };
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Failed to upload image.");
      } finally {
        setUploadingImage(false);
      }
    },
    []
  );

  const pickVariantImageFromLibrary = useCallback(
    async (rowIndex: number) => {
      const result = await launchImageLibraryWithPermission(
        {
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        },
        {
          title: "Permission needed",
          message: "Allow access to your photo library to add a variant image.",
        },
      );
      if (!result) return;
      if (result.canceled || !result.assets?.[0]) return;
      await uploadVariantImageAtIndex(rowIndex, result.assets[0]);
    },
    [uploadVariantImageAtIndex]
  );

  const pickImageFromLibrary = useCallback(async () => {
    const result = await launchImageLibraryWithPermission(
      {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      },
      {
        title: "Permission needed",
        message: "Allow access to your photo library to add a product image.",
      },
    );
    if (!result) return;
    if (result.canceled || !result.assets?.[0]) return;
    await uploadImageAsset(result.assets[0]);
  }, [uploadImageAsset]);

  const takePhoto = useCallback(async () => {
    const result = await launchCameraWithPermission(
      {
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      },
      {
        title: "Permission needed",
        message: "Allow camera access to take a product photo.",
      },
    );
    if (!result) return;
    if (result.canceled || !result.assets?.[0]) return;
    await uploadImageAsset(result.assets[0]);
  }, [uploadImageAsset]);

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
        image_url: urls[0] ?? "",
        extra_image_urls: urls.length > 1 ? urls.slice(1).join("\n") : "",
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

  const isSaving = creating || updating;
  const isEdit = !!productId;

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert("Validation", "Product name is required.");
      return;
    }

    const primary = form.image_url.trim();
    const extras = form.extra_image_urls.split(/\n/).map((s) => s.trim()).filter(Boolean);
    const image_urls = [...new Set([primary, ...extras].filter(Boolean))];

    const withVariants = Boolean(form.hasVariants && form.variantRows.length > 0);
    if (!withVariants) {
      const retailPrice = parseFloat(form.retail_price);
      if (Number.isNaN(retailPrice) || retailPrice < 0) {
        Alert.alert("Validation", "Retail price must be a valid number.");
        return;
      }
    } else {
      const bad = form.variantRows.some((r) => r.retail_price === undefined || Number(r.retail_price) < 0);
      if (bad) {
        Alert.alert("Validation", "Each variant needs a valid retail price (≥ 0).");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      name,
      barcode: form.barcode || undefined,
      brand: form.brand || undefined,
      measure: withVariants ? undefined : form.measure || undefined,
      amount: withVariants ? undefined : form.amount ? parseFloat(form.amount) : undefined,
      short_description: form.short_description || undefined,
      description: form.description || undefined,
      category: form.category || undefined,
      supplier: form.supplier || undefined,
      sku: withVariants ? undefined : form.sku || undefined,
      quantity: withVariants ? 0 : parseInt(form.quantity, 10) || 0,
      low_stock_level: withVariants ? 5 : parseInt(form.low_stock_level, 10) || 5,
      reorder_quantity: parseInt(form.reorder_quantity, 10) || 0,
      supply_price: withVariants ? 0 : parseFloat(form.supply_price) || 0,
      retail_price: withVariants ? 0 : parseFloat(form.retail_price),
      retail_sales_enabled: form.retail_sales_enabled,
      markup: withVariants ? undefined : form.markup ? parseFloat(form.markup) : undefined,
      tax_rate: parseFloat(form.tax_rate) || 0,
      team_member_commission_enabled: form.team_member_commission_enabled,
      track_stock_quantity: form.track_stock_quantity,
      receive_low_stock_notifications: form.receive_low_stock_notifications,
      image_urls,
      is_active: form.is_active,
      has_variants: withVariants,
    };

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
          "Add at least one option (e.g. Size) with a name and values. Use Generate variant matrix after editing options."
        );
        return;
      }
      payload.variant_option_types = validTypes;
      payload.variants = form.variantRows.map((r) => ({
        option_values: r.option_values,
        sku: r.sku.trim() || undefined,
        barcode: r.barcode.trim() || undefined,
        measure: r.measure.trim() || undefined,
        amount: r.amount > 0 ? r.amount : undefined,
        quantity: r.quantity ?? 0,
        low_stock_level: r.low_stock_level ?? 5,
        reorder_quantity: r.reorder_quantity ?? 0,
        supply_price: r.supply_price ?? 0,
        retail_price: Number(r.retail_price),
        markup: r.markup > 0 ? r.markup : undefined,
        image_url: r.image_url.trim() || undefined,
      }));
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
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
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
            <FormField
              label="Barcode"
              value={form.barcode}
              onChangeText={(t) => setForm((p) => ({ ...p, barcode: t }))}
              placeholder="Optional"
            />

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
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Product image</Text>
              {form.image_url ? (
                <View style={twStyle("flex-row items-center rounded-xl border border-gray-200 bg-gray-50 p-3")}>
                  <Image source={{ uri: form.image_url }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: "#E5E7EB", marginRight: 12 }} contentFit="cover" />
                  <View style={twStyle("flex-1")}>
                    <TouchableOpacity
                      onPress={pickImageFromLibrary}
                      disabled={uploadingImage}
                      style={twStyle("mb-2 rounded-lg bg-indigo-600 px-3 py-2")}
                      accessibilityLabel="Change product photo"
                      accessibilityRole="button"
                    >
                      {uploadingImage ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={twStyle("text-sm font-medium text-white")}>Change photo</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setForm((p) => ({ ...p, image_url: "" }))}
                      style={twStyle("rounded-lg border border-gray-300 bg-white px-3 py-2")}
                      accessibilityLabel="Remove product photo"
                      accessibilityRole="button"
                    >
                      <Text style={twStyle("text-sm font-medium text-gray-700")}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={twStyle("flex-row")}>
                  <TouchableOpacity
                    onPress={pickImageFromLibrary}
                    disabled={uploadingImage}
                    style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3"), { marginRight: 8 }]}
                    accessibilityLabel="Add product photo from library"
                    accessibilityRole="button"
                  >
                    {uploadingImage ? (
                      <ActivityIndicator size="small" color="#6366f1" />
                    ) : (
                      <Ionicons name="image-outline" size={20} color="#6366f1" />
                    )}
                    <Text style={twStyle("text-base font-medium text-indigo-600")}>Add photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={takePhoto}
                    disabled={uploadingImage}
                    style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3")}
                    accessibilityLabel="Take product photo with camera"
                    accessibilityRole="button"
                  >
                    <Ionicons name="camera-outline" size={20} color="#6366f1" />
                    <Text style={twStyle("text-base font-medium text-indigo-600")}>Take photo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <FormField
              label="More image URLs (optional, one per line)"
              value={form.extra_image_urls}
              onChangeText={(t) => setForm((p) => ({ ...p, extra_image_urls: t }))}
              placeholder="https://..."
              multiline
            />

            <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Has variants (sizes, volumes…)</Text>
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
              <View style={twStyle("mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3")}>
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-800")}>Variant options</Text>
                <Text style={twStyle("mb-3 text-xs text-gray-600")}>
                  Add one or more option types (e.g. Size, Colour). Values combine into every combination (e.g. S × Red, S ×
                  Blue). Then generate rows and set SKU, photo, price and stock per variant — same as provider web.
                </Text>
                {form.variantOptionTypes.map((opt, oi) => (
                  <View key={oi} style={twStyle("mb-3 rounded-lg border border-violet-100 bg-white p-3")}>
                    <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                      <Text style={twStyle("text-xs font-medium text-gray-700")}>Option {oi + 1}</Text>
                      {form.variantOptionTypes.length > 1 ? (
                        <TouchableOpacity
                          onPress={() =>
                            setForm((p) => ({
                              ...p,
                              variantOptionTypes: p.variantOptionTypes.filter((_, i) => i !== oi),
                            }))
                          }
                          accessibilityLabel={`Remove option ${oi + 1}`}
                          accessibilityRole="button"
                        >
                          <Text style={twStyle("text-xs font-medium text-red-600")}>Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={twStyle("mb-1 text-xs text-gray-600")}>Name (e.g. Size)</Text>
                    <TextInput
                      style={twStyle("mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-base text-gray-900")}
                      value={opt.name}
                      onChangeText={(t) =>
                        setForm((p) => {
                          const next = [...p.variantOptionTypes];
                          next[oi] = { ...next[oi], name: t };
                          return { ...p, variantOptionTypes: next };
                        })
                      }
                      placeholder="Size"
                    />
                    <Text style={twStyle("mb-1 text-xs text-gray-600")}>Values</Text>
                    <ChipCombobox
                      value={opt.values}
                      onChange={(arr) =>
                        setForm((p) => {
                          const next = [...p.variantOptionTypes];
                          next[oi] = { ...next[oi], values: arr };
                          return { ...p, variantOptionTypes: next };
                        })
                      }
                      staticSuggestions={[
                        { value: "250ml", label: "250ml" },
                        { value: "500ml", label: "500ml" },
                        { value: "S", label: "S" },
                        { value: "M", label: "M" },
                        { value: "L", label: "L" },
                        { value: "Red", label: "Red" },
                        { value: "Blue", label: "Blue" },
                      ]}
                      placeholder="Pick or type values"
                      accessibilityLabel={`Option ${oi + 1} values`}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() =>
                    setForm((p) => ({
                      ...p,
                      variantOptionTypes: [...p.variantOptionTypes, { name: "", values: [] }],
                    }))
                  }
                  style={twStyle("mb-2 flex-row items-center justify-center rounded-xl border border-dashed border-violet-300 py-2")}
                  accessibilityLabel="Add another option type"
                  accessibilityRole="button"
                >
                  <Ionicons name="add-circle-outline" size={18} color="#7c3aed" />
                  <Text style={twStyle("ml-1 text-sm font-medium text-violet-700")}>Add option (e.g. Colour)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const validTypes = form.variantOptionTypes
                      .map((t) => ({
                        name: t.name.trim(),
                        values: [...new Set(t.values.map((x) => x.trim()).filter(Boolean))],
                      }))
                      .filter((t) => t.name.length > 0 && t.values.length > 0);
                    if (validTypes.length === 0) {
                      Alert.alert("Variants", "Add at least one option with a name and one value.");
                      return;
                    }
                    let combos: Record<string, string>[] = [{}];
                    for (const dim of validTypes) {
                      const next: Record<string, string>[] = [];
                      for (const combo of combos) {
                        for (const val of dim.values) {
                          next.push({ ...combo, [dim.name]: val });
                        }
                      }
                      combos = next;
                    }
                    const baseMeasure = form.measure || "ml";
                    const merged: VariantFormRow[] = combos.map((option_values) => {
                      const existing = form.variantRows.find(
                        (r) => optionValuesKey(r.option_values) === optionValuesKey(option_values)
                      );
                      if (existing) return { ...existing, option_values };
                      return {
                        option_values,
                        sku: "",
                        barcode: "",
                        quantity: 0,
                        supply_price: 0,
                        retail_price: 0,
                        low_stock_level: 5,
                        reorder_quantity: 0,
                        markup: 0,
                        image_url: "",
                        measure: baseMeasure,
                        amount: 0,
                      };
                    });
                    setForm((f) => ({ ...f, variantRows: merged }));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={twStyle("items-center rounded-xl border border-violet-300 bg-white py-3")}
                >
                  <Text style={twStyle("font-medium text-violet-700")}>Generate variant matrix</Text>
                </TouchableOpacity>
                {form.variantRows.length > 0 && (
                  <View style={twStyle("mt-3 border-t border-violet-200 pt-3")}>
                    {form.variantRows.map((row, idx) => (
                      <View key={`variant-row-${idx}`} style={twStyle("mb-4 border-b border-violet-100 pb-4")}>
                        <Text style={twStyle("mb-2 text-xs font-medium text-gray-800")}>
                          {Object.entries(row.option_values)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </Text>
                        <View style={twStyle("mb-2 flex-row flex-wrap items-center")}>
                          {row.image_url ? (
                            <Image
                              source={{ uri: row.image_url }}
                              style={{ marginRight: 8, width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: "#ddd6fe", backgroundColor: "#fff" }}
                              contentFit="contain"
                            />
                          ) : (
                            <View
                              style={twStyle("mr-2 h-14 w-14 items-center justify-center rounded-lg border border-dashed border-violet-200 bg-white")}
                            >
                              <Ionicons name="image-outline" size={22} color="#9ca3af" />
                            </View>
                          )}
                          <TouchableOpacity
                            onPress={() => pickVariantImageFromLibrary(idx)}
                            disabled={uploadingImage}
                            style={twStyle("rounded-lg border border-violet-200 bg-white px-3 py-2")}
                            accessibilityLabel="Add variant photo"
                            accessibilityRole="button"
                          >
                            <Text style={twStyle("text-xs font-medium text-violet-700")}>
                              {row.image_url ? "Replace photo" : "Add photo"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View style={twStyle("flex-row flex-wrap")}>
                          <View style={twStyle("mb-2 mr-2 min-w-[44%] flex-1")}>
                            <Text style={twStyle("text-xs text-gray-500")}>SKU</Text>
                            <TextInput
                              style={twStyle("rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm")}
                              value={row.sku}
                              onChangeText={(t) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], sku: t };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                            />
                          </View>
                          <View style={twStyle("mb-2 mr-2 min-w-[44%] flex-1")}>
                            <Text style={twStyle("text-xs text-gray-500")}>Barcode</Text>
                            <TextInput
                              style={twStyle("rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm")}
                              value={row.barcode}
                              onChangeText={(t) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], barcode: t };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                            />
                          </View>
                          <View style={twStyle("mb-2 w-16")}>
                            <Text style={twStyle("text-xs text-gray-500")}>Qty</Text>
                            <TextInput
                              style={twStyle("rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm")}
                              value={String(row.quantity)}
                              keyboardType="number-pad"
                              onChangeText={(t) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], quantity: parseInt(t, 10) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                            />
                          </View>
                          <View style={twStyle("mb-2 w-16")}>
                            <Text style={twStyle("text-xs text-gray-500")}>Reorder</Text>
                            <TextInput
                              style={twStyle("rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm")}
                              value={String(row.reorder_quantity)}
                              keyboardType="number-pad"
                              onChangeText={(t) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], reorder_quantity: parseInt(t, 10) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                            />
                          </View>
                          <View style={twStyle("mb-2 w-20")}>
                            <Text style={twStyle("text-xs text-gray-500")}>Supply</Text>
                            <TextInput
                              style={twStyle("rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm")}
                              value={row.supply_price ? String(row.supply_price) : ""}
                              keyboardType="decimal-pad"
                              onChangeText={(t) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], supply_price: parseFloat(t) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                            />
                          </View>
                          <View style={twStyle("mb-2 w-20")}>
                            <Text style={twStyle("text-xs text-gray-500")}>Retail *</Text>
                            <TextInput
                              style={twStyle("rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm")}
                              value={row.retail_price ? String(row.retail_price) : ""}
                              keyboardType="decimal-pad"
                              onChangeText={(t) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], retail_price: parseFloat(t) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                            />
                          </View>
                          <View style={twStyle("mb-2 w-16")}>
                            <Text style={twStyle("text-xs text-gray-500")}>Markup %</Text>
                            <TextInput
                              style={twStyle("rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm")}
                              value={row.markup ? String(row.markup) : ""}
                              keyboardType="decimal-pad"
                              onChangeText={(t) => {
                                const next = [...form.variantRows];
                                next[idx] = { ...next[idx], markup: parseFloat(t) || 0 };
                                setForm((f) => ({ ...f, variantRows: next }));
                              }}
                            />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {!form.hasVariants && (
              <>
            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>Pricing</Text>
            <View style={twStyle("mb-2 flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <FormField
                  label="Supply / cost price"
                  value={form.supply_price}
                  onChangeText={(t) => setForm((p) => ({ ...p, supply_price: t }))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={twStyle("flex-1")}>
                <FormField
                  label="Retail price *"
                  value={form.retail_price}
                  onChangeText={(t) => setForm((p) => ({ ...p, retail_price: t }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <FormField
              label="Markup (%)"
              value={form.markup}
              onChangeText={(t) => setForm((p) => ({ ...p, markup: t }))}
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
          <ActionButton
            label={isSaving ? "Saving…" : isEdit ? "Save changes" : "Create product"}
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
    </ScreenContainer>
  );
}

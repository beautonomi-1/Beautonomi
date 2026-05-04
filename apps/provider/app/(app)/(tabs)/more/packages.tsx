import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useApi, useApiMutation, useApiPost } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { Colors } from "@/constants/colors";
import { normalizePackagesList, normalizeProductsList } from "@/lib/unpack-provider-api";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface PackageItem {
  id: string;
  offering_id?: string | null;
  product_id?: string | null;
  product_variant_id?: string | null;
  quantity: number;
  offering?: { id: string; title: string; duration_minutes: number; price: number } | null;
  product?: { id: string; name: string; retail_price: number } | null;
  product_variant?: ProductVariant | null;
}

interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  discount_percentage: number | null;
  is_active: boolean;
  items: PackageItem[];
  created_at: string;
}

interface ServiceOption {
  id: string;
  title: string;
  price: number;
  duration_minutes: number;
}

interface ProductOption {
  id: string;
  name: string;
  retail_price: number;
  has_variants?: boolean;
  variants?: ProductVariant[];
}

interface ProductVariant {
  id: string;
  option_values?: Record<string, string> | null;
  retail_price: number;
  sku?: string | null;
  quantity?: number | null;
}

interface FormItem {
  offering_id?: string;
  product_id?: string;
  product_variant_id?: string | null;
  quantity: number;
  label: string;
}

function formatVariantLabel(variant?: ProductVariant | null): string {
  if (!variant) return "";
  const optionLabel = variant.option_values ? Object.values(variant.option_values).filter(Boolean).join(" / ") : "";
  return optionLabel || variant.sku || "Variant";
}

export default function PackagesScreen() {
  const { isTablet } = useResponsive();
  const params = useLocalSearchParams<{ editId?: string | string[] }>();
  const editParamHandledRef = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<ServicePackage | null>(null);
  const [showItemPicker, setShowItemPicker] = useState(false);

  const { data: rawPackages, loading, error: packagesLoadError, refresh: refreshPackages } = useApi<unknown>("/api/provider/packages");
  const { data: services, error: servicesLoadError, refresh: refreshServices } = useApi<ServiceOption[]>("/api/provider/services?include_variants=true");
  const { data: rawProducts, error: productsLoadError, refresh: refreshProducts } = useApi<unknown>("/api/provider/products?limit=500");
  const { execute: createPackage, loading: creating } = useApiPost<any, any>("/api/provider/packages");
  const { execute: updatePkg, loading: updating } = useApiMutation("patch");
  const { execute: deletePkg } = useApiMutation("delete");

  const packages: ServicePackage[] = useMemo(
    () => normalizePackagesList(rawPackages) as ServicePackage[],
    [rawPackages]
  );

  const products: ProductOption[] = useMemo(
    () => normalizeProductsList(rawProducts) as ProductOption[],
    [rawProducts]
  );

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    currency: getTenantDefaultCurrency(),
    discount_percentage: "",
    is_active: true,
    items: [] as FormItem[],
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshPackages(), refreshServices(), refreshProducts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshPackages, refreshServices, refreshProducts]);

  const filtered = useMemo(() => {
    let list = packages;
    if (filter === "active") list = list.filter((p) => p.is_active);
    if (filter === "inactive") list = list.filter((p) => !p.is_active);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [packages, filter, search]);

  function resetForm() {
    setForm({ name: "", description: "", price: "", currency: getTenantDefaultCurrency(), discount_percentage: "", is_active: true, items: [] });
  }

  function openCreate() {
    resetForm();
    setEditingPkg(null);
    setShowForm(true);
  }

  const openEdit = useCallback((pkg: ServicePackage) => {
    setEditingPkg(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      price: String(pkg.price),
      currency: pkg.currency || getTenantDefaultCurrency(),
      discount_percentage: pkg.discount_percentage ? String(pkg.discount_percentage) : "",
      is_active: pkg.is_active,
      items: (pkg.items ?? []).map((it) => ({
        offering_id: it.offering_id ?? undefined,
        product_id: it.product_id ?? undefined,
        product_variant_id: it.product_variant_id ?? undefined,
        quantity: it.quantity,
        label: it.offering?.title ?? (it.product ? `${it.product.name}${formatVariantLabel(it.product_variant) ? ` — ${formatVariantLabel(it.product_variant)}` : ""}` : "Item"),
      })),
    });
    setShowForm(true);
  }, []);

  useEffect(() => {
    const raw = params.editId;
    const editId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (!editId) {
      editParamHandledRef.current = null;
      return;
    }
    if (packages.length === 0) return;
    const pkg = packages.find((p) => p.id === editId);
    if (!pkg) return;
    if (editParamHandledRef.current === editId) return;
    editParamHandledRef.current = editId;
    openEdit(pkg);
  }, [params.editId, packages, openEdit]);

  function addServiceItem(svc: ServiceOption) {
    setForm((p) => ({
      ...p,
      items: [...p.items, { offering_id: svc.id, quantity: 1, label: svc.title }],
    }));
    setShowItemPicker(false);
  }

  function addProductItem(prod: ProductOption) {
    setForm((p) => ({
      ...p,
    items: [...p.items, { product_id: prod.id, quantity: 1, label: prod.name }],
    }));
    setShowItemPicker(false);
  }

  function removeItem(index: number) {
    setForm((p) => ({
      ...p,
      items: p.items.filter((_, i) => i !== index),
    }));
  }

  function updateItemQty(index: number, qty: number) {
    if (qty < 1) return;
    setForm((p) => ({
      ...p,
      items: p.items.map((it, i) => (i === index ? { ...it, quantity: qty } : it)),
    }));
  }

  function updateItemVariant(index: number, product: ProductOption, variant: ProductVariant | null) {
    setForm((p) => ({
      ...p,
      items: p.items.map((it, i) => (
        i === index
          ? {
              ...it,
              product_variant_id: variant?.id ?? undefined,
              label: variant ? `${product.name} — ${formatVariantLabel(variant)}` : product.name,
            }
          : it
      )),
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert("Required", "Package name is required");
      return;
    }
    if (!form.price || Number(form.price) <= 0) {
      Alert.alert("Required", "Please enter a valid price");
      return;
    }
    if (form.items.length === 0) {
      Alert.alert("Required", "Add at least one service or product");
      return;
    }
    const missingVariant = form.items.find((item) => {
      if (!item.product_id) return false;
      const product = products.find((p) => p.id === item.product_id);
      return Boolean(product?.has_variants && (product.variants?.length ?? 0) > 0 && !item.product_variant_id);
    });
    if (missingVariant) {
      Alert.alert("Variant required", "Choose the exact product variant included in this package.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: Number(form.price),
      currency: form.currency.trim() || getTenantDefaultCurrency(),
      discount_percentage: form.discount_percentage ? Number(form.discount_percentage) : undefined,
      is_active: form.is_active,
      items: form.items.map((it) => ({
        offering_id: it.offering_id || undefined,
        product_id: it.product_id || undefined,
        product_variant_id: it.product_variant_id || undefined,
        quantity: it.quantity,
      })),
    };

    if (editingPkg) {
      const { error } = await updatePkg(`/api/provider/packages/${editingPkg.id}`, payload);
      if (error) { Alert.alert("Error", error); return; }
    } else {
      const { error } = await createPackage(payload);
      if (error) { Alert.alert("Error", error); return; }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    setEditingPkg(null);
    resetForm();
    refreshPackages();
  }

  function handleDelete(pkg: ServicePackage) {
    Alert.alert("Delete Package", `Delete "${pkg.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deletePkg(`/api/provider/packages/${pkg.id}`);
          if (error) Alert.alert("Error", error);
          else refreshPackages();
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Packages"
        showBack
        subtitle={`${packages.length} packages`}
        rightAction={
          <TouchableOpacity
            style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: Colors.gray[900] }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openCreate(); }}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search packages..." />

      <View style={{ marginVertical: 12 }}>
        <FilterChipGroup
          options={[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
          ]}
          selected={filter}
          onSelect={setFilter}
        />
      </View>

      {packagesLoadError && !rawPackages ? (
        <ErrorState message={packagesLoadError} onRetry={refreshPackages} />
      ) : loading && !rawPackages && !packagesLoadError ? (
        <SkeletonList rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="gift-outline"
          title="No packages"
          description="Bundle services and products into packages for your clients"
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(p: ServicePackage) => p.id}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={!isTablet ? () => <View style={{ height: 10 }} /> : undefined}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { marginBottom: 12 } : undefined}
          renderItem={({ item: pkg, index }: { item: ServicePackage; index: number }) => (
            <View
              style={[
                isTablet ? { flex: 1 } : undefined,
                isTablet && index % 2 === 0 ? { marginRight: 12 } : undefined,
              ]}
            >
            <TouchableOpacity
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 }}
              onPress={() => openEdit(pkg)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>{pkg.name}</Text>
                  {pkg.description && (
                    <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }} numberOfLines={2}>{pkg.description}</Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{formatCurrency(pkg.price, pkg.currency)}</Text>
                  {pkg.discount_percentage != null && pkg.discount_percentage > 0 && (
                    <Text style={{ fontSize: 12, color: "#16a34a" }}>{pkg.discount_percentage}% off</Text>
                  )}
                </View>
              </View>

              <View style={{ marginTop: 12, borderRadius: 8, backgroundColor: Colors.gray[50], padding: 12 }}>
                {(pkg.items ?? []).map((item: PackageItem, i: number) => (
                  <View key={item.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: i > 0 ? 6 : 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                      <Ionicons name={item.offering_id ? "cut-outline" : "cube-outline"} size={14} color="#6b7280" />
                      <Text style={{ marginLeft: 6, fontSize: 12, color: Colors.gray[700] }} numberOfLines={1}>
                        {item.offering?.title ?? (item.product ? `${item.product.name}${formatVariantLabel(item.product_variant) ? ` — ${formatVariantLabel(item.product_variant)}` : ""}` : "Item")}
                      </Text>
                    </View>
                    {item.quantity > 1 && (
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }}>×{item.quantity}</Text>
                    )}
                  </View>
                ))}
                {(pkg.items ?? []).length === 0 && (
                  <Text style={{ fontSize: 12, color: Colors.gray[400] }}>No items</Text>
                )}
              </View>

              <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: pkg.is_active ? "#dcfce7" : Colors.gray[100] }}>
                  <Text style={{ fontSize: 10, fontWeight: "500", color: pkg.is_active ? "#15803d" : Colors.gray[500] }}>
                    {pkg.is_active ? "Active" : "Inactive"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(pkg)}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
            </View>
          )}
        />
      )}

      </View>

      {/* Create / Edit form */}
      <BottomSheet
        visible={showForm}
        onClose={() => { setShowForm(false); setEditingPkg(null); }}
        title={editingPkg ? "Edit Package" : "New Package"}
        snapHeight={isTablet ? "full" : "auto"}
      >
        <View>
          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Package Name *</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Luxury Pamper Package"
            placeholderTextColor="#9ca3af"
          />

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Description</Text>
          <TextInput
            style={{ marginBottom: 12, minHeight: 60, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Brief description..."
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />

          <View style={{ marginBottom: 12, flexDirection: "row" }}>
            <View style={{ flex: 2, marginRight: 8 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Price *</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={form.price}
                onChangeText={(t) => setForm((p) => ({ ...p, price: t }))}
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Currency</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={form.currency}
                onChangeText={(t) => setForm((p) => ({ ...p, currency: t.toUpperCase().slice(0, 3) }))}
                placeholder={getTenantDefaultCurrency()}
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                maxLength={3}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Discount %</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={form.discount_percentage}
                onChangeText={(t) => setForm((p) => ({ ...p, discount_percentage: t }))}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Items ({form.items.length})</Text>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 9999, backgroundColor: "#eef2ff", paddingHorizontal: 12, paddingVertical: 6 }}
              onPress={() => setShowItemPicker(true)}
            >
              <Ionicons name="add" size={16} color="#6366f1" />
              <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "500", color: "#4f46e5" }}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {form.items.length > 0 && (
            <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50] }}>
              {form.items.map((item, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: idx < form.items.length - 1 ? 1 : 0,
                    borderBottomColor: Colors.gray[200],
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{item.label}</Text>
                    {item.product_id && (() => {
                      const product = products.find((p) => p.id === item.product_id);
                      if (!product?.has_variants || !product.variants?.length) return null;
                      return (
                        <View style={{ marginTop: 8 }}>
                          <Text style={{ marginBottom: 6, fontSize: 11, fontWeight: "700", color: "#6d28d9", textTransform: "uppercase" }}>
                            Variant
                          </Text>
                          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                            {product.variants.map((variant) => {
                              const selected = item.product_variant_id === variant.id;
                              return (
                                <TouchableOpacity
                                  key={variant.id}
                                  onPress={() => updateItemVariant(idx, product, variant)}
                                  style={{
                                    marginRight: 8,
                                    marginBottom: 8,
                                    borderRadius: 999,
                                    borderWidth: 1,
                                    borderColor: selected ? "#7c3aed" : Colors.gray[200],
                                    backgroundColor: selected ? "#f3e8ff" : Colors.white,
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: "600", color: selected ? "#6d28d9" : Colors.gray[700] }}>
                                    {formatVariantLabel(variant)}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TouchableOpacity onPress={() => updateItemQty(idx, item.quantity - 1)} style={{ marginRight: 8 }}>
                      <Ionicons name="remove-circle-outline" size={22} color="#6b7280" />
                    </TouchableOpacity>
                    <Text style={{ width: 24, textAlign: "center", fontSize: 14, fontWeight: "600", marginRight: 8 }}>{item.quantity}</Text>
                    <TouchableOpacity onPress={() => updateItemQty(idx, item.quantity + 1)} style={{ marginRight: 8 }}>
                      <Ionicons name="add-circle-outline" size={22} color="#6b7280" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeItem(idx)} style={{ marginLeft: 8 }}>
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Active</Text>
            <Switch
              value={form.is_active}
              onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.is_active ? "#6366f1" : "#f4f4f5"}
            />
          </View>

          <ActionButton
            label={editingPkg ? "Update Package" : "Create Package"}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Item picker sheet */}
      <BottomSheet visible={showItemPicker} onClose={() => setShowItemPicker(false)} title="Add Item">
        <View>
          <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>Services</Text>
          {servicesLoadError && !services ? (
            <ErrorState message={servicesLoadError} onRetry={refreshServices} />
          ) : (
            (services ?? []).map((svc) => (
              <TouchableOpacity
                key={svc.id}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 }}
                onPress={() => addServiceItem(svc)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Ionicons name="cut-outline" size={18} color="#6366f1" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{svc.title}</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{`${svc.duration_minutes}min · ${getTenantDefaultCurrency()} ${svc.price}`}</Text>
                  </View>
                </View>
                <Ionicons name="add-circle-outline" size={22} color="#6366f1" />
              </TouchableOpacity>
            ))
          )}

          <Text style={{ marginBottom: 8, marginTop: 16, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>Products</Text>
          {productsLoadError && !rawProducts ? (
            <ErrorState message={productsLoadError} onRetry={refreshProducts} />
          ) : (
            products.map((prod) => (
              <TouchableOpacity
                key={prod.id}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 }}
                onPress={() => addProductItem(prod)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Ionicons name="cube-outline" size={18} color="#8b5cf6" />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{prod.name}</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                      {prod.has_variants && (prod.variants?.length ?? 0) > 0
                        ? `${prod.variants?.length} variants`
                        : `${getTenantDefaultCurrency()} ${prod.retail_price}`}
                    </Text>
                  </View>
                </View>
                <Ionicons name="add-circle-outline" size={22} color="#8b5cf6" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

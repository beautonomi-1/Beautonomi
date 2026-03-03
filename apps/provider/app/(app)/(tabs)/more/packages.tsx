import { useState, useCallback, useMemo } from "react";
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
import { useApi, useApiMutation, useApiPost } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";

interface PackageItem {
  id: string;
  offering_id?: string | null;
  product_id?: string | null;
  quantity: number;
  offering?: { id: string; title: string; duration_minutes: number; price: number } | null;
  product?: { id: string; name: string; retail_price: number } | null;
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
}

interface FormItem {
  offering_id?: string;
  product_id?: string;
  quantity: number;
  label: string;
}

export default function PackagesScreen() {
  const { isTablet } = useResponsive();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<ServicePackage | null>(null);
  const [showItemPicker, setShowItemPicker] = useState(false);

  const { data: rawPackages, loading, refresh } = useApi<any>("/api/provider/packages");
  const { data: services } = useApi<ServiceOption[]>("/api/provider/services");
  const { data: rawProducts } = useApi<any>("/api/provider/products");
  const { execute: createPackage, loading: creating } = useApiPost<any, any>("/api/provider/packages");
  const { execute: updatePkg, loading: updating } = useApiMutation("patch");
  const { execute: deletePkg } = useApiMutation("delete");

  const packages: ServicePackage[] = useMemo(() => {
    if (!rawPackages) return [];
    return rawPackages.packages ?? rawPackages ?? [];
  }, [rawPackages]);

  const products: ProductOption[] = useMemo(() => {
    if (!rawProducts) return [];
    return rawProducts.products ?? rawProducts ?? [];
  }, [rawProducts]);

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    discount_percentage: "",
    is_active: true,
    items: [] as FormItem[],
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

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
    setForm({ name: "", description: "", price: "", discount_percentage: "", is_active: true, items: [] });
  }

  function openCreate() {
    resetForm();
    setEditingPkg(null);
    setShowForm(true);
  }

  function openEdit(pkg: ServicePackage) {
    setEditingPkg(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      price: String(pkg.price),
      discount_percentage: pkg.discount_percentage ? String(pkg.discount_percentage) : "",
      is_active: pkg.is_active,
      items: pkg.items.map((it) => ({
        offering_id: it.offering_id ?? undefined,
        product_id: it.product_id ?? undefined,
        quantity: it.quantity,
        label: it.offering?.title ?? it.product?.name ?? "Item",
      })),
    });
    setShowForm(true);
  }

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

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: Number(form.price),
      discount_percentage: form.discount_percentage ? Number(form.discount_percentage) : undefined,
      is_active: form.is_active,
      items: form.items.map((it) => ({
        offering_id: it.offering_id || undefined,
        product_id: it.product_id || undefined,
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
    refresh();
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
          else refresh();
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
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openCreate(); }}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search packages..." />

      <View className="my-3">
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

      {loading && !packages.length ? (
        <SkeletonList rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="gift-outline"
          title="No packages"
          description="Bundle services and products into packages for your clients"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p: ServicePackage) => p.id}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: 10 }}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
          renderItem={({ item: pkg }: { item: ServicePackage }) => (
            <TouchableOpacity
              className={`rounded-xl border border-gray-100 bg-white p-4 ${isTablet ? "flex-1" : ""}`}
              onPress={() => openEdit(pkg)}
              activeOpacity={0.7}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900">{pkg.name}</Text>
                  {pkg.description && (
                    <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={2}>{pkg.description}</Text>
                  )}
                </View>
                <View className="items-end">
                  <Text className="text-base font-bold text-gray-900">{formatCurrency(pkg.price)}</Text>
                  {pkg.discount_percentage != null && pkg.discount_percentage > 0 && (
                    <Text className="text-xs text-green-600">{pkg.discount_percentage}% off</Text>
                  )}
                </View>
              </View>

              {/* Items list */}
              <View className="mt-3 rounded-lg bg-gray-50 p-3">
                {pkg.items.map((item: PackageItem, i: number) => (
                  <View key={item.id} className={`flex-row items-center justify-between ${i > 0 ? "mt-1.5" : ""}`}>
                    <View className="flex-row items-center flex-1">
                      <Ionicons
                        name={item.offering_id ? "cut-outline" : "cube-outline"}
                        size={14}
                        color="#6b7280"
                      />
                      <Text className="ml-1.5 text-xs text-gray-700" numberOfLines={1}>
                        {item.offering?.title ?? item.product?.name ?? "Item"}
                      </Text>
                    </View>
                    {item.quantity > 1 && (
                      <Text className="text-xs text-gray-500">×{item.quantity}</Text>
                    )}
                  </View>
                ))}
                {pkg.items.length === 0 && (
                  <Text className="text-xs text-gray-400">No items</Text>
                )}
              </View>

              <View className="mt-3 flex-row items-center justify-between">
                <View className={`rounded-full px-2.5 py-0.5 ${pkg.is_active ? "bg-green-50" : "bg-gray-100"}`}>
                  <Text className={`text-[10px] font-medium ${pkg.is_active ? "text-green-700" : "text-gray-500"}`}>
                    {pkg.is_active ? "Active" : "Inactive"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(pkg)}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      </View>

      {/* Create / Edit form */}
      <BottomSheet
        visible={showForm}
        onClose={() => { setShowForm(false); setEditingPkg(null); }}
        title={editingPkg ? "Edit Package" : "New Package"}
      >
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Package Name *</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Luxury Pamper Package"
            placeholderTextColor="#9ca3af"
          />

          <Text className="mb-1 text-sm font-medium text-gray-700">Description</Text>
          <TextInput
            className="mb-3 min-h-[60px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Brief description..."
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />

          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Price (R) *</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.price}
                onChangeText={(t) => setForm((p) => ({ ...p, price: t }))}
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Discount %</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.discount_percentage}
                onChangeText={(t) => setForm((p) => ({ ...p, discount_percentage: t }))}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Package items */}
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">Items ({form.items.length})</Text>
            <TouchableOpacity
              className="flex-row items-center rounded-full bg-indigo-50 px-3 py-1.5"
              onPress={() => setShowItemPicker(true)}
            >
              <Ionicons name="add" size={16} color="#6366f1" />
              <Text className="ml-1 text-xs font-medium text-indigo-600">Add Item</Text>
            </TouchableOpacity>
          </View>

          {form.items.length > 0 && (
            <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50">
              {form.items.map((item, idx) => (
                <View
                  key={idx}
                  className={`flex-row items-center px-4 py-3 ${idx < form.items.length - 1 ? "border-b border-gray-200" : ""}`}
                >
                  <View className="flex-1">
                    <Text className="text-sm text-gray-900">{item.label}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity onPress={() => updateItemQty(idx, item.quantity - 1)}>
                      <Ionicons name="remove-circle-outline" size={22} color="#6b7280" />
                    </TouchableOpacity>
                    <Text className="w-6 text-center text-sm font-semibold">{item.quantity}</Text>
                    <TouchableOpacity onPress={() => updateItemQty(idx, item.quantity + 1)}>
                      <Ionicons name="add-circle-outline" size={22} color="#6b7280" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeItem(idx)} className="ml-2">
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Active toggle */}
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">Active</Text>
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
          <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">Services</Text>
          {(services ?? []).map((svc) => (
            <TouchableOpacity
              key={svc.id}
              className="flex-row items-center justify-between rounded-lg px-3 py-3 active:bg-gray-50"
              onPress={() => addServiceItem(svc)}
            >
              <View className="flex-row items-center flex-1">
                <Ionicons name="cut-outline" size={18} color="#6366f1" />
                <View className="ml-2.5">
                  <Text className="text-sm text-gray-900">{svc.title}</Text>
                  <Text className="text-xs text-gray-500">{svc.duration_minutes}min · R{svc.price}</Text>
                </View>
              </View>
              <Ionicons name="add-circle-outline" size={22} color="#6366f1" />
            </TouchableOpacity>
          ))}

          <Text className="mb-2 mt-4 text-xs font-semibold uppercase text-gray-400">Products</Text>
          {products.map((prod) => (
            <TouchableOpacity
              key={prod.id}
              className="flex-row items-center justify-between rounded-lg px-3 py-3 active:bg-gray-50"
              onPress={() => addProductItem(prod)}
            >
              <View className="flex-row items-center flex-1">
                <Ionicons name="cube-outline" size={18} color="#8b5cf6" />
                <View className="ml-2.5">
                  <Text className="text-sm text-gray-900">{prod.name}</Text>
                  <Text className="text-xs text-gray-500">R{prod.retail_price}</Text>
                </View>
              </View>
              <Ionicons name="add-circle-outline" size={22} color="#8b5cf6" />
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

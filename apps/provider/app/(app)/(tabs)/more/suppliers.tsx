import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  category: string;
  status: "active" | "inactive";
  product_count: number;
  total_orders: number;
  created_at: string;
}

interface SupplierForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  notes: string;
  category: string;
}

const EMPTY_FORM: SupplierForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  notes: "",
  category: "general",
};

const CATEGORY_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Hair", value: "hair" },
  { label: "Skincare", value: "skincare" },
  { label: "Nails", value: "nails" },
  { label: "Equipment", value: "equipment" },
  { label: "General", value: "general" },
];

function categoryColor(cat: string) {
  switch (cat) {
    case "hair":
      return { bg: "bg-purple-50", text: "text-purple-700" };
    case "skincare":
      return { bg: "bg-pink-50", text: "text-pink-700" };
    case "nails":
      return { bg: "bg-rose-50", text: "text-rose-700" };
    case "equipment":
      return { bg: "bg-blue-50", text: "text-blue-700" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600" };
  }
}

export default function SuppliersScreen() {
  const { isTablet } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);

  const { data: suppliers, loading, refresh } = useApi<Supplier[]>("/api/provider/suppliers");
  const { execute: createSupplier, loading: creating } = useApiPost<SupplierForm, Supplier>("/api/provider/suppliers");
  const { execute: updateSupplier, loading: updating } = useApiMutation<Supplier>("patch");
  const { execute: deleteSupplier } = useApiMutation<void>("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = suppliers ?? [];
    if (categoryFilter !== "all") {
      list = list.filter((s) => s.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.phone?.includes(q)
      );
    }
    return list;
  }, [suppliers, search, categoryFilter]);

  const activeCount = useMemo(
    () => (suppliers ?? []).filter((s) => s.status === "active").length,
    [suppliers]
  );

  function updateForm(key: keyof SupplierForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openNewForm() {
    setForm(EMPTY_FORM);
    setEditMode(false);
    setShowForm(true);
  }

  function openEditForm(supplier: Supplier) {
    setForm({
      name: supplier.name,
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
      website: supplier.website ?? "",
      notes: supplier.notes ?? "",
      category: supplier.category,
    });
    setSelectedSupplier(supplier);
    setEditMode(true);
    setShowDetail(false);
    setShowForm(true);
  }

  function openDetail(supplier: Supplier) {
    setSelectedSupplier(supplier);
    setShowDetail(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert("Required", "Supplier name is required");
      return;
    }

    if (editMode && selectedSupplier) {
      const { error } = await updateSupplier(
        `/api/provider/suppliers/${selectedSupplier.id}`,
        form
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createSupplier(form);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    setForm(EMPTY_FORM);
    refresh();
  }

  function handleDelete(supplier: Supplier) {
    Alert.alert(
      "Delete Supplier",
      `Are you sure you want to delete "${supplier.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await deleteSupplier(
              `/api/provider/suppliers/${supplier.id}`
            );
            if (error) {
              Alert.alert("Error", error);
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setShowDetail(false);
            setSelectedSupplier(null);
            refresh();
          },
        },
      ]
    );
  }

  function handleCall(phone: string) {
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert("Error", "Could not open phone dialer")
    );
  }

  function handleEmail(email: string) {
    Linking.openURL(`mailto:${email}`).catch(() =>
      Alert.alert("Error", "Could not open email client")
    );
  }

  function handleWebsite(website: string) {
    const url = website.startsWith("http") ? website : `https://${website}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Could not open website")
    );
  }

  const renderSupplierItem = (item: Supplier) => {
    const cat = categoryColor(item.category);
    return (
      <TouchableOpacity
        key={item.id}
        className="mb-2 rounded-xl border border-gray-100 bg-white p-4"
        onPress={() => openDetail(item)}
        activeOpacity={0.7}
      >
        <View className="flex-row items-start">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-indigo-50">
            <Ionicons name="business-outline" size={20} color="#6366f1" />
          </View>
          <View className="ml-3 flex-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] font-semibold text-gray-900">
                {item.name}
              </Text>
              <View
                className={`rounded-full px-2 py-0.5 ${
                  item.status === "active" ? "bg-green-50" : "bg-gray-100"
                }`}
              >
                <Text
                  className={`text-[10px] font-medium capitalize ${
                    item.status === "active" ? "text-green-700" : "text-gray-500"
                  }`}
                >
                  {item.status}
                </Text>
              </View>
            </View>
            {item.email && (
              <Text className="mt-0.5 text-xs text-gray-500">{item.email}</Text>
            )}
            <View className="mt-2 flex-row items-center gap-2">
              <View className={`rounded-full px-2 py-0.5 ${cat.bg}`}>
                <Text className={`text-[10px] font-medium capitalize ${cat.text}`}>
                  {item.category}
                </Text>
              </View>
              {item.product_count > 0 && (
                <Text className="text-[11px] text-gray-400">
                  {item.product_count} product{item.product_count !== 1 ? "s" : ""}
                </Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 4, alignSelf: "center" }} />
        </View>

        {/* Quick actions */}
        {(item.phone || item.email || item.website) && (
          <View className="mt-3 flex-row gap-2 border-t border-gray-50 pt-3">
            {item.phone && (
              <TouchableOpacity
                className="flex-row items-center rounded-lg bg-green-50 px-3 py-1.5"
                onPress={(e) => {
                  e.stopPropagation();
                  handleCall(item.phone!);
                }}
              >
                <Ionicons name="call-outline" size={13} color="#22c55e" />
                <Text className="ml-1 text-xs font-medium text-green-700">Call</Text>
              </TouchableOpacity>
            )}
            {item.email && (
              <TouchableOpacity
                className="flex-row items-center rounded-lg bg-blue-50 px-3 py-1.5"
                onPress={(e) => {
                  e.stopPropagation();
                  handleEmail(item.email!);
                }}
              >
                <Ionicons name="mail-outline" size={13} color="#3b82f6" />
                <Text className="ml-1 text-xs font-medium text-blue-700">Email</Text>
              </TouchableOpacity>
            )}
            {item.website && (
              <TouchableOpacity
                className="flex-row items-center rounded-lg bg-violet-50 px-3 py-1.5"
                onPress={(e) => {
                  e.stopPropagation();
                  handleWebsite(item.website!);
                }}
              >
                <Ionicons name="globe-outline" size={13} color="#8b5cf6" />
                <Text className="ml-1 text-xs font-medium text-violet-700">Web</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer
      scrollable={true}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      <ScreenHeader
        title="Suppliers"
        showBack
        subtitle={`${suppliers?.length ?? 0} suppliers`}
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
            onPress={openNewForm}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {/* Stats */}
      <View className={`mb-3 gap-3 ${isTablet ? "flex-row" : "flex-row"}`}>
        <View className="flex-1">
          <StatCard
            title="Total Suppliers"
            value={String(suppliers?.length ?? 0)}
            icon="business-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            compact
          />
        </View>
        <View className="flex-1">
          <StatCard
            title="Active"
            value={String(activeCount)}
            icon="checkmark-circle-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name, email, or phone..." />
      <View className="mt-2 mb-3">
        <FilterChipGroup
          options={CATEGORY_OPTIONS}
          selected={categoryFilter}
          onSelect={setCategoryFilter}
        />
      </View>

      {loading && !suppliers ? (
        <SkeletonList rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="No suppliers found"
          description={search || categoryFilter !== "all" ? "Try adjusting your filters" : "Add suppliers to manage your product vendors"}
        />
      ) : (
        <View>
          {filtered.map((item) => renderSupplierItem(item))}
        </View>
      )}

      {/* Supplier Detail */}
      <BottomSheet
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        title="Supplier Details"
      >
        {selectedSupplier && (
          <View>
            <View className="mb-4 flex-row items-center">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
                <Ionicons name="business" size={26} color="#6366f1" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-lg font-bold text-gray-900">
                  {selectedSupplier.name}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <View
                    className={`rounded-full px-2 py-0.5 ${
                      selectedSupplier.status === "active" ? "bg-green-50" : "bg-gray-100"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-medium capitalize ${
                        selectedSupplier.status === "active" ? "text-green-700" : "text-gray-500"
                      }`}
                    >
                      {selectedSupplier.status}
                    </Text>
                  </View>
                  <View className={`rounded-full px-2 py-0.5 ${categoryColor(selectedSupplier.category).bg}`}>
                    <Text className={`text-[10px] font-medium capitalize ${categoryColor(selectedSupplier.category).text}`}>
                      {selectedSupplier.category}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Contact info */}
            <View className="mb-4 rounded-xl bg-gray-50 p-3">
              {selectedSupplier.email && (
                <TouchableOpacity
                  className="mb-2 flex-row items-center"
                  onPress={() => handleEmail(selectedSupplier.email!)}
                >
                  <Ionicons name="mail-outline" size={16} color="#6b7280" />
                  <Text className="ml-2 flex-1 text-sm text-gray-700">
                    {selectedSupplier.email}
                  </Text>
                </TouchableOpacity>
              )}
              {selectedSupplier.phone && (
                <TouchableOpacity
                  className="mb-2 flex-row items-center"
                  onPress={() => handleCall(selectedSupplier.phone!)}
                >
                  <Ionicons name="call-outline" size={16} color="#6b7280" />
                  <Text className="ml-2 flex-1 text-sm text-gray-700">
                    {selectedSupplier.phone}
                  </Text>
                </TouchableOpacity>
              )}
              {selectedSupplier.address && (
                <View className="mb-2 flex-row items-start">
                  <Ionicons name="location-outline" size={16} color="#6b7280" style={{ marginTop: 1 }} />
                  <Text className="ml-2 flex-1 text-sm text-gray-700">
                    {selectedSupplier.address}
                  </Text>
                </View>
              )}
              {selectedSupplier.website && (
                <TouchableOpacity
                  className="flex-row items-center"
                  onPress={() => handleWebsite(selectedSupplier.website!)}
                >
                  <Ionicons name="globe-outline" size={16} color="#6b7280" />
                  <Text className="ml-2 flex-1 text-sm text-indigo-600">
                    {selectedSupplier.website}
                  </Text>
                </TouchableOpacity>
              )}
              {!selectedSupplier.email && !selectedSupplier.phone && !selectedSupplier.address && !selectedSupplier.website && (
                <Text className="text-sm text-gray-400">No contact information added</Text>
              )}
            </View>

            {/* Stats */}
            <View className="mb-4 flex-row gap-3">
              <View className="flex-1 rounded-xl border border-gray-100 p-3">
                <Text className="text-xs text-gray-500">Products</Text>
                <Text className="text-lg font-bold text-gray-900">
                  {selectedSupplier.product_count}
                </Text>
              </View>
              <View className="flex-1 rounded-xl border border-gray-100 p-3">
                <Text className="text-xs text-gray-500">Total Orders</Text>
                <Text className="text-lg font-bold text-gray-900">
                  {selectedSupplier.total_orders}
                </Text>
              </View>
            </View>

            {/* Notes */}
            {selectedSupplier.notes && (
              <View className="mb-4">
                <Text className="mb-1 text-xs font-medium text-gray-500">Notes</Text>
                <Text className="text-sm leading-5 text-gray-700">
                  {selectedSupplier.notes}
                </Text>
              </View>
            )}

            {/* Actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 flex-row items-center justify-center rounded-xl bg-indigo-50 py-3"
                onPress={() => openEditForm(selectedSupplier)}
              >
                <Ionicons name="create-outline" size={16} color="#6366f1" />
                <Text className="ml-1.5 text-sm font-medium text-indigo-700">Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 flex-row items-center justify-center rounded-xl bg-red-50 py-3"
                onPress={() => handleDelete(selectedSupplier)}
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text className="ml-1.5 text-sm font-medium text-red-700">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheet>

      {/* Add/Edit Form */}
      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editMode ? "Edit Supplier" : "New Supplier"}
      >
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Supplier Name *</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.name}
            onChangeText={(t) => updateForm("name", t)}
            placeholder="e.g. Beauty Wholesale Co."
            placeholderTextColor="#9ca3af"
          />

          <Text className="mb-1 text-sm font-medium text-gray-700">Category</Text>
          <View className="mb-3">
            <FilterChipGroup
              options={CATEGORY_OPTIONS.filter((c) => c.value !== "all")}
              selected={form.category}
              onSelect={(v) => updateForm("category", v)}
            />
          </View>

          <Text className="mb-1 text-sm font-medium text-gray-700">Email</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.email}
            onChangeText={(t) => updateForm("email", t)}
            placeholder="supplier@example.com"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text className="mb-1 text-sm font-medium text-gray-700">Phone</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.phone}
            onChangeText={(t) => updateForm("phone", t)}
            placeholder="+27 ..."
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />

          <Text className="mb-1 text-sm font-medium text-gray-700">Address</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.address}
            onChangeText={(t) => updateForm("address", t)}
            placeholder="Street address, city"
            placeholderTextColor="#9ca3af"
          />

          <Text className="mb-1 text-sm font-medium text-gray-700">Website</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.website}
            onChangeText={(t) => updateForm("website", t)}
            placeholder="www.example.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />

          <Text className="mb-1 text-sm font-medium text-gray-700">Notes</Text>
          <TextInput
            className="mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.notes}
            onChangeText={(t) => updateForm("notes", t)}
            placeholder="Additional notes about this supplier..."
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />

          <ActionButton
            label={editMode ? "Save Changes" : "Add Supplier"}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

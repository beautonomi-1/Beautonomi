import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Switch,
  Alert,
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
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

type AddonType = "service" | "product" | "upgrade";

interface ServiceAddon {
  id: string;
  name: string;
  description: string | null;
  type: AddonType;
  category: string | null;
  price: number;
  currency: string;
  duration_minutes: number | null;
  is_active: boolean;
  is_recommended: boolean;
  max_quantity: number | null;
  requires_service: boolean;
  sort_order: number;
}

interface AddonForm {
  name: string;
  description: string;
  type: AddonType;
  price: string;
  duration_minutes: string;
  is_active: boolean;
  is_recommended: boolean;
  max_quantity: string;
  requires_service: boolean;
}

const EMPTY_FORM: AddonForm = {
  name: "",
  description: "",
  type: "service",
  price: "",
  duration_minutes: "",
  is_active: true,
  is_recommended: false,
  max_quantity: "",
  requires_service: false,
};

const TYPE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Service", value: "service" },
  { label: "Product", value: "product" },
  { label: "Upgrade", value: "upgrade" },
];

function typeStyle(t: AddonType) {
  switch (t) {
    case "service": return { bg: "bg-indigo-50", text: "text-indigo-700", icon: "cut-outline" as const, color: "#6366f1" };
    case "product": return { bg: "bg-emerald-50", text: "text-emerald-700", icon: "cube-outline" as const, color: "#10b981" };
    case "upgrade": return { bg: "bg-amber-50", text: "text-amber-700", icon: "arrow-up-circle-outline" as const, color: "#f59e0b" };
  }
}

export default function ServiceAddonsScreen() {
  const tenantCurrency = getTenantDefaultCurrency();
  useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingAddon, setEditingAddon] = useState<ServiceAddon | null>(null);
  const [form, setForm] = useState<AddonForm>(EMPTY_FORM);

  const { data: addons, loading, error: loadError, refresh } = useApi<ServiceAddon[]>("/api/provider/addons");
  const { execute: createAddon, loading: creating } = useApiPost<object, ServiceAddon>("/api/provider/addons");
  const { execute: updateAddon, loading: updating } = useApiMutation<ServiceAddon>("put");
  const { execute: deleteAddon } = useApiMutation<void>("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = addons ?? [];
    if (typeFilter !== "all") list = list.filter((a) => a.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q));
    }
    return list;
  }, [addons, typeFilter, search]);

  function updateForm(key: keyof AddonForm, value: any) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function openNew() {
    setEditingAddon(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(addon: ServiceAddon) {
    setEditingAddon(addon);
    setForm({
      name: addon.name,
      description: addon.description ?? "",
      type: addon.type,
      price: String(addon.price),
      duration_minutes: addon.duration_minutes ? String(addon.duration_minutes) : "",
      is_active: addon.is_active,
      is_recommended: addon.is_recommended,
      max_quantity: addon.max_quantity ? String(addon.max_quantity) : "",
      requires_service: addon.requires_service,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert("Required", "Addon name is required");
      return;
    }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) {
      Alert.alert("Invalid", "Price must be 0 or more");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      price,
      currency: tenantCurrency,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      is_active: form.is_active,
      is_recommended: form.is_recommended,
      max_quantity: form.max_quantity ? parseInt(form.max_quantity) : null,
      requires_service: form.requires_service,
    };

    if (editingAddon) {
      const { error } = await updateAddon(`/api/provider/addons/${editingAddon.id}`, payload);
      if (error) { Alert.alert("Error", error); return; }
    } else {
      const { error } = await createAddon(payload);
      if (error) { Alert.alert("Error", error); return; }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  function handleDelete(addon: ServiceAddon) {
    Alert.alert("Delete Addon", `Remove "${addon.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteAddon(`/api/provider/addons/${addon.id}`);
          if (error) Alert.alert("Error", error);
          else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refresh(); }
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Service Addons"
        showBack
        subtitle={`${addons?.length ?? 0} addons`}
        rightAction={
          <TouchableOpacity style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")} onPress={openNew}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search addons..." />
      <View style={twStyle("mt-2 mb-3")}>
        <FilterChipGroup options={TYPE_FILTERS} selected={typeFilter} onSelect={setTypeFilter} />
      </View>

      {loading && !addons && !loadError ? (
        <SkeletonList rows={5} />
      ) : loadError && !addons ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="add-circle-outline"
          title="No addons"
          description={search || typeFilter !== "all" ? "Try adjusting your filters" : "Create service addons to offer clients during booking"}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a: ServiceAddon) => a.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: addon }: { item: ServiceAddon }) => {
            const ts = typeStyle(addon.type);
            return (
              <TouchableOpacity
                style={twStyle(`rounded-xl border bg-white p-4 ${addon.is_active ? "border-gray-100" : "border-gray-100 opacity-60"}`)}
                onPress={() => openEdit(addon)}
                activeOpacity={0.7}
              >
                <View style={twStyle("flex-row items-start")}>
                  <View style={twStyle(`h-10 w-10 items-center justify-center rounded-xl ${ts.bg}`)}>
                    <Ionicons name={ts.icon} size={18} color={ts.color} />
                  </View>
                  <View style={twStyle("ml-3 flex-1")}>
                    <View style={twStyle("flex-row items-center")}>
                      <Text style={twStyle("text-[15px] font-semibold text-gray-900")}>{addon.name}</Text>
                      {addon.is_recommended && (
                        <View style={twStyle("ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5")}>
                          <Ionicons name="star" size={10} color="#f59e0b" />
                        </View>
                      )}
                    </View>
                    {addon.description && (
                      <Text style={twStyle("mt-0.5 text-xs text-gray-500")} numberOfLines={1}>{addon.description}</Text>
                    )}
                    <View style={twStyle("mt-1.5 flex-row items-center")}>
                      <View style={[twStyle(`rounded-full px-2 py-0.5 ${ts.bg}`), { marginRight: 8 }]}>
                        <Text style={twStyle(`text-[10px] font-medium capitalize ${ts.text}`)}>{addon.type}</Text>
                      </View>
                      {addon.duration_minutes && (
                        <Text style={[twStyle("text-[11px] text-gray-400"), { marginRight: 8 }]}>{addon.duration_minutes} min</Text>
                      )}
                      {!addon.is_active && (
                        <View style={twStyle("rounded-full bg-gray-100 px-2 py-0.5")}>
                          <Text style={twStyle("text-[10px] text-gray-500")}>Inactive</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={twStyle("items-end ml-2")}>
                    <Text style={twStyle("text-base font-bold text-gray-900")}>{formatCurrency(addon.price)}</Text>
                    <TouchableOpacity style={twStyle("mt-1 rounded-lg bg-red-50 p-1.5")} onPress={() => handleDelete(addon)}>
                      <Ionicons name="trash-outline" size={12} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Addon Form */}
      <BottomSheet visible={showForm} onClose={() => setShowForm(false)} title={editingAddon ? "Edit Addon" : "New Addon"}>
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Name *</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(t) => updateForm("name", t)}
            placeholder="e.g. Deep Conditioning Treatment"
            placeholderTextColor="#9ca3af"
          />

          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Type *</Text>
          <View style={twStyle("mb-3")}>
            <FilterChipGroup
              options={TYPE_FILTERS.filter((t) => t.value !== "all")}
              selected={form.type}
              onSelect={(v) => updateForm("type", v)}
            />
          </View>

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Price ({tenantCurrency}) *</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.price}
            onChangeText={(t) => updateForm("price", t)}
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
          />

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Description</Text>
          <TextInput
            style={twStyle("mb-3 min-h-[60px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(t) => updateForm("description", t)}
            placeholder="Brief description..."
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
          />

          {form.type === "service" && (
            <>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Extra Duration (minutes)</Text>
              <TextInput
                style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={form.duration_minutes}
                onChangeText={(t) => updateForm("duration_minutes", t)}
                placeholder="15"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
              />
            </>
          )}

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Max Quantity Per Booking</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.max_quantity}
            onChangeText={(t) => updateForm("max_quantity", t)}
            placeholder="Leave blank for unlimited"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
          />

          <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-3")}>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Recommended</Text>
              <Text style={twStyle("text-[11px] text-gray-500")}>Highlight this addon during booking</Text>
            </View>
            <Switch value={form.is_recommended} onValueChange={(v) => updateForm("is_recommended", v)} trackColor={{ false: "#e5e7eb", true: "#818cf8" }} thumbColor="#fff" />
          </View>

          <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-3")}>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Requires Service</Text>
              <Text style={twStyle("text-[11px] text-gray-500")}>Can only be added with a service</Text>
            </View>
            <Switch value={form.requires_service} onValueChange={(v) => updateForm("requires_service", v)} trackColor={{ false: "#e5e7eb", true: "#818cf8" }} thumbColor="#fff" />
          </View>

          <View style={twStyle("mb-4 flex-row items-center justify-between rounded-xl border border-gray-100 bg-white p-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>Active</Text>
            <Switch value={form.is_active} onValueChange={(v) => updateForm("is_active", v)} trackColor={{ false: "#e5e7eb", true: "#818cf8" }} thumbColor="#fff" />
          </View>

          <ActionButton label={editingAddon ? "Save Changes" : "Create Addon"} onPress={handleSave} loading={creating || updating} fullWidth />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

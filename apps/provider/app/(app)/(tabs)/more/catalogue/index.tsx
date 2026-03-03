import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation, useApiPost } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { formatCurrency, formatDuration } from "@/lib/format";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CategoryInfo {
  name: string;
  color: string;
}

interface ServiceItem {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  currency: string;
  is_active: boolean;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  sort_order: number;
  provider_categories?: CategoryInfo[];
}

interface CategoryOption {
  id: string;
  name: string;
  slug?: string;
  color: string | null;
  description?: string | null;
}

interface CategoriesResponse {
  own_categories: CategoryOption[];
  global_categories: CategoryOption[];
}

const EMPTY_FORM = {
  title: "",
  description: "",
  duration_minutes: "60",
  price: "",
  currency: "ZAR",
  category_id: "",
  supports_at_home: false,
  supports_at_salon: true,
  is_active: true,
};

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function CatalogueScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();

  // --- Data ---
  const { data: services, loading, error: servicesError, refresh } = useApi<ServiceItem[]>(
    "/api/provider/services",
  );
  const { data: categoriesResponse, refresh: refreshCategories } = useApi<CategoriesResponse>(
    "/api/provider/categories",
  );
  const categories = useMemo<CategoryOption[]>(() => {
    if (!categoriesResponse) return [];
    const raw = categoriesResponse as any;
    const own = raw.own_categories ?? raw ?? [];
    return Array.isArray(own) ? own : [];
  }, [categoriesResponse]);

  const { execute: toggleService } = useApiMutation("patch");
  const { execute: reorderService } = useApiMutation("patch");
  const { execute: createService, loading: creating } = useApiPost<
    Record<string, unknown>,
    ServiceItem
  >("/api/provider/services");
  const { execute: createCategory, loading: creatingCat } = useApiPost<
    Record<string, unknown>,
    CategoryOption
  >("/api/provider/categories");
  const { execute: updateCategory } = useApiMutation("put");
  const { execute: deleteCategory } = useApiMutation("delete");

  // --- Local state ---
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Category CRUD state
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", color: "", description: "" });
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshCategories()]);
    setRefreshing(false);
  }, [refresh, refreshCategories]);

  // --- Category CRUD ---
  function openAddCategory() {
    setCatForm({ name: "", color: "#6366f1", description: "" });
    setEditingCatId(null);
    setCatSheetOpen(true);
  }

  function openEditCategory(cat: CategoryOption) {
    setCatForm({ name: cat.name, color: cat.color ?? "#6366f1", description: cat.description ?? "" });
    setEditingCatId(cat.id);
    setCatSheetOpen(true);
  }

  async function handleSaveCategory() {
    if (!catForm.name.trim()) {
      Alert.alert("Validation", "Category name is required.");
      return;
    }
    if (editingCatId) {
      const { error: err } = await updateCategory(
        `/api/provider/categories/${editingCatId}`,
        { name: catForm.name.trim(), color: catForm.color || null, description: catForm.description.trim() || null },
      );
      if (err) { Alert.alert("Error", err); return; }
    } else {
      const { error: err } = await createCategory({
        name: catForm.name.trim(),
        color: catForm.color || null,
        description: catForm.description.trim() || null,
      });
      if (err) { Alert.alert("Error", err); return; }
    }
    setCatSheetOpen(false);
    refreshCategories();
    refresh();
  }

  function handleDeleteCategory(cat: CategoryOption) {
    Alert.alert("Delete Category", `Delete "${cat.name}"? Services in this category will become uncategorized.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error: err } = await deleteCategory(`/api/provider/categories/${cat.id}`, {});
          if (err) Alert.alert("Error", err);
          else { refreshCategories(); refresh(); }
        },
      },
    ]);
  }

  // --- Filtering ---
  const filtered = useMemo(() => {
    let items = services ?? [];
    if (filter === "active") items = items.filter((s) => s.is_active);
    if (filter === "inactive") items = items.filter((s) => !s.is_active);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q),
      );
    }
    return items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [services, filter, search]);

  // --- Grouped by category ---
  const grouped = useMemo(() => {
    const map = new Map<string, ServiceItem[]>();
    for (const item of filtered) {
      const cat = item.provider_categories?.[0]?.name ?? "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // --- Handlers ---
  async function handleToggleActive(service: ServiceItem) {
    const { error } = await toggleService(
      `/api/provider/services/${service.id}`,
      { is_active: !service.is_active },
    );
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  async function handleReorder(serviceId: string, direction: "up" | "down") {
    const all = services ?? [];
    const idx = all.findIndex((s) => s.id === serviceId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) return;

    const { error } = await reorderService(
      `/api/provider/services/${serviceId}/reorder`,
      { direction },
    );
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function toggleCollapse(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkToggle(activate: boolean) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      Alert.alert("No Selection", "Select services to update.");
      return;
    }
    const label = activate ? "activate" : "deactivate";
    Alert.alert(
      `Bulk ${activate ? "Activate" : "Deactivate"}`,
      `${label.charAt(0).toUpperCase() + label.slice(1)} ${ids.length} service(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            for (const id of ids) {
              await toggleService(`/api/provider/services/${id}`, {
                is_active: activate,
              });
            }
            setSelectedIds(new Set());
            setBulkMode(false);
            refresh();
          },
        },
      ],
    );
  }

  function openAddSheet() {
    setForm({ ...EMPTY_FORM });
    setAddSheetOpen(true);
  }

  async function handleSubmitService() {
    if (!form.title.trim()) {
      Alert.alert("Validation", "Service name is required.");
      return;
    }
    if (!form.price || isNaN(parseFloat(form.price))) {
      Alert.alert("Validation", "A valid price is required.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      duration_minutes: parseInt(form.duration_minutes, 10) || 60,
      price: parseFloat(form.price),
      currency: form.currency,
      category_id: form.category_id || null,
      supports_at_home: form.supports_at_home,
      supports_at_salon: form.supports_at_salon,
      is_active: form.is_active,
    };
    const { error } = await createService(payload as any);
    if (error) {
      Alert.alert("Error", error);
    } else {
      setAddSheetOpen(false);
      refresh();
    }
  }

  // --- Render ---
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Catalogue"
        showBack
        subtitle={`${services?.length ?? 0} services`}
        rightAction={
          <TouchableOpacity
            onPress={openAddSheet}
            className="flex-row items-center rounded-xl bg-gray-900 px-4 py-2"
            accessibilityLabel="Add service"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="ml-1 text-sm font-semibold text-white">Add</Text>
          </TouchableOpacity>
        }
      />

      {/* ── Search & Filter ── */}
      <View className="mb-3">
        <SearchBar
          placeholder="Search services..."
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <View className="mb-3 flex-row items-center justify-between">
        <FilterChipGroup
          options={[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
          ]}
          selected={filter}
          onSelect={setFilter}
        />
        <TouchableOpacity
          onPress={() => {
            setBulkMode(!bulkMode);
            setSelectedIds(new Set());
          }}
          hitSlop={8}
          accessibilityLabel="Toggle bulk mode"
        >
          <Ionicons
            name={bulkMode ? "close-circle" : "checkbox-outline"}
            size={22}
            color={bulkMode ? "#ef4444" : "#6b7280"}
          />
        </TouchableOpacity>
      </View>

      {/* ── Category Chips (quick manage) ── */}
      {categories.length > 0 && (
        <View className="mb-3 flex-row flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              className="flex-row items-center rounded-full border border-gray-200 bg-white px-3 py-1.5"
              onPress={() => openEditCategory(cat)}
              onLongPress={() => handleDeleteCategory(cat)}
              accessibilityLabel={`Edit category ${cat.name}`}
            >
              {cat.color && (
                <View className="mr-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
              )}
              <Text className="text-xs font-medium text-gray-700">{cat.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            className="flex-row items-center rounded-full border border-dashed border-gray-300 px-3 py-1.5"
            onPress={openAddCategory}
            accessibilityLabel="Add category"
          >
            <Ionicons name="add" size={14} color="#6b7280" />
            <Text className="ml-1 text-xs font-medium text-gray-500">Category</Text>
          </TouchableOpacity>
        </View>
      )}
      {categories.length === 0 && (
        <TouchableOpacity
          className="mb-3 flex-row items-center rounded-xl border border-dashed border-gray-300 p-3"
          onPress={openAddCategory}
          accessibilityLabel="Add first category"
        >
          <Ionicons name="folder-open-outline" size={18} color="#6b7280" />
          <Text className="ml-2 text-sm text-gray-500">Add your first category to organize services</Text>
        </TouchableOpacity>
      )}

      {/* ── Bulk Actions Bar ── */}
      {bulkMode && selectedIds.size > 0 && (
        <View className="mb-3 flex-row items-center gap-3 rounded-xl bg-gray-50 p-3">
          <Text className="flex-1 text-sm text-gray-700">
            {selectedIds.size} selected
          </Text>
          <TouchableOpacity
            className="rounded-lg bg-green-500 px-3 py-1.5"
            onPress={() => handleBulkToggle(true)}
            accessibilityLabel="Bulk activate"
          >
            <Text className="text-xs font-medium text-white">Activate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-lg bg-gray-400 px-3 py-1.5"
            onPress={() => handleBulkToggle(false)}
            accessibilityLabel="Bulk deactivate"
          >
            <Text className="text-xs font-medium text-white">Deactivate</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Service List ── */}
      {loading && !services ? (
        <SkeletonList rows={5} />
      ) : servicesError && !services ? (
        <ErrorState message={servicesError} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="layers-outline"
          title="No services"
          description="Add services to your catalogue"
        />
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={([cat]: [string, ServiceItem[]]) => cat}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item: [category, items] }: { item: [string, ServiceItem[]] }) => {
            const isCollapsed = collapsedCategories.has(category);
            return (
              <View className="mb-4">
                {/* Category header */}
                <TouchableOpacity
                  className="mb-2 flex-row items-center justify-between"
                  onPress={() => toggleCollapse(category)}
                  accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${category}`}
                >
                  <Text className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                    {category} ({items.length})
                  </Text>
                  <Ionicons
                    name={isCollapsed ? "chevron-down" : "chevron-up"}
                    size={16}
                    color="#9ca3af"
                  />
                </TouchableOpacity>

                {!isCollapsed && (
                  <View className={isTablet ? "flex-row flex-wrap gap-3" : "gap-2"}>
                    {items.map((service: ServiceItem, svcIdx: number) => (
                      <View
                        key={service.id}
                        className={`rounded-xl border border-gray-100 bg-white p-4 ${isTablet ? "w-[48.5%]" : ""} ${!service.is_active ? "opacity-60" : ""}`}
                      >
                        <TouchableOpacity
                          className="flex-row items-start"
                          onPress={() => {
                            if (bulkMode) {
                              toggleSelected(service.id);
                            } else {
                              router.push(
                                `/(app)/(tabs)/more/catalogue/${service.id}` as any,
                              );
                            }
                          }}
                          accessibilityLabel={`${bulkMode ? "Select" : "View"} ${service.title}`}
                        >
                          {bulkMode && (
                            <Ionicons
                              name={
                                selectedIds.has(service.id)
                                  ? "checkbox"
                                  : "square-outline"
                              }
                              size={20}
                              color={
                                selectedIds.has(service.id) ? "#6366f1" : "#9ca3af"
                              }
                              style={{ marginRight: 8, marginTop: 2 }}
                            />
                          )}
                          <View className="flex-1">
                            <Text
                              className="text-base font-semibold text-gray-900"
                              numberOfLines={1}
                            >
                              {service.title}
                            </Text>
                            {service.description ? (
                              <Text
                                className="mt-0.5 text-xs text-gray-500"
                                numberOfLines={2}
                              >
                                {service.description}
                              </Text>
                            ) : null}
                          </View>
                          <Text className="ml-2 text-base font-bold text-gray-900">
                            {formatCurrency(service.price, service.currency)}
                          </Text>
                        </TouchableOpacity>

                        {/* Meta row */}
                        <View className="mt-2 flex-row items-center justify-between">
                          <View className="flex-row items-center gap-3">
                            <View className="flex-row items-center">
                              <Ionicons
                                name="time-outline"
                                size={12}
                                color="#9ca3af"
                              />
                              <Text className="ml-1 text-xs text-gray-500">
                                {formatDuration(service.duration_minutes)}
                              </Text>
                            </View>
                            {service.supports_at_home && (
                              <View className="flex-row items-center">
                                <Ionicons
                                  name="home-outline"
                                  size={12}
                                  color="#9ca3af"
                                />
                                <Text className="ml-1 text-xs text-gray-500">
                                  Home
                                </Text>
                              </View>
                            )}
                            {service.supports_at_salon && (
                              <View className="flex-row items-center">
                                <Ionicons
                                  name="business-outline"
                                  size={12}
                                  color="#9ca3af"
                                />
                                <Text className="ml-1 text-xs text-gray-500">
                                  Salon
                                </Text>
                              </View>
                            )}
                          </View>

                          <View className="flex-row items-center gap-2">
                            {/* Reorder buttons */}
                            {!bulkMode && (
                              <>
                                <TouchableOpacity
                                  hitSlop={6}
                                  onPress={() =>
                                    handleReorder(service.id, "up")
                                  }
                                  accessibilityLabel={`Move ${service.title} up`}
                                >
                                  <Ionicons
                                    name="arrow-up-circle-outline"
                                    size={20}
                                    color="#9ca3af"
                                  />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  hitSlop={6}
                                  onPress={() =>
                                    handleReorder(service.id, "down")
                                  }
                                  accessibilityLabel={`Move ${service.title} down`}
                                >
                                  <Ionicons
                                    name="arrow-down-circle-outline"
                                    size={20}
                                    color="#9ca3af"
                                  />
                                </TouchableOpacity>
                              </>
                            )}
                            {/* Active toggle */}
                            <TouchableOpacity
                              hitSlop={8}
                              onPress={() => handleToggleActive(service)}
                              accessibilityLabel={`Toggle ${service.title} active`}
                            >
                              <View
                                className={`h-6 w-10 rounded-full ${service.is_active ? "bg-green-500" : "bg-gray-300"} justify-center px-0.5`}
                              >
                                <View
                                  className={`h-5 w-5 rounded-full bg-white ${service.is_active ? "self-end" : "self-start"}`}
                                />
                              </View>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  Add Service Bottom Sheet                                   */}
      {/* ════════════════════════════════════════════════════════════ */}
      <BottomSheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        title="Add Service"
        snapHeight="full"
      >
        <FormField
          label="Service Name *"
          value={form.title}
          onChangeText={(t) => setForm((p) => ({ ...p, title: t }))}
          placeholder="e.g. Haircut & Blow Dry"
        />
        <FormField
          label="Description"
          value={form.description}
          onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
          placeholder="Brief description..."
          multiline
        />

        <View className="mb-3 flex-row gap-3">
          <View className="flex-1">
            <FormField
              label="Duration (min)"
              value={form.duration_minutes}
              onChangeText={(t) =>
                setForm((p) => ({ ...p, duration_minutes: t }))
              }
              placeholder="60"
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <FormField
              label="Price (R) *"
              value={form.price}
              onChangeText={(t) => setForm((p) => ({ ...p, price: t }))}
              placeholder="350.00"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Currency */}
        <Text className="mb-1 text-sm font-medium text-gray-700">Currency</Text>
        <View className="mb-3 flex-row gap-2">
          {["ZAR", "USD", "GBP", "EUR"].map((c) => (
            <TouchableOpacity
              key={c}
              className={`rounded-full px-4 py-2 ${form.currency === c ? "bg-gray-900" : "border border-gray-200 bg-white"}`}
              onPress={() => setForm((p) => ({ ...p, currency: c }))}
              accessibilityLabel={`Select currency ${c}`}
            >
              <Text
                className={`text-sm font-medium ${form.currency === c ? "text-white" : "text-gray-600"}`}
              >
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category Selector */}
        {categories && categories.length > 0 && (
          <>
            <Text className="mb-1 text-sm font-medium text-gray-700">Category</Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  className={`rounded-full px-4 py-2 ${form.category_id === cat.id ? "bg-gray-900" : "border border-gray-200 bg-white"}`}
                  onPress={() =>
                    setForm((p) => ({
                      ...p,
                      category_id: p.category_id === cat.id ? "" : cat.id,
                    }))
                  }
                  accessibilityLabel={`Select category ${cat.name}`}
                >
                  <Text
                    className={`text-sm font-medium ${form.category_id === cat.id ? "text-white" : "text-gray-600"}`}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Toggles */}
        <View className="mb-3 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons name="home-outline" size={18} color="#6b7280" />
              <Text className="ml-2 text-sm text-gray-900">At Home</Text>
            </View>
            <Switch
              value={form.supports_at_home}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, supports_at_home: v }))
              }
              trackColor={{ false: "#d1d5db", true: "#6366f1" }}
              thumbColor="#fff"
              accessibilityLabel="Toggle at home"
            />
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons name="business-outline" size={18} color="#6b7280" />
              <Text className="ml-2 text-sm text-gray-900">At Salon</Text>
            </View>
            <Switch
              value={form.supports_at_salon}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, supports_at_salon: v }))
              }
              trackColor={{ false: "#d1d5db", true: "#6366f1" }}
              thumbColor="#fff"
              accessibilityLabel="Toggle at salon"
            />
          </View>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons name="checkmark-circle-outline" size={18} color="#6b7280" />
              <Text className="ml-2 text-sm text-gray-900">Active</Text>
            </View>
            <Switch
              value={form.is_active}
              onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              thumbColor="#fff"
              accessibilityLabel="Toggle active status"
            />
          </View>
        </View>

        <View className="mt-2">
          <ActionButton
            label="Add Service"
            onPress={handleSubmitService}
            loading={creating}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  Category CRUD Bottom Sheet                                 */}
      {/* ════════════════════════════════════════════════════════════ */}
      <BottomSheet
        visible={catSheetOpen}
        onClose={() => setCatSheetOpen(false)}
        title={editingCatId ? "Edit Category" : "New Category"}
      >
        <FormField
          label="Category Name *"
          value={catForm.name}
          onChangeText={(t) => setCatForm((p) => ({ ...p, name: t }))}
          placeholder="e.g. Hair, Nails, Skincare"
        />
        <FormField
          label="Description"
          value={catForm.description}
          onChangeText={(t) => setCatForm((p) => ({ ...p, description: t }))}
          placeholder="Optional description..."
          multiline
        />

        <Text className="mb-1 text-sm font-medium text-gray-700">Color</Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {["#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#f97316"].map((c) => (
            <TouchableOpacity
              key={c}
              className={`h-9 w-9 items-center justify-center rounded-full ${catForm.color === c ? "border-2 border-gray-900" : "border border-gray-200"}`}
              style={{ backgroundColor: c }}
              onPress={() => setCatForm((p) => ({ ...p, color: c }))}
              accessibilityLabel={`Color ${c}`}
            >
              {catForm.color === c && (
                <Ionicons name="checkmark" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row gap-3">
          {editingCatId && (
            <View className="flex-1">
              <ActionButton
                label="Delete"
                variant="danger"
                onPress={() => {
                  const cat = categories.find((c) => c.id === editingCatId);
                  if (cat) { setCatSheetOpen(false); handleDeleteCategory(cat); }
                }}
                fullWidth
              />
            </View>
          )}
          <View className="flex-1">
            <ActionButton
              label={editingCatId ? "Save" : "Create"}
              onPress={handleSaveCategory}
              loading={creatingCat}
              fullWidth
            />
          </View>
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline Form Field                                                  */
/* ------------------------------------------------------------------ */

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
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  multiline?: boolean;
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-gray-700">{label}</Text>
      <TextInput
        className={`rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 ${multiline ? "min-h-[80px]" : ""}`}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        accessibilityLabel={label}
      />
    </View>
  );
}

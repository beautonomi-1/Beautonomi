import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { Colors } from "@/constants/colors";
import { tabScreenScrollBottomPadding } from "@/constants/layout";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { groupServicesIntoSections } from "@/features/catalogue/groupServicesIntoSections";
import type { CatalogueServiceItem, CategoryOption as SharedCategoryOption, ServiceSection } from "@/features/catalogue/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ServiceItem extends CatalogueServiceItem {
  title: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  currency: string;
  is_active: boolean;
}

interface CategoryOption extends SharedCategoryOption {
  slug?: string;
  description?: string | null;
}

interface CategoriesResponse {
  own_categories: CategoryOption[];
  global_categories: CategoryOption[];
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function CatalogueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listBottomPadding = tabScreenScrollBottomPadding(insets.bottom, 16);
  const { isTablet } = useResponsive();

  // --- Data ---
  const { data: services, loading, error: servicesError, refresh } = useApi<ServiceItem[]>(
    "/api/provider/services?include_inactive=true&include_variants=true",
  );
  const { data: categoriesResponse, refresh: refreshCategories } = useApi<
    CategoriesResponse | CategoryOption[]
  >("/api/provider/categories");
  const categories = useMemo<CategoryOption[]>(() => {
    if (!categoriesResponse) return [];
    if (Array.isArray(categoriesResponse)) return categoriesResponse;
    const own = categoriesResponse.own_categories;
    return Array.isArray(own) ? own : [];
  }, [categoriesResponse]);

  const { execute: toggleService } = useApiMutation("patch");
  const { execute: reorderService } = useApiMutation("patch");
  const { execute: reorderCategory } = useApiMutation("patch");
  const { execute: createCategory, loading: creatingCat } = useApiPost<
    Record<string, unknown>,
    CategoryOption
  >("/api/provider/categories");
  const { execute: updateCategory } = useApiMutation("put");
  const { execute: deleteCategory } = useApiMutation("delete");
  const { execute: deleteService } = useApiMutation("delete");

  // --- Local state ---
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Category CRUD state
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", color: "", description: "" });
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshCategories()]);
    } finally {
      setRefreshing(false);
    }
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
    Alert.alert("Delete Category", `Delete "${cat.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const result = (await deleteCategory(`/api/provider/categories/${cat.id}`, {})) as {
            error?: string;
            errorCode?: string;
            data?: { services?: Array<{ id: string; name: string }> };
          };
          if (result.error) {
            if (result.errorCode === "CATEGORY_HAS_SERVICES" || result.error.includes("services")) {
              const names = result.data?.services?.map((s) => s.name).join(", ") ?? "assigned services";
              Alert.alert(
                "Category has services",
                `Reassign or delete these services first: ${names}`,
              );
            } else {
              Alert.alert("Error", result.error);
            }
            return;
          }
          refreshCategories();
          refresh();
        },
      },
    ]);
  }

  async function handleReorderCategory(catId: string, direction: "up" | "down") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error: err } = await reorderCategory(`/api/provider/categories/${catId}`, { direction });
    if (err) Alert.alert("Error", err);
    else refreshCategories();
  }

  const grouped = useMemo(
    () =>
      groupServicesIntoSections(
        (services ?? []) as CatalogueServiceItem[],
        categories,
        {
          includeVariants: true,
          search,
          filter: filter as "all" | "active" | "inactive",
        },
      ),
    [services, categories, search, filter],
  );

  const hasServices = (services ?? []).some(
    (s) => s.service_type !== "variant" && !s.parent_service_id,
  );

  function handleDeleteServiceItem(service: ServiceItem) {
    Alert.alert("Delete service", `Remove "${service.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteService(`/api/provider/services/${service.id}`);
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  function openServiceKebab(service: ServiceItem) {
    Alert.alert(service.title, undefined, [
      {
        text: "Edit",
        onPress: () => router.push(`/(app)/(tabs)/more/service-form?id=${service.id}` as never),
      },
      {
        text: service.is_active ? "Deactivate" : "Activate",
        onPress: () => handleToggleActive(service),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => handleDeleteServiceItem(service),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function toggleVariantExpand(serviceId: string) {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  }

  async function handleToggleActive(service: ServiceItem) {
    const { error } = await toggleService(
      `/api/provider/services/${service.id}`,
      { is_active: !service.is_active },
    );
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function canReorderInSection(items: ServiceItem[], serviceId: string, direction: "up" | "down"): boolean {
    const topLevel = items.filter((s) => !s.parent_service_id);
    const idx = topLevel.findIndex((s) => s.id === serviceId);
    if (idx < 0) return false;
    if (direction === "up") return idx > 0;
    return idx < topLevel.length - 1;
  }

  async function handleReorder(serviceId: string, direction: "up" | "down") {
    // §Provider-audit 2026-04 (catalogue round 2): the server endpoint
    // previously did not exist so this button was silently a no-op. The
    // route at /api/provider/services/[id]/reorder now swaps display_order
    // with the neighbour; give the provider immediate tactile feedback.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await reorderService(
      `/api/provider/services/${serviceId}/reorder`,
      { direction },
    );
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Could not reorder", error);
    } else {
      refresh();
    }
  }

  function toggleCollapse(sectionKey: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
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
            const failures: string[] = [];
            for (const id of ids) {
              const { error: err } = await toggleService(`/api/provider/services/${id}`, {
                is_active: activate,
              });
              if (err) failures.push(id);
            }
            setSelectedIds(new Set());
            setBulkMode(false);
            refresh();
            if (failures.length > 0) {
              Alert.alert("Partial failure", `${failures.length} service(s) could not be updated. Please try again.`);
            }
          },
        },
      ],
    );
  }

  function openAddSheet() {
    // Keep add/edit parity on a single screen: the dedicated service form
    // includes the full field set and the current create payload contract.
    router.push("/(app)/(tabs)/more/service-form" as never);
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
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: Colors.gray[900], paddingHorizontal: 16, paddingVertical: 8 }}
            accessibilityLabel="Add service"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ marginLeft: 4, fontSize: 14, fontWeight: "600", color: Colors.white }}>Add</Text>
          </TouchableOpacity>
        }
      />

      <View style={{ marginBottom: 12, flexDirection: "row", gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: Colors.gray[900],
            backgroundColor: Colors.gray[50],
          }}
          accessibilityRole="text"
          accessibilityLabel="Services catalogue, current section"
        >
          <Ionicons name="cut-outline" size={18} color={Colors.gray[900]} />
          <Text style={{ fontWeight: "700", fontSize: 13, color: Colors.gray[900] }}>Services</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/more/products" as never);
          }}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
          }}
          accessibilityRole="button"
          accessibilityLabel="Open products and variants"
        >
          <Ionicons name="cube-outline" size={18} color="#8b5cf6" />
          <Text style={{ fontWeight: "600", fontSize: 13, color: Colors.gray[800] }}>Products</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/more/packages-list" as never);
          }}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            backgroundColor: Colors.white,
          }}
          accessibilityRole="button"
          accessibilityLabel="Open packages"
        >
          <Ionicons name="layers-outline" size={18} color="#4f46e5" />
          <Text style={{ fontWeight: "600", fontSize: 13, color: Colors.gray[800] }}>Packages</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginBottom: 12 }}>
        <SearchBar placeholder="Search services..." value={search} onChangeText={setSearch} />
      </View>
      <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
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

      {categories.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], letterSpacing: 0.5, textTransform: "uppercase", flex: 1 }}>
              Categories
            </Text>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 9999, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[300], paddingHorizontal: 10, paddingVertical: 4 }}
              onPress={openAddCategory}
              accessibilityLabel="Add category"
            >
              <Ionicons name="add" size={14} color="#6b7280" />
              <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Add</Text>
            </TouchableOpacity>
          </View>
          {categories.map((cat, idx) => (
            <View
              key={cat.id}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}
            >
              {/* Colour dot */}
              {cat.color ? (
                <View style={{ height: 12, width: 12, borderRadius: 9999, backgroundColor: cat.color, marginRight: 10 }} />
              ) : (
                <Ionicons name="folder-outline" size={14} color="#9ca3af" style={{ marginRight: 10 }} />
              )}
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{cat.name}</Text>
              {/* Up / Down reorder */}
              <TouchableOpacity
                hitSlop={6}
                onPress={() => handleReorderCategory(cat.id, "up")}
                disabled={idx === 0}
                accessibilityLabel={`Move ${cat.name} up`}
                style={{ marginRight: 4, opacity: idx === 0 ? 0.3 : 1 }}
              >
                <Ionicons name="chevron-up" size={18} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                hitSlop={6}
                onPress={() => handleReorderCategory(cat.id, "down")}
                disabled={idx === categories.length - 1}
                accessibilityLabel={`Move ${cat.name} down`}
                style={{ marginRight: 10, opacity: idx === categories.length - 1 ? 0.3 : 1 }}
              >
                <Ionicons name="chevron-down" size={18} color="#6b7280" />
              </TouchableOpacity>
              {/* Edit */}
              <TouchableOpacity
                hitSlop={6}
                onPress={() => openEditCategory(cat)}
                accessibilityLabel={`Edit ${cat.name}`}
              >
                <Ionicons name="pencil-outline" size={16} color="#6b7280" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {categories.length === 0 && (
        <TouchableOpacity
          style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[300], padding: 12 }}
          onPress={openAddCategory}
          accessibilityLabel="Add first category"
        >
          <Ionicons name="folder-open-outline" size={18} color="#6b7280" />
          <Text style={{ marginLeft: 8, fontSize: 14, color: Colors.gray[500] }}>Add your first category to organize services</Text>
        </TouchableOpacity>
      )}

      {bulkMode && selectedIds.size > 0 && (
        <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
          <Text style={{ flex: 1, fontSize: 14, color: Colors.gray[700] }}>{selectedIds.size} selected</Text>
          <TouchableOpacity
            style={{ borderRadius: 8, backgroundColor: "#22c55e", paddingHorizontal: 12, paddingVertical: 6, marginRight: 12 }}
            onPress={() => handleBulkToggle(true)}
            accessibilityLabel="Bulk activate"
          >
            <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.white }}>Activate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ borderRadius: 8, backgroundColor: Colors.gray[400], paddingHorizontal: 12, paddingVertical: 6 }}
            onPress={() => handleBulkToggle(false)}
            accessibilityLabel="Bulk deactivate"
          >
            <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.white }}>Deactivate</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Service List ── */}
      {loading && !services ? (
        <SkeletonList rows={5} />
      ) : servicesError && !services ? (
        <ErrorState message={servicesError} onRetry={refresh} />
      ) : !hasServices || grouped.length === 0 ? (
        <EmptyState
          icon="layers-outline"
          title="No services"
          description="Add services to your catalogue"
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={grouped}
          keyExtractor={(s: ServiceSection) => s.sectionKey}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: listBottomPadding }}
          renderItem={({ item: section }: { item: ServiceSection }) => {
            const { sectionKey, title, color, items } = section;
            const isCollapsed = collapsedCategories.has(sectionKey);
            const accent = color && color.trim() ? color : Colors.gray[300];
            return (
              <View style={{ marginBottom: 16 }}>
                <TouchableOpacity
                  style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  onPress={() => toggleCollapse(sectionKey)}
                  accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${title}`}
                >
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      borderLeftWidth: 4,
                      borderLeftColor: accent,
                      paddingLeft: 10,
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[800] }} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: "500", color: Colors.gray[400] }}>
                      ({items.length})
                    </Text>
                  </View>
                  <Ionicons name={isCollapsed ? "chevron-down" : "chevron-up"} size={16} color="#9ca3af" />
                </TouchableOpacity>

                {!isCollapsed && (
                  <View style={[isTablet ? { flexDirection: "row", flexWrap: "wrap" } : {}]}>
                    {items.map((service: ServiceItem) => (
                      <View
                        key={service.id}
                        style={[
                          { borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: Colors.white, padding: 16 },
                          isTablet ? { width: "48.5%", marginRight: 12, marginBottom: 12 } : { marginBottom: 8 },
                          !service.is_active && { opacity: 0.6 },
                        ]}
                      >
                        <TouchableOpacity
                          style={{ flexDirection: "row", alignItems: "flex-start" }}
                          onPress={() => {
                            if (bulkMode) toggleSelected(service.id);
                            else router.push(`/(app)/(tabs)/more/catalogue/${service.id}` as never);
                          }}
                          accessibilityLabel={`${bulkMode ? "Select" : "View"} ${service.title}`}
                        >
                          {bulkMode && (
                            <Ionicons
                              name={selectedIds.has(service.id) ? "checkbox" : "square-outline"}
                              size={20}
                              color={selectedIds.has(service.id) ? "#6366f1" : "#9ca3af"}
                              style={{ marginRight: 8, marginTop: 2 }}
                            />
                          )}
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], flexShrink: 1 }} numberOfLines={1}>
                                {service.title}
                              </Text>
                              {service.service_type === "addon" ? (
                                <View style={{ marginLeft: 8, borderRadius: 9999, backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#b45309" }}>Add-on</Text>
                                </View>
                              ) : null}
                              {service.service_type === "package" ? (
                                <View style={{ marginLeft: 8, borderRadius: 9999, backgroundColor: "#e0e7ff", paddingHorizontal: 8, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#4338ca" }}>Package</Text>
                                </View>
                              ) : null}
                              {(service.variants?.length ?? 0) > 0 ? (
                                <View style={{ marginLeft: 8, borderRadius: 9999, backgroundColor: "#f3f4f6", paddingHorizontal: 8, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#4b5563" }}>{service.variants!.length} variants</Text>
                                </View>
                              ) : null}
                              {service.is_onboarding_auto_generated ? (
                                <View
                                  style={{
                                    marginLeft: 8,
                                    borderRadius: 9999,
                                    backgroundColor: "#e0f2fe",
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                  }}
                                >
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#0369a1" }}>Starter</Text>
                                </View>
                              ) : null}
                            </View>
                            {service.description ? (
                              <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }} numberOfLines={2}>{service.description}</Text>
                            ) : null}
                          </View>
                          <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                            {formatCurrency(service.price, service.currency)}
                          </Text>
                        </TouchableOpacity>

                        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
                              <Ionicons name="time-outline" size={12} color="#9ca3af" />
                              <Text style={{ marginLeft: 4, fontSize: 12, color: Colors.gray[500] }}>{formatDuration(service.duration_minutes)}</Text>
                            </View>
                            {service.supports_at_home && (
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Ionicons name="home-outline" size={12} color="#9ca3af" />
                                <Text style={{ marginLeft: 4, fontSize: 12, color: Colors.gray[500] }}>Home</Text>
                              </View>
                            )}
                            {service.supports_at_salon && (
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Ionicons name="business-outline" size={12} color="#9ca3af" />
                                <Text style={{ marginLeft: 4, fontSize: 12, color: Colors.gray[500] }}>Salon</Text>
                              </View>
                            )}
                          </View>

                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            {!bulkMode && (
                              <>
                                <TouchableOpacity
                                  hitSlop={6}
                                  onPress={() => handleReorder(service.id, "up")}
                                  disabled={!canReorderInSection(items as ServiceItem[], service.id, "up")}
                                  accessibilityLabel={`Move ${service.title} up`}
                                  style={{ marginRight: 8, opacity: canReorderInSection(items as ServiceItem[], service.id, "up") ? 1 : 0.3 }}
                                >
                                  <Ionicons name="arrow-up-circle-outline" size={20} color="#9ca3af" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  hitSlop={6}
                                  onPress={() => handleReorder(service.id, "down")}
                                  disabled={!canReorderInSection(items as ServiceItem[], service.id, "down")}
                                  accessibilityLabel={`Move ${service.title} down`}
                                  style={{ marginRight: 8, opacity: canReorderInSection(items as ServiceItem[], service.id, "down") ? 1 : 0.3 }}
                                >
                                  <Ionicons name="arrow-down-circle-outline" size={20} color="#9ca3af" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  hitSlop={8}
                                  onPress={() => openServiceKebab(service)}
                                  accessibilityLabel={`Actions for ${service.title}`}
                                  style={{ marginRight: 8 }}
                                >
                                  <Ionicons name="ellipsis-vertical" size={20} color="#6b7280" />
                                </TouchableOpacity>
                              </>
                            )}
                            <TouchableOpacity hitSlop={8} onPress={() => handleToggleActive(service)} accessibilityLabel={`Toggle ${service.title} active`}>
                              <View style={{ height: 24, width: 40, borderRadius: 9999, backgroundColor: service.is_active ? "#22c55e" : Colors.gray[300], justifyContent: "center", paddingHorizontal: 2 }}>
                                <View style={{ height: 20, width: 20, borderRadius: 9999, backgroundColor: Colors.white, alignSelf: service.is_active ? "flex-end" : "flex-start" }} />
                              </View>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {(service.variants?.length ?? 0) > 0 ? (
                          <View style={{ marginTop: 8 }}>
                            <TouchableOpacity
                              onPress={() => toggleVariantExpand(service.id)}
                              style={{ flexDirection: "row", alignItems: "center" }}
                            >
                              <Ionicons
                                name={expandedVariants.has(service.id) ? "chevron-up" : "chevron-down"}
                                size={14}
                                color="#6b7280"
                              />
                              <Text style={{ marginLeft: 4, fontSize: 12, color: Colors.gray[600] }}>
                                {expandedVariants.has(service.id) ? "Hide variants" : "Show variants"}
                              </Text>
                            </TouchableOpacity>
                            {expandedVariants.has(service.id)
                              ? service.variants!.map((variant) => (
                                  <View
                                    key={variant.id}
                                    style={{
                                      marginTop: 6,
                                      marginLeft: 12,
                                      borderLeftWidth: 2,
                                      borderLeftColor: Colors.gray[200],
                                      paddingLeft: 10,
                                    }}
                                  >
                                    <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[800] }}>
                                      {variant.variant_name ?? variant.title ?? variant.name}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: Colors.gray[500] }}>
                                      {formatDuration(variant.duration_minutes ?? 0)} ·{" "}
                                      {formatCurrency(variant.price ?? 0, variant.currency ?? service.currency)}
                                    </Text>
                                  </View>
                                ))
                              : null}
                          </View>
                        ) : null}
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

        <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Color</Text>
        <View style={{ marginBottom: 16, flexDirection: "row", flexWrap: "wrap" }}>
          {["#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#f97316"].map((c) => (
            <TouchableOpacity
              key={c}
              style={{
                height: 36,
                width: 36,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9999,
                borderWidth: catForm.color === c ? 2 : 1,
                borderColor: catForm.color === c ? Colors.gray[900] : Colors.gray[200],
                backgroundColor: c,
                marginRight: 8,
                marginBottom: 8,
              }}
              onPress={() => setCatForm((p) => ({ ...p, color: c }))}
              accessibilityLabel={`Color ${c}`}
            >
              {catForm.color === c && <Ionicons name="checkmark" size={18} color="#fff" />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flexDirection: "row" }}>
          {editingCatId && (
            <View style={{ flex: 1, marginRight: 12 }}>
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
          <View style={{ flex: 1 }}>
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
    <View style={{ marginBottom: 12 }}>
      <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{label}</Text>
      <TextInput
        style={[
          { borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] },
          multiline && { minHeight: 80 },
        ]}
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

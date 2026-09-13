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
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
  product_count?: number;
  created_at: string;
}

const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#ec4899",
  "#3b82f6", "#8b5cf6", "#14b8a6", "#f97316", "#0ea5e9",
];

export default function ProductCategoriesScreen() {
  const { t } = useTranslation();
  const pc = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.productCategories.${key}`, opts) as string,
    [t],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: COLORS[0],
    is_active: true,
  });

  const { data: categories, loading, refresh } = useApi<ProductCategory[]>(
    "/api/provider/product-categories?include_inactive=true"
  );
  const { execute: createCategory, loading: creating } = useApiPost<any, any>(
    "/api/provider/product-categories"
  );
  const { execute: updateCategory, loading: updating } = useApiMutation("patch");
  const { execute: deleteCategory } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!categories) return [];
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    );
  }, [categories, search]);

  const activeCount = useMemo(
    () => categories?.filter((c) => c.is_active).length ?? 0,
    [categories]
  );
  const totalProducts = useMemo(
    () => categories?.reduce((sum, c) => sum + (c.product_count ?? 0), 0) ?? 0,
    [categories]
  );

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", color: COLORS[0], is_active: true });
    setShowForm(true);
  }

  function openEdit(cat: ProductCategory) {
    setEditing(cat);
    setForm({
      name: cat.name,
      description: cat.description ?? "",
      color: cat.color ?? COLORS[0],
      is_active: cat.is_active,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert(pc("requiredTitle"), pc("requiredBody"));
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
      is_active: form.is_active,
    };
    if (editing) {
      const { error } = await updateCategory(
        `/api/provider/product-categories/${editing.id}`,
        payload
      );
      if (error) {
        Alert.alert(pc("errorTitle"), error);
        return;
      }
    } else {
      const { error } = await createCategory(payload);
      if (error) {
        Alert.alert(pc("errorTitle"), error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  async function handleToggleActive(cat: ProductCategory) {
    const { error } = await updateCategory(
      `/api/provider/product-categories/${cat.id}`,
      { is_active: !cat.is_active }
    );
    if (error) Alert.alert(pc("errorTitle"), error);
    else refresh();
  }

  function handleDelete(cat: ProductCategory) {
    Alert.alert(pc("deleteTitle"), pc("deleteBody", { name: cat.name }), [
      { text: pc("cancel"), style: "cancel" },
      {
        text: pc("delete"),
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteCategory(
            `/api/provider/product-categories/${cat.id}`,
            {}
          );
          if (error) Alert.alert(pc("errorTitle"), error);
          else refresh();
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={pc("title")}
        showBack
        subtitle={pc("subtitle", { count: categories?.length ?? 0 })}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {categories && categories.length > 0 && (
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
            <StatCard
              title={pc("statActive")}
              value={String(activeCount)}
              icon="grid-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title={pc("statProducts")}
              value={String(totalProducts)}
              icon="cube-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
        </View>
      )}

      {categories && categories.length > 2 && (
        <View style={twStyle("mb-3")}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={pc("searchPlaceholder")}
          />
        </View>
      )}

      {loading && !categories ? (
        <SkeletonList rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="grid-outline"
          title={search ? pc("emptyMatches") : pc("emptyTitle")}
          description={
            search
              ? pc("emptyMatchesHint")
              : pc("emptyHint")
          }
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(c: ProductCategory) => c.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          renderItem={({ item: cat }: { item: ProductCategory }) => (
            <TouchableOpacity
              style={twStyle(`flex-row items-center rounded-xl border bg-white p-4 ${
                cat.is_active
                  ? "border-gray-100"
                  : "border-gray-100 opacity-60"
              }`)}
              onPress={() => openEdit(cat)}
              activeOpacity={0.7}
            >
              <View
                style={[twStyle("h-10 w-10 items-center justify-center rounded-xl"), {
                  backgroundColor: (cat.color ?? "#6366f1") + "18",
                }]}
              >
                <Ionicons
                  name="grid-outline"
                  size={20}
                  color={cat.color ?? "#6366f1"}
                />
              </View>
              <View style={twStyle("ms-3 flex-1")}>
                <View style={twStyle("flex-row items-center")}>
                  <Text style={[twStyle("text-sm font-semibold text-gray-900"), { marginEnd: 8 }]}>
                    {cat.name}
                  </Text>
                  {!cat.is_active && (
                    <View style={twStyle("rounded-full bg-gray-100 px-2 py-0.5")}>
                      <Text style={twStyle("text-[10px] font-medium text-gray-500")}>
                        {pc("inactive")}
                      </Text>
                    </View>
                  )}
                </View>
                {cat.description && (
                  <Text
                    style={twStyle("mt-0.5 text-xs text-gray-500")}
                    numberOfLines={1}
                  >
                    {cat.description}
                  </Text>
                )}
                {cat.product_count !== undefined && (
                  <Text style={twStyle("mt-0.5 text-xs text-indigo-500")}>
                    {pc("productCount", { count: cat.product_count })}
                  </Text>
                )}
              </View>
              <View style={twStyle("flex-row items-center")}>
                <TouchableOpacity onPress={() => handleToggleActive(cat)} style={{ marginEnd: 8 }}>
                  <Ionicons
                    name={cat.is_active ? "eye-outline" : "eye-off-outline"}
                    size={18}
                    color={cat.is_active ? "#22c55e" : "#9ca3af"}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(cat)}>
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color="#ef4444"
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? pc("editTitle") : pc("newTitle")}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {pc("nameLabel")}
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
            placeholder={pc("namePlaceholder")}
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {pc("description")}
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(text) => setForm((p) => ({ ...p, description: text }))}
            placeholder={pc("descriptionPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
          />
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{pc("color")}</Text>
          <View style={twStyle("mb-3 flex-row flex-wrap")}>
            {COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[twStyle(`h-9 w-9 items-center justify-center rounded-full ${
                  form.color === c ? "border-2 border-gray-900" : ""
                }`), { backgroundColor: c, marginEnd: 8, marginBottom: 8 }]}
                onPress={() => setForm((p) => ({ ...p, color: c }))}
              >
                {form.color === c && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </View>
          <View style={twStyle("mb-4 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{pc("active")}</Text>
            <Switch
              value={form.is_active}
              onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.is_active ? "#6366f1" : "#f4f4f5"}
            />
          </View>
          <ActionButton
            label={editing ? pc("updateCategory") : pc("createCategory")}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

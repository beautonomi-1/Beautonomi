import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Switch,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { twStyle } from "@/lib/twStyle";
import { APP_URL } from "@/config/public-env";
import { resolveGlobalCategoryIconUri } from "@beautonomi/utils";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  service_count?: number;
  icon?: string | null;
}

interface CategoriesResponse {
  own_categories: Category[];
  global_categories: Category[];
}

const ICON_OPTIONS = [
  "cut-outline",
  "color-palette-outline",
  "hand-left-outline",
  "flower-outline",
  "body-outline",
  "sparkles-outline",
  "heart-outline",
  "fitness-outline",
  "water-outline",
  "leaf-outline",
  "medkit-outline",
  "eye-outline",
];

export default function ServiceCategoriesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "",
    is_active: true,
  });

  const { data: catData, loading, refresh } = useApi<CategoriesResponse>(
    "/api/provider/categories"
  );
  const ownCats = useMemo(() => catData?.own_categories ?? [], [catData?.own_categories]);
  const globalCats = useMemo(() => catData?.global_categories ?? [], [catData?.global_categories]);
  const { execute: createCat, loading: creating } = useApiPost<any, any>(
    "/api/provider/categories"
  );
  const { execute: updateCat, loading: updatingCat } = useApiMutation("patch");
  const { execute: deleteCat } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const allCats = useMemo(
    () => [...ownCats, ...globalCats],
    [ownCats, globalCats]
  );
  const totalServices = useMemo(
    () => allCats.reduce((sum, c) => sum + (c.service_count ?? 0), 0),
    [allCats]
  );

  const filteredOwn = useMemo(() => {
    if (!search) return ownCats;
    const q = search.toLowerCase();
    return ownCats.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    );
  }, [ownCats, search]);

  const filteredGlobal = useMemo(() => {
    if (!search) return globalCats;
    const q = search.toLowerCase();
    return globalCats.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    );
  }, [globalCats, search]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", icon: "", is_active: true });
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setForm({
      name: cat.name,
      description: cat.description ?? "",
      icon: cat.icon ?? "",
      is_active: cat.is_active,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert("Required", "Name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon || null,
      is_active: form.is_active,
    };
    if (editing) {
      const { error } = await updateCat(
        `/api/provider/categories/${editing.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createCat(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  async function handleToggleActive(cat: Category) {
    const { error } = await updateCat(`/api/provider/categories/${cat.id}`, {
      is_active: !cat.is_active,
    });
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function handleDelete(cat: Category) {
    Alert.alert("Delete", `Remove "${cat.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteCat(
            `/api/provider/categories/${cat.id}`
          );
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  const listData = useMemo(() => {
    const items: (| { type: "header"; title: string; id: string }
      | (Category & { type: "own" | "global" }))[] = [];
    if (filteredOwn.length) {
      items.push({ type: "header", title: "Your Categories", id: "h-own" });
      filteredOwn.forEach((c) => items.push({ ...c, type: "own" }));
    }
    if (filteredGlobal.length) {
      items.push({
        type: "header",
        title: "Platform Categories",
        id: "h-global",
      });
      filteredGlobal.forEach((c) => items.push({ ...c, type: "global" }));
    }
    return items;
  }, [filteredOwn, filteredGlobal]);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Service Categories"
        showBack
        subtitle={`${allCats.length} categories`}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {allCats.length > 0 && (
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
            <StatCard
              title="Categories"
              value={String(allCats.length)}
              icon="grid-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title="Services"
              value={String(totalServices)}
              icon="briefcase-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
        </View>
      )}

      {allCats.length > 3 && (
        <View style={twStyle("mb-3")}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories..."
          />
        </View>
      )}

      {loading && !catData ? (
        <SkeletonList rows={4} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item: Category | { id: string; type: "header"; title: string }) => item.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }: { item: Category | { id: string; type: "header"; title: string } }) => {
            if ("type" in item && item.type === "header") {
              return (
                <Text style={twStyle("mt-2 text-xs font-semibold uppercase text-gray-400")}>
                  {item.title}
                </Text>
              );
            }
            const cat = item as Category & { type: "own" | "global" };
            const iconUri = resolveGlobalCategoryIconUri(cat.icon, APP_URL);
            return (
              <TouchableOpacity
                style={twStyle(`rounded-xl border bg-white p-4 ${
                  cat.is_active ? "border-gray-100" : "border-gray-100 opacity-60"
                }`)}
                onPress={() => (cat.type === "own" ? openEdit(cat) : null)}
                activeOpacity={cat.type === "own" ? 0.7 : 1}
              >
                <View style={twStyle("flex-row items-center")}>
                  <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-indigo-50")}>
                    {iconUri ? (
                      <Image
                        source={{ uri: iconUri }}
                        style={{ width: 22, height: 22 }}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <Ionicons
                        name={(cat.icon as keyof typeof Ionicons.glyphMap) || "grid-outline"}
                        size={20}
                        color="#6366f1"
                      />
                    )}
                  </View>
                  <View style={twStyle("ml-3 flex-1")}>
                    <View style={twStyle("flex-row items-center")}>
                      <Text style={[twStyle("text-sm font-semibold text-gray-900"), { marginRight: 8 }]}>
                        {cat.name}
                      </Text>
                      {!cat.is_active && (
                        <View style={[twStyle("rounded-full bg-gray-100 px-2 py-0.5"), { marginRight: 8 }]}>
                          <Text style={twStyle("text-[10px] font-medium text-gray-500")}>
                            Inactive
                          </Text>
                        </View>
                      )}
                      {cat.type === "global" && (
                        <View style={twStyle("rounded-full bg-blue-50 px-2 py-0.5")}>
                          <Text style={twStyle("text-[10px] font-medium text-blue-600")}>
                            Platform
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
                    {cat.service_count !== undefined && (
                      <Text style={twStyle("mt-0.5 text-xs text-indigo-500")}>
                        {cat.service_count} service
                        {cat.service_count !== 1 ? "s" : ""}
                      </Text>
                    )}
                  </View>
                  {cat.type === "own" && (
                    <View style={twStyle("flex-row items-center")}>
                      <TouchableOpacity
                        style={{ marginRight: 8 }}
                        onPress={() => handleToggleActive(cat)}
                      >
                        <Ionicons
                          name={
                            cat.is_active
                              ? "eye-outline"
                              : "eye-off-outline"
                          }
                          size={18}
                          color={cat.is_active ? "#22c55e" : "#9ca3af"}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(cat)}>
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#ef4444"
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="grid-outline"
              title={search ? "No matches" : "No categories"}
              description={
                search
                  ? "Try a different search"
                  : "Add categories to organize your services"
              }
            />
          }
        />
      )}

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit Category" : "New Category"}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Name *
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Hair, Nails, Skin"
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Description
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Optional..."
            placeholderTextColor="#9ca3af"
            multiline
          />
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Icon</Text>
          <View style={twStyle("mb-3 flex-row flex-wrap")}>
            {ICON_OPTIONS.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={[twStyle(`h-10 w-10 items-center justify-center rounded-xl ${
                  form.icon === icon
                    ? "bg-indigo-100 border-2 border-indigo-500"
                    : "bg-gray-100"
                }`), { marginRight: 8, marginBottom: 8 }]}
                onPress={() => setForm((p) => ({ ...p, icon }))}
              >
                <Ionicons
                  name={icon as any}
                  size={20}
                  color={form.icon === icon ? "#6366f1" : "#6b7280"}
                />
              </TouchableOpacity>
            ))}
          </View>
          <View style={twStyle("mb-4 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Active</Text>
            <Switch
              value={form.is_active}
              onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.is_active ? "#6366f1" : "#f4f4f5"}
            />
          </View>
          <ActionButton
            label={editing ? "Update Category" : "Create Category"}
            onPress={handleSave}
            loading={creating || updatingCat}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

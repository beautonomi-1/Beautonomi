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
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { SearchBar } from "@/components/ui/SearchBar";

interface ResourceGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  resource_count?: number;
  created_at: string;
}

const COLORS = [
  "#FF0077",
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

export default function ResourceGroupsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ResourceGroup | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: "#FF0077",
    is_active: true,
  });

  const { data: groups, loading, refresh } = useApi<ResourceGroup[]>(
    "/api/provider/resource-groups"
  );
  const { execute: createGroup, loading: creating } = useApiPost<any, any>(
    "/api/provider/resource-groups"
  );
  const { execute: updateGroup, loading: updating } = useApiMutation("patch");
  const { execute: deleteGroup } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!groups) return [];
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q)
    );
  }, [groups, search]);

  const activeCount = useMemo(
    () => groups?.filter((g) => g.is_active).length ?? 0,
    [groups]
  );
  const totalResources = useMemo(
    () => groups?.reduce((sum, g) => sum + (g.resource_count ?? 0), 0) ?? 0,
    [groups]
  );

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", color: "#FF0077", is_active: true });
    setShowForm(true);
  }

  function openEdit(group: ResourceGroup) {
    setEditing(group);
    setForm({
      name: group.name,
      description: group.description ?? "",
      color: group.color,
      is_active: group.is_active,
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
      description: form.description.trim() || undefined,
      color: form.color,
      is_active: form.is_active,
    };
    if (editing) {
      const { error } = await updateGroup(
        `/api/provider/resource-groups/${editing.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createGroup(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  async function handleToggleActive(group: ResourceGroup) {
    const { error } = await updateGroup(
      `/api/provider/resource-groups/${group.id}`,
      { is_active: !group.is_active }
    );
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function handleDelete(group: ResourceGroup) {
    Alert.alert("Delete", `Remove "${group.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteGroup(
            `/api/provider/resource-groups/${group.id}`
          );
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Resource Groups"
        showBack
        subtitle={`${groups?.length ?? 0} groups`}
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {/* Stats */}
      {groups && groups.length > 0 && (
        <View className="mb-3 flex-row gap-3">
          <View className="flex-1">
            <StatCard
              title="Active"
              value={String(activeCount)}
              icon="layers-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Resources"
              value={String(totalResources)}
              icon="cube-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
        </View>
      )}

      {/* Search */}
      {groups && groups.length > 2 && (
        <View className="mb-3">
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search groups..."
          />
        </View>
      )}

      {loading && !groups ? (
        <SkeletonList rows={4} />
      ) : !filtered.length ? (
        <EmptyState
          icon="layers-outline"
          title={search ? "No matches" : "No resource groups"}
          description={
            search
              ? "Try a different search"
              : "Organize resources into groups"
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(g: ResourceGroup) => g.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
          renderItem={({ item: group }: { item: ResourceGroup }) => (
            <TouchableOpacity
              className={`rounded-xl border bg-white p-4 ${
                group.is_active ? "border-gray-100" : "border-gray-100 opacity-60"
              }`}
              onPress={() => openEdit(group)}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center">
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: group.color + "20" }}
                >
                  <View
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-gray-900">
                      {group.name}
                    </Text>
                    {!group.is_active && (
                      <View className="rounded-full bg-gray-100 px-2 py-0.5">
                        <Text className="text-[10px] font-medium text-gray-500">
                          Inactive
                        </Text>
                      </View>
                    )}
                  </View>
                  {group.description && (
                    <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={1}>
                      {group.description}
                    </Text>
                  )}
                  {group.resource_count !== undefined && (
                    <Text className="mt-0.5 text-xs text-indigo-500">
                      {group.resource_count} resource{group.resource_count !== 1 ? "s" : ""}
                    </Text>
                  )}
                </View>
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => handleToggleActive(group)}
                    className="rounded-full p-1"
                  >
                    <Ionicons
                      name={group.is_active ? "eye-outline" : "eye-off-outline"}
                      size={18}
                      color={group.is_active ? "#22c55e" : "#9ca3af"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(group)}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit Resource Group" : "New Resource Group"}
      >
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Name *
          </Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Treatment Rooms"
            placeholderTextColor="#9ca3af"
          />
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Description
          </Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Optional..."
            placeholderTextColor="#9ca3af"
            multiline
          />
          <Text className="mb-2 text-sm font-medium text-gray-700">Color</Text>
          <View className="mb-3 flex-row flex-wrap gap-3">
            {COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  form.color === c ? "border-2 border-gray-900" : ""
                }`}
                style={{ backgroundColor: c }}
                onPress={() => setForm((p) => ({ ...p, color: c }))}
              >
                {form.color === c && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </View>
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
            label={editing ? "Update Group" : "Create Group"}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

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
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";

interface ResourceGroup {
  id: string;
  name: string;
  color: string;
  resource_count?: number;
}

/** Matches API response from GET /api/provider/resources (schema has no resource_type/calendar_color) */
interface Resource {
  id: string;
  name: string;
  description: string | null;
  resource_type?: string | null;
  capacity: number | null;
  is_active: boolean;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
  calendar_color?: string | null;
  provider_id?: string;
  created_at?: string;
  updated_at?: string;
}

const RESOURCE_TYPES = [
  { label: "Room", value: "room", icon: "home-outline" as const, color: "#6366f1" },
  { label: "Chair", value: "chair", icon: "person-outline" as const, color: "#22c55e" },
  { label: "Equipment", value: "equipment", icon: "construct-outline" as const, color: "#f59e0b" },
  { label: "Other", value: "other", icon: "ellipse-outline" as const, color: "#6b7280" },
];

const COLOR_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#f59e0b", "#22c55e", "#14b8a6", "#0ea5e9", "#3b82f6",
];

const TAB_OPTIONS = [
  { label: "Resources", value: "resources" },
  { label: "Groups", value: "groups" },
];

function typeInfo(type: string | null) {
  return RESOURCE_TYPES.find((t) => t.value === type) ?? RESOURCE_TYPES[3];
}

export default function ResourcesScreen({ embedded }: { embedded?: boolean } = {}) {
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("resources");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    capacity: "1",
    resource_type: "room",
    group_id: "",
    calendar_color: "#6366f1",
    is_active: true,
  });

  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ResourceGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ name: "", color: "#6366f1" });

  const { data: resources, loading, error: resourcesError, refresh } = useApi<Resource[]>("/api/provider/resources");
  const { data: groups, loading: loadingGroups, error: groupsError, refresh: refreshGroups } = useApi<ResourceGroup[]>(
    "/api/provider/resource-groups"
  );

  const hasError = (resourcesError && !resources) || (groupsError && !groups);
  const errorMessage = resourcesError || groupsError || "Failed to load";
  const { execute: createResource, loading: creating } = useApiPost<any, any>("/api/provider/resources");
  const { execute: updateResource, loading: updating } = useApiMutation("patch");
  const { execute: deleteResource } = useApiMutation("delete");
  const { execute: createGroup, loading: creatingGroup } = useApiPost<any, any>("/api/provider/resource-groups");
  const { execute: updateGroup, loading: updatingGroup } = useApiMutation("patch");
  const { execute: deleteGroup } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshGroups()]);
    setRefreshing(false);
  }, [refresh, refreshGroups]);

  const filteredResources = useMemo(() => {
    if (!resources) return [];
    let result = resources;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.group_name?.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      result = result.filter((r) => r.resource_type === typeFilter);
    }
    return result;
  }, [resources, search, typeFilter]);

  const stats = useMemo(() => {
    if (!resources) return { total: 0, active: 0, groupCount: 0 };
    return {
      total: resources.length,
      active: resources.filter((r) => r.is_active).length,
      groupCount: groups?.length ?? 0,
    };
  }, [resources, groups]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", capacity: "1", resource_type: "room", group_id: "", calendar_color: "#6366f1", is_active: true });
    setShowForm(true);
  }

  function openEdit(res: Resource) {
    setEditing(res);
    setForm({
      name: res.name,
      description: res.description ?? "",
      capacity: String(res.capacity ?? 1),
      resource_type: res.resource_type ?? "room",
      group_id: res.group_id ?? "",
      calendar_color: res.calendar_color ?? "#6366f1",
      is_active: res.is_active,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert("Required", "Resource name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      capacity: Number(form.capacity) || 1,
      resource_type: form.resource_type,
      group_id: form.group_id || undefined,
      calendar_color: form.calendar_color,
      is_active: form.is_active,
    };
    if (editing) {
      const { error } = await updateResource(`/api/provider/resources/${editing.id}`, payload);
      if (error) { Alert.alert("Error", error); return; }
    } else {
      const { error } = await createResource(payload);
      if (error) { Alert.alert("Error", error); return; }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  function handleDelete(res: Resource) {
    Alert.alert("Delete Resource", `Delete "${res.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteResource(`/api/provider/resources/${res.id}`);
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  function openCreateGroup() {
    setEditingGroup(null);
    setGroupForm({ name: "", color: "#6366f1" });
    setShowGroupForm(true);
  }

  function openEditGroup(group: ResourceGroup) {
    setEditingGroup(group);
    setGroupForm({ name: group.name, color: group.color });
    setShowGroupForm(true);
  }

  async function handleSaveGroup() {
    if (!groupForm.name.trim()) {
      Alert.alert("Required", "Group name is required");
      return;
    }
    const payload = { name: groupForm.name.trim(), color: groupForm.color };
    if (editingGroup) {
      const { error } = await updateGroup(`/api/provider/resource-groups/${editingGroup.id}`, payload);
      if (error) { Alert.alert("Error", error); return; }
    } else {
      const { error } = await createGroup(payload);
      if (error) { Alert.alert("Error", error); return; }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowGroupForm(false);
    refreshGroups();
  }

  function handleDeleteGroup(group: ResourceGroup) {
    Alert.alert("Delete Group", `Delete "${group.name}"? Resources in this group won't be deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteGroup(`/api/provider/resource-groups/${group.id}`);
          if (error) Alert.alert("Error", error);
          else refreshGroups();
        },
      },
    ]);
  }

  const inner = (
    <>
      {embedded && (
        <TouchableOpacity
          className="mb-3 flex-row items-center justify-center rounded-xl bg-gray-900 py-3"
          onPress={tab === "resources" ? openCreate : openCreateGroup}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text className="ml-2 font-semibold text-white">{tab === "resources" ? "Add resource" : "Add group"}</Text>
        </TouchableOpacity>
      )}
      <View className="min-h-0 flex-1">
        <View className="mb-4 flex-row gap-3">
          <View className="flex-1">
            <StatCard title="Total" value={String(stats.total)} icon="construct-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
          </View>
          <View className="flex-1">
            <StatCard title="Active" value={String(stats.active)} icon="checkmark-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
          </View>
          <View className="flex-1">
            <StatCard title="Groups" value={String(stats.groupCount)} icon="layers-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
          </View>
        </View>

        <View className="mb-3">
          <FilterChipGroup options={TAB_OPTIONS} selected={tab} onSelect={setTab} />
        </View>

        {tab === "resources" ? (
          <>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search resources..." />
            <View className="my-3">
              <FilterChipGroup
                options={[
                  { label: "All", value: "all" },
                  ...RESOURCE_TYPES.map((t) => ({ label: t.label, value: t.value })),
                ]}
                selected={typeFilter}
                onSelect={setTypeFilter}
              />
            </View>

            {loading && !resources ? (
              <SkeletonList rows={4} />
            ) : filteredResources.length === 0 ? (
              <EmptyState icon="construct-outline" title="No resources" description="Add rooms, chairs, and equipment" />
            ) : (
              <FlatList
                data={filteredResources}
                keyExtractor={(r: Resource) => r.id}
                style={{ flex: 1, minHeight: 0 }}
                showsVerticalScrollIndicator={false}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
              renderItem={({ item: res }: { item: Resource }) => {
                const ti = typeInfo(res.resource_type ?? null);
                return (
                  <TouchableOpacity
                    className="rounded-xl border border-gray-100 bg-white p-4"
                    onPress={() => openEdit(res)}
                    activeOpacity={0.7}
                  >
                    <View className="flex-row items-center">
                      <View
                        className="h-10 w-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: (res.calendar_color ?? ti.color) + "15" }}
                      >
                        <Ionicons name={ti.icon} size={18} color={res.calendar_color ?? ti.color} />
                      </View>
                      <View className="ml-3 flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm font-semibold text-gray-900">{res.name}</Text>
                          <View className={`rounded-full px-2 py-0.5 ${res.is_active ? "bg-green-50" : "bg-gray-100"}`}>
                            <Text className={`text-[10px] font-medium ${res.is_active ? "text-green-700" : "text-gray-500"}`}>
                              {res.is_active ? "Active" : "Inactive"}
                            </Text>
                          </View>
                        </View>
                        <View className="mt-1 flex-row items-center gap-2">
                          <View className="rounded-full bg-gray-100 px-2 py-0.5">
                            <Text className="text-[10px] text-gray-600">{ti.label}</Text>
                          </View>
                          {res.capacity && (
                            <Text className="text-xs text-gray-400">Cap: {res.capacity}</Text>
                          )}
                          {res.group_name && (
                            <View
                              className="rounded-full px-2 py-0.5"
                              style={{ backgroundColor: (res.group_color ?? "#6366f1") + "15" }}
                            >
                              <Text className="text-[10px]" style={{ color: res.group_color ?? "#6366f1" }}>
                                {res.group_name}
                              </Text>
                            </View>
                          )}
                        </View>
                        {res.description && (
                          <Text className="mt-0.5 text-xs text-gray-400" numberOfLines={1}>
                            {res.description}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => handleDelete(res)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
      ) : (
        <>
          {loadingGroups && !groups ? (
            <SkeletonList rows={3} />
          ) : !groups?.length ? (
            <EmptyState icon="layers-outline" title="No groups" description="Create groups to organize resources" />
          ) : (
            <FlatList
              data={groups}
              keyExtractor={(g: ResourceGroup) => g.id}
              style={{ flex: 1, minHeight: 0 }}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
              renderItem={({ item: group }: { item: ResourceGroup }) => (
                <TouchableOpacity
                  className="flex-row items-center rounded-xl border border-gray-100 bg-white p-4"
                  onPress={() => openEditGroup(group)}
                  activeOpacity={0.7}
                >
                  <View
                    className="h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: group.color + "20" }}
                  >
                    <View className="h-5 w-5 rounded-full" style={{ backgroundColor: group.color }} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-semibold text-gray-900">{group.name}</Text>
                    {group.resource_count != null && (
                      <Text className="text-xs text-gray-500">{group.resource_count} resources</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteGroup(group)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}
      </View>

      {/* Resource form */}
      <BottomSheet visible={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit Resource" : "New Resource"}>
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Name *</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Treatment Room 1"
            placeholderTextColor="#9ca3af"
          />

          <Text className="mb-1 text-sm font-medium text-gray-700">Type</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {RESOURCE_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                className={`flex-row items-center gap-1.5 rounded-lg px-3 py-2 ${
                  form.resource_type === t.value ? "bg-indigo-600" : "bg-gray-100"
                }`}
                onPress={() => setForm((p) => ({ ...p, resource_type: t.value }))}
              >
                <Ionicons name={t.icon} size={14} color={form.resource_type === t.value ? "#fff" : t.color} />
                <Text className={`text-xs font-medium ${form.resource_type === t.value ? "text-white" : "text-gray-700"}`}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="mb-1 text-sm font-medium text-gray-700">Description</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Optional description"
            placeholderTextColor="#9ca3af"
          />

          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Capacity</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.capacity}
                onChangeText={(t) => setForm((p) => ({ ...p, capacity: t }))}
                placeholder="1"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Group</Text>
              <View className="flex-row flex-wrap gap-1.5">
                <TouchableOpacity
                  className={`rounded-lg px-3 py-2.5 ${!form.group_id ? "bg-indigo-600" : "bg-gray-100"}`}
                  onPress={() => setForm((p) => ({ ...p, group_id: "" }))}
                >
                  <Text className={`text-xs font-medium ${!form.group_id ? "text-white" : "text-gray-600"}`}>None</Text>
                </TouchableOpacity>
                {(groups ?? []).map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    className={`rounded-lg px-3 py-2.5 ${form.group_id === g.id ? "bg-indigo-600" : "bg-gray-100"}`}
                    onPress={() => setForm((p) => ({ ...p, group_id: g.id }))}
                  >
                    <Text className={`text-xs font-medium ${form.group_id === g.id ? "text-white" : "text-gray-600"}`}>
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text className="mb-1 text-sm font-medium text-gray-700">Calendar Color</Text>
          <View className="mb-3 flex-row gap-2">
            {COLOR_PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                className={`h-8 w-8 items-center justify-center rounded-full ${
                  form.calendar_color === c ? "border-2 border-gray-900" : ""
                }`}
                style={{ backgroundColor: c }}
                onPress={() => setForm((p) => ({ ...p, calendar_color: c }))}
              >
                {form.calendar_color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
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

          <ActionButton label={editing ? "Update" : "Create"} onPress={handleSave} loading={creating || updating} fullWidth />
        </View>
      </BottomSheet>

      {/* Group form */}
      <BottomSheet visible={showGroupForm} onClose={() => setShowGroupForm(false)} title={editingGroup ? "Edit Group" : "New Group"}>
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Group Name *</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={groupForm.name}
            onChangeText={(t) => setGroupForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Treatment Rooms"
            placeholderTextColor="#9ca3af"
          />
          <Text className="mb-1 text-sm font-medium text-gray-700">Color</Text>
          <View className="mb-4 flex-row gap-2">
            {COLOR_PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                className={`h-8 w-8 items-center justify-center rounded-full ${
                  groupForm.color === c ? "border-2 border-gray-900" : ""
                }`}
                style={{ backgroundColor: c }}
                onPress={() => setGroupForm((p) => ({ ...p, color: c }))}
              >
                {groupForm.color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>
          <ActionButton label={editingGroup ? "Update Group" : "Create Group"} onPress={handleSaveGroup} loading={creatingGroup || updatingGroup} fullWidth />
        </View>
      </BottomSheet>
    </>
  );
  if (embedded) {
    return (
      <View className="flex-1 min-h-0">
        {hasError ? (
          <ErrorState message={errorMessage} onRetry={handleRefresh} />
        ) : (
          inner
        )}
      </View>
    );
  }
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Resources"
        showBack
        subtitle={`${stats.total} resources · ${stats.groupCount} groups`}
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
            onPress={tab === "resources" ? openCreate : openCreateGroup}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />
      {hasError ? (
        <ErrorState message={errorMessage} onRetry={handleRefresh} />
      ) : (
        inner
      )}
    </ScreenContainer>
  );
}

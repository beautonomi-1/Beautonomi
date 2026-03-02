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
import { FilterChipGroup } from "@/components/ui/FilterChip";

interface TimeOffType {
  id: string;
  name: string;
  description: string | null;
  is_paid: boolean;
  is_active: boolean;
  color?: string | null;
  max_days?: number | null;
  usage_count?: number;
}

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
];

type FilterMode = "all" | "paid" | "unpaid" | "active" | "inactive";

export default function TimeOffTypesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TimeOffType | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [form, setForm] = useState({
    name: "",
    description: "",
    isPaid: false,
    isActive: true,
    color: "#6366f1",
    maxDays: "",
  });

  const { data: types, loading, refresh } = useApi<TimeOffType[]>(
    "/api/provider/time-off-types"
  );
  const { execute: createType, loading: creating } = useApiPost<any, any>(
    "/api/provider/time-off-types"
  );
  const { execute: updateType, loading: updating } = useApiMutation("patch");
  const { execute: deleteType } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!types) return [];
    let result = [...types];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q)
      );
    }
    switch (filter) {
      case "paid":
        result = result.filter((t) => t.is_paid);
        break;
      case "unpaid":
        result = result.filter((t) => !t.is_paid);
        break;
      case "active":
        result = result.filter((t) => t.is_active);
        break;
      case "inactive":
        result = result.filter((t) => !t.is_active);
        break;
    }
    return result;
  }, [types, search, filter]);

  const paidCount = useMemo(
    () => types?.filter((t) => t.is_paid).length ?? 0,
    [types]
  );
  const activeCount = useMemo(
    () => types?.filter((t) => t.is_active).length ?? 0,
    [types]
  );

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      isPaid: false,
      isActive: true,
      color: "#6366f1",
      maxDays: "",
    });
    setShowForm(true);
  }

  function openEdit(type: TimeOffType) {
    setEditing(type);
    setForm({
      name: type.name,
      description: type.description ?? "",
      isPaid: type.is_paid,
      isActive: type.is_active,
      color: type.color ?? "#6366f1",
      maxDays: type.max_days ? String(type.max_days) : "",
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
      is_paid: form.isPaid,
      is_active: form.isActive,
      color: form.color,
      max_days: form.maxDays ? parseInt(form.maxDays) : null,
    };
    if (editing) {
      const { error } = await updateType(
        `/api/provider/time-off-types/${editing.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createType(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  async function handleToggleActive(type: TimeOffType) {
    const { error } = await updateType(
      `/api/provider/time-off-types/${type.id}`,
      { is_active: !type.is_active }
    );
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function handleDelete(type: TimeOffType) {
    Alert.alert("Delete", `Remove "${type.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteType(
            `/api/provider/time-off-types/${type.id}`
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
        title="Time Off Types"
        showBack
        subtitle={`${types?.length ?? 0} types`}
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {types && types.length > 0 && (
        <View className="mb-3 flex-row gap-3">
          <View className="flex-1">
            <StatCard
              title="Paid Types"
              value={String(paidCount)}
              icon="cash-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Active"
              value={String(activeCount)}
              icon="checkmark-circle-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
        </View>
      )}

      {types && types.length > 2 && (
        <View className="mb-3">
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search types..."
          />
          <View className="mt-2">
            <FilterChipGroup
              options={[
                { label: "All", value: "all" },
                { label: "Paid", value: "paid" },
                { label: "Unpaid", value: "unpaid" },
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
              ]}
              selected={filter}
              onSelect={(v) => setFilter(v as FilterMode)}
            />
          </View>
        </View>
      )}

      {loading && !types ? (
        <SkeletonList rows={4} />
      ) : !filtered.length ? (
        <EmptyState
          icon="sunny-outline"
          title={search || filter !== "all" ? "No matches" : "No time off types"}
          description={
            search || filter !== "all"
              ? "Try different filters"
              : "Add categories like Annual Leave, Sick Leave, etc."
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t: TimeOffType) => t.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
          renderItem={({ item: type }: { item: TimeOffType }) => (
            <TouchableOpacity
              className={`rounded-xl border bg-white p-4 ${
                type.is_active
                  ? "border-gray-100"
                  : "border-gray-100 opacity-60"
              }`}
              onPress={() => openEdit(type)}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center">
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: (type.color ?? "#6366f1") + "20",
                  }}
                >
                  <Ionicons
                    name="sunny-outline"
                    size={20}
                    color={type.color ?? "#6366f1"}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-gray-900">
                      {type.name}
                    </Text>
                    <View
                      className={`rounded-full px-2 py-0.5 ${
                        type.is_paid ? "bg-green-50" : "bg-gray-100"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-medium ${
                          type.is_paid ? "text-green-700" : "text-gray-500"
                        }`}
                      >
                        {type.is_paid ? "Paid" : "Unpaid"}
                      </Text>
                    </View>
                    {!type.is_active && (
                      <View className="rounded-full bg-gray-100 px-2 py-0.5">
                        <Text className="text-[10px] font-medium text-gray-500">
                          Inactive
                        </Text>
                      </View>
                    )}
                  </View>
                  {type.description && (
                    <Text
                      className="mt-0.5 text-xs text-gray-500"
                      numberOfLines={1}
                    >
                      {type.description}
                    </Text>
                  )}
                  <View className="mt-1 flex-row items-center gap-3">
                    {type.max_days && (
                      <Text className="text-xs text-indigo-500">
                        Max {type.max_days} days/year
                      </Text>
                    )}
                    {type.usage_count !== undefined && (
                      <Text className="text-xs text-gray-400">
                        Used {type.usage_count} times
                      </Text>
                    )}
                  </View>
                </View>
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => handleToggleActive(type)}
                  >
                    <Ionicons
                      name={
                        type.is_active ? "eye-outline" : "eye-off-outline"
                      }
                      size={18}
                      color={type.is_active ? "#22c55e" : "#9ca3af"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(type)}>
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color="#ef4444"
                    />
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
        title={editing ? "Edit Time Off Type" : "New Time Off Type"}
      >
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Name *
          </Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Annual Leave"
            placeholderTextColor="#9ca3af"
          />
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Description
          </Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Optional details..."
            placeholderTextColor="#9ca3af"
            multiline
          />
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Max Days Per Year
          </Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.maxDays}
            onChangeText={(t) => setForm((p) => ({ ...p, maxDays: t }))}
            placeholder="Leave blank for unlimited"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
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
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">
              Paid Leave
            </Text>
            <Switch
              value={form.isPaid}
              onValueChange={(v) => setForm((p) => ({ ...p, isPaid: v }))}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              thumbColor={form.isPaid ? "#16a34a" : "#f4f4f5"}
            />
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-700">Active</Text>
            <Switch
              value={form.isActive}
              onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.isActive ? "#6366f1" : "#f4f4f5"}
            />
          </View>
          <ActionButton
            label={editing ? "Update Type" : "Add Type"}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

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
import { twStyle } from "@/lib/twStyle";

interface CancellationReason {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  requires_note?: boolean;
  usage_count?: number;
  last_used_at?: string | null;
}

type FilterMode = "all" | "active" | "inactive";

export default function CancellationReasonsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CancellationReason | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [form, setForm] = useState({
    name: "",
    description: "",
    isActive: true,
    requiresNote: false,
  });

  const { data: reasons, loading, refresh } = useApi<CancellationReason[]>(
    "/api/provider/cancellation-reasons"
  );
  const { execute: createReason, loading: creating } = useApiPost<any, any>(
    "/api/provider/cancellation-reasons"
  );
  const { execute: updateReason, loading: updatingReason } =
    useApiMutation("patch");
  const { execute: deleteReason } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!reasons) return [];
    let result = [...reasons];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q)
      );
    }
    if (filter === "active") result = result.filter((r) => r.is_active);
    if (filter === "inactive") result = result.filter((r) => !r.is_active);
    return result;
  }, [reasons, search, filter]);

  const activeCount = useMemo(
    () => reasons?.filter((r) => r.is_active).length ?? 0,
    [reasons]
  );
  const totalUsage = useMemo(
    () => reasons?.reduce((sum, r) => sum + (r.usage_count ?? 0), 0) ?? 0,
    [reasons]
  );
  const topReason = useMemo(() => {
    if (!reasons?.length) return null;
    return reasons.reduce((top, r) =>
      (r.usage_count ?? 0) > (top.usage_count ?? 0) ? r : top
    );
  }, [reasons]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", isActive: true, requiresNote: false });
    setShowForm(true);
  }

  function openEdit(reason: CancellationReason) {
    setEditing(reason);
    setForm({
      name: reason.name,
      description: reason.description ?? "",
      isActive: reason.is_active,
      requiresNote: reason.requires_note ?? false,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert("Required", "Reason name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      is_active: form.isActive,
      requires_note: form.requiresNote,
    };
    if (editing) {
      const { error } = await updateReason(
        `/api/provider/cancellation-reasons/${editing.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createReason(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  async function handleToggleActive(reason: CancellationReason) {
    const { error } = await updateReason(
      `/api/provider/cancellation-reasons/${reason.id}`,
      { is_active: !reason.is_active }
    );
    if (error) Alert.alert("Error", error);
    else refresh();
  }

  function handleDelete(reason: CancellationReason) {
    Alert.alert("Delete", `Remove "${reason.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteReason(
            `/api/provider/cancellation-reasons/${reason.id}`
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
        title="Cancellation Reasons"
        showBack
        subtitle={`${reasons?.length ?? 0} reasons`}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {reasons && reasons.length > 0 && (
        <View style={twStyle("mb-3")}>
          <View style={twStyle("flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <StatCard
                title="Active"
                value={String(activeCount)}
                icon="checkmark-circle-outline"
                iconColor="#22c55e"
                iconBg="bg-green-50"
                compact
              />
            </View>
            <View style={twStyle("flex-1")}>
              <StatCard
                title="Total Used"
                value={String(totalUsage)}
                icon="analytics-outline"
                iconColor="#6366f1"
                iconBg="bg-indigo-50"
                compact
              />
            </View>
          </View>
          {topReason && (topReason.usage_count ?? 0) > 0 && (
            <View style={twStyle("mt-2 rounded-xl bg-amber-50 p-3")}>
              <Text style={twStyle("text-xs text-amber-700")}>
                Most common: <Text style={twStyle("font-semibold")}>{topReason.name}</Text> ({topReason.usage_count} times)
              </Text>
            </View>
          )}
        </View>
      )}

      {reasons && reasons.length > 2 && (
        <View style={twStyle("mb-3")}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search reasons..."
          />
          <View style={twStyle("mt-2")}>
            <FilterChipGroup
              options={[
                { label: "All", value: "all" },
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
              ]}
              selected={filter}
              onSelect={(v) => setFilter(v as FilterMode)}
            />
          </View>
        </View>
      )}

      {loading && !reasons ? (
        <SkeletonList rows={4} />
      ) : !filtered.length ? (
        <EmptyState
          icon="close-circle-outline"
          title={search || filter !== "all" ? "No matches" : "No reasons"}
          description={
            search || filter !== "all"
              ? "Try different filters"
              : "Add cancellation reasons for tracking"
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r: CancellationReason) => r.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: reason }: { item: CancellationReason }) => (
            <TouchableOpacity
              style={twStyle(`rounded-xl border bg-white p-4 ${
                reason.is_active
                  ? "border-gray-100"
                  : "border-gray-100 opacity-60"
              }`)}
              onPress={() => openEdit(reason)}
              activeOpacity={0.7}
            >
              <View style={twStyle("flex-row items-center")}>
                <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-red-50")}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color="#ef4444"
                  />
                </View>
                <View style={twStyle("ml-3 flex-1")}>
                  <View style={twStyle("flex-row items-center")}>
                    <Text style={[twStyle("text-sm font-semibold text-gray-900"), { marginRight: 8 }]}>
                      {reason.name}
                    </Text>
                    {!reason.is_active && (
                      <View style={[twStyle("rounded-full bg-gray-100 px-2 py-0.5"), { marginRight: 8 }]}>
                        <Text style={twStyle("text-[10px] font-medium text-gray-500")}>
                          Inactive
                        </Text>
                      </View>
                    )}
                    {reason.requires_note && (
                      <View style={[twStyle("rounded-full bg-amber-50 px-2 py-0.5"), { marginRight: 8 }]}>
                        <Text style={twStyle("text-[10px] font-medium text-amber-700")}>
                          Note Required
                        </Text>
                      </View>
                    )}
                  </View>
                  {reason.description && (
                    <Text
                      style={twStyle("mt-0.5 text-xs text-gray-500")}
                      numberOfLines={1}
                    >
                      {reason.description}
                    </Text>
                  )}
                  {reason.usage_count !== undefined && (
                    <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>
                      Used {reason.usage_count} time{reason.usage_count !== 1 ? "s" : ""}
                    </Text>
                  )}
                </View>
                <View style={twStyle("flex-row items-center")}>
                  <TouchableOpacity
                    onPress={() => handleToggleActive(reason)}
                    style={{ marginRight: 8 }}
                  >
                    <Ionicons
                      name={
                        reason.is_active
                          ? "eye-outline"
                          : "eye-off-outline"
                      }
                      size={18}
                      color={reason.is_active ? "#22c55e" : "#9ca3af"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(reason)}>
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
        title={editing ? "Edit Reason" : "New Cancellation Reason"}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Reason *
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Schedule conflict"
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Description
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(t) => setForm((p) => ({ ...p, description: t }))}
            placeholder="Optional details..."
            placeholderTextColor="#9ca3af"
            multiline
          />
          <View style={twStyle("mb-3 flex-row items-center justify-between")}>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>
                Require Note
              </Text>
              <Text style={twStyle("text-xs text-gray-400")}>
                Clients must add a note when selecting this reason
              </Text>
            </View>
            <Switch
              value={form.requiresNote}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, requiresNote: v }))
              }
              trackColor={{ false: "#d1d5db", true: "#f59e0b" }}
              thumbColor={form.requiresNote ? "#d97706" : "#f4f4f5"}
            />
          </View>
          <View style={twStyle("mb-4 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Active</Text>
            <Switch
              value={form.isActive}
              onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.isActive ? "#6366f1" : "#f4f4f5"}
            />
          </View>
          <ActionButton
            label={editing ? "Update Reason" : "Add Reason"}
            onPress={handleSave}
            loading={creating || updatingReason}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

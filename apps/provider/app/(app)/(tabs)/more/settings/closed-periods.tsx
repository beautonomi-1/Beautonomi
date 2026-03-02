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
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { formatDate } from "@/lib/format";

interface AvailabilityBlock {
  id: string;
  block_type: "unavailable" | "break" | "maintenance";
  start_at: string;
  end_at: string;
  reason: string | null;
  staff_id: string | null;
  location_id: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: string | null;
  affected_bookings_count?: number;
}

const BLOCK_TYPES = [
  { label: "Holiday / Closure", value: "unavailable" },
  { label: "Break", value: "break" },
  { label: "Maintenance", value: "maintenance" },
];

type TabMode = "upcoming" | "past" | "all";

export default function ClosedPeriodsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AvailabilityBlock | null>(null);
  const [tab, setTab] = useState<TabMode>("upcoming");
  const [form, setForm] = useState({
    block_type: "unavailable",
    start_date: "",
    start_time: "00:00",
    end_date: "",
    end_time: "23:59",
    reason: "",
    is_recurring: false,
    recurrence_pattern: "yearly",
  });

  const { data: blocks, loading, refresh } = useApi<AvailabilityBlock[]>(
    "/api/provider/availability-blocks"
  );
  const { execute: createBlock, loading: creating } = useApiPost<any, any>(
    "/api/provider/availability-blocks"
  );
  const { execute: updateBlock, loading: updatingBlock } =
    useApiMutation("patch");
  const { execute: deleteBlock } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const now = new Date();

  const filtered = useMemo(() => {
    if (!blocks) return [];
    const sorted = [...blocks].sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
    switch (tab) {
      case "upcoming":
        return sorted.filter((b) => new Date(b.end_at) >= now);
      case "past":
        return sorted.filter((b) => new Date(b.end_at) < now);
      default:
        return sorted;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- now intentionally omitted to avoid recompute every tick
  }, [blocks, tab]);

  const upcomingCount = useMemo(
    () => blocks?.filter((b) => new Date(b.end_at) >= now).length ?? 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now intentionally omitted
    [blocks]
  );
  const activeNow = useMemo(
    () =>
      blocks?.filter(
        (b) => new Date(b.start_at) <= now && new Date(b.end_at) >= now
      ).length ?? 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now intentionally omitted
    [blocks]
  );

  const nextClosure = useMemo(() => {
    if (!blocks) return null;
    const upcoming = blocks
      .filter((b) => new Date(b.start_at) > now)
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
    return upcoming[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now intentionally omitted
  }, [blocks]);

  function getDurationDays(block: AvailabilityBlock): number {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    return Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );
  }

  function openCreate() {
    setEditing(null);
    setForm({
      block_type: "unavailable",
      start_date: "",
      start_time: "00:00",
      end_date: "",
      end_time: "23:59",
      reason: "",
      is_recurring: false,
      recurrence_pattern: "yearly",
    });
    setShowForm(true);
  }

  function openEdit(block: AvailabilityBlock) {
    setEditing(block);
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    setForm({
      block_type: block.block_type,
      start_date: start.toISOString().split("T")[0],
      start_time: start.toTimeString().slice(0, 5),
      end_date: end.toISOString().split("T")[0],
      end_time: end.toTimeString().slice(0, 5),
      reason: block.reason ?? "",
      is_recurring: block.is_recurring ?? false,
      recurrence_pattern: block.recurrence_pattern ?? "yearly",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.start_date || !form.end_date) {
      Alert.alert("Required", "Please enter start and end dates");
      return;
    }
    const startAt = `${form.start_date}T${form.start_time}:00`;
    const endAt = `${form.end_date}T${form.end_time}:00`;

    const payload = {
      block_type: form.block_type,
      start_at: startAt,
      end_at: endAt,
      reason: form.reason.trim() || null,
      is_recurring: form.is_recurring,
      recurrence_pattern: form.is_recurring ? form.recurrence_pattern : null,
    };

    if (editing) {
      const { error } = await updateBlock(
        `/api/provider/availability-blocks/${editing.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createBlock(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  function handleDelete(block: AvailabilityBlock) {
    Alert.alert("Delete", "Remove this closed period?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteBlock(
            `/api/provider/availability-blocks/${block.id}`
          );
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  function blockLabel(type: string): string {
    if (type === "unavailable") return "Closed";
    if (type === "break") return "Break";
    if (type === "maintenance") return "Maintenance";
    return type;
  }

  function blockColor(type: string): { bg: string; text: string } {
    if (type === "unavailable") return { bg: "bg-red-50", text: "text-red-700" };
    if (type === "break")
      return { bg: "bg-amber-50", text: "text-amber-700" };
    return { bg: "bg-blue-50", text: "text-blue-700" };
  }

  function isCurrentlyActive(block: AvailabilityBlock): boolean {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    return start <= now && end >= now;
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Closed Periods"
        showBack
        subtitle="Holidays & closures"
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-900"
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {blocks && blocks.length > 0 && (
        <View className="mb-3">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <StatCard
                title="Upcoming"
                value={String(upcomingCount)}
                icon="calendar-outline"
                iconColor="#6366f1"
                iconBg="bg-indigo-50"
                compact
              />
            </View>
            <View className="flex-1">
              <StatCard
                title="Active Now"
                value={String(activeNow)}
                icon="alert-circle-outline"
                iconColor={activeNow > 0 ? "#ef4444" : "#22c55e"}
                iconBg={activeNow > 0 ? "bg-red-50" : "bg-green-50"}
                compact
              />
            </View>
          </View>
          {nextClosure && (
            <View className="mt-2 rounded-xl bg-indigo-50 p-3">
              <Text className="text-xs text-indigo-700">
                Next: <Text className="font-semibold">{nextClosure.reason ?? blockLabel(nextClosure.block_type)}</Text>{" "}
                on {formatDate(nextClosure.start_at)}
              </Text>
            </View>
          )}
        </View>
      )}

      {blocks && blocks.length > 0 && (
        <View className="mb-3">
          <FilterChipGroup
            options={[
              { label: "Upcoming", value: "upcoming" },
              { label: "Past", value: "past" },
              { label: "All", value: "all" },
            ]}
            selected={tab}
            onSelect={(v) => setTab(v as TabMode)}
          />
        </View>
      )}

      {loading && !blocks ? (
        <SkeletonList rows={4} />
      ) : !filtered.length ? (
        <EmptyState
          icon="calendar-outline"
          title={tab !== "upcoming" ? "No periods found" : "No closed periods"}
          description={
            tab !== "upcoming"
              ? "Try a different filter"
              : "Add holiday closures or maintenance windows"
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b: AvailabilityBlock) => b.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
          renderItem={({ item: block }: { item: AvailabilityBlock }) => {
            const colors = blockColor(block.block_type);
            const active = isCurrentlyActive(block);
            const days = getDurationDays(block);
            return (
              <TouchableOpacity
                className={`rounded-xl border bg-white p-4 ${
                  active ? "border-red-200" : "border-gray-100"
                }`}
                onPress={() => openEdit(block)}
                activeOpacity={0.7}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <View className={`rounded-full px-2.5 py-0.5 ${colors.bg}`}>
                        <Text className={`text-xs font-medium ${colors.text}`}>
                          {blockLabel(block.block_type)}
                        </Text>
                      </View>
                      {active && (
                        <View className="rounded-full bg-red-500 px-2 py-0.5">
                          <Text className="text-[10px] font-bold text-white">
                            ACTIVE
                          </Text>
                        </View>
                      )}
                      {block.is_recurring && (
                        <Ionicons
                          name="repeat-outline"
                          size={14}
                          color="#6366f1"
                        />
                      )}
                    </View>
                    <Text className="mt-1.5 text-sm font-medium text-gray-900">
                      {formatDate(block.start_at)} — {formatDate(block.end_at)}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-3">
                      <Text className="text-xs text-gray-400">
                        {days} day{days !== 1 ? "s" : ""}
                      </Text>
                      {block.affected_bookings_count !== undefined &&
                        block.affected_bookings_count > 0 && (
                          <Text className="text-xs text-amber-600">
                            {block.affected_bookings_count} booking
                            {block.affected_bookings_count !== 1 ? "s" : ""}{" "}
                            affected
                          </Text>
                        )}
                    </View>
                    {block.reason && (
                      <Text className="mt-1 text-xs text-gray-500">
                        {block.reason}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(block)}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Edit Closed Period" : "Add Closed Period"}
      >
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Type</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {BLOCK_TYPES.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                className={`rounded-full px-4 py-2 ${
                  form.block_type === opt.value
                    ? "bg-indigo-600"
                    : "bg-gray-100"
                }`}
                onPress={() =>
                  setForm((p) => ({ ...p, block_type: opt.value }))
                }
              >
                <Text
                  className={`text-sm ${
                    form.block_type === opt.value
                      ? "font-medium text-white"
                      : "text-gray-700"
                  }`}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                Start Date
              </Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.start_date}
                onChangeText={(t) =>
                  setForm((p) => ({ ...p, start_date: t }))
                }
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                Start Time
              </Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.start_time}
                onChangeText={(t) =>
                  setForm((p) => ({ ...p, start_time: t }))
                }
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                End Date
              </Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.end_date}
                onChangeText={(t) => setForm((p) => ({ ...p, end_date: t }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                End Time
              </Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.end_time}
                onChangeText={(t) =>
                  setForm((p) => ({ ...p, end_time: t }))
                }
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Reason
          </Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={form.reason}
            onChangeText={(t) => setForm((p) => ({ ...p, reason: t }))}
            placeholder="e.g. Christmas Holiday"
            placeholderTextColor="#9ca3af"
          />
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-700">
                Recurring
              </Text>
              <Text className="text-xs text-gray-400">
                Repeat this closure every year
              </Text>
            </View>
            <Switch
              value={form.is_recurring}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, is_recurring: v }))
              }
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.is_recurring ? "#6366f1" : "#f4f4f5"}
            />
          </View>
          {form.is_recurring && (
            <View className="mb-3 flex-row gap-2">
              {["yearly", "monthly", "weekly"].map((pattern) => (
                <TouchableOpacity
                  key={pattern}
                  className={`rounded-full px-3 py-1.5 ${
                    form.recurrence_pattern === pattern
                      ? "bg-indigo-600"
                      : "bg-gray-100"
                  }`}
                  onPress={() =>
                    setForm((p) => ({ ...p, recurrence_pattern: pattern }))
                  }
                >
                  <Text
                    className={`text-xs capitalize ${
                      form.recurrence_pattern === pattern
                        ? "font-medium text-white"
                        : "text-gray-700"
                    }`}
                  >
                    {pattern}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <ActionButton
            label={editing ? "Update Period" : "Add Closed Period"}
            onPress={handleSave}
            loading={creating || updatingBlock}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

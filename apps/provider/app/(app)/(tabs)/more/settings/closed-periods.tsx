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
import { useTranslation } from "@beautonomi/i18n";
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
import { formatLocalYmd } from "@/lib/reportDateRanges";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

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
  { labelKey: "typeHoliday", value: "unavailable" },
  { labelKey: "typeBreak", value: "break" },
  { labelKey: "typeMaintenance", value: "maintenance" },
];

const RECURRENCE_PATTERNS = [
  { value: "yearly", labelKey: "recurrenceYearly" },
  { value: "monthly", labelKey: "recurrenceMonthly" },
  { value: "weekly", labelKey: "recurrenceWeekly" },
];

type TabMode = "upcoming" | "past" | "all";
type CpT = (key: string, opts?: Record<string, unknown>) => string;

function blockLabel(type: string, cp: CpT): string {
  if (type === "unavailable") return cp("labelClosed");
  if (type === "break") return cp("labelBreak");
  if (type === "maintenance") return cp("labelMaintenance");
  return type;
}

export default function ClosedPeriodsScreen() {
  const { t } = useTranslation();
  const cp = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.closedPeriods.${key}`, opts) as string,
    [t],
  );
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
    useApiMutation("put");
  const { execute: deleteBlock } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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
      start_date: formatLocalYmd(start),
      start_time: start.toTimeString().slice(0, 5),
      end_date: formatLocalYmd(end),
      end_time: end.toTimeString().slice(0, 5),
      reason: block.reason ?? "",
      is_recurring: block.is_recurring ?? false,
      recurrence_pattern: block.recurrence_pattern ?? "yearly",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.start_date || !form.end_date) {
      Alert.alert(cp("requiredTitle"), cp("datesRequired"));
      return;
    }
    const startLocal = new Date(`${form.start_date}T${form.start_time}:00`);
    const endLocal = new Date(`${form.end_date}T${form.end_time}:00`);
    if (!Number.isFinite(startLocal.getTime()) || !Number.isFinite(endLocal.getTime())) {
      Alert.alert(cp("invalidTitle"), cp("parseFailed"));
      return;
    }
    if (endLocal.getTime() <= startLocal.getTime()) {
      Alert.alert(cp("invalidTimesTitle"), cp("endAfterStart"));
      return;
    }

    const payload = {
      block_type: form.block_type,
      start_at: startLocal.toISOString(),
      end_at: endLocal.toISOString(),
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
        Alert.alert(
          cp("saveFailedTitle"),
          __DEV__ ? `${error}` : error,
        );
        return;
      }
    } else {
      const { error } = await createBlock(payload);
      if (error) {
        Alert.alert(
          cp("saveFailedTitle"),
          __DEV__ ? `${error}` : error,
        );
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  function handleDelete(block: AvailabilityBlock) {
    Alert.alert(cp("deleteTitle"), cp("deleteBody"), [
      { text: cp("cancel"), style: "cancel" },
      {
        text: cp("delete"),
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteBlock(
            `/api/provider/availability-blocks/${block.id}`
          );
          if (error) Alert.alert(cp("errorTitle"), error);
          else refresh();
        },
      },
    ]);
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
        title={cp("title")}
        showBack
        subtitle={cp("subtitle")}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {blocks && blocks.length > 0 && (
        <View style={twStyle("mb-3")}>
          <View style={twStyle("flex-row")}>
            <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
              <StatCard
                title={cp("statUpcoming")}
                value={String(upcomingCount)}
                icon="calendar-outline"
                iconColor="#6366f1"
                iconBg="bg-indigo-50"
                compact
              />
            </View>
            <View style={twStyle("flex-1")}>
              <StatCard
                title={cp("statActiveNow")}
                value={String(activeNow)}
                icon="alert-circle-outline"
                iconColor={activeNow > 0 ? "#ef4444" : "#22c55e"}
                iconBg={activeNow > 0 ? "bg-red-50" : "bg-green-50"}
                compact
              />
            </View>
          </View>
          {nextClosure && (
            <View style={twStyle("mt-2 rounded-xl bg-indigo-50 p-3")}>
              <Text style={twStyle("text-xs text-indigo-700")}>
                {cp("nextClosure", {
                  reason: nextClosure.reason ?? blockLabel(nextClosure.block_type, cp),
                  date: formatDate(nextClosure.start_at),
                })}
              </Text>
            </View>
          )}
        </View>
      )}

      {blocks && blocks.length > 0 && (
        <View style={twStyle("mb-3")}>
          <FilterChipGroup
            options={[
              { label: cp("filterUpcoming"), value: "upcoming" },
              { label: cp("filterPast"), value: "past" },
              { label: cp("filterAll"), value: "all" },
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
          title={tab !== "upcoming" ? cp("emptyFilteredTitle") : cp("emptyTitle")}
          description={
            tab !== "upcoming"
              ? cp("emptyFilteredBody")
              : cp("emptyBody")
          }
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(b: AvailabilityBlock) => b.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: block }: { item: AvailabilityBlock }) => {
            const colors = blockColor(block.block_type);
            const active = isCurrentlyActive(block);
            const days = getDurationDays(block);
            return (
              <TouchableOpacity
                style={twStyle(`rounded-xl border bg-white p-4 ${
                  active ? "border-red-200" : "border-gray-100"
                }`)}
                onPress={() => openEdit(block)}
                activeOpacity={0.7}
              >
                <View style={twStyle("flex-row items-start justify-between")}>
                  <View style={twStyle("flex-1")}>
                    <View style={twStyle("flex-row items-center")}>
                      <View style={[twStyle(`rounded-full px-2.5 py-0.5 ${colors.bg}`), { marginEnd: 8 }]}>
                        <Text style={twStyle(`text-xs font-medium ${colors.text}`)}>
                          {blockLabel(block.block_type, cp)}
                        </Text>
                      </View>
                      {active && (
                        <View style={[twStyle("rounded-full bg-red-500 px-2 py-0.5"), { marginEnd: 8 }]}>
                          <Text style={twStyle("text-[10px] font-bold text-white")}>
                            {cp("activeBadge")}
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
                    <Text style={twStyle("mt-1.5 text-sm font-medium text-gray-900")}>
                      {formatDate(block.start_at)} — {formatDate(block.end_at)}
                    </Text>
                    <View style={twStyle("mt-1 flex-row items-center")}>
                      <Text style={[twStyle("text-xs text-gray-400"), { marginEnd: 12 }]}>
                        {cp("durationDays", { count: days })}
                      </Text>
                      {block.affected_bookings_count !== undefined &&
                        block.affected_bookings_count > 0 && (
                          <Text style={twStyle("text-xs text-amber-600")}>
                            {cp("bookingsAffected", { count: block.affected_bookings_count })}
                          </Text>
                        )}
                    </View>
                    {block.reason && (
                      <Text style={twStyle("mt-1 text-xs text-gray-500")}>
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
        title={editing ? cp("editTitle") : cp("addTitle")}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{cp("typeLabel")}</Text>
          <View style={twStyle("mb-3 flex-row flex-wrap")}>
            {BLOCK_TYPES.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[twStyle(`rounded-full px-4 py-2 ${
                  form.block_type === opt.value
                    ? "bg-indigo-600"
                    : "bg-gray-100"
                }`), { marginEnd: 8, marginBottom: 8 }]}
                onPress={() =>
                  setForm((p) => ({ ...p, block_type: opt.value }))
                }
              >
                <Text
                  style={twStyle(`text-sm ${
                    form.block_type === opt.value
                      ? "font-medium text-white"
                      : "text-gray-700"
                  }`)}
                >
                  {cp(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                {cp("startDate")}
              </Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={form.start_date}
                onChangeText={(text) =>
                  setForm((p) => ({ ...p, start_date: text }))
                }
                placeholder={cp("datePlaceholder")}
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                {cp("startTime")}
              </Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={form.start_time}
                onChangeText={(text) =>
                  setForm((p) => ({ ...p, start_time: text }))
                }
                placeholder={cp("timePlaceholder")}
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                {cp("endDate")}
              </Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={form.end_date}
                onChangeText={(text) => setForm((p) => ({ ...p, end_date: text }))}
                placeholder={cp("datePlaceholder")}
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                {cp("endTime")}
              </Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={form.end_time}
                onChangeText={(text) =>
                  setForm((p) => ({ ...p, end_time: text }))
                }
                placeholder={cp("timePlaceholder")}
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {cp("reason")}
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.reason}
            onChangeText={(text) => setForm((p) => ({ ...p, reason: text }))}
            placeholder={cp("reasonPlaceholder")}
            placeholderTextColor="#9ca3af"
          />
          <View style={twStyle("mb-3 flex-row items-center justify-between")}>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>
                {cp("recurring")}
              </Text>
              <Text style={twStyle("text-xs text-gray-400")}>
                {cp("recurringHint")}
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
            <View style={twStyle("mb-3 flex-row")}>
              {RECURRENCE_PATTERNS.map((pattern) => (
                <TouchableOpacity
                  key={pattern.value}
                  style={[twStyle(`rounded-full px-3 py-1.5 ${
                    form.recurrence_pattern === pattern.value
                      ? "bg-indigo-600"
                      : "bg-gray-100"
                  }`), { marginEnd: 8 }]}
                  onPress={() =>
                    setForm((p) => ({ ...p, recurrence_pattern: pattern.value }))
                  }
                >
                  <Text
                    style={twStyle(`text-xs capitalize ${
                      form.recurrence_pattern === pattern.value
                        ? "font-medium text-white"
                        : "text-gray-700"
                    }`)}
                  >
                    {cp(pattern.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <ActionButton
            label={editing ? cp("updatePeriod") : cp("addPeriod")}
            onPress={handleSave}
            loading={creating || updatingBlock}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

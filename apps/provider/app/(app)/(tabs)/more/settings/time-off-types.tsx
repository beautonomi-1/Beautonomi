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
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

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
  const { t } = useTranslation();
  const tot = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.timeOffTypes.${key}`, opts) as string,
    [t],
  );
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
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!types) return [];
    let result = [...types];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
      );
    }
    switch (filter) {
      case "paid":
        result = result.filter((item) => item.is_paid);
        break;
      case "unpaid":
        result = result.filter((item) => !item.is_paid);
        break;
      case "active":
        result = result.filter((item) => item.is_active);
        break;
      case "inactive":
        result = result.filter((item) => !item.is_active);
        break;
    }
    return result;
  }, [types, search, filter]);

  const paidCount = useMemo(
    () => types?.filter((item) => item.is_paid).length ?? 0,
    [types]
  );
  const activeCount = useMemo(
    () => types?.filter((item) => item.is_active).length ?? 0,
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
      Alert.alert(tot("requiredTitle"), tot("nameRequired"));
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
        Alert.alert(tot("errorTitle"), error);
        return;
      }
    } else {
      const { error } = await createType(payload);
      if (error) {
        Alert.alert(tot("errorTitle"), error);
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
    if (error) Alert.alert(tot("errorTitle"), error);
    else refresh();
  }

  function handleDelete(type: TimeOffType) {
    Alert.alert(tot("deleteTitle"), tot("deleteBody", { name: type.name }), [
      { text: tot("cancel"), style: "cancel" },
      {
        text: tot("delete"),
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteType(
            `/api/provider/time-off-types/${type.id}`
          );
          if (error) Alert.alert(tot("errorTitle"), error);
          else refresh();
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={tot("title")}
        showBack
        subtitle={tot("subtitle", { count: types?.length ?? 0 })}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
            onPress={openCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {types && types.length > 0 && (
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginEnd: 12 }]}>
            <StatCard
              title={tot("statPaid")}
              value={String(paidCount)}
              icon="cash-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title={tot("statActive")}
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
        <View style={twStyle("mb-3")}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={tot("searchPlaceholder")}
          />
          <View style={twStyle("mt-2")}>
            <FilterChipGroup
              options={[
                { label: tot("filterAll"), value: "all" },
                { label: tot("filterPaid"), value: "paid" },
                { label: tot("filterUnpaid"), value: "unpaid" },
                { label: tot("filterActive"), value: "active" },
                { label: tot("filterInactive"), value: "inactive" },
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
          title={search || filter !== "all" ? tot("emptyMatches") : tot("emptyTitle")}
          description={
            search || filter !== "all"
              ? tot("emptyMatchesHint")
              : tot("emptyHint")
          }
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(item: TimeOffType) => item.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: type }: { item: TimeOffType }) => (
            <TouchableOpacity
              style={twStyle(`rounded-xl border bg-white p-4 ${
                type.is_active
                  ? "border-gray-100"
                  : "border-gray-100 opacity-60"
              }`)}
              onPress={() => openEdit(type)}
              activeOpacity={0.7}
            >
              <View style={twStyle("flex-row items-center")}>
                <View
                  style={[twStyle("h-10 w-10 items-center justify-center rounded-xl"), {
                    backgroundColor: (type.color ?? "#6366f1") + "20",
                  }]}
                >
                  <Ionicons
                    name="sunny-outline"
                    size={20}
                    color={type.color ?? "#6366f1"}
                  />
                </View>
                <View style={twStyle("ms-3 flex-1")}>
                  <View style={twStyle("flex-row items-center")}>
                    <Text style={[twStyle("text-sm font-semibold text-gray-900"), { marginEnd: 8 }]}>
                      {type.name}
                    </Text>
                    <View
                      style={[twStyle(`rounded-full px-2 py-0.5 ${
                        type.is_paid ? "bg-green-50" : "bg-gray-100"
                      }`), { marginEnd: 8 }]}
                    >
                      <Text
                        style={twStyle(`text-[10px] font-medium ${
                          type.is_paid ? "text-green-700" : "text-gray-500"
                        }`)}
                      >
                        {type.is_paid ? tot("paid") : tot("unpaid")}
                      </Text>
                    </View>
                    {!type.is_active && (
                      <View style={[twStyle("rounded-full bg-gray-100 px-2 py-0.5"), { marginEnd: 8 }]}>
                        <Text style={twStyle("text-[10px] font-medium text-gray-500")}>
                          {tot("inactive")}
                        </Text>
                      </View>
                    )}
                  </View>
                  {type.description && (
                    <Text
                      style={twStyle("mt-0.5 text-xs text-gray-500")}
                      numberOfLines={1}
                    >
                      {type.description}
                    </Text>
                  )}
                  <View style={twStyle("mt-1 flex-row items-center")}>
                    {type.max_days && (
                      <Text style={[twStyle("text-xs text-indigo-500"), { marginEnd: 12 }]}>
                        {tot("maxDays", { count: type.max_days })}
                      </Text>
                    )}
                    {type.usage_count !== undefined && (
                      <Text style={twStyle("text-xs text-gray-400")}>
                        {tot("usedTimes", { count: type.usage_count })}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={twStyle("flex-row items-center")}>
                  <TouchableOpacity
                    onPress={() => handleToggleActive(type)}
                    style={{ marginEnd: 8 }}
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
        title={editing ? tot("editTitle") : tot("newTitle")}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {tot("nameLabel")}
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
            placeholder={tot("namePlaceholder")}
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {tot("description")}
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(text) => setForm((p) => ({ ...p, description: text }))}
            placeholder={tot("descriptionPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {tot("maxDaysLabel")}
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.maxDays}
            onChangeText={(text) => setForm((p) => ({ ...p, maxDays: text }))}
            placeholder={tot("maxDaysPlaceholder")}
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
          />
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{tot("color")}</Text>
          <View style={twStyle("mb-3 flex-row flex-wrap")}>
            {COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[twStyle(`h-10 w-10 items-center justify-center rounded-full ${
                  form.color === c ? "border-2 border-gray-900" : ""
                }`), { backgroundColor: c, marginEnd: 12, marginBottom: 12 }]}
                onPress={() => setForm((p) => ({ ...p, color: c }))}
              >
                {form.color === c && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </View>
          <View style={twStyle("mb-3 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>
              {tot("paidLeave")}
            </Text>
            <Switch
              value={form.isPaid}
              onValueChange={(v) => setForm((p) => ({ ...p, isPaid: v }))}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              thumbColor={form.isPaid ? "#16a34a" : "#f4f4f5"}
            />
          </View>
          <View style={twStyle("mb-4 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{tot("active")}</Text>
            <Switch
              value={form.isActive}
              onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              trackColor={{ false: "#d1d5db", true: "#818cf8" }}
              thumbColor={form.isActive ? "#6366f1" : "#f4f4f5"}
            />
          </View>
          <ActionButton
            label={editing ? tot("updateType") : tot("addType")}
            onPress={handleSave}
            loading={creating || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

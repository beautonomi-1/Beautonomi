import { useState, useCallback, useMemo } from "react";
import { View, Text, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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

type FilterMode = "all" | "paid" | "unpaid" | "active" | "inactive";

export default function TimeOffTypesScreen() {
  const { t } = useTranslation();
  const tot = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.timeOffTypes.${key}`, opts) as string,
    [t],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  const { data: types, loading, refresh } = useApi<TimeOffType[]>(
    "/api/provider/time-off-types"
  );

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

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={tot("title")}
        showBack
        subtitle={tot("subtitle", { count: types?.length ?? 0 })}
      />

      <Text style={twStyle("mb-3 text-sm text-gray-500")}>{tot("emptyHint")}</Text>

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
            <View
              style={twStyle(`rounded-xl border bg-white p-4 ${
                type.is_active
                  ? "border-gray-100"
                  : "border-gray-100 opacity-60"
              }`)}
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
                      style={twStyle(`rounded-full px-2 py-0.5 ${
                        type.is_paid ? "bg-green-50" : "bg-gray-100"
                      }`)}
                    >
                      <Text
                        style={twStyle(`text-[10px] font-medium ${
                          type.is_paid ? "text-green-700" : "text-gray-500"
                        }`)}
                      >
                        {type.is_paid ? tot("paid") : tot("unpaid")}
                      </Text>
                    </View>
                  </View>
                  {type.description ? (
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")} numberOfLines={1}>
                      {type.description}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}

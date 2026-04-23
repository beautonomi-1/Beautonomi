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
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface PlatformZone {
  id: string;
  name: string;
  region: string | null;
  description: string | null;
}

interface ZoneSelection {
  id: string;
  platform_zone_id: string;
  travel_fee: number;
  currency: string;
  travel_time_minutes: number;
  description: string | null;
  is_active: boolean;
}

interface ZoneWithSelection {
  platform_zone: PlatformZone;
  selection: ZoneSelection | null;
  is_selected: boolean;
}

type FilterMode = "all" | "active" | "inactive" | "available";

export default function ServiceZonesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneWithSelection | null>(
    null
  );
  const [selectedZone, setSelectedZone] = useState<PlatformZone | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [form, setForm] = useState({
    travel_fee: "0",
    travel_time: "30",
    description: "",
  });

  const { data: zones, loading, error: loadError, refresh } = useApi<ZoneWithSelection[]>(
    "/api/provider/zone-selections"
  );
  const { execute: addZone, loading: adding } = useApiPost<any, any>(
    "/api/provider/zone-selections"
  );
  const { execute: updateZone, loading: updating } = useApiMutation("patch");
  const { execute: removeZone } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!zones) return [];
    let result = [...zones];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (z) =>
          z.platform_zone.name.toLowerCase().includes(q) ||
          z.platform_zone.region?.toLowerCase().includes(q)
      );
    }

    switch (filter) {
      case "active":
        result = result.filter((z) => z.is_selected && z.selection?.is_active);
        break;
      case "inactive":
        result = result.filter(
          (z) => z.is_selected && !z.selection?.is_active
        );
        break;
      case "available":
        result = result.filter((z) => !z.is_selected);
        break;
    }

    result.sort((a, b) => {
      if (a.is_selected && !b.is_selected) return -1;
      if (!a.is_selected && b.is_selected) return 1;
      return a.platform_zone.name.localeCompare(b.platform_zone.name);
    });

    return result;
  }, [zones, search, filter]);

  const activeCount = useMemo(
    () =>
      zones?.filter((z) => z.is_selected && z.selection?.is_active).length ?? 0,
    [zones]
  );
  const totalFees = useMemo(
    () =>
      zones
        ?.filter((z) => z.selection?.is_active)
        .reduce((sum, z) => sum + (z.selection?.travel_fee ?? 0), 0) ?? 0,
    [zones]
  );
  const avgTravelTime = useMemo(() => {
    const activeZones =
      zones?.filter((z) => z.selection?.is_active) ?? [];
    if (!activeZones.length) return 0;
    return Math.round(
      activeZones.reduce(
        (sum, z) => sum + (z.selection?.travel_time_minutes ?? 0),
        0
      ) / activeZones.length
    );
  }, [zones]);

  function openAdd(zone: PlatformZone) {
    setEditingZone(null);
    setSelectedZone(zone);
    setForm({ travel_fee: "0", travel_time: "30", description: "" });
    setShowForm(true);
  }

  function openEdit(zone: ZoneWithSelection) {
    setEditingZone(zone);
    setSelectedZone(zone.platform_zone);
    setForm({
      travel_fee: String(zone.selection?.travel_fee ?? 0),
      travel_time: String(zone.selection?.travel_time_minutes ?? 30),
      description: zone.selection?.description ?? "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!selectedZone) return;
    const payload = {
      platform_zone_id: selectedZone.id,
      travel_fee: Number(form.travel_fee) || 0,
      travel_time_minutes: Number(form.travel_time) || 30,
      description: form.description.trim() || undefined,
      is_active: true,
    };
    if (editingZone?.selection) {
      const { error } = await updateZone(
        `/api/provider/zone-selections/${editingZone.selection.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await addZone(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  async function handleToggle(zone: ZoneWithSelection) {
    if (zone.selection) {
      const { error } = await updateZone(
        `/api/provider/zone-selections/${zone.selection.id}`,
        { is_active: !zone.selection.is_active }
      );
      if (error) Alert.alert("Error", error);
      else refresh();
    }
  }

  async function handleRemove(zone: ZoneWithSelection) {
    if (!zone.selection) return;
    Alert.alert(
      "Remove Zone",
      `Stop servicing ${zone.platform_zone.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const { error } = await removeZone(
              `/api/provider/zone-selections/${zone.selection!.id}`
            );
            if (error) Alert.alert("Error", error);
            else refresh();
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Service Zones"
        showBack
        subtitle={`${activeCount} active zones`}
      />

      {zones && zones.length > 0 && (
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
            <StatCard
              title="Active"
              value={String(activeCount)}
              icon="map-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
            <StatCard
              title="Avg Travel"
              value={`${avgTravelTime}m`}
              icon="time-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title="Total Fees"
              value={formatCurrency(totalFees)}
              icon="cash-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
              compact
            />
          </View>
        </View>
      )}

      {zones && zones.length > 3 && (
        <View style={twStyle("mb-3")}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search zones..."
          />
          <View style={twStyle("mt-2")}>
            <FilterChipGroup
              options={[
                { label: "All", value: "all" },
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
                { label: "Available", value: "available" },
              ]}
              selected={filter}
              onSelect={(v: string) => setFilter(v as FilterMode)}
            />
          </View>
        </View>
      )}

      {loading && !zones && !loadError ? (
        <SkeletonList rows={5} />
      ) : loadError && !zones ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : !filtered.length ? (
        <EmptyState
          icon="map-outline"
          title={search || filter !== "all" ? "No matches" : "No zones"}
          description={
            search || filter !== "all"
              ? "Try different filters"
              : "Service zones will be configured by the platform"
          }
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(z: ZoneWithSelection) => z.platform_zone.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: zone }: { item: ZoneWithSelection }) => (
            <TouchableOpacity
              style={twStyle(`rounded-xl border bg-white p-4 ${
                zone.is_selected
                  ? zone.selection?.is_active
                    ? "border-indigo-200"
                    : "border-gray-200 opacity-70"
                  : "border-gray-100"
              }`)}
              onPress={() =>
                zone.is_selected ? openEdit(zone) : openAdd(zone.platform_zone)
              }
              activeOpacity={0.7}
            >
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-row flex-1 items-center")}>
                  <View
                    style={twStyle(`h-10 w-10 items-center justify-center rounded-lg ${
                      zone.is_selected ? "bg-indigo-50" : "bg-gray-50"
                    }`)}
                  >
                    <Ionicons
                      name="location-outline"
                      size={20}
                      color={zone.is_selected ? "#6366f1" : "#9ca3af"}
                    />
                  </View>
                  <View style={twStyle("ml-3 flex-1")}>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                      {zone.platform_zone.name}
                    </Text>
                    {zone.platform_zone.region && (
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {zone.platform_zone.region}
                      </Text>
                    )}
                  </View>
                </View>
                {zone.is_selected ? (
                  <Switch
                    value={zone.selection?.is_active ?? false}
                    onValueChange={() => handleToggle(zone)}
                    trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                    thumbColor={
                      zone.selection?.is_active ? "#6366f1" : "#f4f4f5"
                    }
                  />
                ) : (
                  <TouchableOpacity
                    style={twStyle("rounded-lg bg-indigo-50 px-3 py-1.5")}
                    onPress={() => openAdd(zone.platform_zone)}
                  >
                    <Text style={twStyle("text-xs font-medium text-indigo-700")}>
                      Add
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {zone.is_selected && zone.selection && (
                <View style={twStyle("mt-2 flex-row items-center justify-between")}>
                  <View style={twStyle("flex-row items-center")}>
                    <View style={[twStyle("flex-row items-center"), { marginRight: 4 }]}>
                      <Ionicons name="cash-outline" size={12} color="#6b7280" />
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {formatCurrency(zone.selection.travel_fee)}
                      </Text>
                    </View>
                    <View style={[twStyle("flex-row items-center"), { marginRight: 12 }]}>
                      <Ionicons name="time-outline" size={12} color="#6b7280" />
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {zone.selection.travel_time_minutes}min
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleRemove(zone)}>
                    <Ionicons name="close-circle" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={
          editingZone
            ? `Edit ${selectedZone?.name ?? "Zone"}`
            : `Add ${selectedZone?.name ?? "Zone"}`
        }
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {`Travel Fee (${getTenantDefaultCurrency()})`}
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.travel_fee}
            onChangeText={(t) =>
              setForm((p) => ({ ...p, travel_fee: t }))
            }
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Travel Time (minutes)
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.travel_time}
            onChangeText={(t) =>
              setForm((p) => ({ ...p, travel_time: t }))
            }
            keyboardType="number-pad"
            placeholder="30"
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Notes
          </Text>
          <TextInput
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(t) =>
              setForm((p) => ({ ...p, description: t }))
            }
            placeholder="Optional notes..."
            placeholderTextColor="#9ca3af"
            multiline
          />
          <ActionButton
            label={editingZone ? "Update Zone" : "Add Zone"}
            onPress={handleSave}
            loading={adding || updating}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}

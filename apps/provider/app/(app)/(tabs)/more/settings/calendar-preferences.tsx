/**
 * Calendar preferences – display options for the calendar.
 * GET/PATCH /api/provider/settings/calendar-preferences
 */
import { useState, useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity, Switch } from "react-native";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";

interface CalendarPreferences {
  highContrast?: boolean;
  showCanceled?: boolean;
  timeIncrementMinutes?: number;
  workdayStartHour?: number;
  workdayEndHour?: number;
  showProcessingAndBuffer?: boolean;
  colorBy?: "status" | "service" | "team_member";
  scrollToNow?: boolean;
  showAppointmentIcons?: boolean;
  compactMode?: boolean;
  showPrices?: boolean;
  showClientPhone?: boolean;
}

const TIME_INCREMENTS = [5, 10, 15];
const COLOR_BY_OPTIONS: { value: CalendarPreferences["colorBy"]; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "service", label: "Service" },
  { value: "team_member", label: "Team member" },
];

export default function CalendarPreferencesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: prefs, loading, refresh } = useApi<CalendarPreferences>(
    "/api/provider/settings/calendar-preferences"
  );
  const { execute: updatePrefs, loading: saving } = useApiMutation("patch");
  const [local, setLocal] = useState<CalendarPreferences>({});

  useEffect(() => {
    if (prefs) setLocal(prefs);
  }, [prefs]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  async function handleSave() {
    const { error } = await updatePrefs(
      "/api/provider/settings/calendar-preferences",
      local
    );
    if (error) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  function set<K extends keyof CalendarPreferences>(key: K, value: CalendarPreferences[K]) {
    setLocal((p) => ({ ...p, [key]: value }));
  }

  if (loading && !prefs) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading preferences..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Calendar preferences" showBack subtitle="Display options" />

      <SectionHeader title="Display" />
      <View className="mb-4 rounded-2xl border border-gray-100 bg-white">
        <View className="flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5">
          <Text className="text-sm text-gray-700">Show canceled appointments</Text>
          <Switch
            value={local.showCanceled ?? true}
            onValueChange={(v) => set("showCanceled", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
        <View className="flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5">
          <Text className="text-sm text-gray-700">High contrast mode</Text>
          <Switch
            value={local.highContrast ?? false}
            onValueChange={(v) => set("highContrast", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
        <View className="flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5">
          <Text className="text-sm text-gray-700">Scroll to current time</Text>
          <Switch
            value={local.scrollToNow ?? true}
            onValueChange={(v) => set("scrollToNow", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
        <View className="flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5">
          <Text className="text-sm text-gray-700">Show appointment icons</Text>
          <Switch
            value={local.showAppointmentIcons ?? true}
            onValueChange={(v) => set("showAppointmentIcons", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
        <View className="flex-row items-center justify-between px-4 py-3.5">
          <Text className="text-sm text-gray-700">Show prices on blocks</Text>
          <Switch
            value={local.showPrices ?? false}
            onValueChange={(v) => set("showPrices", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
      </View>

      <SectionHeader title="Time grid (minutes)" />
      <View className="mb-4 flex-row gap-2">
        {TIME_INCREMENTS.map((m) => (
          <TouchableOpacity
            key={m}
            className={`flex-1 items-center rounded-xl border py-3 ${
              (local.timeIncrementMinutes ?? 15) === m
                ? "border-indigo-300 bg-indigo-50"
                : "border-gray-200 bg-white"
            }`}
            onPress={() => set("timeIncrementMinutes", m)}
          >
            <Text
              className={`text-sm font-medium ${
                (local.timeIncrementMinutes ?? 15) === m ? "text-indigo-700" : "text-gray-600"
              }`}
            >
              {m} min
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionHeader title="Color appointments by" />
      <View className="mb-4 flex-row flex-wrap gap-2">
        {COLOR_BY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            className={`rounded-xl border px-4 py-2.5 ${
              (local.colorBy ?? "status") === opt.value
                ? "border-indigo-300 bg-indigo-50"
                : "border-gray-200 bg-white"
            }`}
            onPress={() => set("colorBy", opt.value)}
          >
            <Text
              className={`text-sm font-medium ${
                (local.colorBy ?? "status") === opt.value ? "text-indigo-700" : "text-gray-600"
              }`}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ActionButton
        label="Save preferences"
        onPress={handleSave}
        loading={saving}
        fullWidth
      />
      <View className="h-8" />
    </ScreenContainer>
  );
}

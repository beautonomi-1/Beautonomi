/**
 * Calendar preferences – display options for the calendar.
 * GET/PATCH /api/provider/settings/calendar-preferences
 */
import { useState, useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity, Switch, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

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
  const { data: prefs, loading, error: loadError, refresh } = useApi<CalendarPreferences>(
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
    if (error) {
      Alert.alert("Error", typeof error === "string" ? error : "Failed to save preferences. Please try again.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Calendar preferences updated.");
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

  if (loadError && !prefs) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Calendar preferences" showBack subtitle="Display options" />
        <ErrorState message={typeof loadError === "string" ? loadError : "Failed to load preferences"} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Calendar preferences" showBack subtitle="Display options" />

      <SectionHeader title="Display" />
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white")}>
        <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5")}>
          <Text style={twStyle("text-sm text-gray-700")}>Show canceled appointments</Text>
          <Switch
            value={local.showCanceled ?? true}
            onValueChange={(v) => set("showCanceled", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
        <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5")}>
          <Text style={twStyle("text-sm text-gray-700")}>High contrast mode</Text>
          <Switch
            value={local.highContrast ?? false}
            onValueChange={(v) => set("highContrast", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
        <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5")}>
          <Text style={twStyle("text-sm text-gray-700")}>Scroll to current time</Text>
          <Switch
            value={local.scrollToNow ?? true}
            onValueChange={(v) => set("scrollToNow", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
        <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3.5")}>
          <Text style={twStyle("text-sm text-gray-700")}>Show appointment icons</Text>
          <Switch
            value={local.showAppointmentIcons ?? true}
            onValueChange={(v) => set("showAppointmentIcons", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
        <View style={twStyle("flex-row items-center justify-between px-4 py-3.5")}>
          <Text style={twStyle("text-sm text-gray-700")}>Show prices on blocks</Text>
          <Switch
            value={local.showPrices ?? false}
            onValueChange={(v) => set("showPrices", v)}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
          />
        </View>
      </View>

      <SectionHeader title="Time grid (minutes)" />
      <View style={twStyle("mb-4 flex-row")}>
        {TIME_INCREMENTS.map((m) => (
          <TouchableOpacity
            key={m}
            style={[twStyle(`flex-1 items-center rounded-xl border py-3 ${
              (local.timeIncrementMinutes ?? 15) === m
                ? "border-indigo-300 bg-indigo-50"
                : "border-gray-200 bg-white"
            }`)]}
            onPress={() => set("timeIncrementMinutes", m)}
          >
            <Text
              style={twStyle(`text-sm font-medium ${
                (local.timeIncrementMinutes ?? 15) === m ? "text-indigo-700" : "text-gray-600"
              }`)}
            >
              {m} min
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionHeader title="Color appointments by" />
      <View style={twStyle("mb-4 flex-row flex-wrap")}>
        {COLOR_BY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[twStyle(`rounded-xl border px-4 py-2.5 ${
              (local.colorBy ?? "status") === opt.value
                ? "border-indigo-300 bg-indigo-50"
                : "border-gray-200 bg-white"
            }`), { marginRight: 8, marginBottom: 8 }]}
            onPress={() => set("colorBy", opt.value)}
          >
            <Text
              style={twStyle(`text-sm font-medium ${
                (local.colorBy ?? "status") === opt.value ? "text-indigo-700" : "text-gray-600"
              }`)}
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
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}

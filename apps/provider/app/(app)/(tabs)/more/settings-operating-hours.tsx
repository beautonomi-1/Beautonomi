/**
 * Operating hours – GET /api/provider/settings/operating-hours, PATCH per location.
 * workingHours: Record<day, { open, close, closed }> or { is_open, open_time, close_time }.
 * Uses @react-native-community/datetimepicker in time mode for open/close times.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  Switch,
  TouchableOpacity,
  Modal,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";

/** Parse "HH:mm" to Date (use fixed date for time-only). */
function timeStringToDate(s: string): Date {
  const [h = 9, m = 0] = s.split(":").map((x) => parseInt(x, 10) || 0);
  return new Date(2000, 0, 1, h, m);
}

/** Format Date to "HH:mm". */
function dateToTimeString(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

type DayHours = { open: string; close: string; closed: boolean };

function normalizeWorkingHours(raw: Record<string, unknown> | null): Record<string, DayHours> {
  const out: Record<string, DayHours> = {};
  const defaultDay: DayHours = { open: "09:00", close: "18:00", closed: false };
  for (const day of DAYS) {
    const d = raw?.[day] as Record<string, unknown> | undefined;
    if (!d) {
      out[day] = { ...defaultDay };
      continue;
    }
    // API may return is_open, open_time, close_time or open, close, closed
    const closed = d.closed === true || d.is_open === false;
    const open =
      (d.open as string) ?? (d.open_time as string) ?? "09:00";
    const close =
      (d.close as string) ?? (d.close_time as string) ?? "18:00";
    out[day] = { open, close, closed };
  }
  return out;
}

function toApiWorkingHours(h: Record<string, DayHours>): Record<string, { is_open: boolean; open_time: string; close_time: string }> {
  const out: Record<string, { is_open: boolean; open_time: string; close_time: string }> = {};
  for (const day of DAYS) {
    const d = h[day] ?? { open: "09:00", close: "18:00", closed: false };
    out[day] = {
      is_open: !d.closed,
      open_time: d.open,
      close_time: d.close,
    };
  }
  return out;
}

type LocationHours = {
  locationId: string;
  locationName: string;
  isPrimary: boolean;
  isActive: boolean;
  workingHours: Record<string, unknown>;
};

type ActiveTimePicker = { locationId: string; day: string; field: "open" | "close" };

export default function SettingsOperatingHoursScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<LocationHours[]>("/api/provider/settings/operating-hours");
  const [locationHours, setLocationHours] = useState<Record<string, Record<string, DayHours>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeTimePicker, setActiveTimePicker] = useState<ActiveTimePicker | null>(null);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    if (!data || !Array.isArray(data)) return;
    const next: Record<string, Record<string, DayHours>> = {};
    for (const loc of data as LocationHours[]) {
      next[loc.locationId] = normalizeWorkingHours(loc.workingHours);
    }
    setLocationHours(next);
  }, [data]);

  const setDay = useCallback(
    (locationId: string, day: string, patch: Partial<DayHours>) => {
      setLocationHours((prev) => ({
        ...prev,
        [locationId]: {
          ...(prev[locationId] ?? {}),
          [day]: { ...(prev[locationId]?.[day] ?? { open: "09:00", close: "18:00", closed: false }), ...patch },
        },
      }));
    },
    []
  );

  const handleSaveLocation = useCallback(
    async (locationId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSavingId(locationId);
      const hours = locationHours[locationId];
      if (!hours) {
        setSavingId(null);
        return;
      }
      const res = await api.patch<LocationHours>("/api/provider/settings/operating-hours", {
        locationId,
        workingHours: toApiWorkingHours(hours),
      });
      setSavingId(null);
      if (res.error) {
        Alert.alert("Error", res.error.message);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Operating hours updated.");
      refresh();
    },
    [locationHours, refresh]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Operating hours" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Operating hours" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const locations = (Array.isArray(data) ? data : []) as LocationHours[];
  if (locations.length === 0) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Operating hours" onBack={() => router.back()} />
        <View className="flex-1 px-4 py-12">
          <View className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <View className="flex-row items-center mb-2">
              <Ionicons name="time-outline" size={24} color="#d97706" />
              <Text className="ml-2 text-base font-semibold text-amber-900">No locations yet</Text>
            </View>
            <Text className="text-sm text-amber-800">
              Add at least one location in Settings first. Operating hours are set per location.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/locations" as never)}
              className="mt-4 rounded-xl bg-amber-600 py-3 items-center"
            >
              <Text className="font-semibold text-white">Go to Locations</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Operating hours"
        subtitle="Opening and closing times per location"
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4">
          {locations.map((loc) => {
            const hours = locationHours[loc.locationId] ?? normalizeWorkingHours(loc.workingHours);
            return (
              <View key={loc.locationId} className="mb-6 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <View className="bg-gray-50 px-4 py-3 flex-row items-center justify-between">
                  <Text className="font-semibold text-gray-900">{loc.locationName}</Text>
                  {loc.isPrimary && (
                    <View className="rounded bg-teal-100 px-2 py-0.5">
                      <Text className="text-xs font-medium text-teal-800">Primary</Text>
                    </View>
                  )}
                </View>
                <View className="p-4">
                  {DAYS.map((day) => {
                    const d = hours[day] ?? { open: "09:00", close: "18:00", closed: false };
                    return (
                      <View
                        key={day}
                        className="flex-row items-center py-3 border-b border-gray-100"
                        style={{ borderBottomWidth: DAYS.indexOf(day) < DAYS.length - 1 ? 1 : 0 }}
                      >
                        <View className="w-24">
                          <Text className="text-sm text-gray-700">{DAY_LABELS[day]}</Text>
                        </View>
                        <Switch
                          value={!d.closed}
                          onValueChange={(v) => setDay(loc.locationId, day, { closed: !v })}
                          trackColor={{ true: "#14b8a6", false: "#d1d5db" }}
                          thumbColor="#fff"
                        />
                        {!d.closed && (
                          <>
                            <TouchableOpacity
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setActiveTimePicker({ locationId: loc.locationId, day, field: "open" });
                              }}
                              className="ml-2 min-w-[64px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                              accessibilityLabel={`Open time ${d.open}`}
                              accessibilityRole="button"
                            >
                              <Text className="text-center text-sm text-gray-900">{d.open}</Text>
                            </TouchableOpacity>
                            <Text className="mx-1 text-gray-400">–</Text>
                            <TouchableOpacity
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setActiveTimePicker({ locationId: loc.locationId, day, field: "close" });
                              }}
                              className="min-w-[64px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                              accessibilityLabel={`Close time ${d.close}`}
                              accessibilityRole="button"
                            >
                              <Text className="text-center text-sm text-gray-900">{d.close}</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        {d.closed && <Text className="ml-2 text-sm text-gray-400">Closed</Text>}
                      </View>
                    );
                  })}
                  <View className="mt-4">
                    <ActionButton
                      label="Save hours"
                      variant="secondary"
                      size="sm"
                      onPress={() => handleSaveLocation(loc.locationId)}
                      loading={savingId === loc.locationId}
                      fullWidth
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {activeTimePicker && data && (() => {
        const loc = data.find((l) => l.locationId === activeTimePicker!.locationId);
        const hours = locationHours[activeTimePicker.locationId] ?? (loc ? normalizeWorkingHours(loc.workingHours) : {});
        const d = hours[activeTimePicker.day] ?? { open: "09:00", close: "18:00", closed: false };
        const timeStr = activeTimePicker.field === "open" ? d.open : d.close;
        const currentDate = timeStringToDate(timeStr);
        return (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setActiveTimePicker(null)}
          >
            <TouchableOpacity
              activeOpacity={1}
              className="flex-1 bg-black/50 justify-end"
              onPress={() => setActiveTimePicker(null)}
            >
              <View
                className="bg-white rounded-t-2xl pb-8 pt-2"
                onStartShouldSetResponder={() => true}
              >
                <View className="flex-row justify-end px-4 py-2">
                  <TouchableOpacity
                    onPress={() => setActiveTimePicker(null)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Text className="text-teal-600 font-medium">Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={currentDate}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, selectedDate) => {
                    if (selectedDate) {
                      setDay(activeTimePicker.locationId, activeTimePicker.day, {
                        [activeTimePicker.field]: dateToTimeString(selectedDate),
                      });
                    }
                    setActiveTimePicker(null);
                  }}
                />
              </View>
            </TouchableOpacity>
          </Modal>
        );
      })()}
    </ScreenContainer>
  );
}

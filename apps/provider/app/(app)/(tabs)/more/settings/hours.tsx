import { useState, useEffect, useCallback } from "react";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Switch,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";
import {
  type DayHours,
  type RawDayHours,
  mapWorkingHoursToSchedule,
  OPERATING_HOURS_DAYS,
  scheduleToWorkingHours,
} from "@/lib/operating-hours";

interface TimePickerTarget {
  dayIndex: number;
  field: "open_time" | "close_time" | "break_start" | "break_end";
  breakIndex?: number;
}

/* ─── constants ─── */
const DAYS = OPERATING_HOURS_DAYS;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function parseTime(t: string): { h: number; m: number } {
  const [hStr, mStr] = t.split(":");
  const parsedH = parseInt(hStr ?? "0", 10);
  const parsedM = parseInt(mStr ?? "0", 10);
  const h = Number.isFinite(parsedH) ? Math.max(0, Math.min(23, parsedH)) : 0;
  const m = Number.isFinite(parsedM) ? Math.max(0, Math.min(59, parsedM)) : 0;
  return { h, m };
}

function formatTimeLabel(t: string): string {
  const { h, m } = parseTime(t);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

/* ─── default schedule ─── */
function defaultSchedule(): DayHours[] {
  return mapWorkingHoursToSchedule(null, DAYS);
}

/* ─── types for API ─── */
interface LocationHours {
  locationId: string;
  locationName: string;
  isPrimary: boolean;
  isActive: boolean;
  workingHours: Record<string, RawDayHours>;
}

/* ─── Screen ─── */
export default function OperatingHoursScreen() {
  const { t } = useTranslation();
  const oh = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.operatingHoursSettings.${key}`, opts) as string,
    [t],
  );
  const {
    data: locations,
    loading,
    error: fetchError,
    refresh,
  } = useApi<LocationHours[]>("/api/provider/settings/operating-hours");
  const { execute: saveHours, loading: saving } = useApiMutation("patch");

  const [schedule, setSchedule] = useState<DayHours[]>(defaultSchedule);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<TimePickerTarget | null>(
    null,
  );
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (locations && locations.length > 0) {
      const primary = locations.find((l) => l.isPrimary) || locations[0];
      if (primary) {
        setSelectedLocationId(primary.locationId);
        setSchedule(mapWorkingHoursToSchedule(primary.workingHours, DAYS));
      }
    }
  }, [locations]);

  function handleLocationChange(locId: string) {
    const loc = locations?.find((l) => l.locationId === locId);
    if (loc) {
      setSelectedLocationId(locId);
      setSchedule(mapWorkingHoursToSchedule(loc.workingHours, DAYS));
      setHasChanges(false);
    }
  }

  /* ─── helpers ─── */
  function markChanged() {
    setHasChanges(true);
  }

  function toggleDay(dayIndex: number) {
    setSchedule((prev) =>
      prev.map((d, i) =>
        i === dayIndex ? { ...d, is_open: !d.is_open } : d,
      ),
    );
    markChanged();
  }

  function openTimePicker(target: TimePickerTarget) {
    setPickerTarget(target);
    setPickerVisible(true);
  }

  function getCurrentTimeValue(): string {
    if (!pickerTarget) return "08:00";
    const day = schedule[pickerTarget.dayIndex];
    if (!day) return "08:00";

    if (pickerTarget.field === "open_time") return day.open_time;
    if (pickerTarget.field === "close_time") return day.close_time;
    if (
      pickerTarget.field === "break_start" &&
      pickerTarget.breakIndex !== undefined
    ) {
      return day.breaks[pickerTarget.breakIndex]?.start ?? "12:00";
    }
    if (
      pickerTarget.field === "break_end" &&
      pickerTarget.breakIndex !== undefined
    ) {
      return day.breaks[pickerTarget.breakIndex]?.end ?? "13:00";
    }
    return "08:00";
  }

  function handleTimeSelect(time: string) {
    if (!pickerTarget) return;
    const { dayIndex, field, breakIndex } = pickerTarget;

    setSchedule((prev) =>
      prev.map((d, i) => {
        if (i !== dayIndex) return d;
        if (field === "open_time") return { ...d, open_time: time };
        if (field === "close_time") return { ...d, close_time: time };
        if (field === "break_start" && breakIndex !== undefined) {
          const breaks = [...d.breaks];
          const brk = breaks[breakIndex];
          if (brk) breaks[breakIndex] = { ...brk, start: time };
          return { ...d, breaks };
        }
        if (field === "break_end" && breakIndex !== undefined) {
          const breaks = [...d.breaks];
          const brk = breaks[breakIndex];
          if (brk) breaks[breakIndex] = { ...brk, end: time };
          return { ...d, breaks };
        }
        return d;
      }),
    );
    markChanged();
  }

  function addBreak(dayIndex: number) {
    setSchedule((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? { ...d, breaks: [...d.breaks, { start: "12:00", end: "13:00" }] }
          : d,
      ),
    );
    markChanged();
  }

  function removeBreak(dayIndex: number, breakIndex: number) {
    setSchedule((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? { ...d, breaks: d.breaks.filter((_, bi) => bi !== breakIndex) }
          : d,
      ),
    );
    markChanged();
  }

  /* ─── validation ─── */
  function timeToMinutes(t: string): number {
    const { h, m } = parseTime(t);
    return h * 60 + m;
  }

  function validateSchedule(): string | null {
    for (const day of schedule) {
      if (!day.is_open) continue;
      const openMin = timeToMinutes(day.open_time);
      const closeMin = timeToMinutes(day.close_time);
      if (closeMin <= openMin) {
        return oh("closeAfterOpen", { day: day.day });
      }
      for (let i = 0; i < day.breaks.length; i++) {
        const brk = day.breaks[i];
        if (!brk) continue;
        const bStart = timeToMinutes(brk.start);
        const bEnd = timeToMinutes(brk.end);
        if (bEnd <= bStart) {
          return oh("breakEndAfterStart", { day: day.day, index: i + 1 });
        }
        if (bStart < openMin || bEnd > closeMin) {
          return oh("breakWithinHours", { day: day.day, index: i + 1 });
        }
      }
    }
    return null;
  }

  /* ─── save ─── */
  const handleSave = useCallback(async () => {
    const validationError = validateSchedule();
    if (validationError) {
      Alert.alert(oh("validationTitle"), validationError);
      return;
    }

    if (!selectedLocationId) {
      Alert.alert(oh("noLocationTitle"), oh("noLocationBody"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await saveHours(
      "/api/provider/settings/operating-hours",
      { locationId: selectedLocationId, workingHours: scheduleToWorkingHours(schedule) },
    );
    if (error) {
      Alert.alert(oh("errorTitle"), error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(oh("savedTitle"), oh("savedBody"));
      setHasChanges(false);
      refresh();
    }
  // selectedLocationId, validateSchedule intentionally omitted to avoid re-running on every location/schedule change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveHours, schedule, refresh]);

  /* ─── loading / error ─── */
  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={oh("title")} showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (fetchError && !locations) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={oh("title")} showBack />
        <ErrorState message={fetchError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={oh("title")}
        showBack
        subtitle={oh("subtitle")}
      />

      {locations && locations.length === 0 && (
        <View style={{ backgroundColor: "#FEF3C7", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#92400E", marginBottom: 4 }}>{oh("noLocationsTitle")}</Text>
          <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 18 }}>
            {oh("noLocationsBody")}
          </Text>
        </View>
      )}

      <View style={{ backgroundColor: "#DBEAFE", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, color: "#1E40AF", lineHeight: 18 }}>
          {oh("infoBanner")}
        </Text>
      </View>

      {/* Location picker (if multiple) */}
      {locations && locations.length > 1 && (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("mb-2 text-xs font-medium text-gray-500")}>{oh("locationLabel")}</Text>
          <View style={twStyle("flex-row flex-wrap")}>
            {locations.map((loc) => (
              <TouchableOpacity
                key={loc.locationId}
                style={[twStyle(`rounded-lg px-3 py-1.5 ${loc.locationId === selectedLocationId ? "bg-indigo-600" : "bg-gray-100"}`), { marginEnd: 8, marginBottom: 8 }]}
                onPress={() => handleLocationChange(loc.locationId)}
                accessibilityLabel={oh("selectLocationA11y", { name: loc.locationName })}
              >
                <Text style={twStyle(`text-sm font-medium ${loc.locationId === selectedLocationId ? "text-white" : "text-gray-700"}`)}>
                  {loc.locationName}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Day rows */}
      <View
        style={twStyle("rounded-2xl border border-gray-100 bg-white")}
        accessibilityLabel={oh("weeklyScheduleA11y")}
      >
        {schedule.map((day, i) => (
          <View
            key={day.day}
            style={twStyle(`px-4 py-3 ${i < schedule.length - 1 ? "border-b border-gray-50" : ""}`)}
          >
            {/* Main row */}
            <View style={twStyle("flex-row items-center")}>
              <Switch
                value={day.is_open}
                onValueChange={() => toggleDay(i)}
                trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                thumbColor={day.is_open ? "#6366f1" : "#f3f4f6"}
                accessibilityLabel={oh("dayOpenToggleA11y", { day: day.day })}
              />
              <Text
                style={twStyle(`ms-3 w-24 text-sm font-semibold ${day.is_open ? "text-gray-900" : "text-gray-400"}`)}
              >
                {day.day}
              </Text>

              {day.is_open ? (
                <View style={twStyle("flex-1 flex-row items-center justify-end")}>
                  <TouchableOpacity
                    style={[twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5"), { marginEnd: 4 }]}
                    onPress={() =>
                      openTimePicker({ dayIndex: i, field: "open_time" })
                    }
                    accessibilityLabel={oh("openingTimeA11y", { day: day.day, time: formatTimeLabel(day.open_time) })}
                    accessibilityRole="button"
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-700")}>
                      {formatTimeLabel(day.open_time)}
                    </Text>
                  </TouchableOpacity>
                    <Text style={[twStyle("text-xs text-gray-400"), { marginEnd: 4 }]}>{oh("timeTo")}</Text>
                  <TouchableOpacity
                    style={twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5")}
                    onPress={() =>
                      openTimePicker({ dayIndex: i, field: "close_time" })
                    }
                    accessibilityLabel={oh("closingTimeA11y", { day: day.day, time: formatTimeLabel(day.close_time) })}
                    accessibilityRole="button"
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-700")}>
                      {formatTimeLabel(day.close_time)}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={twStyle("flex-1 text-end text-sm text-gray-400")}>
                  {oh("closed")}
                </Text>
              )}
            </View>

            {/* Breaks */}
            {day.is_open && (
              <View style={twStyle("ms-14 mt-2")}>
                {day.breaks.map((brk, bi) => (
                  <View
                    key={bi}
                    style={twStyle("mb-1.5 flex-row items-center")}
                  >
                    <Ionicons name="cafe-outline" size={14} color="#9ca3af" style={{ marginEnd: 4 }} />
                    <Text style={[twStyle("text-xs text-gray-500"), { marginEnd: 4 }]}>{oh("breakLabel")}</Text>
                    <TouchableOpacity
                      style={[twStyle("rounded-md border border-gray-200 bg-gray-50 px-2 py-1"), { marginEnd: 4 }]}
                      onPress={() =>
                        openTimePicker({
                          dayIndex: i,
                          field: "break_start",
                          breakIndex: bi,
                        })
                      }
                      accessibilityLabel={oh("breakStartA11y", { day: day.day, index: bi + 1 })}
                      accessibilityRole="button"
                    >
                      <Text style={twStyle("text-xs text-gray-600")}>
                        {formatTimeLabel(brk.start)}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[twStyle("text-xs text-gray-400"), { marginEnd: 4 }]}>-</Text>
                    <TouchableOpacity
                      style={[twStyle("rounded-md border border-gray-200 bg-gray-50 px-2 py-1"), { marginEnd: 4 }]}
                      onPress={() =>
                        openTimePicker({
                          dayIndex: i,
                          field: "break_end",
                          breakIndex: bi,
                        })
                      }
                      accessibilityLabel={oh("breakEndA11y", { day: day.day, index: bi + 1 })}
                      accessibilityRole="button"
                    >
                      <Text style={twStyle("text-xs text-gray-600")}>
                        {formatTimeLabel(brk.end)}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeBreak(i, bi)}
                      hitSlop={8}
                      accessibilityLabel={oh("removeBreakA11y", { day: day.day, index: bi + 1 })}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={twStyle("mt-1 flex-row items-center")}
                  onPress={() => addBreak(i)}
                  accessibilityLabel={oh("addBreakA11y", { day: day.day })}
                  accessibilityRole="button"
                >
                  <Ionicons name="add-circle-outline" size={16} color="#6366f1" />
                  <Text style={twStyle("ms-1 text-xs font-medium text-indigo-600")}>
                    {oh("addBreak")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Save */}
      <View style={twStyle("mt-6")}>
        <ActionButton
          label={saving ? oh("saving") : oh("saveHours")}
          onPress={handleSave}
          loading={saving}
          disabled={!hasChanges}
          fullWidth
        />
      </View>

      {hasChanges && (
        <Text style={twStyle("mt-2 text-center text-xs text-amber-600")}>
          {oh("unsavedChanges")}
        </Text>
      )}

      <View style={twStyle("h-8")} />

      {/* Time Picker Modal */}
      {pickerVisible && pickerTarget && (
        <DateTimePicker
          value={new Date(`2000-01-01T${getCurrentTimeValue()}:00`)}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_: any, d?: Date) => {
            if (Platform.OS !== "ios") setPickerVisible(false);
            if (d) {
              handleTimeSelect(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
            }
          }}
        />
      )}
    </ScreenContainer>
  );
}

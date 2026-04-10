import { useState, useEffect, useCallback } from "react";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Switch,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

/* ─── types ─── */
interface BreakTime {
  start: string;
  end: string;
}

interface DayHours {
  day: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
  breaks: BreakTime[];
}

interface TimePickerTarget {
  dayIndex: number;
  field: "open_time" | "close_time" | "break_start" | "break_end";
  breakIndex?: number;
}

/* ─── constants ─── */
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

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
  return DAYS.map((day) => ({
    day,
    is_open: day !== "Sunday",
    open_time: "08:00",
    close_time: "18:00",
    breaks: [],
  }));
}

/* ─── Time Picker Modal ─── */
function TimePicker({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  onSelect: (time: string) => void;
  onClose: () => void;
}) {
  const parsed = parseTime(value);
  const [hour, setHour] = useState(parsed.h);
  const [minute, setMinute] = useState(parsed.m);

  useEffect(() => {
    if (visible) {
      const p = parseTime(value);
      setHour(p.h);
      setMinute(p.m);
    }
  }, [visible, value]);

  function handleConfirm() {
    onSelect(`${pad(hour)}:${pad(minute)}`);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={twStyle("flex-1 items-center justify-center bg-black/40")}
        onPress={onClose}
      >
        <Pressable
          style={twStyle("mx-6 w-80 rounded-2xl bg-white p-6")}
          onPress={() => {}}
          accessibilityLabel="Time picker dialog"
        >
          <Text style={twStyle("mb-4 text-center text-lg font-semibold text-gray-900")}>
            Select Time
          </Text>

          {/* Hour / Minute columns */}
          <View style={twStyle("flex-row justify-center")}>
            {/* Hour */}
            <View style={[twStyle("items-center"), { marginRight: 16 }]}>
              <Text style={twStyle("mb-2 text-xs font-medium text-gray-500")}>
                Hour
              </Text>
              <ScrollView
                style={twStyle("h-40 w-16 rounded-xl bg-gray-50")}
                showsVerticalScrollIndicator={false}
                accessibilityLabel="Hour selector"
              >
                {HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={twStyle(`items-center py-2 ${hour === h ? "rounded-lg bg-indigo-600" : ""}`)}
                    onPress={() => setHour(h)}
                    accessibilityLabel={`Hour ${h}`}
                    accessibilityRole="button"
                  >
                    <Text
                      style={twStyle(`text-base font-medium ${hour === h ? "text-white" : "text-gray-700"}`)}
                    >
                      {pad(h)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={[twStyle("self-center text-2xl font-bold text-gray-400"), { marginRight: 16 }]}>
              :
            </Text>

            {/* Minute */}
            <View style={twStyle("items-center")}>
              <Text style={twStyle("mb-2 text-xs font-medium text-gray-500")}>
                Min
              </Text>
              <View style={twStyle("w-16 rounded-xl bg-gray-50")}>
                {MINUTES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={twStyle(`items-center py-3 ${minute === m ? "rounded-lg bg-indigo-600" : ""}`)}
                    onPress={() => setMinute(m)}
                    accessibilityLabel={`Minute ${pad(m)}`}
                    accessibilityRole="button"
                  >
                    <Text
                      style={twStyle(`text-base font-medium ${minute === m ? "text-white" : "text-gray-700"}`)}
                    >
                      {pad(m)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Preview */}
          <Text style={twStyle("mt-4 text-center text-xl font-bold text-gray-900")}>
            {formatTimeLabel(`${pad(hour)}:${pad(minute)}`)}
          </Text>

          {/* Actions */}
          <View style={twStyle("mt-5 flex-row")}>
            <TouchableOpacity
              style={[twStyle("flex-1 items-center rounded-xl border border-gray-200 py-3"), { marginRight: 12 }]}
              onPress={onClose}
              accessibilityLabel="Cancel time selection"
              accessibilityRole="button"
            >
              <Text style={twStyle("font-medium text-gray-600")}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={twStyle("flex-1 items-center rounded-xl bg-indigo-600 py-3")}
              onPress={handleConfirm}
              accessibilityLabel="Confirm time selection"
              accessibilityRole="button"
            >
              <Text style={twStyle("font-medium text-white")}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ─── types for API ─── */
interface LocationHours {
  locationId: string;
  locationName: string;
  isPrimary: boolean;
  isActive: boolean;
  workingHours: Record<string, { is_open?: boolean; open_time?: string; close_time?: string; breaks?: BreakTime[] }>;
}

function locationHoursToSchedule(wh: LocationHours["workingHours"]): DayHours[] {
  return DAYS.map((day) => {
    const key = day.toLowerCase();
    const dh = wh[key];
    return {
      day,
      is_open: dh?.is_open ?? day !== "Sunday",
      open_time: dh?.open_time ?? "08:00",
      close_time: dh?.close_time ?? "18:00",
      breaks: dh?.breaks ?? [],
    };
  });
}

function scheduleToWorkingHours(sched: DayHours[]): Record<string, object> {
  const result: Record<string, object> = {};
  for (const d of sched) {
    result[d.day.toLowerCase()] = {
      is_open: d.is_open,
      open_time: d.open_time,
      close_time: d.close_time,
      breaks: d.breaks,
    };
  }
  return result;
}

/* ─── Screen ─── */
export default function OperatingHoursScreen() {
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
        setSchedule(locationHoursToSchedule(primary.workingHours));
      }
    }
  }, [locations]);

  function handleLocationChange(locId: string) {
    const loc = locations?.find((l) => l.locationId === locId);
    if (loc) {
      setSelectedLocationId(locId);
      setSchedule(locationHoursToSchedule(loc.workingHours));
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
        return `${day.day}: Closing time must be after opening time`;
      }
      for (let i = 0; i < day.breaks.length; i++) {
        const brk = day.breaks[i];
        if (!brk) continue;
        const bStart = timeToMinutes(brk.start);
        const bEnd = timeToMinutes(brk.end);
        if (bEnd <= bStart) {
          return `${day.day}: Break ${i + 1} end must be after start`;
        }
        if (bStart < openMin || bEnd > closeMin) {
          return `${day.day}: Break ${i + 1} must be within operating hours`;
        }
      }
    }
    return null;
  }

  /* ─── save ─── */
  const handleSave = useCallback(async () => {
    const validationError = validateSchedule();
    if (validationError) {
      Alert.alert("Validation Error", validationError);
      return;
    }

    if (!selectedLocationId) {
      Alert.alert("Error", "No location selected");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error } = await saveHours(
      "/api/provider/settings/operating-hours",
      { locationId: selectedLocationId, workingHours: scheduleToWorkingHours(schedule) },
    );
    if (error) {
      Alert.alert("Error", error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Operating hours updated successfully.");
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
        <ScreenHeader title="Operating Hours" showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (fetchError && !locations) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Operating Hours" showBack />
        <ErrorState message={fetchError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Operating Hours"
        showBack
        subtitle="Set your business hours for each day"
      />

      <View style={{ backgroundColor: "#DBEAFE", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, color: "#1E40AF", lineHeight: 18 }}>
          These hours determine when customers can book at this location. Staff without custom work hours will follow these hours automatically.
        </Text>
      </View>

      {/* Location picker (if multiple) */}
      {locations && locations.length > 1 && (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("mb-2 text-xs font-medium text-gray-500")}>Location</Text>
          <View style={twStyle("flex-row flex-wrap")}>
            {locations.map((loc) => (
              <TouchableOpacity
                key={loc.locationId}
                style={[twStyle(`rounded-lg px-3 py-1.5 ${loc.locationId === selectedLocationId ? "bg-indigo-600" : "bg-gray-100"}`), { marginRight: 8, marginBottom: 8 }]}
                onPress={() => handleLocationChange(loc.locationId)}
                accessibilityLabel={`Select ${loc.locationName}`}
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
        accessibilityLabel="Weekly schedule"
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
                accessibilityLabel={`${day.day} open toggle`}
              />
              <Text
                style={twStyle(`ml-3 w-24 text-sm font-semibold ${day.is_open ? "text-gray-900" : "text-gray-400"}`)}
              >
                {day.day}
              </Text>

              {day.is_open ? (
                <View style={twStyle("flex-1 flex-row items-center justify-end")}>
                  <TouchableOpacity
                    style={[twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5"), { marginRight: 4 }]}
                    onPress={() =>
                      openTimePicker({ dayIndex: i, field: "open_time" })
                    }
                    accessibilityLabel={`${day.day} opening time ${formatTimeLabel(day.open_time)}`}
                    accessibilityRole="button"
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-700")}>
                      {formatTimeLabel(day.open_time)}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[twStyle("text-xs text-gray-400"), { marginRight: 4 }]}>to</Text>
                  <TouchableOpacity
                    style={twStyle("rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5")}
                    onPress={() =>
                      openTimePicker({ dayIndex: i, field: "close_time" })
                    }
                    accessibilityLabel={`${day.day} closing time ${formatTimeLabel(day.close_time)}`}
                    accessibilityRole="button"
                  >
                    <Text style={twStyle("text-sm font-medium text-gray-700")}>
                      {formatTimeLabel(day.close_time)}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={twStyle("flex-1 text-right text-sm text-gray-400")}>
                  Closed
                </Text>
              )}
            </View>

            {/* Breaks */}
            {day.is_open && (
              <View style={twStyle("ml-14 mt-2")}>
                {day.breaks.map((brk, bi) => (
                  <View
                    key={bi}
                    style={twStyle("mb-1.5 flex-row items-center")}
                  >
                    <Ionicons name="cafe-outline" size={14} color="#9ca3af" style={{ marginRight: 4 }} />
                    <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 4 }]}>Break:</Text>
                    <TouchableOpacity
                      style={[twStyle("rounded-md border border-gray-200 bg-gray-50 px-2 py-1"), { marginRight: 4 }]}
                      onPress={() =>
                        openTimePicker({
                          dayIndex: i,
                          field: "break_start",
                          breakIndex: bi,
                        })
                      }
                      accessibilityLabel={`${day.day} break ${bi + 1} start time`}
                      accessibilityRole="button"
                    >
                      <Text style={twStyle("text-xs text-gray-600")}>
                        {formatTimeLabel(brk.start)}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[twStyle("text-xs text-gray-400"), { marginRight: 4 }]}>-</Text>
                    <TouchableOpacity
                      style={[twStyle("rounded-md border border-gray-200 bg-gray-50 px-2 py-1"), { marginRight: 4 }]}
                      onPress={() =>
                        openTimePicker({
                          dayIndex: i,
                          field: "break_end",
                          breakIndex: bi,
                        })
                      }
                      accessibilityLabel={`${day.day} break ${bi + 1} end time`}
                      accessibilityRole="button"
                    >
                      <Text style={twStyle("text-xs text-gray-600")}>
                        {formatTimeLabel(brk.end)}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeBreak(i, bi)}
                      hitSlop={8}
                      accessibilityLabel={`Remove ${day.day} break ${bi + 1}`}
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
                  accessibilityLabel={`Add break for ${day.day}`}
                  accessibilityRole="button"
                >
                  <Ionicons name="add-circle-outline" size={16} color="#6366f1" />
                  <Text style={twStyle("ml-1 text-xs font-medium text-indigo-600")}>
                    Add break
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
          label={saving ? "Saving…" : "Save Hours"}
          onPress={handleSave}
          loading={saving}
          disabled={!hasChanges}
          fullWidth
        />
      </View>

      {hasChanges && (
        <Text style={twStyle("mt-2 text-center text-xs text-amber-600")}>
          You have unsaved changes
        </Text>
      )}

      <View style={twStyle("h-8")} />

      {/* Time Picker Modal */}
      <TimePicker
        visible={pickerVisible}
        value={getCurrentTimeValue()}
        onSelect={handleTimeSelect}
        onClose={() => setPickerVisible(false)}
      />
    </ScreenContainer>
  );
}

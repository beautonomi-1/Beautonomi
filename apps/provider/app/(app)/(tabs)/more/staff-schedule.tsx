import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { capitalizeFirst } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StaffMember {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
}

interface Shift {
  id: string | null;
  staff_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  date?: string;
  notes?: string | null;
}

interface ShiftFormData {
  staff_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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

function parseTime(t: string | null | undefined): { h: number; m: number } {
  if (t == null || typeof t !== "string") return { h: 0, m: 0 };
  const [hStr, mStr] = t.split(":");
  const parsedH = parseInt(hStr ?? "0", 10);
  const parsedM = parseInt(mStr ?? "0", 10);
  const h = Number.isFinite(parsedH) ? Math.max(0, Math.min(23, parsedH)) : 0;
  const m = Number.isFinite(parsedM) ? Math.max(0, Math.min(59, parsedM)) : 0;
  return { h, m };
}

function formatTimeLabel(t: string | null | undefined): string {
  const { h, m } = parseTime(t);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

function timeToMinutes(t: string | null | undefined): number {
  const { h, m } = parseTime(t);
  return h * 60 + m;
}

const EMPTY_SHIFT_FORM: ShiftFormData = {
  staff_id: "",
  day_of_week: "Monday",
  start_time: "09:00",
  end_time: "17:00",
  notes: "",
};

/* ------------------------------------------------------------------ */
/*  Time Picker Modal                                                  */
/* ------------------------------------------------------------------ */

function TimePicker({
  visible,
  value,
  onSelect,
  onClose,
  title,
}: {
  visible: boolean;
  value: string;
  onSelect: (time: string) => void;
  onClose: () => void;
  title?: string;
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
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <Pressable
        style={[twStyle("flex-1 items-center justify-center bg-black/40"), { zIndex: 10000, elevation: 10000 }]}
        onPress={onClose}
      >
        <Pressable
          style={[twStyle("mx-6 w-80 rounded-2xl bg-white p-6"), { zIndex: 10001, elevation: 10001 }]}
          onPress={() => {}}
          accessibilityLabel="Time picker dialog"
        >
          <Text style={twStyle("mb-4 text-center text-lg font-semibold text-gray-900")}>
            {title ?? "Select Time"}
          </Text>

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

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function StaffScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ staffId?: string }>();
  useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [shiftFormOpen, setShiftFormOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [form, setForm] = useState<ShiftFormData>(EMPTY_SHIFT_FORM);
  const [pickerField, setPickerField] = useState<
    "start_time" | "end_time" | null
  >(null);

  /* ── Data ── */
  const {
    data: staff,
    loading: loadingStaff,
    error: staffError,
    refresh: refreshStaff,
  } = useApi<StaffMember[]>("/api/provider/staff");

  const shiftsUrl = selectedStaffId
    ? `/api/provider/staff/${selectedStaffId}/shifts`
    : "";
  const {
    data: shifts,
    loading: loadingShifts,
    error: shiftsError,
    refresh: refreshShifts,
  } = useApi<Shift[]>(shiftsUrl, { enabled: !!selectedStaffId });

  const { execute: saveShift, loading: creating } = useApiMutation("post");
  const { execute: deleteShift, loading: deleting } = useApiMutation("delete");

  const isSaving = creating || deleting;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshStaff(), refreshShifts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshStaff, refreshShifts]);

  /* ── Select staff from route param or first member ── */
  useEffect(() => {
    if (params.staffId && staff?.some((s) => s.id === params.staffId)) {
      setSelectedStaffId(params.staffId);
      return;
    }
    if (!selectedStaffId && staff && staff.length > 0 && staff[0]) {
      setSelectedStaffId(staff[0].id);
    }
  }, [staff, selectedStaffId, params.staffId]);

  /* ── Group shifts by day ── */
  const shiftsByDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    DAYS.forEach((day) => map.set(day, []));

    const filteredShifts = (shifts ?? []).filter(
      (s) => !selectedStaffId || s.staff_id === selectedStaffId,
    );

    for (const shift of filteredShifts) {
      const existing = map.get(shift.day_of_week) ?? [];
      existing.push(shift);
      map.set(shift.day_of_week, existing);
    }
    return map;
  }, [shifts, selectedStaffId]);

  /* ── Selected staff member name ── */
  const selectedStaff = useMemo(
    () => staff?.find((s) => s.id === selectedStaffId),
    [staff, selectedStaffId],
  );

  /* ── Handlers ── */
  function openAddShift(day?: string) {
    setEditingShift(null);
    setForm({
      ...EMPTY_SHIFT_FORM,
      staff_id: selectedStaffId ?? "",
      day_of_week: day ?? "Monday",
    });
    setShiftFormOpen(true);
  }

  function openEditShift(shift: Shift) {
    setEditingShift(shift);
    setForm({
      staff_id: shift.staff_id,
      day_of_week: shift.day_of_week,
      start_time: shift.start_time,
      end_time: shift.end_time,
      notes: shift.notes ?? "",
    });
    setShiftFormOpen(true);
  }

  function validateShift(): string | null {
    if (!form.staff_id) return "Please select a staff member";
    const startMin = timeToMinutes(form.start_time);
    const endMin = timeToMinutes(form.end_time);
    if (endMin <= startMin) return "End time must be after start time";
    return null;
  }

  async function handleSaveShift() {
    const validationError = validateShift();
    if (validationError) {
      Alert.alert("Validation Error", validationError);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const payload = {
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      notes: form.notes.trim() || null,
    };

    const staffId = form.staff_id;

    // When editing and the day changed, delete the old shift first so we don't orphan it.
    // The subsequent POST does an upsert keyed on (staff_id, day_of_week).
    if (editingShift?.id && editingShift.day_of_week !== form.day_of_week) {
      const { error: delErr } = await deleteShift(
        `/api/provider/staff/${staffId}/shifts/${editingShift.id}`,
        {},
      );
      if (delErr) {
        Alert.alert("Error", delErr);
        return;
      }
    }

    const { error } = await saveShift(
      `/api/provider/staff/${staffId}/shifts`,
      payload,
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShiftFormOpen(false);
    refreshShifts();
  }

  function handleDeleteShift(shift: Shift) {
    if (!shift.id) return; // No saved schedule row to delete
    Alert.alert(
      "Delete Shift",
      `Delete this ${shift.day_of_week} shift (${formatTimeLabel(shift.start_time)} - ${formatTimeLabel(shift.end_time)})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error } = await deleteShift(
              `/api/provider/staff/${shift.staff_id}/shifts/${shift.id}`,
              {},
            );
            if (error) {
              Alert.alert("Error", error);
            } else {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              refreshShifts();
            }
          },
        },
      ],
    );
  }

  /* ── Total weekly hours ── */
  const totalWeeklyHours = useMemo(() => {
    let totalMinutes = 0;
    shiftsByDay.forEach((dayShifts) => {
      for (const shift of dayShifts) {
        const start = timeToMinutes(shift.start_time);
        const end = timeToMinutes(shift.end_time);
        if (end > start) totalMinutes += end - start;
      }
    });
    return (totalMinutes / 60).toFixed(1);
  }, [shiftsByDay]);

  /* ── Render ── */
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Staff Schedules"
        showBack
        subtitle={selectedStaff ? selectedStaff.name : "Select a staff member"}
        rightAction={
          <TouchableOpacity
            onPress={() => openAddShift()}
            style={twStyle("flex-row items-center rounded-xl bg-gray-900 px-4 py-2")}
            accessibilityLabel="Add shift"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={twStyle("ml-1 text-sm font-semibold text-white")}>
              Add Shift
            </Text>
          </TouchableOpacity>
        }
      />

      <View style={{ backgroundColor: "#EEF2FF", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, color: "#3730A3", lineHeight: 18 }}>
          Schedules define when each staff member is available for bookings. You can set multiple shifts per day (split shifts).
        </Text>
      </View>

      {/* ── Add team member CTA: one flow with shifts on Team screen ── */}
      <TouchableOpacity
        style={twStyle("mb-3 flex-row items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 py-2.5")}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(app)/(tabs)/more/team?add=1" as never);
        }}
        accessibilityLabel="Add team member and set shifts"
        accessibilityRole="button"
      >
        <Ionicons name="person-add-outline" size={18} color="#6366f1" />
        <Text style={twStyle("ml-2 text-sm font-medium text-indigo-700")}>
          Add team member (set shifts in one step)
        </Text>
      </TouchableOpacity>

      {/* ── Staff Selector ── */}
      {loadingStaff && !staff ? (
        <SkeletonList rows={1} />
      ) : staffError && !staff ? (
        <ErrorState message={staffError} onRetry={refreshStaff} />
      ) : (
        <View style={twStyle("mb-4")}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 4 }}
          >
            {(staff ?? [])
              .filter((s) => s.is_active)
              .map((member) => {
                const isSelected = selectedStaffId === member.id;
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[twStyle(`flex-row items-center rounded-2xl px-4 py-2.5 ${
                      isSelected
                        ? "border border-indigo-200 bg-indigo-50"
                        : "border border-gray-100 bg-white"
                    }`), { marginRight: 8 }]}
                    onPress={() => setSelectedStaffId(member.id)}
                    accessibilityLabel={`Select ${member.name}`}
                    accessibilityRole="button"
                  >
                    <Avatar
                      name={member.name}
                      imageUrl={member.avatar_url}
                      size="sm"
                    />
                    <View style={twStyle("ml-2")}>
                      <Text
                        style={twStyle(`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-gray-900"}`)}
                        numberOfLines={1}
                      >
                        {member.name}
                      </Text>
                      <Text style={twStyle("text-[10px] text-gray-500")}>
                        {capitalizeFirst(member.role)}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={twStyle("ml-2")}>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color="#6366f1"
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </View>
      )}

      {/* ── Weekly hours summary ── */}
      {selectedStaffId && (
        <View style={twStyle("mb-4 flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-row items-center")}>
            <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-indigo-50")}>
              <Ionicons name="time-outline" size={20} color="#6366f1" />
            </View>
            <View style={twStyle("ml-3")}>
              <Text style={twStyle("text-xs text-gray-500")}>Total Weekly Hours</Text>
              <Text style={twStyle("text-lg font-bold text-gray-900")}>
                {totalWeeklyHours}h
              </Text>
            </View>
          </View>
          <View style={twStyle("flex-row items-center rounded-full bg-indigo-50 px-3 py-1")}>
            <Text style={twStyle("text-xs font-medium text-indigo-700")}>
              {Array.from(shiftsByDay.values()).filter((s) => s.length > 0)
                .length}{" "}
              days
            </Text>
          </View>
        </View>
      )}

      {/* ── Quick Actions ── */}
      {selectedStaffId && (
        <View style={twStyle("mb-4 flex-row")}>
          <TouchableOpacity
            style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5"), { marginRight: 8 }]}
            onPress={() => {
              Alert.alert(
                "Set Standard Hours",
                "Set Mon–Fri 09:00–17:00 for this staff member? This will overwrite existing shifts.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Apply",
                    onPress: async () => {
                      const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                      const failures: string[] = [];
                      for (const day of weekdays) {
                        const { error: err } = await saveShift(`/api/provider/staff/${selectedStaffId}/shifts`, {
                          day_of_week: day,
                          start_time: "09:00",
                          end_time: "17:00",
                        });
                        if (err) failures.push(day);
                      }
                      if (failures.length > 0) {
                        Alert.alert("Partial failure", `Could not set hours for: ${failures.join(", ")}. Please try again.`);
                      } else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }
                      refreshShifts();
                    },
                  },
                ]
              );
            }}
          >
            <Ionicons name="calendar-outline" size={16} color="#6366f1" />
            <Text style={twStyle("ml-1.5 text-xs font-medium text-indigo-600")}>Standard Hours</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5")}
            onPress={() => {
              Alert.alert(
                "Set Extended Hours",
                "Set Mon–Sat 08:00–20:00 for this staff member?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Apply",
                    onPress: async () => {
                      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                      const failures: string[] = [];
                      for (const day of days) {
                        const { error: err } = await saveShift(`/api/provider/staff/${selectedStaffId}/shifts`, {
                          day_of_week: day,
                          start_time: "08:00",
                          end_time: "20:00",
                        });
                        if (err) failures.push(day);
                      }
                      if (failures.length > 0) {
                        Alert.alert("Partial failure", `Could not set hours for: ${failures.join(", ")}. Please try again.`);
                      } else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }
                      refreshShifts();
                    },
                  },
                ]
              );
            }}
          >
            <Ionicons name="time-outline" size={16} color="#8b5cf6" />
            <Text style={twStyle("ml-1.5 text-xs font-medium text-violet-600")}>Extended Hours</Text>
          </TouchableOpacity>
          {(staff?.length ?? 0) > 1 && (
            <TouchableOpacity
              style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5")}
              onPress={() => {
                const otherStaff = (staff ?? []).filter((s) => s.id !== selectedStaffId);
                if (otherStaff.length === 0) return;
                Alert.alert(
                  "Copy Schedule",
                  `Copy ${selectedStaff?.name}'s schedule to another staff member? Select from the staff list after copying.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Copy",
                      onPress: async () => {
                        const currentShifts = shifts ?? [];
                        if (currentShifts.length === 0) {
                          Alert.alert("No shifts", "This staff member has no shifts to copy.");
                          return;
                        }
                        const targetId = otherStaff[0].id;
                        let failed = 0;
                        for (const shift of currentShifts) {
                          const { error: err } = await saveShift(`/api/provider/staff/${targetId}/shifts`, {
                            day_of_week: shift.day_of_week,
                            start_time: shift.start_time,
                            end_time: shift.end_time,
                          });
                          if (err) failed++;
                        }
                        if (failed > 0) {
                          Alert.alert("Partial failure", `${failed} shift(s) could not be copied. Please try again.`);
                        } else {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          Alert.alert("Done", `Schedule copied to ${otherStaff[0].name}`);
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="copy-outline" size={16} color="#0ea5e9" />
              <Text style={twStyle("ml-1.5 text-xs font-medium text-sky-600")}>Copy</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Weekly Schedule ── */}
      {!selectedStaffId ? (
        <EmptyState
          icon="people-outline"
          title="No staff selected"
          description="Select a staff member above to view their schedule"
        />
      ) : loadingShifts ? (
        <SkeletonList rows={7} />
      ) : shiftsError && !shifts ? (
        <View style={twStyle("px-4 py-8")}>
          <Text style={twStyle("text-center text-sm text-red-600 mb-3")}>Could not load shifts. Pull down to retry.</Text>
          <TouchableOpacity onPress={handleRefresh} style={twStyle("self-center rounded-lg bg-gray-100 px-5 py-2.5")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={DAYS}
          keyExtractor={(day: string) => day}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: day }: { item: string }) => {
            const dayShifts = shiftsByDay.get(day) ?? [];
            const hasShifts = dayShifts.length > 0;

            return (
              <View
                style={twStyle("rounded-xl border border-gray-100 bg-white")}
                accessibilityLabel={`${day} schedule`}
              >
                {/* Day header */}
                <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3")}>
                  <View style={twStyle("flex-row items-center")}>
                    <View
                      style={twStyle(`h-8 w-8 items-center justify-center rounded-lg ${hasShifts ? "bg-indigo-50" : "bg-gray-50"}`)}
                    >
                      <Text
                        style={twStyle(`text-xs font-bold ${hasShifts ? "text-indigo-600" : "text-gray-400"}`)}
                      >
                        {day.slice(0, 2)}
                      </Text>
                    </View>
                    <Text
                      style={twStyle(`ml-3 text-base font-semibold ${hasShifts ? "text-gray-900" : "text-gray-400"}`)}
                    >
                      {day}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={twStyle("flex-row items-center rounded-lg bg-gray-50 px-3 py-1.5")}
                    onPress={() => openAddShift(day)}
                    accessibilityLabel={`Add shift on ${day}`}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={14}
                      color="#6366f1"
                    />
                    <Text style={twStyle("ml-1 text-xs font-medium text-indigo-600")}>
                      Add
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Shifts */}
                {hasShifts ? (
                  dayShifts.map((shift, idx) => (
                    <View
                      key={shift.id}
                      style={twStyle(`flex-row items-center px-4 py-3 ${idx < dayShifts.length - 1 ? "border-b border-gray-50" : ""}`)}
                    >
                      <View style={twStyle("mr-3 h-8 w-1 rounded-full bg-indigo-400")} />
                      <View style={twStyle("flex-1")}>
                        <View style={twStyle("flex-row items-center")}>
                          <Ionicons
                            name="time-outline"
                            size={14}
                            color="#6b7280"
                          />
                          <Text style={twStyle("ml-1.5 text-sm font-medium text-gray-900")}>
                            {formatTimeLabel(shift.start_time)} –{" "}
                            {formatTimeLabel(shift.end_time)}
                          </Text>
                        </View>
                        {shift.notes && (
                          <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                            {shift.notes}
                          </Text>
                        )}
                        <Text style={twStyle("mt-0.5 text-[10px] text-gray-400")}>
                          {(
                            (timeToMinutes(shift.end_time) -
                              timeToMinutes(shift.start_time)) /
                            60
                          ).toFixed(1)}
                          h shift
                        </Text>
                      </View>
                      <View style={twStyle("flex-row items-center")}>
                        <TouchableOpacity
                          style={[twStyle("h-8 w-8 items-center justify-center rounded-lg bg-gray-50"), { marginRight: 4 }]}
                          onPress={() => openEditShift(shift)}
                          accessibilityLabel="Edit shift"
                          accessibilityRole="button"
                        >
                          <Ionicons
                            name="create-outline"
                            size={14}
                            color="#6b7280"
                          />
                        </TouchableOpacity>
                        {shift.id ? (
                          <TouchableOpacity
                            style={twStyle("h-8 w-8 items-center justify-center rounded-lg bg-red-50")}
                            onPress={() => handleDeleteShift(shift)}
                            accessibilityLabel="Delete shift"
                            accessibilityRole="button"
                          >
                            <Ionicons
                              name="trash-outline"
                              size={14}
                              color="#ef4444"
                            />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={twStyle("px-4 py-3")}>
                    <Text style={twStyle("text-sm italic text-gray-400")}>
                      No shifts – Day off
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  Add / Edit Shift Bottom Sheet                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <BottomSheet
        visible={shiftFormOpen}
        onClose={() => setShiftFormOpen(false)}
        title={editingShift ? "Edit Shift" : "Add Shift"}
      >
        {/* Staff selector (only when adding) */}
        {!editingShift && (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
              Staff Member *
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={twStyle("mb-4")}
              contentContainerStyle={{}}
            >
              {(staff ?? [])
                .filter((s) => s.is_active)
                .map((member) => {
                  const isSelected = form.staff_id === member.id;
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[twStyle(`flex-row items-center rounded-xl px-3 py-2 ${isSelected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginRight: 8 }]}
                      onPress={() =>
                        setForm((prev) => ({ ...prev, staff_id: member.id }))
                      }
                      accessibilityLabel={`Select ${member.name}`}
                      accessibilityRole="button"
                    >
                      <Avatar
                        name={member.name}
                        imageUrl={member.avatar_url}
                        size="sm"
                      />
                      <Text
                        style={twStyle(`ml-2 text-sm font-medium ${isSelected ? "text-white" : "text-gray-700"}`)}
                      >
                        {member.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </>
        )}

        {/* Day of Week */}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
          Day of Week *
        </Text>
        <View style={twStyle("mb-4 flex-row flex-wrap")}>
          {DAYS.map((day) => {
            const isSelected = form.day_of_week === day;
            return (
              <TouchableOpacity
                key={day}
                style={[twStyle(`rounded-full px-3.5 py-2 ${isSelected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginRight: 8, marginBottom: 8 }]}
                onPress={() =>
                  setForm((prev) => ({ ...prev, day_of_week: day }))
                }
                accessibilityLabel={`Select ${day}`}
                accessibilityRole="button"
              >
                <Text
                  style={twStyle(`text-sm font-medium ${isSelected ? "text-white" : "text-gray-600"}`)}
                >
                  {day.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Time selection */}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
          Shift Times *
        </Text>
        <View style={twStyle("mb-4 flex-row items-center")}>
          <TouchableOpacity
            style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3"), { marginRight: 12 }]}
            onPress={() => setPickerField("start_time")}
            accessibilityLabel={`Start time: ${formatTimeLabel(form.start_time)}`}
            accessibilityRole="button"
          >
            <Ionicons name="time-outline" size={16} color="#6366f1" />
            <Text style={twStyle("ml-2 text-base font-medium text-gray-900")}>
              {formatTimeLabel(form.start_time)}
            </Text>
          </TouchableOpacity>

          <Text style={twStyle("text-sm text-gray-400")}>to</Text>

          <TouchableOpacity
            style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3")}
            onPress={() => setPickerField("end_time")}
            accessibilityLabel={`End time: ${formatTimeLabel(form.end_time)}`}
            accessibilityRole="button"
          >
            <Ionicons name="time-outline" size={16} color="#6366f1" />
            <Text style={twStyle("ml-2 text-base font-medium text-gray-900")}>
              {formatTimeLabel(form.end_time)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Duration preview */}
        {timeToMinutes(form.end_time) > timeToMinutes(form.start_time) && (
          <View style={twStyle("mb-4 flex-row items-center rounded-xl bg-indigo-50 px-4 py-2.5")}>
            <Ionicons name="hourglass-outline" size={16} color="#6366f1" />
            <Text style={twStyle("ml-2 text-sm font-medium text-indigo-700")}>
              {(
                (timeToMinutes(form.end_time) -
                  timeToMinutes(form.start_time)) /
                60
              ).toFixed(1)}{" "}
              hours shift
            </Text>
          </View>
        )}

        {/* Notes */}
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          Notes (optional)
        </Text>
        <View style={twStyle("mb-4")}>
          <TextInput
            style={[
              twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"),
              { minHeight: 72, textAlignVertical: "top" },
            ]}
            placeholder="e.g. Split shift, on call..."
            placeholderTextColor="#9ca3af"
            value={form.notes}
            onChangeText={(text) => setForm((prev) => ({ ...prev, notes: text }))}
            multiline
            maxLength={200}
            accessibilityLabel="Shift notes"
          />
        </View>

        {/* Save button */}
        <ActionButton
          label={
            isSaving
              ? "Saving…"
              : editingShift
                ? "Update Shift"
                : "Add Shift"
          }
          onPress={handleSaveShift}
          loading={isSaving}
          fullWidth
        />
      </BottomSheet>

      {/* Time Picker */}
      <TimePicker
        visible={pickerField !== null}
        value={
          pickerField === "start_time"
            ? form.start_time
            : pickerField === "end_time"
              ? form.end_time
              : "09:00"
        }
        title={pickerField === "start_time" ? "Start Time" : "End Time"}
        onSelect={(time) => {
          if (pickerField) {
            setForm((prev) => ({ ...prev, [pickerField]: time }));
          }
        }}
        onClose={() => setPickerField(null)}
      />
    </ScreenContainer>
  );
}

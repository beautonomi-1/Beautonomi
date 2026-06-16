import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  TextInput,
  RefreshControl,
  ActionSheetIOS,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useBusinessToday } from "@/hooks/useBusinessToday";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { startOfBusinessDayLocalDate } from "@beautonomi/utils";
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
  start_time: string | null;
  end_time: string | null;
  date?: string;
  notes?: string | null;
  /** From GET /api/provider/staff/[id]/shifts — false means day off placeholder */
  is_working?: boolean;
}

interface ScheduledShift {
  id: string;
  team_member_id: string;
  team_member_name?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string | null;
  is_recurring?: boolean;
  source?: "shift" | "schedule" | "location";
  is_synthetic?: boolean;
}

interface ShiftFormData {
  staff_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  notes: string;
}

interface DateShiftFormData {
  staff_id: string;
  date: string;
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

/**
 * Duration in minutes, treating end < start as an overnight shift that
 * crosses midnight (adds 24h). end == start is treated as zero (caller
 * decides whether that's invalid).
 */
function shiftDurationMinutes(
  start: string | null | undefined,
  end: string | null | undefined,
): number {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (e === s) return 0;
  if (e > s) return e - s;
  return 24 * 60 - s + e;
}

function isOvernight(
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  return timeToMinutes(end) < timeToMinutes(start);
}

const EMPTY_SHIFT_FORM: ShiftFormData = {
  staff_id: "",
  day_of_week: "Monday",
  start_time: "09:00",
  end_time: "17:00",
  notes: "",
};

function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get the {y, m, d} parts of a Date in the given IANA timezone. Falls back to
 * the device's local time when no timezone is provided. Used to anchor week
 * navigation to the provider's calendar rather than the device clock.
 */
function ymdInTz(d: Date, tz?: string | null): { y: number; m: number; d: number } {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(d);
      const y = Number(parts.find((p) => p.type === "year")?.value);
      const m = Number(parts.find((p) => p.type === "month")?.value);
      const day = Number(parts.find((p) => p.type === "day")?.value);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(day)) {
        return { y, m, d: day };
      }
    } catch {
      // fall through to local
    }
  }
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

/**
 * Monday-anchored start of week. We use Monday-first to match the
 * /api/provider/shifts handler (it expands `week_start` to Mon→Sun in the
 * provider timezone) and to align with the rest of the provider portal.
 */
function startOfWeekMondayInTz(d: Date, tz?: string | null): Date {
  const { y, m, d: day } = ymdInTz(d, tz);
  const local = new Date(y, m - 1, day, 0, 0, 0, 0);
  // JS getDay(): 0=Sun…6=Sat → convert to Mon=0..Sun=6.
  const dow = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - dow);
  return local;
}

function emptyDateShiftForm(tz?: string | null): DateShiftFormData {
  return {
    staff_id: "",
    date: formatDateLocal(startOfBusinessDayLocalDate(tz)),
    start_time: "09:00",
    end_time: "17:00",
    notes: "",
  };
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function StaffScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ staffId?: string }>();
  useResponsive();
  const { provider } = useProvider();
  const providerTz = provider?.timezone ?? null;
  const { businessToday } = useBusinessToday(providerTz);
  const prevBusinessTodayRef = useRef(businessToday);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [shiftFormOpen, setShiftFormOpen] = useState(false);
  const [dateShiftFormOpen, setDateShiftFormOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  /** When set, the date-shift sheet edits an existing date-specific shift via PATCH. */
  const [editingDateShift, setEditingDateShift] = useState<ScheduledShift | null>(null);
  const [form, setForm] = useState<ShiftFormData>(EMPTY_SHIFT_FORM);
  const [dateForm, setDateForm] = useState<DateShiftFormData>(() => emptyDateShiftForm(providerTz));
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeekMondayInTz(businessToday, providerTz),
  );
  const [pickerField, setPickerField] = useState<
    "start_time" | "end_time" | "date" | "date_start_time" | "date_end_time" | null
  >(null);

  /* Re-anchor the visible week when the provider business day rolls over
     (focus / foreground / timezone) — but only if the user was still on
     the week that contained the previous business today. */
  useEffect(() => {
    const prev = prevBusinessTodayRef.current;
    const prevWeekMonday = startOfWeekMondayInTz(prev, providerTz);
    setWeekStart((current) => {
      const wasOnCurrentWeek = formatDateLocal(current) === formatDateLocal(prevWeekMonday);
      if (!wasOnCurrentWeek) return current;
      const expected = startOfWeekMondayInTz(businessToday, providerTz);
      return formatDateLocal(current) === formatDateLocal(expected) ? current : expected;
    });
    prevBusinessTodayRef.current = businessToday;
  }, [businessToday, providerTz]);

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
  const dateShiftUrl = selectedStaffId
    ? `/api/provider/shifts?week_start=${formatDateLocal(weekStart)}&staff_id=${selectedStaffId}`
    : "";
  const {
    data: scheduledShifts,
    loading: loadingScheduledShifts,
    refresh: refreshScheduledShifts,
  } = useApi<ScheduledShift[]>(dateShiftUrl, { enabled: !!selectedStaffId });

  const { execute: saveShift, loading: creating } = useApiMutation("post");
  const { execute: deleteShift, loading: deleting } = useApiMutation("delete");
  const { execute: saveDateShift, loading: savingDateShift } = useApiMutation("post");
  const { execute: patchDateShift, loading: patchingDateShift } = useApiMutation("patch");
  const { execute: deleteDateShift } = useApiMutation("delete");

  const isSaving = creating || deleting || savingDateShift || patchingDateShift;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshStaff(),
        ...(selectedStaffId ? [refreshShifts(), refreshScheduledShifts()] : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshStaff, refreshShifts, refreshScheduledShifts, selectedStaffId]);

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
      (s) =>
        (!selectedStaffId || s.staff_id === selectedStaffId) &&
        Boolean(s.start_time && s.end_time) &&
        s.is_working !== false,
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

  const copyWeeklyScheduleToTarget = useCallback(
    async (targetStaffId: string, targetName: string) => {
      const currentShifts = shifts ?? [];
      const working = currentShifts.filter(
        (s) => s.start_time && s.end_time && s.is_working !== false,
      );
      if (working.length === 0) {
        Alert.alert("No shifts", "This staff member has no weekly shifts to copy.");
        return;
      }
      let failed = 0;
      for (const shift of working) {
        const { error: err } = await saveShift(`/api/provider/staff/${targetStaffId}/shifts`, {
          day_of_week: shift.day_of_week,
          start_time: shift.start_time as string,
          end_time: shift.end_time as string,
        });
        if (err) failed++;
      }
      if (failed > 0) {
        Alert.alert("Partial failure", `${failed} shift(s) could not be copied. Please try again.`);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectedStaffId(targetStaffId);
        Alert.alert("Done", `Weekly schedule copied to ${targetName}.`);
      }
    },
    [shifts, saveShift],
  );

  const promptCopyScheduleTarget = useCallback(() => {
    const otherStaff = (staff ?? []).filter((s) => s.is_active && s.id !== selectedStaffId);
    if (otherStaff.length === 0) return;
    const run = (target: StaffMember) => {
      Alert.alert(
        "Copy schedule",
        `Copy ${selectedStaff?.name ?? "this staff member"}'s weekly schedule to ${target.name}? Existing weekly rows for the same days will be updated.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Copy",
            onPress: () => void copyWeeklyScheduleToTarget(target.id, target.name),
          },
        ],
      );
    };
    if (otherStaff.length === 1) {
      run(otherStaff[0]!);
      return;
    }
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", ...otherStaff.map((s) => s.name)],
          cancelButtonIndex: 0,
          title: "Copy weekly schedule to",
        },
        (buttonIndex) => {
          if (buttonIndex <= 0) return;
          const target = otherStaff[buttonIndex - 1];
          if (target) run(target);
        },
      );
    } else {
      Alert.alert("Copy weekly schedule to", "Choose a team member", [
        { text: "Cancel", style: "cancel" },
        ...otherStaff.map((s) => ({
          text: s.name,
          onPress: () => run(s),
        })),
      ]);
    }
  }, [staff, selectedStaffId, selectedStaff, copyWeeklyScheduleToTarget]);

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

  function openAddDateShift(date?: string) {
    setEditingDateShift(null);
    setDateForm({
      ...emptyDateShiftForm(providerTz),
      staff_id: selectedStaffId ?? "",
      date: date ?? formatDateLocal(startOfBusinessDayLocalDate(providerTz)),
    });
    setDateShiftFormOpen(true);
  }

  function openEditDateShift(shift: ScheduledShift) {
    if (!shift.id || shift.is_synthetic || shift.source !== "shift") {
      Alert.alert(
        "Weekly template",
        "This row comes from weekly hours or location hours. Add a date-specific shift to override it.",
      );
      return;
    }
    setEditingDateShift(shift);
    setDateForm({
      staff_id: shift.team_member_id,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      notes: shift.notes ?? "",
    });
    setDateShiftFormOpen(true);
  }

  function openEditShift(shift: Shift) {
    setEditingShift(shift);
    setForm({
      staff_id: shift.staff_id,
      day_of_week: shift.day_of_week,
      start_time: shift.start_time ?? "09:00",
      end_time: shift.end_time ?? "17:00",
      notes: shift.notes ?? "",
    });
    setShiftFormOpen(true);
  }

  function validateShift(): string | null {
    if (!form.staff_id) return "Please select a staff member";
    const startMin = timeToMinutes(form.start_time);
    const endMin = timeToMinutes(form.end_time);
    // Weekly schedule rows are stored per day_of_week with a `start_time <
    // end_time` DB constraint, so an overnight slot has to be split into two
    // separate days. Steer the user to date-specific shifts instead of
    // silently failing at the database layer.
    if (endMin < startMin) {
      return "Overnight weekly shifts aren't supported. Add a date-specific shift for that night instead.";
    }
    if (endMin === startMin) return "End time must be after start time";
    return null;
  }

  function validateDateShift(): string | null {
    if (!dateForm.staff_id) return "Please select a staff member";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateForm.date)) return "Enter a valid date";
    const startMin = timeToMinutes(dateForm.start_time);
    const endMin = timeToMinutes(dateForm.end_time);
    // For date-specific shifts an end-time earlier than start-time is treated
    // as an overnight shift that wraps past midnight (the staff_shifts table
    // has no `start < end` constraint). Only zero-length is rejected.
    if (endMin === startMin) return "End time must be after start time";
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

  async function handleSaveDateShift() {
    const validationError = validateDateShift();
    if (validationError) {
      Alert.alert("Validation Error", validationError);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (editingDateShift?.id) {
      const { error } = await patchDateShift(
        `/api/provider/shifts/${editingDateShift.id}`,
        {
          date: dateForm.date,
          start_time: dateForm.start_time,
          end_time: dateForm.end_time,
          notes: dateForm.notes.trim() || null,
        },
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await saveDateShift("/api/provider/shifts", {
        staff_id: dateForm.staff_id,
        date: dateForm.date,
        start_time: dateForm.start_time,
        end_time: dateForm.end_time,
        notes: dateForm.notes.trim() || undefined,
        is_recurring: false,
        recurring_pattern: null,
      });
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDateShiftFormOpen(false);
    setEditingDateShift(null);
    refreshScheduledShifts();
  }

  function handleDeleteDateShift(shift: ScheduledShift) {
    if (!shift.id || shift.is_synthetic || shift.source !== "shift") {
      Alert.alert(
        "Weekly template",
        "This row comes from weekly hours or location hours. Edit the weekly schedule below, or add a date-specific shift to override it.",
      );
      return;
    }
    Alert.alert("Delete date-specific shift", `Delete this shift on ${shift.date}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteDateShift(`/api/provider/shifts/${shift.id}`, {});
          if (error) Alert.alert("Error", error);
          else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            refreshScheduledShifts();
          }
        },
      },
    ]);
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

  /* ── Total weekly hours (treats end < start as overnight wrap) ── */
  const totalWeeklyHours = useMemo(() => {
    let totalMinutes = 0;
    shiftsByDay.forEach((dayShifts) => {
      for (const shift of dayShifts) {
        totalMinutes += shiftDurationMinutes(shift.start_time, shift.end_time);
      }
    });
    return (totalMinutes / 60).toFixed(1);
  }, [shiftsByDay]);

  const dateSpecificShifts = useMemo(
    () => (scheduledShifts ?? []).filter((shift) => shift.source === "shift" && !shift.is_synthetic),
    [scheduledShifts],
  );

  /**
   * Inherited hours per weekday name for the visible week. We surface
   * location-fallback rows from `/api/provider/shifts` so days without an
   * explicit `staff_schedules` entry still show the effective hours that
   * customers will see when booking. Rows are read-only here — providers
   * create a real schedule row to override them.
   */
  const inheritedByDay = useMemo(() => {
    const map = new Map<string, { start_time: string; end_time: string; source: "schedule" | "location" }>();
    for (const shift of scheduledShifts ?? []) {
      if (shift.source !== "location" && shift.source !== "schedule") continue;
      // Build a stable day name from the YYYY-MM-DD anchor without timezone drift.
      const [yStr, mStr, dStr] = shift.date.split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      const d = Number(dStr);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) continue;
      const localDate = new Date(y, m - 1, d, 12, 0, 0, 0);
      const dayName = DAYS[(localDate.getDay() + 6) % 7];
      if (!dayName) continue;
      // Prefer `schedule` over `location` if both exist for the same day.
      const existing = map.get(dayName);
      if (existing && existing.source === "schedule") continue;
      map.set(dayName, {
        start_time: shift.start_time,
        end_time: shift.end_time,
        source: shift.source,
      });
    }
    return map;
  }, [scheduledShifts]);

  const hasInheritedHours = inheritedByDay.size > 0;

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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={{ backgroundColor: "#EEF2FF", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, color: "#3730A3", lineHeight: 18 }}>
          Weekly schedules define normal availability. Date-specific shifts below support split shifts and one-off overrides for busy days, events, or alternate rosters.
        </Text>
      </View>

      {/* ── Add team member CTA: opens team list add sheet, then return here to set shifts ── */}
      <TouchableOpacity
        style={twStyle("mb-3 flex-row items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 py-2.5")}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: "/(app)/(tabs)/more/team-list",
            params: { add: "1" },
          } as never);
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
            {(staff ?? []).filter((s) => s.is_active).length === 0 ? (
              <View style={twStyle("rounded-xl border border-amber-100 bg-amber-50 px-4 py-3")}>
                <Text style={twStyle("text-sm text-amber-900")}>
                  No active team members. Add someone from Team, then set their weekly hours here.
                </Text>
              </View>
            ) : null}
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
        <View style={twStyle("mb-4")}>
          <View style={twStyle("flex-row")}>
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
          </View>
          {(staff ?? []).filter((s) => s.is_active && s.id !== selectedStaffId).length > 0 ? (
            <TouchableOpacity
              style={twStyle("mt-2 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5")}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                promptCopyScheduleTarget();
              }}
            >
              <Ionicons name="copy-outline" size={16} color="#0ea5e9" />
              <Text style={twStyle("ml-1.5 text-xs font-medium text-sky-600")}>Copy weekly schedule to…</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {selectedStaffId && (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("mb-3 flex-row items-center justify-between")}>
            <View style={twStyle("flex-row items-center")}>
              <View style={twStyle("h-9 w-9 items-center justify-center rounded-xl bg-pink-50")}>
                <Ionicons name="calendar-number-outline" size={18} color="#db2777" />
              </View>
              <View style={twStyle("ml-3")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>Date-specific shifts</Text>
                <Text style={twStyle("text-xs text-gray-500")}>Split shifts and one-off overrides this week</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => openAddDateShift()}
              style={twStyle("rounded-xl bg-pink-50 px-3 py-2")}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-xs font-semibold text-pink-700")}>Add</Text>
            </TouchableOpacity>
          </View>

          <View style={twStyle("mb-3 flex-row items-center justify-between")}>
            <TouchableOpacity
              onPress={() => {
                const next = new Date(weekStart);
                next.setDate(next.getDate() - 7);
                setWeekStart(next);
              }}
              style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-gray-50")}
              accessibilityLabel="Previous week"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color="#6b7280" />
            </TouchableOpacity>
            <Text style={twStyle("text-xs font-medium text-gray-600")}>
              {(() => {
                const end = new Date(weekStart);
                end.setDate(end.getDate() + 6);
                const sameMonth = end.getMonth() === weekStart.getMonth();
                const startStr = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                const endStr = end.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
                return `Mon ${startStr} – Sun ${endStr}`;
              })()}
            </Text>
            <TouchableOpacity
              onPress={() => {
                const next = new Date(weekStart);
                next.setDate(next.getDate() + 7);
                setWeekStart(next);
              }}
              style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-gray-50")}
              accessibilityLabel="Next week"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loadingScheduledShifts ? (
            <Text style={twStyle("text-sm text-gray-500")}>Loading date-specific shifts…</Text>
          ) : dateSpecificShifts.length === 0 ? (
            <View style={twStyle("rounded-xl bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm text-gray-500")}>
                No date-specific shifts this week. Weekly hours below still apply.
              </Text>
            </View>
          ) : (
            dateSpecificShifts.map((shift) => (
              <View key={`${shift.id}-${shift.date}`} style={twStyle("mb-2 flex-row items-center rounded-xl bg-pink-50/60 px-3 py-3")}>
                <View style={twStyle("mr-3 h-9 w-9 items-center justify-center rounded-lg bg-white")}>
                  <Text style={twStyle("text-[10px] font-bold text-pink-700")}>
                    {new Date(`${shift.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                  </Text>
                </View>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {new Date(`${shift.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </Text>
                  <Text style={twStyle("text-xs text-gray-600")}>
                    {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)}
                    {isOvernight(shift.start_time, shift.end_time) ? " (next day)" : ""}
                    {shift.notes ? ` · ${shift.notes}` : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => openEditDateShift(shift)}
                  style={[twStyle("h-8 w-8 items-center justify-center rounded-lg bg-white"), { marginRight: 4 }]}
                  accessibilityLabel="Edit date-specific shift"
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={15} color="#6b7280" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteDateShift(shift)}
                  style={twStyle("h-8 w-8 items-center justify-center rounded-lg bg-white")}
                  accessibilityLabel="Delete date-specific shift"
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={15} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))
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
        <View style={{ gap: 8 }}>
          {hasInheritedHours ? (
            <View
              style={twStyle("mb-1 flex-row items-start rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3")}
            >
              <Ionicons name="information-circle" size={16} color="#047857" style={{ marginTop: 1 }} />
              <Text style={twStyle("ml-2 flex-1 text-xs leading-5 text-emerald-900")}>
                Days marked &ldquo;Inherited&rdquo; follow your location operating hours. Customers can still book those days. Add a weekly shift to set custom hours for this staff member.
              </Text>
            </View>
          ) : null}
          {DAYS.map((day) => {
            const dayShifts = shiftsByDay.get(day) ?? [];
            const hasShifts = dayShifts.length > 0;

            return (
              <View
                key={day}
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
                          {(shiftDurationMinutes(shift.start_time, shift.end_time) / 60).toFixed(1)}
                          h shift
                          {isOvernight(shift.start_time, shift.end_time) ? " · ends next day" : ""}
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
                ) : inheritedByDay.has(day) ? (
                  (() => {
                    const inherited = inheritedByDay.get(day)!;
                    const isLocation = inherited.source === "location";
                    return (
                      <View
                        style={twStyle("flex-row items-center px-4 py-3")}
                        accessibilityLabel={`${day} inherited ${isLocation ? "location" : "schedule"} hours ${formatTimeLabel(inherited.start_time)} to ${formatTimeLabel(inherited.end_time)}`}
                      >
                        <View style={twStyle("mr-3 h-8 w-1 rounded-full bg-emerald-300")} />
                        <View style={twStyle("flex-1")}>
                          <View style={twStyle("flex-row items-center")}>
                            <Ionicons
                              name="business-outline"
                              size={14}
                              color="#059669"
                            />
                            <Text style={twStyle("ml-1.5 text-sm font-medium text-gray-900")}>
                              {formatTimeLabel(inherited.start_time)} – {formatTimeLabel(inherited.end_time)}
                            </Text>
                          </View>
                          <Text style={twStyle("mt-0.5 text-[10px] font-medium text-emerald-700")}>
                            {isLocation
                              ? "Inherited from location operating hours"
                              : "Inherited from weekly schedule"}
                          </Text>
                          <Text style={twStyle("mt-0.5 text-[10px] text-gray-400")}>
                            Add a weekly shift to override this for {selectedStaff?.name ?? "this staff member"}.
                          </Text>
                        </View>
                      </View>
                    );
                  })()
                ) : (
                  <View style={twStyle("px-4 py-3")}>
                    <Text style={twStyle("text-sm italic text-gray-400")}>
                      No shifts – Day off
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      </ScrollView>

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

        {pickerField === "start_time" && (
          <DateTimePicker
            value={new Date(`2000-01-01T${form.start_time}:00`)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              if (Platform.OS !== "ios") setPickerField(null);
              if (d) {
                setForm((prev) => ({
                  ...prev,
                  start_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
                }));
              }
            }}
          />
        )}

        {pickerField === "end_time" && (
          <DateTimePicker
            value={new Date(`2000-01-01T${form.end_time}:00`)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              if (Platform.OS !== "ios") setPickerField(null);
              if (d) {
                setForm((prev) => ({
                  ...prev,
                  end_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
                }));
              }
            }}
          />
        )}

        {/* Duration preview / overnight notice */}
        {timeToMinutes(form.end_time) > timeToMinutes(form.start_time) ? (
          <View style={twStyle("mb-4 flex-row items-center rounded-xl bg-indigo-50 px-4 py-2.5")}>
            <Ionicons name="hourglass-outline" size={16} color="#6366f1" />
            <Text style={twStyle("ml-2 text-sm font-medium text-indigo-700")}>
              {(
                (timeToMinutes(form.end_time) - timeToMinutes(form.start_time)) /
                60
              ).toFixed(1)}{" "}
              hours shift
            </Text>
          </View>
        ) : timeToMinutes(form.end_time) < timeToMinutes(form.start_time) ? (
          <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3")}>
            <Text style={twStyle("text-sm font-semibold text-amber-900")}>
              Overnight weekly shifts are not supported
            </Text>
            <Text style={twStyle("mt-1 text-xs text-amber-800")}>
              The weekly schedule stores one slot per day. For shifts that cross midnight, add a date-specific shift below — those support overnight times.
            </Text>
            <TouchableOpacity
              style={twStyle("mt-2 self-start rounded-lg bg-amber-600 px-3 py-1.5")}
              onPress={() => {
                setShiftFormOpen(false);
                openAddDateShift();
              }}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-xs font-semibold text-white")}>
                Add date-specific shift instead
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

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

      <BottomSheet
        visible={dateShiftFormOpen}
        onClose={() => {
          setDateShiftFormOpen(false);
          setEditingDateShift(null);
        }}
        title={editingDateShift ? "Edit date-specific shift" : "Add date-specific shift"}
        subtitle={
          editingDateShift
            ? "Update times, date or notes for this one-off shift."
            : "Use this for split shifts, special event rosters, or one-off overrides."
        }
      >
        {editingDateShift ? null : (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Staff Member *</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={twStyle("mb-4")}
            >
              {(staff ?? [])
                .filter((s) => s.is_active)
                .map((member) => {
                  const isSelected = dateForm.staff_id === member.id;
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        twStyle(
                          `flex-row items-center rounded-xl px-3 py-2 ${
                            isSelected ? "bg-pink-600" : "border border-gray-200 bg-gray-50"
                          }`,
                        ),
                        { marginRight: 8 },
                      ]}
                      onPress={() => setDateForm((prev) => ({ ...prev, staff_id: member.id }))}
                      accessibilityRole="button"
                    >
                      <Avatar name={member.name} imageUrl={member.avatar_url} size="sm" />
                      <Text style={twStyle(`ml-2 text-sm font-medium ${isSelected ? "text-white" : "text-gray-700"}`)}>
                        {member.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Date *</Text>
        <TouchableOpacity
          onPress={() => setPickerField("date")}
          style={twStyle("mb-4 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          accessibilityLabel="Shift date"
        >
          <Ionicons name="calendar-outline" size={20} color="#db2777" />
          <Text style={twStyle("ml-2 text-base text-gray-900")}>
            {dateForm.date}
          </Text>
        </TouchableOpacity>

        {pickerField === "date" && (
          <DateTimePicker
            value={new Date(`${dateForm.date}T12:00:00`)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              if (Platform.OS !== "ios") setPickerField(null);
              if (d) {
                setDateForm((prev) => ({
                  ...prev,
                  date: formatDateLocal(d),
                }));
              }
            }}
          />
        )}

        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Shift Times *</Text>
        <View style={twStyle("mb-4 flex-row items-center")}>
          <TouchableOpacity
            style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3"), { marginRight: 12 }]}
            onPress={() => setPickerField("date_start_time")}
          >
            <Ionicons name="time-outline" size={16} color="#db2777" />
            <Text style={twStyle("ml-2 text-base font-medium text-gray-900")}>
              {formatTimeLabel(dateForm.start_time)}
            </Text>
          </TouchableOpacity>
          <Text style={twStyle("text-sm text-gray-400")}>to</Text>
          <TouchableOpacity
            style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3")}
            onPress={() => setPickerField("date_end_time")}
          >
            <Ionicons name="time-outline" size={16} color="#db2777" />
            <Text style={twStyle("ml-2 text-base font-medium text-gray-900")}>
              {formatTimeLabel(dateForm.end_time)}
            </Text>
          </TouchableOpacity>
        </View>

        {pickerField === "date_start_time" && (
          <DateTimePicker
            value={new Date(`2000-01-01T${dateForm.start_time}:00`)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              if (Platform.OS !== "ios") setPickerField(null);
              if (d) {
                setDateForm((prev) => ({
                  ...prev,
                  start_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
                }));
              }
            }}
          />
        )}

        {pickerField === "date_end_time" && (
          <DateTimePicker
            value={new Date(`2000-01-01T${dateForm.end_time}:00`)}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_: any, d?: Date) => {
              if (Platform.OS !== "ios") setPickerField(null);
              if (d) {
                setDateForm((prev) => ({
                  ...prev,
                  end_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
                }));
              }
            }}
          />
        )}

        {timeToMinutes(dateForm.end_time) !== timeToMinutes(dateForm.start_time) && (
          <View style={twStyle("mb-4 flex-row items-center rounded-xl bg-pink-50 px-4 py-2.5")}>
            <Ionicons name="hourglass-outline" size={16} color="#db2777" />
            <Text style={twStyle("ml-2 text-sm font-medium text-pink-700")}>
              {(shiftDurationMinutes(dateForm.start_time, dateForm.end_time) / 60).toFixed(1)} hours
              {isOvernight(dateForm.start_time, dateForm.end_time) ? " · ends next day" : ""}
            </Text>
          </View>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Notes (optional)</Text>
        <TextInput
          style={[
            twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"),
            { minHeight: 72, textAlignVertical: "top" },
          ]}
          placeholder="e.g. Morning split shift, event coverage..."
          placeholderTextColor="#9ca3af"
          value={dateForm.notes}
          onChangeText={(text) => setDateForm((prev) => ({ ...prev, notes: text }))}
          multiline
          maxLength={200}
        />

        <ActionButton
          label={
            savingDateShift || patchingDateShift
              ? "Saving…"
              : editingDateShift
                ? "Update date-specific shift"
                : "Add date-specific shift"
          }
          onPress={handleSaveDateShift}
          loading={savingDateShift || patchingDateShift}
          fullWidth
        />
      </BottomSheet>

      {/* Time Picker */}
    </ScreenContainer>
  );
}

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
import { useCalendarScopeLock } from "@/hooks/useCalendarScopeLock";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

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

function formatTimeLabel(
  t: string | null | undefined,
  meridium: { am: string; pm: string },
): string {
  const { h, m } = parseTime(t);
  const ampm = h >= 12 ? meridium.pm : meridium.am;
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
  const { t } = useTranslation();
  const ss = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.staffSchedule.${key}`, opts) as string;
  const meridium = { am: ss("am"), pm: ss("pm") };
  const fmtTime = (time: string | null | undefined) => formatTimeLabel(time, meridium);
  const dayLabel = (day: string) => ss(`days.${day}`);
  const dayShort = (day: string) => ss(`daysShort.${day}`);
  const dayAbbr = (day: string) => ss(`daysAbbr.${day}`);
  const router = useRouter();
  const params = useLocalSearchParams<{ staffId?: string }>();
  useResponsive();
  const { provider } = useProvider();
  const providerTz = provider?.timezone ?? null;
  const { businessToday } = useBusinessToday(providerTz);
  const prevBusinessTodayRef = useRef(businessToday);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const { calendarScopeOwn, selfStaffId } = useCalendarScopeLock();
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

  const saveWeeklyShift = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      const first = await saveShift(url, body);
      if (first.errorCode !== "FUTURE_BOOKINGS_CONFLICT") return first;
      return await new Promise<typeof first>((resolve) => {
        Alert.alert(
          ss("upcomingBookingsTitle"),
          ss("upcomingBookingsSaveBody"),
          [
            { text: ss("cancel"), style: "cancel", onPress: () => resolve(first) },
            {
              text: ss("saveAnyway"),
              onPress: () => {
                void saveShift(url, { ...body, force: true }).then(resolve);
              },
            },
          ],
        );
      });
    },
    [saveShift],
  );
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
    if (calendarScopeOwn && selfStaffId) {
      setSelectedStaffId(selfStaffId);
      return;
    }
    if (params.staffId && staff?.some((s) => s.id === params.staffId)) {
      setSelectedStaffId(params.staffId);
      return;
    }
    if (!selectedStaffId && staff && staff.length > 0 && staff[0]) {
      setSelectedStaffId(staff[0].id);
    }
  }, [staff, selectedStaffId, params.staffId, calendarScopeOwn, selfStaffId]);

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
        Alert.alert(ss("noShiftsTitle"), ss("noShiftsCopyBody"));
        return;
      }
      let failed = 0;
      for (const shift of working) {
        const { error: err } = await saveWeeklyShift(`/api/provider/staff/${targetStaffId}/shifts`, {
          day_of_week: shift.day_of_week,
          start_time: shift.start_time as string,
          end_time: shift.end_time as string,
        });
        if (err) failed++;
      }
      if (failed > 0) {
        Alert.alert(ss("partialFailureTitle"), ss("partialFailureCopy", { count: failed }));
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelectedStaffId(targetStaffId);
        Alert.alert(ss("doneTitle"), ss("copiedTo", { name: targetName }));
      }
    },
    [shifts, saveWeeklyShift],
  );

  const promptCopyScheduleTarget = useCallback(() => {
    const otherStaff = (staff ?? []).filter((s) => s.is_active && s.id !== selectedStaffId);
    if (otherStaff.length === 0) return;
    const run = (target: StaffMember) => {
      Alert.alert(
        ss("copyScheduleTitle"),
        ss("copyScheduleBody", {
          source: selectedStaff?.name ?? ss("thisStaffMember"),
          target: target.name,
        }),
        [
          { text: ss("cancel"), style: "cancel" },
          {
            text: ss("copy"),
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
          options: [ss("cancel"), ...otherStaff.map((member) => member.name)],
          cancelButtonIndex: 0,
          title: ss("copyWeeklyToTitle"),
        },
        (buttonIndex) => {
          if (buttonIndex <= 0) return;
          const target = otherStaff[buttonIndex - 1];
          if (target) run(target);
        },
      );
    } else {
      Alert.alert(ss("copyWeeklyToTitle"), ss("chooseTeamMember"), [
        { text: ss("cancel"), style: "cancel" },
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
        ss("weeklyTemplateTitle"),
        ss("weeklyTemplateEditBody"),
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
    if (!form.staff_id) return ss("selectStaffMember");
    const startMin = timeToMinutes(form.start_time);
    const endMin = timeToMinutes(form.end_time);
    // Weekly schedule rows are stored per day_of_week with a `start_time <
    // end_time` DB constraint, so an overnight slot has to be split into two
    // separate days. Steer the user to date-specific shifts instead of
    // silently failing at the database layer.
    if (endMin < startMin) {
      return ss("overnightWeeklyUnsupported");
    }
    if (endMin === startMin) return ss("endAfterStart");
    return null;
  }

  function validateDateShift(): string | null {
    if (!dateForm.staff_id) return ss("selectStaffMember");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateForm.date)) return ss("validDate");
    const startMin = timeToMinutes(dateForm.start_time);
    const endMin = timeToMinutes(dateForm.end_time);
    // For date-specific shifts an end-time earlier than start-time is treated
    // as an overnight shift that wraps past midnight (the staff_shifts table
    // has no `start < end` constraint). Only zero-length is rejected.
    if (endMin === startMin) return ss("endAfterStart");
    return null;
  }

  async function handleSaveShift() {
    const validationError = validateShift();
    if (validationError) {
      Alert.alert(ss("validationError"), validationError);
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
        Alert.alert(ss("errorTitle"), delErr);
        return;
      }
    }

    const { error } = await saveWeeklyShift(
      `/api/provider/staff/${staffId}/shifts`,
      payload,
    );
    if (error) {
      Alert.alert(ss("errorTitle"), error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShiftFormOpen(false);
    refreshShifts();
  }

  async function handleSaveDateShift() {
    const validationError = validateDateShift();
    if (validationError) {
      Alert.alert(ss("validationError"), validationError);
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
        Alert.alert(ss("errorTitle"), error);
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
        Alert.alert(ss("errorTitle"), error);
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
        ss("weeklyTemplateTitle"),
        ss("weeklyTemplateDeleteBody"),
      );
      return;
    }
    Alert.alert(ss("deleteDateShiftTitle"), ss("deleteDateShiftBody", { date: shift.date }), [
      { text: ss("cancel"), style: "cancel" },
      {
        text: ss("delete"),
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteDateShift(`/api/provider/shifts/${shift.id}`, {});
          if (error) Alert.alert(ss("errorTitle"), error);
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
      ss("deleteShiftTitle"),
      ss("deleteShiftBody", {
        day: dayLabel(shift.day_of_week),
        start: fmtTime(shift.start_time),
        end: fmtTime(shift.end_time),
      }),
      [
        { text: ss("cancel"), style: "cancel" },
        {
          text: ss("delete"),
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const path = `/api/provider/staff/${shift.staff_id}/shifts/${shift.id}`;
            const first = await deleteShift(path, {});
            if (first.errorCode === "FUTURE_BOOKINGS_CONFLICT") {
              Alert.alert(
                ss("upcomingBookingsTitle"),
                ss("upcomingBookingsDeleteBody"),
                [
                  { text: ss("cancel"), style: "cancel" },
                  {
                    text: ss("deleteAnyway"),
                    style: "destructive",
                    onPress: async () => {
                      const retry = await deleteShift(`${path}?force=true`, {});
                      if (retry.error) Alert.alert(ss("errorTitle"), retry.error);
                      else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        refreshShifts();
                      }
                    },
                  },
                ],
              );
              return;
            }
            if (first.error) {
              Alert.alert(ss("errorTitle"), first.error);
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
        title={ss("title")}
        showBack
        subtitle={selectedStaff ? selectedStaff.name : ss("selectStaffSubtitle")}
        rightAction={
          <TouchableOpacity
            onPress={() => openAddShift()}
            style={twStyle("flex-row items-center rounded-xl bg-gray-900 px-4 py-2")}
            accessibilityLabel={ss("addShiftA11y")}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={twStyle("ms-1 text-sm font-semibold text-white")}>
              {ss("addShift")}
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
          {ss("intro")}
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
        accessibilityLabel={ss("addTeamMemberA11y")}
        accessibilityRole="button"
      >
        <Ionicons name="person-add-outline" size={18} color="#6366f1" />
        <Text style={twStyle("ms-2 text-sm font-medium text-indigo-700")}>
          {ss("addTeamMember")}
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
                  {ss("noActiveTeam")}
                </Text>
              </View>
            ) : null}
            {(staff ?? [])
              .filter((s) => s.is_active && (!calendarScopeOwn || s.id === selfStaffId))
              .map((member) => {
                const isSelected = selectedStaffId === member.id;
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[twStyle(`flex-row items-center rounded-2xl px-4 py-2.5 ${
                      isSelected
                        ? "border border-indigo-200 bg-indigo-50"
                        : "border border-gray-100 bg-white"
                    }`), { marginEnd: 8 }]}
                    onPress={() => setSelectedStaffId(member.id)}
                    accessibilityLabel={ss("selectStaffA11y", { name: member.name })}
                    accessibilityRole="button"
                  >
                    <Avatar
                      name={member.name}
                      imageUrl={member.avatar_url}
                      size="sm"
                    />
                    <View style={twStyle("ms-2")}>
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
                      <View style={twStyle("ms-2")}>
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
            <View style={twStyle("ms-3")}>
              <Text style={twStyle("text-xs text-gray-500")}>{ss("totalWeeklyHours")}</Text>
              <Text style={twStyle("text-lg font-bold text-gray-900")}>
                {ss("hoursAbbrev", { hours: totalWeeklyHours })}
              </Text>
            </View>
          </View>
          <View style={twStyle("flex-row items-center rounded-full bg-indigo-50 px-3 py-1")}>
            <Text style={twStyle("text-xs font-medium text-indigo-700")}>
              {ss("daysCount", {
                count: Array.from(shiftsByDay.values()).filter((dayShifts) => dayShifts.length > 0).length,
              })}
            </Text>
          </View>
        </View>
      )}

      {/* ── Quick Actions ── */}
      {selectedStaffId && (
        <View style={twStyle("mb-4")}>
          <View style={twStyle("flex-row")}>
          <TouchableOpacity
            style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5"), { marginEnd: 8 }]}
            onPress={() => {
              Alert.alert(
                ss("setStandardHoursTitle"),
                ss("setStandardHoursBody"),
                [
                  { text: ss("cancel"), style: "cancel" },
                  {
                    text: ss("apply"),
                    onPress: async () => {
                      const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                      const failures: string[] = [];
                      for (const day of weekdays) {
                        const { error: err } = await saveWeeklyShift(`/api/provider/staff/${selectedStaffId}/shifts`, {
                          day_of_week: day,
                          start_time: "09:00",
                          end_time: "17:00",
                        });
                        if (err) failures.push(day);
                      }
                      if (failures.length > 0) {
                        Alert.alert(ss("partialFailureTitle"), ss("partialFailureHours", { days: failures.map(dayLabel).join(", ") }));
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
            <Text style={twStyle("ms-1.5 text-xs font-medium text-indigo-600")}>{ss("standardHours")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5")}
            onPress={() => {
              Alert.alert(
                ss("setExtendedHoursTitle"),
                ss("setExtendedHoursBody"),
                [
                  { text: ss("cancel"), style: "cancel" },
                  {
                    text: ss("apply"),
                    onPress: async () => {
                      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                      const failures: string[] = [];
                      for (const day of days) {
                        const { error: err } = await saveWeeklyShift(`/api/provider/staff/${selectedStaffId}/shifts`, {
                          day_of_week: day,
                          start_time: "08:00",
                          end_time: "20:00",
                        });
                        if (err) failures.push(day);
                      }
                      if (failures.length > 0) {
                        Alert.alert(ss("partialFailureTitle"), ss("partialFailureHours", { days: failures.map(dayLabel).join(", ") }));
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
            <Text style={twStyle("ms-1.5 text-xs font-medium text-violet-600")}>{ss("extendedHours")}</Text>
          </TouchableOpacity>
          </View>
          {!calendarScopeOwn && (staff ?? []).filter((s) => s.is_active && s.id !== selectedStaffId).length > 0 ? (
            <TouchableOpacity
              style={twStyle("mt-2 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5")}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                promptCopyScheduleTarget();
              }}
            >
              <Ionicons name="copy-outline" size={16} color="#0ea5e9" />
              <Text style={twStyle("ms-1.5 text-xs font-medium text-sky-600")}>{ss("copyWeeklySchedule")}</Text>
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
              <View style={twStyle("ms-3")}>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>{ss("dateSpecificShifts")}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>{ss("dateSpecificShiftsSubtitle")}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => openAddDateShift()}
              style={twStyle("rounded-xl bg-pink-50 px-3 py-2")}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-xs font-semibold text-pink-700")}>{ss("add")}</Text>
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
              accessibilityLabel={ss("prevWeekA11y")}
              accessibilityRole="button"
            >
              <DirectionalIcon name="chevron-back" size={18} color="#6b7280" />
            </TouchableOpacity>
            <Text style={twStyle("text-xs font-medium text-gray-600")}>
              {(() => {
                const end = new Date(weekStart);
                end.setDate(end.getDate() + 6);
                const sameMonth = end.getMonth() === weekStart.getMonth();
                const startStr = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                const endStr = end.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
                return ss("weekRange", { start: startStr, end: endStr });
              })()}
            </Text>
            <TouchableOpacity
              onPress={() => {
                const next = new Date(weekStart);
                next.setDate(next.getDate() + 7);
                setWeekStart(next);
              }}
              style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-gray-50")}
              accessibilityLabel={ss("nextWeekA11y")}
              accessibilityRole="button"
            >
              <DirectionalIcon name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loadingScheduledShifts ? (
            <Text style={twStyle("text-sm text-gray-500")}>{ss("loadingDateShifts")}</Text>
          ) : dateSpecificShifts.length === 0 ? (
            <View style={twStyle("rounded-xl bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-sm text-gray-500")}>
                {ss("noDateShifts")}
              </Text>
            </View>
          ) : (
            dateSpecificShifts.map((shift) => (
              <View key={`${shift.id}-${shift.date}`} style={twStyle("mb-2 flex-row items-center rounded-xl bg-pink-50/60 px-3 py-3")}>
                <View style={twStyle("me-3 h-9 w-9 items-center justify-center rounded-lg bg-white")}>
                  <Text style={twStyle("text-[10px] font-bold text-pink-700")}>
                    {new Date(`${shift.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                  </Text>
                </View>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {new Date(`${shift.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </Text>
                  <Text style={twStyle("text-xs text-gray-600")}>
                    {fmtTime(shift.start_time)} - {fmtTime(shift.end_time)}
{isOvernight(shift.start_time, shift.end_time) ? ss("nextDaySuffix") : ""}
                    {shift.notes ? ` · ${shift.notes}` : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => openEditDateShift(shift)}
                  style={[twStyle("h-8 w-8 items-center justify-center rounded-lg bg-white"), { marginEnd: 4 }]}
                  accessibilityLabel={ss("editDateShiftA11y")}
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={15} color="#6b7280" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteDateShift(shift)}
                  style={twStyle("h-8 w-8 items-center justify-center rounded-lg bg-white")}
                  accessibilityLabel={ss("deleteDateShiftA11y")}
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
          title={ss("noStaffSelected")}
          description={ss("noStaffSelectedDesc")}
        />
      ) : loadingShifts ? (
        <SkeletonList rows={7} />
      ) : shiftsError && !shifts ? (
        <View style={twStyle("px-4 py-8")}>
          <Text style={twStyle("text-center text-sm text-red-600 mb-3")}>{ss("couldNotLoadShifts")}</Text>
          <TouchableOpacity onPress={handleRefresh} style={twStyle("self-center rounded-lg bg-gray-100 px-5 py-2.5")}>
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{ss("retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {hasInheritedHours ? (
            <View
              style={twStyle("mb-1 flex-row items-start rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3")}
            >
              <Ionicons name="information-circle" size={16} color="#047857" style={{ marginTop: 1 }} />
              <Text style={twStyle("ms-2 flex-1 text-xs leading-5 text-emerald-900")}>
                {ss("inheritedBanner")}
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
                accessibilityLabel={ss("dayScheduleA11y", { day: dayLabel(day) })}
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
{dayAbbr(day)}
                      </Text>
                    </View>
                    <Text
                      style={twStyle(`ms-3 text-base font-semibold ${hasShifts ? "text-gray-900" : "text-gray-400"}`)}
                    >
                      {dayLabel(day)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={twStyle("flex-row items-center rounded-lg bg-gray-50 px-3 py-1.5")}
                    onPress={() => openAddShift(day)}
                    accessibilityLabel={ss("addShiftOnA11y", { day: dayLabel(day) })}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={14}
                      color="#6366f1"
                    />
                    <Text style={twStyle("ms-1 text-xs font-medium text-indigo-600")}>
                      {ss("add")}
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
                      <View style={twStyle("me-3 h-8 w-1 rounded-full bg-indigo-400")} />
                      <View style={twStyle("flex-1")}>
                        <View style={twStyle("flex-row items-center")}>
                          <Ionicons
                            name="time-outline"
                            size={14}
                            color="#6b7280"
                          />
                          <Text style={twStyle("ms-1.5 text-sm font-medium text-gray-900")}>
                            {fmtTime(shift.start_time)} –{" "}
                            {fmtTime(shift.end_time)}
                          </Text>
                        </View>
                        {shift.notes && (
                          <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                            {shift.notes}
                          </Text>
                        )}
                        <Text style={twStyle("mt-0.5 text-[10px] text-gray-400")}>
                          {ss("hoursShift", {
                            hours: (shiftDurationMinutes(shift.start_time, shift.end_time) / 60).toFixed(1),
                          })}
                          {isOvernight(shift.start_time, shift.end_time) ? ss("endsNextDay") : ""}
                        </Text>
                      </View>
                      <View style={twStyle("flex-row items-center")}>
                        <TouchableOpacity
                          style={[twStyle("h-8 w-8 items-center justify-center rounded-lg bg-gray-50"), { marginEnd: 4 }]}
                          onPress={() => openEditShift(shift)}
                          accessibilityLabel={ss("editShiftA11y")}
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
                            accessibilityLabel={ss("deleteShiftA11y")}
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
                        accessibilityLabel={ss("inheritedHoursA11y", {
                          day: dayLabel(day),
                          source: isLocation ? ss("inheritedSourceLocation") : ss("inheritedSourceSchedule"),
                          start: fmtTime(inherited.start_time),
                          end: fmtTime(inherited.end_time),
                        })}
                      >
                        <View style={twStyle("me-3 h-8 w-1 rounded-full bg-emerald-300")} />
                        <View style={twStyle("flex-1")}>
                          <View style={twStyle("flex-row items-center")}>
                            <Ionicons
                              name="business-outline"
                              size={14}
                              color="#059669"
                            />
                            <Text style={twStyle("ms-1.5 text-sm font-medium text-gray-900")}>
                              {fmtTime(inherited.start_time)} – {fmtTime(inherited.end_time)}
                            </Text>
                          </View>
                          <Text style={twStyle("mt-0.5 text-[10px] font-medium text-emerald-700")}>
                            {isLocation
                              ? ss("inheritedLocation")
                              : ss("inheritedSchedule")}
                          </Text>
                          <Text style={twStyle("mt-0.5 text-[10px] text-gray-400")}>
                            {ss("addWeeklyToOverride", { name: selectedStaff?.name ?? ss("thisStaffMember") })}
                          </Text>
                        </View>
                      </View>
                    );
                  })()
                ) : (
                  <View style={twStyle("px-4 py-3")}>
                    <Text style={twStyle("text-sm italic text-gray-400")}>
                      {ss("noShiftsDayOff")}
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
        title={editingShift ? ss("editShiftTitle") : ss("addShiftTitle")}
      >
        {/* Staff selector (only when adding) */}
        {!editingShift && (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
              {ss("staffMemberRequired")}
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
                      style={[twStyle(`flex-row items-center rounded-xl px-3 py-2 ${isSelected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginEnd: 8 }]}
                      onPress={() =>
                        setForm((prev) => ({ ...prev, staff_id: member.id }))
                      }
                      accessibilityLabel={ss("selectStaffA11y", { name: member.name })}
                      accessibilityRole="button"
                    >
                      <Avatar
                        name={member.name}
                        imageUrl={member.avatar_url}
                        size="sm"
                      />
                      <Text
                        style={twStyle(`ms-2 text-sm font-medium ${isSelected ? "text-white" : "text-gray-700"}`)}
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
          {ss("dayOfWeekRequired")}
        </Text>
        <View style={twStyle("mb-4 flex-row flex-wrap")}>
          {DAYS.map((day) => {
            const isSelected = form.day_of_week === day;
            return (
              <TouchableOpacity
                key={day}
                style={[twStyle(`rounded-full px-3.5 py-2 ${isSelected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginEnd: 8, marginBottom: 8 }]}
                onPress={() =>
                  setForm((prev) => ({ ...prev, day_of_week: day }))
                }
                accessibilityLabel={ss("selectDayA11y", { day: dayLabel(day) })}
                accessibilityRole="button"
              >
                <Text
                  style={twStyle(`text-sm font-medium ${isSelected ? "text-white" : "text-gray-600"}`)}
                >
{dayShort(day)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Time selection */}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
          {ss("shiftTimesRequired")}
        </Text>
        <View style={twStyle("mb-4 flex-row items-center")}>
          <TouchableOpacity
            style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3"), { marginEnd: 12 }]}
            onPress={() => setPickerField("start_time")}
            accessibilityLabel={ss("startTimeA11y", { time: fmtTime(form.start_time) })}
            accessibilityRole="button"
          >
            <Ionicons name="time-outline" size={16} color="#6366f1" />
            <Text style={twStyle("ms-2 text-base font-medium text-gray-900")}>
              {fmtTime(form.start_time)}
            </Text>
          </TouchableOpacity>

          <Text style={twStyle("text-sm text-gray-400")}>{ss("to")}</Text>

          <TouchableOpacity
            style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3")}
            onPress={() => setPickerField("end_time")}
            accessibilityLabel={ss("endTimeA11y", { time: fmtTime(form.end_time) })}
            accessibilityRole="button"
          >
            <Ionicons name="time-outline" size={16} color="#6366f1" />
            <Text style={twStyle("ms-2 text-base font-medium text-gray-900")}>
              {fmtTime(form.end_time)}
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
            <Text style={twStyle("ms-2 text-sm font-medium text-indigo-700")}>
              {ss("hoursShiftPreview", {
                hours: (
                  (timeToMinutes(form.end_time) - timeToMinutes(form.start_time)) /
                  60
                ).toFixed(1),
              })}
            </Text>
          </View>
        ) : timeToMinutes(form.end_time) < timeToMinutes(form.start_time) ? (
          <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3")}>
            <Text style={twStyle("text-sm font-semibold text-amber-900")}>
              {ss("overnightNotSupportedTitle")}
            </Text>
            <Text style={twStyle("mt-1 text-xs text-amber-800")}>
              {ss("overnightNotSupportedBody")}
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
                {ss("addDateShiftInstead")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Notes */}
        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
          {ss("notesOptional")}
        </Text>
        <View style={twStyle("mb-4")}>
          <TextInput
            style={[
              twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"),
              { minHeight: 72, textAlignVertical: "top" },
            ]}
            placeholder={ss("notesPlaceholder")}
            placeholderTextColor="#9ca3af"
            value={form.notes}
            onChangeText={(text) => setForm((prev) => ({ ...prev, notes: text }))}
            multiline
            maxLength={200}
            accessibilityLabel={ss("shiftNotesA11y")}
          />
        </View>

        {/* Save button */}
        <ActionButton
          label={
            isSaving
              ? ss("saving")
              : editingShift
                ? ss("updateShift")
                : ss("addShift")
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
        title={editingDateShift ? ss("editDateShiftTitle") : ss("addDateShiftTitle")}
        subtitle={
          editingDateShift
            ? ss("editDateShiftSubtitle")
            : ss("addDateShiftSubtitle")
        }
      >
        {editingDateShift ? null : (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ss("staffMemberRequired")}</Text>
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
                        { marginEnd: 8 },
                      ]}
                      onPress={() => setDateForm((prev) => ({ ...prev, staff_id: member.id }))}
                      accessibilityRole="button"
                    >
                      <Avatar name={member.name} imageUrl={member.avatar_url} size="sm" />
                      <Text style={twStyle(`ms-2 text-sm font-medium ${isSelected ? "text-white" : "text-gray-700"}`)}>
                        {member.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ss("dateRequired")}</Text>
        <TouchableOpacity
          onPress={() => setPickerField("date")}
          style={twStyle("mb-4 flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          accessibilityLabel={ss("shiftDateA11y")}
        >
          <Ionicons name="calendar-outline" size={20} color="#db2777" />
          <Text style={twStyle("ms-2 text-base text-gray-900")}>
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

        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ss("shiftTimesRequired")}</Text>
        <View style={twStyle("mb-4 flex-row items-center")}>
          <TouchableOpacity
            style={[twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3"), { marginEnd: 12 }]}
            onPress={() => setPickerField("date_start_time")}
          >
            <Ionicons name="time-outline" size={16} color="#db2777" />
            <Text style={twStyle("ms-2 text-base font-medium text-gray-900")}>
              {fmtTime(dateForm.start_time)}
            </Text>
          </TouchableOpacity>
          <Text style={twStyle("text-sm text-gray-400")}>{ss("to")}</Text>
          <TouchableOpacity
            style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3")}
            onPress={() => setPickerField("date_end_time")}
          >
            <Ionicons name="time-outline" size={16} color="#db2777" />
            <Text style={twStyle("ms-2 text-base font-medium text-gray-900")}>
              {fmtTime(dateForm.end_time)}
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
            <Text style={twStyle("ms-2 text-sm font-medium text-pink-700")}>
              {isOvernight(dateForm.start_time, dateForm.end_time)
                ? ss("hoursDurationNextDay", {
                    hours: (shiftDurationMinutes(dateForm.start_time, dateForm.end_time) / 60).toFixed(1),
                  })
                : ss("hoursDuration", {
                    hours: (shiftDurationMinutes(dateForm.start_time, dateForm.end_time) / 60).toFixed(1),
                  })}
            </Text>
          </View>
        )}

        <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ss("notesOptional")}</Text>
        <TextInput
          style={[
            twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"),
            { minHeight: 72, textAlignVertical: "top" },
          ]}
          placeholder={ss("dateNotesPlaceholder")}
          placeholderTextColor="#9ca3af"
          value={dateForm.notes}
          onChangeText={(text) => setDateForm((prev) => ({ ...prev, notes: text }))}
          multiline
          maxLength={200}
        />

        <ActionButton
          label={
            savingDateShift || patchingDateShift
              ? ss("saving")
              : editingDateShift
                ? ss("updateDateShift")
                : ss("addDateShiftTitle")
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

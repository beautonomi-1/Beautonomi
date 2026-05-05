import { useState, useCallback, useMemo, useRef, useEffect, type ElementRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  Pressable,
  Alert,
  ActionSheetIOS,
  Platform,
  Share,
  TextInput,
  useWindowDimensions,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { ScrollView as CalendarGridScrollView, Gesture, GestureDetector } from "react-native-gesture-handler";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  isSameDay,
  parseISO,
  differenceInMinutes,
} from "date-fns";
import * as Clipboard from "expo-clipboard";
import { APP_URL } from "@/config/public-env";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { usePagedProviderBookings } from "@/hooks/usePagedProviderBookings";
import { useResponsive } from "@/hooks/useResponsive";
import { useCalendarPreferences } from "@/hooks/useCalendarPreferences";
import { useProvider } from "@/providers/ProviderContext";
import type { ColorByMode } from "@/hooks/useCalendarPreferences";
import { CalendarPreferencesModal } from "@/components/calendar/CalendarPreferencesModal";
import { CalendarActionRail } from "@/components/calendar/CalendarActionRail";
import { CalendarBookingBlock } from "@/components/calendar/CalendarBookingBlock";
import { CalendarDayGridColumn } from "@/components/calendar/CalendarDayGridColumn";
import { CalendarDragGhost } from "@/components/calendar/CalendarDragGhost";
import { CalendarBookingQuickSheet } from "@/components/calendar/CalendarBookingQuickSheet";
import { CurrentTimeIndicator } from "@/components/calendar/CurrentTimeIndicator";
import {
  CALENDAR_GRID_TOP_PADDING,
  addCalendarDaysToDateKey,
  contentYOffsetToHourMinute,
  getBlockHeight,
  getHourMinuteForInstantInZone,
  getTopOffset,
  parseApiDateTime,
} from "@/components/calendar/calendar-layout";
import type { Booking, CalendarBooking, CalendarBookingDropContext } from "@/components/calendar/calendar-booking-types";
import { isNewBooking } from "@/components/calendar/calendar-booking-helpers";
import {
  BLOCK_TYPE_COLORS,
  STAFF_TIMEOFF_OVERLAY_COLORS,
} from "@/components/calendar/calendar-overlay-colors";
import { getCalendarPaymentLabel, paymentNeedsAttention } from "@/lib/calendar-payment-label";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { Avatar } from "@/components/ui/Avatar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatTime,
  formatTimeInZone,
  capitalizeFirst,
} from "@/lib/format";
import { buildZonedIsoForWallClock } from "@/lib/tz";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { trackCalendarView } from "@/lib/analytics";
import { useCalendarBookingsRealtime } from "@/hooks/useCalendarBookingsRealtime";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { useTranslation, type TFunction } from "@beautonomi/i18n";
import {
  expandTimeBlocksForCalendarRange,
  resolveTimeBlockRecordId,
} from "@/lib/expand-time-blocks";
import {
  expandBookingsForCalendar,
  normalizeCalendarWallClockLoose as normalizeCalendarTime,
  validateCalendarTimeRange,
} from "@/lib/provider-calendar-parity";
import { newBookingScreenHrefFromCalendarDay } from "@/lib/new-booking-nav-defaults";
import {
  dbTargetToPatchStatusField,
  getAllowedTransitionTargets,
  labelForDbStatus,
  optimisticBookingFieldsForDbTarget,
} from "@/lib/provider-booking-status-transitions";
import {
  dayMinuteRanges,
  deriveGridHourWindow,
  formatDateKeyInTimeZone,
  mergeOperatingHours,
  mergeStaffWorkingHours,
  timeStringToMinutes as sharedTimeStringToMinutes,
  wallClockInTimeZone,
  type MinuteRange,
  type WeeklyHours,
} from "@beautonomi/utils";

/* ================================================================== */
/*  Types (Booking / CalendarBooking: `@/components/calendar/calendar-booking-types`) */
/* ================================================================== */

interface StaffMember {
  id: string;
  name: string;
  avatar_url?: string | null;
  working_hours?: Record<string, { open?: string; close?: string; open_time?: string; close_time?: string; closed?: boolean; is_open?: boolean }> | null;
}

interface ProviderShift {
  id: string;
  team_member_id: string;
  date: string;
  start_time: string;
  end_time: string;
  source?: "shift" | "schedule" | "location";
}

interface TimeBlock {
  id: string;
  staff_id: string | null;
  block_type: string;
  title: string;
  start_time: string;
  end_time: string;
  date: string;
  /** From calendar APIs: staff PTO vs `availability_blocks` table. */
  overlay_source?: "staff_unavailability" | "availability_block";
  /** DB id for `availability_blocks` (stable across split day segments). */
  availability_block_id?: string;
  /** Distinguishes overlay rows for tap actions / CRUD. */
  calendar_overlay_kind?: "availability" | "staff_off" | "time_block" | "booking_hold";
  /** §Provider-launch (audit 2026-04): for booking holds, the originating hold id + expiry. */
  hold_id?: string;
  hold_expires_at?: string | null;
  /** From GET /api/provider/time-blocks (`recurring_pattern`); used to expand recurring rows on the client. */
  is_recurring?: boolean;
  is_active?: boolean;
  recurrence_rule?: unknown;
}

/** Raw rows from GET /api/provider/availability-blocks (same table public booking uses). */
interface AvailabilityBlockApi {
  id: string;
  block_type: "unavailable" | "break" | "maintenance";
  start_at: string;
  end_at: string;
  staff_id: string | null;
  location_id: string | null;
  reason?: string | null;
}

/** Per-day segment for calendar overlay (mirrors web normalizeAvailabilityBlocksToDisplay). */
interface AvailabilitySegment {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  team_member_id: string | null;
  location_id: string | null;
  block_type: "unavailable" | "break" | "maintenance";
  reason?: string | null;
  _source?: "staff_unavailability" | "availability_block";
  /** Original `availability_blocks.id` when `_source` is availability_block. */
  parent_block_id?: string;
}

/**
 * Split multi-day availability blocks into per-day segments.
 * Uses the provider timezone so blocks near midnight aren't assigned to the
 * wrong calendar day when the device is in a different timezone.
 */
function normalizeAvailabilityBlocksToSegments(
  raw: AvailabilityBlockApi[],
  tz?: string | null,
): AvailabilitySegment[] {
  const result: AvailabilitySegment[] = [];
  const pad = (n: number) => n.toString().padStart(2, "0");
  for (const block of raw) {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    let cursor = new Date(start.getTime());
    while (cursor < end) {
      // Use provider TZ to determine the calendar date of the cursor instant
      const wc = wallClockInTimeZone(cursor, tz);
      const dateStr = `${String(wc.year).padStart(4, "0")}-${pad(wc.month)}-${pad(wc.day)}`;

      // Compute start-of-next-day boundary in UTC by advancing the cursor to
      // midnight+1ms of the provider's next wall-clock day.
      // Advance by up to 25 hours (covers all DST transitions) and check date
      const tryNext = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      const tryWc = wallClockInTimeZone(tryNext, tz);
      // Snap to midnight of the next calendar day in provider TZ by binary-search
      // approximation: advance from cursor until the wall date increments.
      let boundary = tryNext;
      if (tryWc.day === wc.day && tryWc.month === wc.month && tryWc.year === wc.year) {
        // tryNext is still the same calendar day — push one more hour
        boundary = new Date(cursor.getTime() + 25 * 60 * 60 * 1000);
      }
      // Clamp to end
      const segmentEnd = end < boundary ? end : boundary;
      const startWc = wallClockInTimeZone(cursor, tz);
      const endWc = wallClockInTimeZone(segmentEnd < end ? segmentEnd : end, tz);
      const startTime = `${pad(startWc.hour)}:${pad(startWc.minute)}`;
      // If segmentEnd === boundary (midnight of next day) show "24:00" style → use "00:00" of next
      const endTime = segmentEnd >= end
        ? `${pad(endWc.hour)}:${pad(endWc.minute)}`
        : "00:00";

      result.push({
        id: `${block.id}-${dateStr}-${startTime}`,
        parent_block_id: block.id,
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
        team_member_id: block.staff_id,
        location_id: block.location_id ?? null,
        block_type: block.block_type,
        reason: block.reason,
        _source: "availability_block",
      });
      cursor = boundary;
    }
  }
  return result;
}

function availabilitySegmentToTimeBlock(seg: AvailabilitySegment): TimeBlock {
  const isStaff = seg._source === "staff_unavailability";
  const startNorm = normalizeCalendarTime(seg.start_time) ?? seg.start_time;
  const endNorm = normalizeCalendarTime(seg.end_time) ?? seg.end_time;
  return {
    id: seg.id,
    staff_id: seg.team_member_id,
    block_type: seg.block_type,
    title: (seg.reason && seg.reason.trim()) || seg.block_type,
    start_time: startNorm,
    end_time: endNorm,
    date: seg.date,
    overlay_source: seg._source,
    availability_block_id: isStaff ? undefined : seg.parent_block_id,
    calendar_overlay_kind: isStaff ? "staff_off" : "availability",
  };
}

const CALENDAR_DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function datesInRange(dateFrom: string, dateTo: string): string[] {
  const start = parseISO(dateFrom);
  const end = parseISO(dateTo);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(format(cursor, "yyyy-MM-dd"));
  }
  return dates;
}

function weekStartsInRange(dateFrom: string, dateTo: string): string[] {
  const start = parseISO(dateFrom);
  const end = parseISO(dateTo);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const starts: string[] = [];
  for (
    let cursor = startOfWeek(start, { weekStartsOn: 1 });
    cursor <= end;
    cursor = addDays(cursor, 7)
  ) {
    starts.push(format(cursor, "yyyy-MM-dd"));
  }
  return starts;
}

function applyEffectiveShiftHours(
  members: StaffMember[],
  shifts: ProviderShift[] | null,
  dateFrom: string,
  dateTo: string,
  selectedStaffId: string,
): StaffMember[] {
  if (shifts == null) return members;

  const rangeDates = datesInRange(dateFrom, dateTo);
  if (rangeDates.length === 0) return members;

  const dateToDayKey = new Map(
    rangeDates.map((date) => [date, CALENDAR_DAY_KEYS[parseISO(date).getDay()]] as const),
  );
  const byStaffDay = new Map<string, { open: string; close: string }>();

  for (const shift of shifts) {
    if (!shift.date || shift.date < dateFrom || shift.date > dateTo) continue;
    if (selectedStaffId !== "all" && shift.team_member_id !== selectedStaffId) continue;

    const dayKey = dateToDayKey.get(shift.date);
    const open = normalizeCalendarTime(shift.start_time);
    const close = normalizeCalendarTime(shift.end_time);
    if (!dayKey || !open || !close) continue;

    const key = `${shift.team_member_id}::${dayKey}`;
    const existing = byStaffDay.get(key);
    if (!existing) {
      byStaffDay.set(key, { open, close });
      continue;
    }

    byStaffDay.set(key, {
      open: timeStringToMinutes(open) < timeStringToMinutes(existing.open) ? open : existing.open,
      close: timeStringToMinutes(close) > timeStringToMinutes(existing.close) ? close : existing.close,
    });
  }

  return members.map((member) => {
    const workingHours: NonNullable<StaffMember["working_hours"]> = { ...(member.working_hours ?? {}) };
    for (const [, dayKey] of dateToDayKey) {
      const shiftHours = byStaffDay.get(`${member.id}::${dayKey}`);
      if (!shiftHours) continue;

      const existing = workingHours[dayKey];
      const existingOpen = normalizeCalendarTime(existing?.open ?? existing?.open_time);
      const existingClose = normalizeCalendarTime(existing?.close ?? existing?.close_time);
      if (existing && existing.closed !== true && existing.is_open !== false && existingOpen && existingClose) {
        workingHours[dayKey] = {
          open: timeStringToMinutes(shiftHours.open) < timeStringToMinutes(existingOpen) ? shiftHours.open : existingOpen,
          close: timeStringToMinutes(shiftHours.close) > timeStringToMinutes(existingClose) ? shiftHours.close : existingClose,
          closed: false,
          is_open: true,
        };
      } else {
        workingHours[dayKey] = { ...shiftHours, closed: false, is_open: true };
      }
    }

    return { ...member, working_hours: workingHours };
  });
}

interface DaySchedule {
  is_open: boolean;
  open_time: string;
  close_time: string;
}

interface ProviderLocation {
  id: string;
  name: string;
  operating_hours?: Record<string, DaySchedule>;
  /** 'salon' = clients can visit; 'base' = distance/travel only (mobile-only) */
  location_type?: "salon" | "base";
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const TIME_COL_WIDTH_PHONE = 48;
const MIN_STAFF_COL_WIDTH_PHONE = 100;
const MIN_WEEK_COL_WIDTH_PHONE = 80;
const TIME_COL_WIDTH_TABLET = 56;
const MIN_STAFF_COL_WIDTH_TABLET = 140;
const MIN_WEEK_COL_WIDTH_TABLET = 120;
const DARK_HEADER = "#1a1f3c";
const TEAL_ACCENT = "#4fd1c5";

type ColorTriple = { bg: string; border: string; text: string };

const STATUS_COLORS: Record<string, ColorTriple> = {
  confirmed: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  pending: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  unconfirmed: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  booked: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  // §Provider-launch (audit 2026-04): distinct palettes for front-desk
  // lifecycle statuses so "waiting in the lobby" vs "checked in and seated"
  // vs "service started" are visually separable on the calendar, matching
  // the web provider portal.
  waiting: { bg: "#fef3c7", border: "#d97706", text: "#78350f" },
  checked_in: { bg: "#e0f2fe", border: "#0284c7", text: "#075985" },
  in_progress: { bg: "#fdf2f8", border: "#ec4899", text: "#831843" },
  started: { bg: "#fdf2f8", border: "#ec4899", text: "#831843" },
  completed: { bg: Colors.gray[100], border: Colors.gray[400], text: Colors.gray[600] },
  cancelled: { bg: Colors.gray[100], border: Colors.gray[300], text: Colors.gray[400] },
  no_show: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
};

const SERVICE_COLOR_MAP: [string[], ColorTriple][] = [
  [["haircut", "cut", "trim"], { bg: "#ecfeff", border: "#06b6d4", text: "#164e63" }],
  [["color", "colour", "dye"], { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" }],
  [["highlight", "foil"], { bg: "#fefce8", border: "#facc15", text: "#854d0e" }],
  [["balayage", "ombre"], { bg: "#fdf2f8", border: "#f472b6", text: "#831843" }],
  [["facial", "face"], { bg: Colors.gray[100], border: Colors.gray[500], text: Colors.gray[800] }],
  [["manicure", "pedicure", "nail"], { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a" }],
  [["massage", "body"], { bg: "#f0fdf4", border: "#22c55e", text: "#14532d" }],
  [["wax"], { bg: "#fff7ed", border: "#fb923c", text: "#9a3412" }],
  [["brow", "lash", "eye"], { bg: "#fafaf9", border: "#78716c", text: "#292524" }],
  [["treatment", "therapy"], { bg: "#f5f3ff", border: "#8b5cf6", text: "#4c1d95" }],
];

const TEAM_COLORS: ColorTriple[] = [
  { bg: "#eef2ff", border: "#6366f1", text: "#312e81" },
  { bg: "#ecfdf5", border: "#10b981", text: "#064e3b" },
  { bg: "#fff1f2", border: "#f43f5e", text: "#9f1239" },
  { bg: "#f0f9ff", border: "#0ea5e9", text: "#0c4a6e" },
  { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  { bg: "#f5f3ff", border: "#8b5cf6", text: "#4c1d95" },
  { bg: "#f0fdfa", border: "#14b8a6", text: "#134e4a" },
  { bg: "#fdf4ff", border: "#d946ef", text: "#701a75" },
];

function translateBookingStatusLabel(t: TFunction, status: string): string {
  const key = `provider.calendarScreen.bookingStatusLabels.${status}`;
  const v = t(key);
  return v === key ? capitalizeFirst(status.replace(/_/g, " ")) : v;
}

function getStatusActionLabel(t: TFunction, actionKey: string): string {
  const key = `provider.calendarScreen.statusActionLabels.${actionKey}`;
  const v = t(key);
  return v === key ? labelForDbStatus(actionKey) : v;
}

function translateAvailabilityBlockType(t: TFunction, blockType: string): string {
  const key = `provider.calendarScreen.availabilityEditTypes.${blockType}`;
  const v = t(key);
  return v === key ? capitalizeFirst(blockType.replace(/_/g, " ")) : v;
}

function translateOverlayBlockType(t: TFunction, blockType: string): string {
  const availability = translateAvailabilityBlockType(t, blockType);
  if (availability !== capitalizeFirst(blockType.replace(/_/g, " "))) return availability;
  const key = `provider.calendarScreen.timeBlockTypes.${blockType}`;
  const v = t(key);
  return v === key ? availability : v;
}

type LayoutMode = "columns" | "single";
type ViewMode = "day" | "3day" | "week";

const BLOCK_TYPES = [
  { value: "break", icon: "cafe-outline" as const },
  { value: "lunch", icon: "restaurant-outline" as const },
  { value: "meeting", icon: "people-outline" as const },
  { value: "personal", icon: "person-outline" as const },
  { value: "other", icon: "ban-outline" as const },
];

/** Editable `availability_blocks.block_type` values (API). */
const AVAILABILITY_EDIT_TYPES = [
  { value: "unavailable" as const, icon: "ban-outline" as const },
  { value: "break" as const, icon: "cafe-outline" as const },
  { value: "maintenance" as const, icon: "construct-outline" as const },
];

/* ================================================================== */
/*  Color resolvers                                                    */
/* ================================================================== */

function getStatusColors(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.booked;
}

/** Map DB + provider-facing status to calendar color keys (pending ≠ confirmed “booked”). */
function resolveCalendarColorKey(booking: Booking | CalendarBooking): string {
  const db = booking.db_status;
  if (db === "pending") return "pending";
  if (db === "confirmed") return "confirmed";
  // §Provider-launch (audit 2026-04): surface lobby-flow DB statuses
  // (waiting / checked_in) distinctly from "booked"/"confirmed" so the
  // calendar reflects what's actually happening at reception.
  if (db === "waiting") return "waiting";
  if (db === "checked_in") return "checked_in";
  if (db === "in_progress") return "started";
  if (db === "completed") return "completed";
  if (db === "cancelled") return "cancelled";
  if (db === "no_show") return "no_show";
  return booking.status;
}

function getServiceColors(booking: Booking | CalendarBooking) {
  const serviceName = booking.services?.[0]?.name?.toLowerCase() ?? "";
  for (const [keywords, colors] of SERVICE_COLOR_MAP) {
    if (keywords.some((kw) => serviceName.includes(kw))) return colors;
  }
  return { bg: "#f8fafc", border: "#94a3b8", text: "#1e293b" };
}

function getTeamColors(booking: Booking | CalendarBooking, staffList: StaffMember[]) {
  const staffId = "calendar_staff_id" in booking ? booking.calendar_staff_id : booking.services?.[0]?.staff_id;
  if (!staffId) return TEAM_COLORS[0]!;
  const idx = staffList.findIndex((s) => s.id === staffId);
  return TEAM_COLORS[idx >= 0 ? idx % TEAM_COLORS.length : 0]!;
}

function getBlockColors(
  booking: Booking | CalendarBooking,
  colorBy: ColorByMode,
  staffList: StaffMember[],
) {
  switch (colorBy) {
    case "service":
      return getServiceColors(booking);
    case "team_member":
      return getTeamColors(booking, staffList);
    default:
      return getStatusColors(resolveCalendarColorKey(booking));
  }
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/**
 * §Calendar-hours: local wrappers that preserve the historical signatures
 * used throughout this file while delegating the underlying parsing to the
 * shared engine in `@beautonomi/utils/calendar-hours`.
 */
function timeStringToMinutes(t: string | undefined | null): number {
  return sharedTimeStringToMinutes(t ?? null) ?? 0;
}

/**
 * Parse `?date=` deep links. When `providerTimezone` is set, `YYYY-MM-DD` is interpreted as that
 * zone's wall calendar date (aligned with `formatDateKeyInTimeZone`), not the device's local date.
 */
function parseCalendarDateParam(value: string, providerTimezone?: string | null): Date | null {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match && providerTimezone) {
    try {
      const iso = buildZonedIsoForWallClock(trimmed, "12:00", providerTimezone);
      const d = parseISO(iso);
      return Number.isFinite(d.getTime()) ? d : null;
    } catch {
      /* fall through */
    }
  }
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d);
    }
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function calendarDateKey(day: Date, timeZone?: string | null): string {
  return timeZone ? formatDateKeyInTimeZone(day, timeZone) : format(day, "yyyy-MM-dd");
}

function bookingDbStatus(booking: Booking | CalendarBooking): string {
  if (typeof booking.db_status === "string" && booking.db_status.trim()) return booking.db_status;
  const s = booking.status;
  if (s === "booked") return "confirmed";
  if (s === "started") return "in_progress";
  return s;
}

function bookingActionTargets(booking: Booking | CalendarBooking): string[] {
  return getAllowedTransitionTargets(bookingDbStatus(booking));
}

function currentWallClockTimeInZone(timeZone?: string | null): string {
  const { hour, minute } = wallClockInTimeZone(new Date(), timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildScheduleShareBody(
  viewMode: ViewMode,
  selectedDate: Date,
  weekStart: Date,
  bookings: Booking[],
  businessName: string,
  t: TFunction,
  timeZone?: string | null,
): string {
  const displayName = businessName.trim() || t("provider.calendarScreen.share.defaultBusinessName");
  const header = `${t("provider.calendarScreen.share.header", { businessName: displayName })}\n`;
  const sorted = [...bookings].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  let days: Date[] = [];
  if (viewMode === "day") days = [selectedDate];
  else if (viewMode === "3day") days = Array.from({ length: 3 }, (_, i) => addDays(selectedDate, i));
  else days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const parts: string[] = [header];
  for (const day of days) {
    const dayKey = calendarDateKey(day, timeZone);
    const dayBookings = sorted.filter((b) => {
      const d = parseApiDateTime(b.scheduled_at);
      return d != null && calendarDateKey(d, timeZone) === dayKey;
    });
    parts.push(`\n${format(day, "EEE, MMM d")}`);
    if (dayBookings.length === 0) parts.push(t("provider.calendarScreen.share.noAppointments"));
    else {
      for (const b of dayBookings) {
        // §Provider-audit 2026-04: share text must reflect the business
        // timezone, same as the rendered card labels, to stay coherent.
        const timeStr = formatTimeInZone(b.scheduled_at, timeZone) || formatTime(b.scheduled_at);
        const name = b.customers?.full_name?.trim() || t("provider.calendarScreen.walkIn");
        const svcs =
          b.services?.map((s) => s.name).filter(Boolean).join(", ") ||
          t("provider.calendarScreen.share.servicesFallback");
        parts.push(
          `  ${timeStr} — ${name} — ${svcs} (${translateBookingStatusLabel(t, b.status)})`,
        );
      }
    }
  }
  parts.push(t("provider.calendarScreen.share.footer"));
  return parts.join("\n");
}

/* ================================================================== */
/*  Skeleton                                                           */
/* ================================================================== */

function CalendarSkeleton() {
  const { t } = useTranslation();
  // §Provider-launch (audit 2026-04-21): skeleton now mirrors the real
  // calendar layout (time gutter + faux booking cards at plausible
  // hours). A subtle pulse makes it read as "loading" instead of "broken".
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 900, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const rowHours = [9, 10, 11, 12, 13, 14, 15, 16];
  const fakeCards: { atHour: number; height: number; offset: number; width: string }[] = [
    { atHour: 9, height: 56, offset: 12, width: "72%" },
    { atHour: 11, height: 44, offset: 28, width: "55%" },
    { atHour: 13, height: 64, offset: 4, width: "85%" },
    { atHour: 15, height: 48, offset: 20, width: "60%" },
  ];

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} accessibilityLabel={t("provider.calendarScreen.dateNav.loadingCalendar")}>
      {rowHours.map((h, i) => (
        <View key={h} style={{ position: "relative", height: 60, flexDirection: "row", alignItems: "flex-start", borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Colors.gray[100] }}>
          <View style={{ width: 40, paddingTop: 2 }}>
            <Animated.View style={{ opacity: pulse, height: 10, width: 28, borderRadius: 4, backgroundColor: Colors.gray[200] }} />
          </View>
          <View style={{ flex: 1, position: "relative" }}>
            {fakeCards
              .filter((c) => c.atHour === h)
              .map((c, idx) => (
                <Animated.View
                  key={`${h}-${idx}`}
                  style={{
                    opacity: pulse,
                    marginTop: c.offset,
                    height: c.height,
                    width: c.width as `${number}%`,
                    borderRadius: 10,
                    borderLeftWidth: 3,
                    borderLeftColor: Colors.gray[300],
                    backgroundColor: Colors.gray[100],
                  }}
                />
              ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ================================================================== */
/*  Date Picker Modal                                                  */
/* ================================================================== */

function DatePickerModal({
  visible,
  currentDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  currentDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(currentDate);
  useEffect(() => { if (visible) setMonth(currentDate); }, [visible, currentDate]);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const weekdayLabels = [
    t("provider.calendarScreen.datePicker.weekdaysShort.sunday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.monday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.tuesday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.wednesday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.thursday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.friday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.saturday"),
  ];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose}>
        <Pressable style={{ marginHorizontal: 24, width: 320, borderRadius: 16, backgroundColor: Colors.white, padding: 20 }} onPress={() => {}}>
          <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <TouchableOpacity
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              accessibilityLabel={t("provider.calendarScreen.prevMonthA11y")}
            >
              <Ionicons name="chevron-back" size={20} color="#111" />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{format(month, "MMMM yyyy")}</Text>
            <TouchableOpacity
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              accessibilityLabel={t("provider.calendarScreen.nextMonthA11y")}
            >
              <Ionicons name="chevron-forward" size={20} color="#111" />
            </TouchableOpacity>
          </View>

          <View style={{ marginBottom: 4, flexDirection: "row" }}>
            {weekdayLabels.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[400] }}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`e-${i}`} style={{ width: "14.28%" }} />;
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const isSelected = isSameDay(date, currentDate);
              const isToday = isSameDay(date, new Date());
              return (
                <TouchableOpacity
                  key={day}
                  style={{
                    width: "14.28%",
                    alignItems: "center",
                    paddingVertical: 8,
                    borderRadius: 9999,
                    backgroundColor: isSelected ? Colors.gray[900] : isToday ? Colors.gray[100] : "transparent",
                  }}
                  onPress={() => { onSelect(date); onClose(); }}
                  accessibilityLabel={format(date, "MMMM d, yyyy")}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isSelected || isToday ? "700" : "400",
                      color: isSelected ? Colors.white : isToday ? Colors.gray[900] : Colors.gray[700],
                    }}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={{ marginTop: 12, alignItems: "center", borderRadius: 8, backgroundColor: Colors.gray[100], paddingVertical: 8 }}
            onPress={() => { onSelect(new Date()); onClose(); }}
            accessibilityRole="button"
            accessibilityLabel={t("provider.calendarScreen.datePicker.today")}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{t("provider.calendarScreen.datePicker.today")}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MonthOverviewModal({
  visible,
  monthAnchor,
  locationParam,
  timeZone,
  onClose,
  onSelectDate,
}: {
  visible: boolean;
  monthAnchor: Date;
  locationParam: string;
  timeZone?: string | null;
  onClose: () => void;
  onSelectDate: (d: Date) => void;
}) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(monthAnchor);
  useEffect(() => {
    if (visible) setMonth(monthAnchor);
  }, [visible, monthAnchor]);

  const start = format(startOfMonth(month), "yyyy-MM-dd");
  const end = format(endOfMonth(month), "yyyy-MM-dd");
  const monthBookingsPath = useMemo(
    () => `/api/provider/bookings?start_date=${start}&end_date=${end}${locationParam}`,
    [start, end, locationParam],
  );
  const { data: mbBookings, loading, error: monthCountsError, refresh: refreshMonthCounts } = usePagedProviderBookings<Booking>(
    monthBookingsPath,
    { enabled: visible, timeoutMs: 60_000 },
  );

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    if (!mbBookings?.length) return m;
    for (const b of mbBookings) {
      const d = parseApiDateTime(b.scheduled_at);
      if (!d) continue;
      const key = calendarDateKey(d, timeZone);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [mbBookings, timeZone]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const weekdayLabels = [
    t("provider.calendarScreen.datePicker.weekdaysShort.sunday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.monday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.tuesday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.wednesday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.thursday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.friday"),
    t("provider.calendarScreen.datePicker.weekdaysShort.saturday"),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose}>
        <Pressable style={{ marginHorizontal: 16, maxWidth: 360, width: "100%", borderRadius: 16, backgroundColor: Colors.white, padding: 16 }} onPress={() => {}}>
          <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <TouchableOpacity
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              accessibilityLabel={t("provider.calendarScreen.prevMonthA11y")}
            >
              <Ionicons name="chevron-back" size={22} color="#111" />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{format(month, "MMMM yyyy")}</Text>
            <TouchableOpacity
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              accessibilityLabel={t("provider.calendarScreen.nextMonthA11y")}
            >
              <Ionicons name="chevron-forward" size={22} color="#111" />
            </TouchableOpacity>
          </View>
          {loading && (
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 8 }}>
              {t("provider.calendarScreen.monthOverviewLoadingCounts")}
            </Text>
          )}
          {monthCountsError && !loading && (
            <TouchableOpacity
              onPress={refreshMonthCounts}
              style={{ marginBottom: 8, borderRadius: 10, borderWidth: 1, borderColor: "#FED7AA", backgroundColor: "#FFF7ED", padding: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t("provider.calendarScreen.monthOverviewCountsErrorA11y")}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400E" }}>
                {t("provider.calendarScreen.monthOverviewCountsError")}
              </Text>
            </TouchableOpacity>
          )}
          <View style={{ marginBottom: 4, flexDirection: "row" }}>
            {weekdayLabels.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400] }}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`e-${i}`} style={{ width: "14.28%" }} />;
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const key = calendarDateKey(date, timeZone);
              const cnt = countByDate.get(key) ?? 0;
              const isToday = isSameDay(date, new Date());
              return (
                <TouchableOpacity
                  key={day}
                  style={{
                    width: "14.28%",
                    alignItems: "center",
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: isToday ? Colors.gray[100] : "transparent",
                  }}
                  onPress={() => {
                    onSelectDate(date);
                    onClose();
                  }}
                  accessibilityLabel={t("provider.calendarScreen.monthOverviewDayA11y", {
                    date: format(date, "MMMM d"),
                    count: cnt,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{day}</Text>
                  {cnt > 0 && (
                    <View style={{ marginTop: 2, minWidth: 18, paddingHorizontal: 4, borderRadius: 8, backgroundColor: TEAL_ACCENT }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: DARK_HEADER, textAlign: "center" }}>{cnt}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={{ marginTop: 12, alignItems: "center", borderRadius: 8, backgroundColor: Colors.gray[100], paddingVertical: 10 }}
            onPress={onClose}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
              {t("provider.calendarScreen.close")}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */

/**
 * §Provider-launch (audit 2026-04-21): calendar-scoped ErrorBoundary.
 * The root `_layout` ErrorBoundary catches render errors too — but its
 * fallback replaces the entire app chrome with a generic "Something went
 * wrong" screen. For the calendar tab specifically we want to keep the
 * tab bar in place and give a calendar-contextualised recovery (reload
 * today's bookings / jump to Today) so a transient render error never
 * looks like the whole app broke.
 */
function CalendarCrashFallback({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
      <View style={{ height: 72, width: 72, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: "#fef2f2", marginBottom: 16 }}>
        <Ionicons name="calendar-outline" size={30} color="#ef4444" />
      </View>
      <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.gray[900], textAlign: "center" }}>
        {t("provider.calendarScreen.crashFallback.title")}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: Colors.gray[500], textAlign: "center" }}>
        {t("provider.calendarScreen.crashFallback.body")}
      </Text>
      <TouchableOpacity
        onPress={onReset}
        style={{ marginTop: 20, borderRadius: 12, backgroundColor: DARK_HEADER, paddingHorizontal: 28, paddingVertical: 12, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        accessibilityRole="button"
        accessibilityLabel={t("provider.calendarScreen.fetchError.retry")}
      >
        <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("provider.calendarScreen.fetchError.retry")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function CalendarScreen() {
  const [resetKey, setResetKey] = useState(0);
  return (
    <ErrorBoundary
      key={resetKey}
      onReset={() => setResetKey((k) => k + 1)}
      fallback={<CalendarCrashFallback onReset={() => setResetKey((k) => k + 1)} />}
    >
      <CalendarScreenBody />
    </ErrorBoundary>
  );
}

function CalendarScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  // §Provider-launch (audit 2026-04): accept `?date=YYYY-MM-DD` +
  // `?booking_id=...` deep-link params so push notifications and email
  // reminders can land the provider on the exact day (and optionally open
  // the booking detail). Falls back to today + no booking highlight.
  const searchParams = useLocalSearchParams<{ date?: string; booking_id?: string }>();
  useAuth();
  const { provider, selectedLocationId: globalLocationId } = useProvider();
  const deepLinkDate = useMemo(() => {
    if (typeof searchParams.date !== "string" || !searchParams.date) return null;
    return parseCalendarDateParam(searchParams.date, provider?.timezone ?? null);
  }, [searchParams.date, provider?.timezone]);
  const handledBookingDeepLinkRef = useRef<string | null>(null);
  const [isFocused, setIsFocused] = useState(true);
  const [secondaryEnabled, setSecondaryEnabled] = useState(false);
  const { isTablet, screenPadding } = useResponsive();
  const { preferences, updatePreference, resetToDefaults } = useCalendarPreferences();

  const [selectedDate, setSelectedDate] = useState<Date>(() => deepLinkDate ?? new Date());
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(() =>
    typeof searchParams.booking_id === "string" && searchParams.booking_id ? searchParams.booking_id : null,
  );
  useEffect(() => {
    if (deepLinkDate) {
      setSelectedDate((prev) => (isSameDay(prev, deepLinkDate) ? prev : deepLinkDate));
    }
  }, [deepLinkDate]);
  useEffect(() => {
    const bookingId = typeof searchParams.booking_id === "string" ? searchParams.booking_id : "";
    if (bookingId && handledBookingDeepLinkRef.current !== bookingId) {
      handledBookingDeepLinkRef.current = bookingId;
      setHighlightedBookingId(bookingId);
    }
  }, [searchParams.booking_id]);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("columns");
  const [selectedStaffIndex, setSelectedStaffIndex] = useState(0);
  const [staffFilter, setStaffFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState(globalLocationId ?? "all");
  const [cancelReasonBookingId, setCancelReasonBookingId] = useState<string | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState("");

  useEffect(() => {
    if (globalLocationId) setLocationFilter(globalLocationId);
    else setLocationFilter("all");
  }, [globalLocationId]);

  useEffect(() => {
    trackCalendarView();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useEffect(() => {
    // Enable secondary data (time blocks, availability, staff unavailability) immediately when
    // the screen is focused so blocked / off times are always visible without requiring a tap.
    setSecondaryEnabled(isFocused);
  }, [isFocused]);

  const [refreshing, setRefreshing] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [monthOverviewVisible, setMonthOverviewVisible] = useState(false);
  /** Android: long-press booking menu (avoids Alert button limits when many status actions exist). */
  const [androidBookingMenu, setAndroidBookingMenu] = useState<CalendarBooking | null>(null);
  const [prefsVisible, setPrefsVisible] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  /** Booking-level status / cancel API in flight (by parent booking id). */
  const [pendingBookingActionIds, setPendingBookingActionIds] = useState<Set<string>>(new Set());
  /** Drag-reschedule PATCH in flight. */
  const [pendingRescheduleBookingIds, setPendingRescheduleBookingIds] = useState<Set<string>>(new Set());
  const [showTimeBlockForm, setShowTimeBlockForm] = useState(false);
  const [timeBlockForm, setTimeBlockForm] = useState({
    type: "break",
    title: "",
    startTime: "12:00",
    endTime: "13:00",
    staffId: "",
  });
  const [availabilityEdit, setAvailabilityEdit] = useState<{
    id: string;
    block_type: "unavailable" | "break" | "maintenance";
    date: string;
    start_time: string;
    end_time: string;
    staff_id: string | null;
  } | null>(null);
  const scrollRef = useRef<ElementRef<typeof CalendarGridScrollView>>(null);
  const hasScrolledToNow = useRef(false);
  const prevViewModeRef = useRef(viewMode);
  if (prevViewModeRef.current !== viewMode) {
    prevViewModeRef.current = viewMode;
    hasScrolledToNow.current = false;
  }
  const scrollOffsetRef = useRef({ x: 0, y: 0 });
  const gridContainerRef = useRef<View>(null);
  const draggingRef = useRef(false);
  const draggingBookingIdRef = useRef<string | null>(null);
  const [draggingBooking, setDraggingBooking] = useState<CalendarBooking | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  /** In-context preview after tapping an appointment (avoids switching away from Calendar tab). */
  const [quickSheetBooking, setQuickSheetBooking] = useState<CalendarBooking | null>(null);

  const SLOT_HEIGHT = preferences.compactMode ? 40 : 60;
  const QUARTER_HEIGHT = SLOT_HEIGHT / 4;
  const GRID_TOP_PADDING = CALENDAR_GRID_TOP_PADDING;

  /**
   * Measured height of the per-column header in multi-staff day-columns and 3-day view.
   * Used to offset the full-width CurrentTimeIndicator overlay so it starts at the top
   * of the grid rows, not at the top of the gridContainerRef which is above the headers.
   */
  const [staffColHeaderHeight, setStaffColHeaderHeight] = useState(0);
  const [threeDayColHeaderHeight, setThreeDayColHeaderHeight] = useState(0);
  const [weekColHeaderHeight, setWeekColHeaderHeight] = useState(0);

  const providerTz = provider?.timezone ?? null;
  const dateStr = calendarDateKey(selectedDate, providerTz);
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = calendarDateKey(addDays(weekStart, 6), providerTz);
  const weekStartStr = calendarDateKey(weekStart, providerTz);
  const threeDayEnd = calendarDateKey(addDays(selectedDate, 2), providerTz);

  // Day view still shows one day in the grid, but we load the full ISO week so the date strip
  // booking dots, share/print, and month counts stay accurate without extra fetches.
  const startDate = viewMode === "week" ? weekStartStr : viewMode === "3day" ? dateStr : weekStartStr;
  const endDate = viewMode === "week" ? weekEnd : viewMode === "3day" ? threeDayEnd : weekEnd;
  const locationParam = locationFilter !== "all" ? `&location_id=${locationFilter}` : "";

  /** Bumps every minute so `providerTodayKey` refreshes after midnight if the screen stays open. */
  const [providerTodayTick, setProviderTodayTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setProviderTodayTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // TZ-aware "today" key — matches the provider's wall-clock date, not the device's.
  const providerTodayKey = useMemo(
    () => formatDateKeyInTimeZone(new Date(), providerTz),
    [providerTz, selectedDate, providerTodayTick],
  );
  const isProviderToday = useCallback(
    (d: Date) => formatDateKeyInTimeZone(d, providerTz) === providerTodayKey,
    [providerTz, providerTodayKey],
  );

  const shiftWeekStarts = useMemo(() => weekStartsInRange(startDate, endDate), [startDate, endDate]);
  const primaryShiftWeekStart = shiftWeekStarts[0] ?? weekStartStr;
  const secondaryShiftWeekStart = shiftWeekStarts[1] ?? primaryShiftWeekStart;
  const needsSecondaryShiftWeek = secondaryShiftWeekStart !== primaryShiftWeekStart;

  const calendarBookingsPath = useMemo(
    () => `/api/provider/bookings?start_date=${startDate}&end_date=${endDate}${locationParam}`,
    [startDate, endDate, locationParam],
  );
  const {
    data: bookings,
    loading,
    error: fetchError,
    refresh,
    mutate: mutateBookings,
  } = usePagedProviderBookings<Booking>(calendarBookingsPath, {
    enabled: isFocused,
    timeoutMs: 60_000,
  });

  const teamUrl = locationFilter !== "all" ? `/api/provider/team?location_id=${encodeURIComponent(locationFilter)}` : "/api/provider/team";
  const { data: staff } = useApi<StaffMember[]>(teamUrl, { enabled: isFocused, staleTimeMs: 30_000 });
  const { data: primaryShifts, refresh: refreshPrimaryShifts } = useApi<ProviderShift[]>(
    `/api/provider/shifts?week_start=${encodeURIComponent(primaryShiftWeekStart)}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  const { data: secondaryShifts, refresh: refreshSecondaryShifts } = useApi<ProviderShift[]>(
    `/api/provider/shifts?week_start=${encodeURIComponent(secondaryShiftWeekStart)}`,
    { enabled: isFocused && secondaryEnabled && needsSecondaryShiftWeek, staleTimeMs: 10_000 },
  );
  const timeBlocksLocationParam = locationFilter !== "all" ? `&location_id=${encodeURIComponent(locationFilter)}` : "";
  const { data: timeBlocks, error: timeBlocksError, refresh: refreshTimeBlocks } = useApi<TimeBlock[]>(
    `/api/provider/time-blocks?date_from=${startDate}&date_to=${endDate}${timeBlocksLocationParam}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  // Build UTC ISO bounds for availability-blocks so the API's overlap
  // query (end_at > from AND start_at < to) uses the correct midnight in
  // the provider timezone — not the device timezone.
  const availBlockParams = useMemo(() => {
    const tz = provider?.timezone;
    const fromIso = buildZonedIsoForWallClock(startDate, "00:00", tz ?? null);
    const toIso = buildZonedIsoForWallClock(endDate, "23:59", tz ?? null);
    return `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  }, [startDate, endDate, provider?.timezone]);

  const { data: availabilityRaw, error: availabilityBlocksError, refresh: refreshAvailabilityBlocks } = useApi<AvailabilityBlockApi[]>(
    `/api/provider/availability-blocks?${availBlockParams}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  const { data: staffUnavailSegments, error: staffUnavailError, refresh: refreshStaffUnavail } = useApi<AvailabilitySegment[]>(
    `/api/provider/calendar/staff-unavailability?date_from=${encodeURIComponent(startDate)}&date_to=${encodeURIComponent(endDate)}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  // §Provider-launch (audit 2026-04): surface active booking_holds as ghost
  // slots so providers don't accidentally double-book a slot a customer is
  // currently finalising payment for. Matches web calendar B8 behaviour.
  const { data: bookingHoldSegments, error: bookingHoldsError, refresh: refreshBookingHolds } = useApi<
    {
      id: string;
      date: string;
      start_time: string;
      end_time: string;
      team_member_id: string | null;
      location_id: string | null;
      block_type: string;
      reason?: string | null;
      _source?: string;
      hold_id?: string;
      hold_expires_at?: string | null;
    }[]
  >(
    `/api/provider/calendar/booking-holds?date_from=${encodeURIComponent(startDate)}&date_to=${encodeURIComponent(endDate)}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  const { data: locations } = useApi<ProviderLocation[]>("/api/provider/locations", {
    enabled: isFocused && secondaryEnabled,
    staleTimeMs: 60_000,
  });
  const waitingRoomUrl = locationFilter !== "all" ? `/api/provider/waiting-room/count?location_id=${encodeURIComponent(locationFilter)}` : "/api/provider/waiting-room/count";
  const { data: waitingRoom } = useApi<{ count: number }>(waitingRoomUrl, {
    enabled: isFocused && secondaryEnabled,
    staleTimeMs: 10_000,
  });
  const { execute: patchBooking } = useApiMutation("patch");
  const { execute: postBookingAction } = useApiMutation("post");
  const { execute: createTimeBlock, loading: creatingBlock } = useApiMutation("post");
  const { execute: deleteAvailabilityBlock } = useApiMutation("delete");
  const { execute: updateAvailabilityBlock, loading: savingAvailabilityEdit } = useApiMutation("put");
  const { execute: deleteCalendarTimeBlock } = useApiMutation("delete");

  const normalizedApiTimeBlocks = useMemo((): TimeBlock[] => {
    if (!timeBlocks?.length) return [];
    return timeBlocks.map((tb) => {
      const raw = tb as TimeBlock & {
        team_member_id?: string | null;
        name?: string;
        blocked_time_type_name?: string;
        recurring_pattern?: unknown;
      };
      const st = normalizeCalendarTime(String(raw.start_time ?? "00:00")) ?? "00:00";
      const et = normalizeCalendarTime(String(raw.end_time ?? "00:00")) ?? "00:00";
      return {
        id: raw.id,
        staff_id: raw.staff_id ?? raw.team_member_id ?? null,
        block_type: raw.block_type || raw.blocked_time_type_name || raw.title || raw.name || "blocked",
        title: raw.title || raw.name || t("provider.calendarScreen.overlayMenu.timeBlockTitle"),
        start_time: st,
        end_time: et,
        date: raw.date,
        calendar_overlay_kind: "time_block" as const,
        is_recurring: !!raw.is_recurring,
        is_active: raw.is_active !== false,
        recurrence_rule: raw.recurrence_rule ?? raw.recurring_pattern,
      };
    });
  }, [timeBlocks, t]);

  const expandedApiTimeBlocks = useMemo(
    () => expandTimeBlocksForCalendarRange(normalizedApiTimeBlocks, startDate, endDate),
    [normalizedApiTimeBlocks, startDate, endDate],
  );

  const refreshCalendarOverlays = useCallback(async () => {
    if (!secondaryEnabled) return;
    await Promise.all([
      refreshPrimaryShifts(),
      ...(needsSecondaryShiftWeek ? [refreshSecondaryShifts()] : []),
      refreshTimeBlocks(),
      refreshAvailabilityBlocks(),
      refreshStaffUnavail(),
      refreshBookingHolds(),
    ]);
  }, [
    refreshPrimaryShifts,
    refreshSecondaryShifts,
    needsSecondaryShiftWeek,
    refreshTimeBlocks,
    refreshAvailabilityBlocks,
    refreshStaffUnavail,
    refreshBookingHolds,
    secondaryEnabled,
  ]);

  useCalendarBookingsRealtime(provider?.id, isFocused, refresh, refreshCalendarOverlays);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const tasks = [refresh()];
      if (secondaryEnabled) {
        tasks.push(refreshCalendarOverlays());
      }
      await Promise.all(tasks);
    } finally {
      setRefreshing(false);
    }
  }, [
    refresh,
    refreshCalendarOverlays,
    secondaryEnabled,
  ]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const operatingHours = useMemo<Record<string, DaySchedule> | null>(() => {
    if (!locations || locations.length === 0) return null;
    // §Calendar-hours: when the user filters by a single location, use that
    // location's schedule verbatim. When "All Locations" is selected, merge
    // every location's operating_hours into the widest open window per day
    // so the overlays and grid range reflect the full business footprint
    // (not just the first location).
    if (locationFilter !== "all") {
      const loc = locations.find((l) => l.id === locationFilter);
      const raw = loc?.operating_hours as unknown;
      if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
      return raw as Record<string, DaySchedule>;
    }
    const merged = mergeOperatingHours(locations.map((l) => l.operating_hours as unknown));
    if (!merged) return null;
    return merged as unknown as Record<string, DaySchedule>;
  }, [locations, locationFilter]);

  // §Provider-audit 2026-04: keep staff-derived memo values before hours
  // computation. iOS JSC reports TDZ access as `TypeError: Cannot convert
  // undefined value to object` inside the hours calculator.
  const staffList = useMemo(() => staff ?? [], [staff]);
  const effectiveShifts = useMemo(() => {
    if (!primaryShifts && !(needsSecondaryShiftWeek && secondaryShifts)) return null;
    return [...(primaryShifts ?? []), ...(needsSecondaryShiftWeek ? (secondaryShifts ?? []) : [])];
  }, [primaryShifts, secondaryShifts, needsSecondaryShiftWeek]);
  const effectiveStaffList = useMemo(
    () => applyEffectiveShiftHours(staffList, effectiveShifts, startDate, endDate, staffFilter),
    [staffList, effectiveShifts, startDate, endDate, staffFilter],
  );
  const staffNameToId = useMemo(() => {
    const map = new Map<string, string>();
    effectiveStaffList.forEach((s) => map.set(s.name, s.id));
    return map;
  }, [effectiveStaffList]);
  const calendarBookings = useMemo(
    () => expandBookingsForCalendar(bookings) as CalendarBooking[],
    [bookings],
  );
  const staffOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [{ label: t("provider.calendarScreen.allStaff"), value: "all" }];
    effectiveStaffList.forEach((s) => opts.push({ label: s.name, value: s.id }));
    return opts;
  }, [effectiveStaffList, t]);

  // All views use operating hours; week/3-day views union hours across visible days.
  const { startHour, endHour } = useMemo(() => {
    const visibleDates: Date[] = [];
    if (viewMode === "day") {
      visibleDates.push(selectedDate);
    } else {
      const count = viewMode === "3day" ? 3 : 7;
      for (let i = 0; i < count; i++) {
        const d = viewMode === "week"
          ? addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), i)
          : addDays(selectedDate, i);
        visibleDates.push(d);
      }
    }
    const staffWorkingHours = (effectiveStaffList ?? [])
      .map((m) => (m?.working_hours ?? null) as WeeklyHours | null);
    const { startHour: sh, endHour: eh } = deriveGridHourWindow({
      visibleDates,
      locationOperatingHours: (operatingHours ?? null) as WeeklyHours | null,
      staffWorkingHours,
      defaultStartHour: Math.max(0, preferences.workdayStartHour - 1),
      defaultEndHour: Math.min(23, preferences.workdayEndHour + 1),
      paddingHours: 1,
      timeZone: provider?.timezone ?? null,
    });
    return { startHour: sh, endHour: eh };
  }, [
    viewMode,
    selectedDate,
    operatingHours,
    effectiveStaffList,
    preferences.workdayStartHour,
    preferences.workdayEndHour,
    provider?.timezone,
  ]);

  const scrollToCurrentTime = useCallback(() => {
    if (!preferences.scrollToNow || hasScrolledToNow.current) return;
    const now = new Date();
    const { h, m } = getHourMinuteForInstantInZone(now, provider?.timezone ?? null);
    // Include the ScrollView contentContainerStyle paddingTop (20px) and GRID_TOP_PADDING (8px)
    // so the scroll position aligns with the actual rendered hour rows.
    // The -1 hour keeps one hour of context visible above the current time indicator.
    const offset = Math.max(
      0,
      20 + GRID_TOP_PADDING + (h - startHour - 1) * SLOT_HEIGHT + (m / 60) * SLOT_HEIGHT,
    );
    scrollRef.current?.scrollTo({ y: offset, animated: false });
    hasScrolledToNow.current = true;
  }, [preferences.scrollToNow, startHour, SLOT_HEIGHT, provider?.timezone]);

  useEffect(() => {
    hasScrolledToNow.current = false;
  }, [startHour, endHour, SLOT_HEIGHT, selectedDate, viewMode, layoutMode, staffFilter]);

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(scrollToCurrentTime);
    }
  }, [loading, scrollToCurrentTime]);

  const gridRows = useMemo(() => {
    const rows: { hour: number; minute: number; label: string }[] = [];
    const inc = preferences.timeIncrementMinutes;
    for (let h = startHour; h <= endHour; h++) {
      for (let m = 0; m < 60; m += inc) {
        if (h === endHour && m > 0) break;
        const hStr = h < 10 ? `0${h}` : `${h}`;
        const mStr = m < 10 ? `0${m}` : `${m}`;
        rows.push({ hour: h, minute: m, label: `${hStr}:${mStr}` });
      }
    }
    return rows;
  }, [startHour, endHour, preferences.timeIncrementMinutes]);

  const rowHeight = (preferences.timeIncrementMinutes / 60) * SLOT_HEIGHT;
  const totalGridHeight = (endHour - startHour) * SLOT_HEIGHT;

  const locationOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [{ label: t("provider.calendarScreen.allLocations"), value: "all" }];
    locations?.forEach((l) => opts.push({ label: l.name, value: l.id }));
    return opts;
  }, [locations, t]);

  const filteredBookings = useMemo(() => {
    let result = calendarBookings;
    const tz = provider?.timezone ?? null;
    const selectedKey = calendarDateKey(selectedDate, tz);
    if (!preferences.showCanceled) {
      result = result.filter((b) => b.status !== "cancelled");
    }
    if (viewMode === "day") {
      result = result.filter((b) => {
        const bDate = parseApiDateTime(b.scheduled_at);
        return bDate ? calendarDateKey(bDate, tz) === selectedKey : false;
      });
    } else if (viewMode === "3day") {
      const visibleKeys = new Set(
        Array.from({ length: 3 }, (_, i) => calendarDateKey(addDays(selectedDate, i), tz)),
      );
      result = result.filter((b) => {
        const bDate = parseApiDateTime(b.scheduled_at);
        if (!bDate) return false;
        return visibleKeys.has(calendarDateKey(bDate, tz));
      });
    }
    if (staffFilter !== "all") {
      result = result.filter((b) =>
        b.calendar_staff_id === staffFilter ||
        (!!b.calendar_staff_name && staffNameToId.get(b.calendar_staff_name) === staffFilter),
      );
    }
    return result;
  }, [calendarBookings, selectedDate, viewMode, staffFilter, staffNameToId, preferences.showCanceled, provider?.timezone]);

  const buildShareText = useCallback(() => {
    return buildScheduleShareBody(
      viewMode,
      selectedDate,
      weekStart,
      filteredBookings,
      provider?.business_name ?? "",
      t,
      provider?.timezone ?? null,
    );
  }, [viewMode, selectedDate, weekStart, filteredBookings, provider?.business_name, provider?.timezone, t]);

  const handleShareSchedule = useCallback(async () => {
    try {
      await Share.share({
        message: buildShareText(),
        title: t("provider.calendarScreen.scheduleShareTitle"),
      });
    } catch {
      /* user dismissed */
    }
  }, [buildShareText, t]);

  const handleCopySchedule = useCallback(async () => {
    await Clipboard.setStringAsync(buildShareText());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [buildShareText]);

  const handleOpenWebCalendar = useCallback(() => {
    const base = APP_URL?.replace(/\/$/, "");
    if (!base) {
      Alert.alert(
        t("provider.calendarScreen.appUrlNotConfiguredTitle"),
        t("provider.calendarScreen.appUrlNotConfiguredMessage"),
      );
      return;
    }
    const d = calendarDateKey(selectedDate, provider?.timezone ?? null);
    pushInAppBrowser(router, `${base}/provider/calendar?date=${encodeURIComponent(d)}`, t("provider.calendarScreen.browserTitle"));
  }, [provider?.timezone, router, selectedDate, t]);

  const openNewBookingFromCalendar = useCallback(() => {
    const selectedStaffId = staffList[selectedStaffIndex]?.id;
    const href = newBookingScreenHrefFromCalendarDay(selectedDate, {
      status: preferences.defaultNewAppointmentStatus,
      timeZone: provider?.timezone ?? null,
      ...(locationFilter !== "all" ? { locationId: locationFilter } : {}),
      ...(staffFilter !== "all" ? { staffId: staffFilter } : selectedStaffId ? { staffId: selectedStaffId } : {}),
    });
    router.push(href as never);
  }, [locationFilter, preferences.defaultNewAppointmentStatus, provider?.timezone, router, selectedDate, selectedStaffIndex, staffFilter, staffList]);

  const openWalkInBookingFromCalendar = useCallback(() => {
    const selectedStaffId = staffList[selectedStaffIndex]?.id;
    router.push(
      newBookingScreenHrefFromCalendarDay(selectedDate, {
        walkIn: true,
        timeZone: provider?.timezone ?? null,
        ...(locationFilter !== "all" ? { locationId: locationFilter } : {}),
        ...(staffFilter !== "all" ? { staffId: staffFilter } : selectedStaffId ? { staffId: selectedStaffId } : {}),
      }) as never,
    );
  }, [locationFilter, provider?.timezone, router, selectedDate, selectedStaffIndex, staffFilter, staffList]);

  const openGroupBookingFromCalendar = useCallback(() => {
    const selectedStaffId = staffList[selectedStaffIndex]?.id;
    const params = new URLSearchParams();
    params.set("default_date", calendarDateKey(selectedDate, provider?.timezone ?? null));
    params.set("default_time", currentWallClockTimeInZone(provider?.timezone ?? null));
    if (staffFilter !== "all") {
      params.set("default_staff_id", staffFilter);
    } else if (selectedStaffId) {
      params.set("default_staff_id", selectedStaffId);
    }
    if (locationFilter !== "all") {
      params.set("default_location_id", locationFilter);
    }
    router.push(`/(app)/(tabs)/more/group-bookings?${params.toString()}` as never);
  }, [locationFilter, provider?.timezone, router, selectedDate, selectedStaffIndex, staffFilter, staffList]);

  const openTimeBlockFormFromCalendar = useCallback(() => {
    const selectedStaffId = staffFilter !== "all" ? staffFilter : staffList[selectedStaffIndex]?.id;
    setTimeBlockForm((prev) => ({
      ...prev,
      staffId: selectedStaffId ?? "",
    }));
    setShowTimeBlockForm(true);
  }, [selectedStaffIndex, staffFilter, staffList]);

  /** Secondary utilities only — primary actions live on `CalendarActionRail`. */
  const openCalendarActionsMenu = useCallback(() => {
    const runShare = () => {
      void handleShareSchedule();
    };
    const runCopy = () => {
      void handleCopySchedule();
    };
    const runMonth = () => setMonthOverviewVisible(true);
    const runWeb = () => handleOpenWebCalendar();
    const runExpress = () => router.push("/(app)/(tabs)/more/express-booking" as never);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t("provider.calendarScreen.cancel"),
            t("provider.calendarScreen.shareSchedule"),
            t("provider.calendarScreen.copySchedule"),
            t("provider.calendarScreen.monthOverview"),
            t("provider.calendarScreen.fullCalendarBrowser"),
            t("provider.calendarScreen.utilityMenu.expressBooking"),
          ],
          cancelButtonIndex: 0,
          title: t("provider.calendarScreen.utilityMenu.title"),
        },
        (idx) => {
          if (idx === 1) runShare();
          else if (idx === 2) runCopy();
          else if (idx === 3) runMonth();
          else if (idx === 4) runWeb();
          else if (idx === 5) runExpress();
        },
      );
    } else {
      Alert.alert(t("provider.calendarScreen.utilityMenu.title"), undefined, [
        { text: t("provider.calendarScreen.shareSchedule"), onPress: runShare },
        { text: t("provider.calendarScreen.copySchedule"), onPress: runCopy },
        { text: t("provider.calendarScreen.monthOverview"), onPress: runMonth },
        { text: t("provider.calendarScreen.fullCalendarBrowser"), onPress: runWeb },
        { text: t("provider.calendarScreen.utilityMenu.expressBooking"), onPress: runExpress },
        { text: t("provider.calendarScreen.close"), style: "cancel" },
      ]);
    }
  }, [
    handleCopySchedule,
    handleOpenWebCalendar,
    handleShareSchedule,
    router,
    t,
  ]);

  const availabilitySegments = useMemo(() => {
    if (!availabilityRaw?.length) return [];
    const normalized = normalizeAvailabilityBlocksToSegments(availabilityRaw, provider?.timezone);
    if (locationFilter !== "all") {
      return normalized.filter((s) => s.location_id == null || s.location_id === locationFilter);
    }
    return normalized;
  }, [availabilityRaw, locationFilter, provider?.timezone]);

  function getCalendarBlocksForDay(
    day: Date,
    blockContext?: { staffColumnId?: string | null } | null,
  ): TimeBlock[] {
    const tz = provider?.timezone ?? null;
    // §Calendar-hours: overlay `.date` values come from the server as the
    // provider's wall-clock date (YYYY-MM-DD in the salon's zone). Format
    // `day` in the same zone so a device in a different tz doesn't filter
    // out overlays when the visible day straddles midnight locally.
    const dayStr = tz ? formatDateKeyInTimeZone(day, tz) : format(day, "yyyy-MM-dd");
    const out: TimeBlock[] = [];
    const columnId = blockContext?.staffColumnId;

    const blockMatchesStaff = (blockStaffId: string | null) => {
      if (columnId === "unassigned") {
        return blockStaffId == null;
      }
      if (columnId != null && columnId !== "") {
        return blockStaffId == null || blockStaffId === columnId;
      }
      if (staffFilter !== "all") {
        return blockStaffId == null || blockStaffId === staffFilter;
      }
      return true;
    };

    // §Calendar-hours: when the user has filtered to a single location,
    // every overlay source must also respect that filter to match the web
    // calendar. Overlays without a `location_id` are treated as location-
    // agnostic (e.g. staff time off that applies everywhere).
    const blockMatchesLocation = (blockLocationId: string | null | undefined) => {
      if (locationFilter === "all") return true;
      if (blockLocationId == null) return true;
      return blockLocationId === locationFilter;
    };

    for (const seg of staffUnavailSegments ?? []) {
      if (seg.date !== dayStr) continue;
      if (!blockMatchesStaff(seg.team_member_id)) continue;
      if (!blockMatchesLocation(seg.location_id)) continue;
      out.push(availabilitySegmentToTimeBlock(seg));
    }

    for (const seg of availabilitySegments) {
      if (seg.date !== dayStr) continue;
      if (!blockMatchesStaff(seg.team_member_id)) continue;
      if (!blockMatchesLocation(seg.location_id)) continue;
      out.push(availabilitySegmentToTimeBlock(seg));
    }

    // Booking-hold ghost slots: active customer checkout sessions that reserve a time slot.
    // Gated behind the "Show booking holds" preference (formerly "Processing & buffer") so
    // providers who find the ghost overlays distracting can hide them.
    if (preferences.showProcessingAndBuffer) {
      for (const seg of bookingHoldSegments ?? []) {
        if (seg.date !== dayStr) continue;
        if (!blockMatchesStaff(seg.team_member_id)) continue;
        if (!blockMatchesLocation(seg.location_id)) continue;
        const stLoose = normalizeCalendarTime(seg.start_time) ?? seg.start_time;
        const etLoose = normalizeCalendarTime(seg.end_time) ?? seg.end_time;
        const range = validateCalendarTimeRange(stLoose, etLoose);
        if (!range.ok) continue;
        out.push({
          id: seg.id,
          staff_id: seg.team_member_id,
          block_type: "booking_hold",
          title: seg.reason?.trim() || t("provider.calendarScreen.bookingHoldTitle"),
          start_time: range.startTime,
          end_time: range.endTime,
          date: seg.date,
          calendar_overlay_kind: "booking_hold",
          hold_id: seg.hold_id ?? seg.id,
          hold_expires_at: seg.hold_expires_at ?? null,
        });
      }
    }

    // Provider-created time blocks (e.g. "Lunch Break", recurring daily blocks) always show
    // regardless of preferences — they are deliberate schedule blocks, not decorative overlays.
    if (expandedApiTimeBlocks.length > 0) {
      for (const tb of expandedApiTimeBlocks) {
        if (tb.date !== dayStr) continue;
        if (!blockMatchesStaff(tb.staff_id)) continue;
        if (
          !blockMatchesLocation(
            (tb as TimeBlock & { location_id?: string | null }).location_id ?? null,
          )
        )
          continue;
        out.push(tb);
      }
    }

    return out;
  }

  const filteredBookingsByDate = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    const tz = provider?.timezone ?? null;
    filteredBookings.forEach((b) => {
      const bDate = parseApiDateTime(b.scheduled_at);
      if (!bDate) return;
      const key = calendarDateKey(bDate, tz);
      const existing = map.get(key);
      if (existing) {
        existing.push(b);
      } else {
        map.set(key, [b]);
      }
    });
    return map;
  }, [filteredBookings, provider?.timezone]);

  const bookingsByStaffId = useMemo(() => {
    const byStaffId = new Map<string, CalendarBooking[]>();
    staffList.forEach((s) => byStaffId.set(s.id, []));
    const unassigned: CalendarBooking[] = [];

    filteredBookings.forEach((b) => {
      const matchedIds = new Set<string>();
      if (b.calendar_staff_id && byStaffId.has(b.calendar_staff_id)) {
        matchedIds.add(b.calendar_staff_id);
      } else if (b.calendar_staff_name) {
        const mappedStaffId = staffNameToId.get(b.calendar_staff_name);
        if (mappedStaffId) matchedIds.add(mappedStaffId);
      }

      if (matchedIds.size === 0) {
        unassigned.push(b);
      } else {
        matchedIds.forEach((staffId) => {
          const list = byStaffId.get(staffId);
          if (list) list.push(b);
        });
      }
    });

    return { byStaffId, unassigned };
  }, [filteredBookings, staffList, staffNameToId]);

  const bookingCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    if (!bookings) return counts;
    const tz = provider?.timezone ?? null;
    let list = bookings;
    if (!preferences.showCanceled) {
      list = list.filter((b) => b.status !== "cancelled");
    }
    list.forEach((b) => {
      const bDate = parseApiDateTime(b.scheduled_at);
      if (!bDate) return;
      const key = calendarDateKey(bDate, tz);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [bookings, provider?.timezone, preferences.showCanceled]);

  const staffColumns = useMemo(() => {
    if (viewMode !== "day") return null;
    if (staffFilter !== "all") return null;
    if (staffList.length <= 1) return null;

    const cols: { staffId: string; staffName: string; staffAvatarUrl?: string | null; bookings: CalendarBooking[] }[] = staffList.map((s) => ({
      staffId: s.id,
      staffName: s.name,
      staffAvatarUrl: s.avatar_url ?? null,
      bookings: bookingsByStaffId.byStaffId.get(s.id) ?? [],
    }));

    if (bookingsByStaffId.unassigned.length > 0) {
      cols.push({
        staffId: "unassigned",
        staffName: t("provider.calendarScreen.staffColumn.unassigned"),
        staffAvatarUrl: null,
        bookings: bookingsByStaffId.unassigned,
      });
    }

    return cols;
  }, [viewMode, staffList, staffFilter, bookingsByStaffId, t]);

  const todayBookingCount = useMemo(
    () => bookingCountsByDate.get(calendarDateKey(selectedDate, provider?.timezone ?? null)) ?? 0,
    [bookingCountsByDate, selectedDate, provider?.timezone],
  );

  const pendingOnSelectedDay = useMemo(
    () => filteredBookings.filter((b) => b.db_status === "pending").length,
    [filteredBookings],
  );

  /** Pending confirmations in the next week — surface on calendar so nothing slips. */
  const pendingAttentionCount = useMemo(() => {
    if (!bookings || !Array.isArray(bookings)) return 0;
    const tz = provider?.timezone ?? null;
    const startKey = providerTodayKey;
    const endExclusive = addCalendarDaysToDateKey(startKey, 8);
    return bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      if (b.db_status !== "pending") return false;
      const d = parseApiDateTime(b.scheduled_at);
      if (!d) return false;
      const bk = calendarDateKey(d, tz);
      return bk >= startKey && bk < endExclusive;
    }).length;
  }, [bookings, provider?.timezone, providerTodayKey]);

  const urgentPendingCount = useMemo(() => {
    if (!bookings || !Array.isArray(bookings)) return 0;
    const now = new Date();
    return bookings.filter((b) => {
      if (b.db_status !== "pending") return false;
      const d = parseApiDateTime(b.scheduled_at);
      if (!d) return false;
      const mins = differenceInMinutes(d, now);
      return mins >= 0 && mins <= 120;
    }).length;
  }, [bookings]);

  const navigateDate = useCallback((direction: number) => {
    const amount = viewMode === "week" ? 7 : viewMode === "3day" ? 3 : 1;
    hasScrolledToNow.current = false;
    setSelectedDate((prev) => (direction > 0 ? addDays(prev, amount) : subDays(prev, amount)));
  }, [viewMode]);

  /** Horizontal day swipe: RNGH pan with failOffsetY so vertical scroll wins; disabled in multi-column staff view (nested horizontal scroll). */
  const swipeDayPanGesture = useMemo(() => {
    const disableSwipe =
      viewMode === "day" &&
      layoutMode === "columns" &&
      staffColumns != null &&
      staffColumns.length > 1;
    return Gesture.Pan()
      .enabled(!disableSwipe)
      .activeOffsetX([-52, 52])
      .failOffsetY([-24, 24])
      .runOnJS(true)
      .onEnd((e) => {
        if (e.translationX > 72) {
          navigateDate(-1);
        } else if (e.translationX < -72) {
          navigateDate(1);
        }
      });
  }, [viewMode, layoutMode, staffColumns, navigateDate]);

  function handleTapSlot(
    hour: number,
    minute: number,
    day?: Date,
    columnStaffId?: string | null,
  ) {
    const targetDay = day ?? selectedDate;
    const dateParam = calendarDateKey(targetDay, provider?.timezone ?? null);
    const timeParam = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    // §Provider-launch (audit 2026-04): when a slot is tapped inside a
    // specific staff column (multi-staff day view), or when a single
    // location filter is active, carry that context forward so the "New
    // booking" screen can pre-select staff/location instead of defaulting
    // to whatever the provider context happened to remember.
    const params = new URLSearchParams({
      date: dateParam,
      time: timeParam,
      status: preferences.defaultNewAppointmentStatus,
    });
    if (columnStaffId && columnStaffId !== "all" && columnStaffId !== "unassigned") {
      params.set("staff_id", columnStaffId);
    } else if (staffFilter !== "all" && staffFilter !== "unassigned") {
      params.set("staff_id", staffFilter);
    }
    if (locationFilter !== "all") {
      params.set("location_id", locationFilter);
    }
    router.push(
      `/(app)/(tabs)/bookings/new?${params.toString()}` as never,
    );
  }

  function handleTapBooking(booking: CalendarBooking) {
    if (
      pendingBookingActionIds.has(booking.id) ||
      pendingRescheduleBookingIds.has(booking.id)
    ) {
      return;
    }
    const groupId = typeof booking.group_booking_id === "string" ? booking.group_booking_id : null;
    if (booking.is_group_booking && groupId) {
      router.push(
        {
          pathname: "/(app)/(tabs)/more/group-bookings",
          params: { open_group_id: groupId },
        } as never,
      );
      return;
    }
    setQuickSheetBooking(booking);
  }

  function handleLongPressBooking(booking: CalendarBooking) {
    if (
      pendingBookingActionIds.has(booking.id) ||
      pendingRescheduleBookingIds.has(booking.id)
    ) {
      return;
    }
    const availableActions = bookingActionTargets(booking);
    const actionLabels = availableActions.map((dbTarget) =>
      getStatusActionLabel(t, dbTargetToPatchStatusField(dbTarget)),
    );
    if (availableActions.length === 0) {
      handleTapBooking(booking);
      return;
    }
    if (Platform.OS === "ios") {
      const sheetOptions = [
        t("provider.calendarScreen.cancel"),
        t("provider.calendarScreen.viewDetails"),
        t("provider.calendarScreen.collectPayment"),
        ...actionLabels,
      ];
      const cancelActionIdx = availableActions.findIndex((key) => key === "cancelled");
      const destructiveButtonIndex = cancelActionIdx >= 0 ? cancelActionIdx + 3 : undefined;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: sheetOptions,
          cancelButtonIndex: 0,
          ...(destructiveButtonIndex !== undefined ? { destructiveButtonIndex } : {}),
          title: `${booking.customers?.full_name ?? t("provider.calendarScreen.bookingLabelFallback")} — ${translateBookingStatusLabel(t, booking.status)}`,
          message: t("provider.calendarScreen.bookingActionsMessage"),
        },
        (buttonIndex) => {
          if (buttonIndex === 0) return;
          if (buttonIndex === 1) {
            handleTapBooking(booking);
            return;
          }
          if (buttonIndex === 2) {
            router.push(
              `/(app)/(tabs)/more/bookings/${booking.calendar_parent_booking_id?.trim() ? booking.calendar_parent_booking_id : booking.id}?focusPayment=1` as never,
            );
            return;
          }
          const dbTarget = availableActions[buttonIndex - 3];
          if (dbTarget) changeBookingStatus(booking.id, dbTarget);
        },
      );
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setAndroidBookingMenu(booking);
    }
  }

  function handleStaffHeaderPress(staffMember: { staffId: string; staffName: string }) {
    if (staffMember.staffId === "unassigned") return;
    const actions = [
      {
        text: t("provider.calendarScreen.staffColumn.viewWeekSchedule"),
        onPress: () => {
          setStaffFilter(staffMember.staffId);
          setViewMode("week");
        },
      },
      {
        text: t("provider.calendarScreen.staffColumn.viewSingle"),
        onPress: () => {
          const idx = staffList.findIndex((s) => s.id === staffMember.staffId);
          if (idx >= 0) {
            setSelectedStaffIndex(idx);
            setLayoutMode("single");
          }
        },
      },
    ];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t("provider.calendarScreen.cancel"), ...actions.map((a) => a.text)],
          cancelButtonIndex: 0,
          title: staffMember.staffName,
        },
        (idx) => {
          if (idx > 0) actions[idx - 1]?.onPress();
        },
      );
    } else {
      Alert.alert(staffMember.staffName, undefined, [
        { text: t("provider.calendarScreen.cancel"), style: "cancel" },
        ...actions.map((a) => ({ text: a.text, onPress: a.onPress })),
      ]);
    }
  }

  async function changeBookingStatus(bookingId: string, dbTarget: string) {
    if (dbTarget === "cancelled") {
      setCancelReasonBookingId(bookingId);
      setCancelReasonText("");
      return;
    }
    await applyBookingStatus(bookingId, dbTarget);
  }

  function optimisticallyUpdateBooking(
    bookingId: string,
    update: Partial<Booking>,
  ): Booking[] | null {
    if (!bookings) return null;
    const next = bookings.map((b) => (b.id === bookingId ? { ...b, ...update } : b));
    mutateBookings(next);
    return bookings;
  }

  async function applyBookingStatus(bookingId: string, dbTarget: string, reason?: string) {
    setPendingBookingActionIds((prev) => new Set(prev).add(bookingId));
    const patchStatus = dbTargetToPatchStatusField(dbTarget);
    const previousBookings = optimisticallyUpdateBooking(
      bookingId,
      optimisticBookingFieldsForDbTarget(dbTarget),
    );
    try {
      if (dbTarget === "completed") {
        const { error } = await postBookingAction(`/api/provider/bookings/${bookingId}/complete-service`, {});
        if (error) {
          if (previousBookings) mutateBookings(previousBookings);
          Alert.alert(t("provider.calendarScreen.mutations.completeServiceErrorTitle"), error);
          await refresh();
          return;
        }
        await refresh();
        return;
      }
      if (dbTarget === "in_progress") {
        const { error } = await postBookingAction(`/api/provider/bookings/${bookingId}/start-service`, {});
        if (error) {
          if (previousBookings) mutateBookings(previousBookings);
          Alert.alert(t("provider.calendarScreen.mutations.startServiceErrorTitle"), error);
          await refresh();
          return;
        }
        await refresh();
        return;
      }
      const body: Record<string, unknown> = { status: patchStatus };
      if (dbTarget === "cancelled" && reason) body.cancellation_reason = reason;
      const { error } = await patchBooking(`/api/provider/bookings/${bookingId}`, body);
      if (error) {
        if (previousBookings) mutateBookings(previousBookings);
        Alert.alert(t("provider.calendarScreen.mutations.updateBookingErrorTitle"), error);
        await refresh();
        return;
      }
      await refresh();
    } finally {
      setPendingBookingActionIds((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
    }
  }

  /** Drag-and-drop: compute new time and optionally staff from drop position, check availability, then PATCH */
  async function handleBookingDrop(
    booking: CalendarBooking,
    absoluteX: number,
    absoluteY: number,
    targetStaffColumns: { staffId: string; staffName: string; bookings: CalendarBooking[] }[] | null,
    targetDayColumnWidth: number,
    targetDay: Date,
  ) {
    gridContainerRef.current?.measureInWindow((gridX, gridY) => {
      // Vertical: gridContainer is inside the vertically-scrolled parent, so measureInWindow
      // already moves with contentOffset.y — do not add scrollY again.
      // In multi-staff column day view, gridContainerRef sits ABOVE the per-staff headers;
      // subtract their measured height so the drop maps to the actual time rows below.
      const headerOffset = targetStaffColumns && targetStaffColumns.length > 1 ? staffColHeaderHeight : 0;
      const contentY = absoluteY - gridY - headerOffset;
      // Horizontal: staff/3-day columns scroll inside a nested horizontal ScrollView; the
      // outer grid row's window X does not move with that scroll — add contentOffset.x.
      const scrollX = scrollOffsetRef.current.x;
      const contentX = scrollX + (absoluteX - gridX);

      const { hour: hourClamp, minute: clampedMinute } = contentYOffsetToHourMinute({
        contentY,
        gridTopPadding: GRID_TOP_PADDING,
        startHour,
        endHour,
        slotHeightPerHour: SLOT_HEIGHT,
        timeIncrementMinutes: preferences.timeIncrementMinutes,
      });
      // §Release-audit 2026-04: build a timezone-aware ISO using the
      // **provider's** IANA zone (e.g. Africa/Johannesburg), not the
      // device's. Previously we used `naive.getTimezoneOffset()` which
      // encoded the phone's zone into the ISO — providers on travel or
      // running a business in a different zone than their device would
      // have bookings persisted at the wrong UTC instant, manifesting as
      // "booking moved to 3am" after a drag. The helper falls back to the
      // device zone if the provider record has no timezone yet, preserving
      // the pre-fix behaviour for that legacy case.
      const naiveDateStr = calendarDateKey(targetDay, provider?.timezone ?? null);
      const naiveTimeStr = `${String(hourClamp).padStart(2, "0")}:${String(clampedMinute).padStart(2, "0")}`;
      const providerTimezone = provider?.timezone ?? null;
      const newScheduledAt = buildZonedIsoForWallClock(
        naiveDateStr,
        naiveTimeStr,
        providerTimezone,
      );

      let newStaffId: string | undefined = booking.services?.[0]?.staff_id ?? undefined;
      if (targetStaffColumns && targetStaffColumns.length > 0 && targetDayColumnWidth > 0) {
        const columnContentX = contentX - (TIME_COL_WIDTH + 8);
        const columnIndex = Math.max(
          0,
          Math.min(targetStaffColumns.length - 1, Math.floor(columnContentX / targetDayColumnWidth)),
        );
        const col = targetStaffColumns[columnIndex];
        newStaffId = col?.staffId === "unassigned" ? undefined : (col?.staffId ?? newStaffId);
      }

      const serviceDuration = (booking.services ?? []).reduce((sum, svc) => {
        const minutes = Number(svc.duration_minutes);
        return sum + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0);
      }, 0);
      const bookingDuration = Number((booking as Booking & { duration_minutes?: number }).duration_minutes);
      const durationMinutes =
        serviceDuration > 0
          ? serviceDuration
          : Number.isFinite(bookingDuration) && bookingDuration > 0
            ? bookingDuration
            : 60;
      const staffIdsParam = newStaffId ? newStaffId : "";
      // §Provider-launch (audit 2026-04): include location_id when a
      // specific location filter is active so multi-location providers
      // get the correct overlap detection — the check-availability API
      // supports it but the mobile drag flow was omitting the param,
      // leading to false "no conflict" reports across locations.
      const locationIdForCheck =
        (booking as Booking & { location_id?: string | null }).location_id ??
        (locationFilter !== "all" ? locationFilter : null);
      const dragOfferingIds = Array.from(
        new Set(
          (booking.services ?? []).map((s) => s.offering_id).filter((x): x is string => !!x),
        ),
      );
      const dragAtHome = booking.location_type === "at_home";
      let checkUrl =
        `/api/provider/bookings/check-availability?scheduled_at=${encodeURIComponent(newScheduledAt)}&duration_minutes=${durationMinutes}` +
        `&exclude_booking_id=${encodeURIComponent(booking.id)}` +
        (staffIdsParam ? `&staff_ids=${encodeURIComponent(staffIdsParam)}` : "") +
        (locationIdForCheck ? `&location_id=${encodeURIComponent(locationIdForCheck)}` : "");
      if (dragOfferingIds.length > 0) {
        checkUrl += `&offering_ids=${encodeURIComponent(dragOfferingIds.join(","))}`;
      }
      checkUrl += `&mode=${encodeURIComponent(dragAtHome ? "mobile" : "salon")}&travel_buffer=${encodeURIComponent(dragAtHome ? "30" : "0")}`;

      (async () => {
        setPendingRescheduleBookingIds((prev) => new Set(prev).add(booking.id));
        try {
          const res = await api.get<{ available?: boolean; conflicts?: string[] }>(checkUrl);
          if (res.error) {
            Alert.alert(
              t("provider.calendarScreen.mutations.moveAppointmentErrorTitle"),
              res.error.message ?? t("provider.calendarScreen.mutations.moveAppointmentGeneric"),
            );
            return;
          }
          if (res.data?.available !== true) {
            Alert.alert(
              res.data?.available === false
                ? t("provider.calendarScreen.mutations.slotUnavailableTitle")
                : t("provider.calendarScreen.mutations.moveAppointmentErrorTitle"),
              res.data?.available === false
                ? res.data?.conflicts?.join("\n") ?? t("provider.calendarScreen.mutations.slotOverlapBody")
                : t("provider.calendarScreen.mutations.moveAppointmentGeneric"),
            );
            return;
          }
          const payload: { scheduled_at: string; staff_id?: string | null } = { scheduled_at: newScheduledAt };
          if (newStaffId !== undefined) payload.staff_id = newStaffId || null;
          const optimisticUpdate: Partial<Booking> = { scheduled_at: newScheduledAt };
          if (newStaffId !== undefined) {
            optimisticUpdate.services = (booking.services ?? []).map((svc) => ({
              ...svc,
              staff_id: newStaffId || null,
            }));
          }
          const previousBookings = optimisticallyUpdateBooking(booking.id, optimisticUpdate);
          const { error } = await patchBooking(`/api/provider/bookings/${booking.id}`, payload);
          if (error) {
            if (previousBookings) mutateBookings(previousBookings);
            Alert.alert(t("provider.calendarScreen.mutations.moveAppointmentErrorTitle"), error);
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await refresh();
        } finally {
          setPendingRescheduleBookingIds((prev) => {
            const next = new Set(prev);
            next.delete(booking.id);
            return next;
          });
        }
      })();
    });
  }

  /* ─── 3-day view days ─── */
  const threeDays = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => addDays(selectedDate, i));
  }, [selectedDate]);

  /* ─── Time block creation ─── */
  async function handleCreateTimeBlock() {
    const range = validateCalendarTimeRange(timeBlockForm.startTime, timeBlockForm.endTime);
    if (!range.ok) {
      Alert.alert(
        range.reason === "format"
          ? t("provider.calendarScreen.overlayMenu.invalidTimeTitle")
          : t("provider.calendarScreen.overlayMenu.invalidRangeTitle"),
        range.reason === "format"
          ? t("provider.calendarScreen.overlayMenu.invalidTimeMessage")
          : t("provider.calendarScreen.overlayMenu.invalidRangeMessage"),
      );
      return;
    }
    const { error } = await createTimeBlock("/api/provider/time-blocks", {
      name: timeBlockForm.title.trim() || capitalizeFirst(timeBlockForm.type),
      start_time: range.startTime,
      end_time: range.endTime,
      date: dateStr,
      staff_id: timeBlockForm.staffId ? timeBlockForm.staffId : null,
    });
    if (error) {
      Alert.alert(t("provider.calendarScreen.overlayMenu.saveTimeBlockErrorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowTimeBlockForm(false);
    setTimeBlockForm({ type: "break", title: "", startTime: "12:00", endTime: "13:00", staffId: "" });
    refreshTimeBlocks();
  }

  function openOverlayBlockMenu(block: TimeBlock) {
    if (block.calendar_overlay_kind === "booking_hold") {
      // §Provider-launch: booking holds are transient — they expire once
      // the customer finishes checkout (or times out). Don't let providers
      // "edit" or "delete" them from the calendar; they'd collide with the
      // checkout finalising flow.
      const expiresText = block.hold_expires_at
        ? t("provider.calendarScreen.overlayMenu.bookingHoldExpires", {
            time: formatTimeInZone(block.hold_expires_at, provider?.timezone ?? null),
          })
        : "";
      Alert.alert(
        t("provider.calendarScreen.overlayMenu.bookingHoldTitle"),
        t("provider.calendarScreen.overlayMenu.bookingHoldMessage", { expires: expiresText }),
      );
      return;
    }
    if (block.calendar_overlay_kind === "staff_off") {
      Alert.alert(
        t("provider.calendarScreen.overlayMenu.staffOffTitle"),
        t("provider.calendarScreen.overlayMenu.staffOffMessage"),
      );
      return;
    }
    if (block.calendar_overlay_kind === "availability" && block.availability_block_id) {
      Alert.alert(
        t("provider.calendarScreen.overlayMenu.availabilityBlockTitle", {
          type: translateAvailabilityBlockType(t, block.block_type),
          start: block.start_time,
          end: block.end_time,
        }),
        block.title,
        [
          {
            text: t("provider.calendarScreen.overlayMenu.edit"),
            onPress: () =>
              setAvailabilityEdit({
                id: block.availability_block_id!,
                block_type: block.block_type as "unavailable" | "break" | "maintenance",
                date: block.date,
                start_time: block.start_time.slice(0, 5),
                end_time: block.end_time.slice(0, 5),
                staff_id: block.staff_id,
              }),
          },
          {
            text: t("provider.calendarScreen.overlayMenu.delete"),
            style: "destructive",
            onPress: () => {
              Alert.alert(t("provider.calendarScreen.overlayMenu.removeBlockTitle"), t("provider.calendarScreen.overlayMenu.removeBlockMessage"), [
                { text: t("provider.calendarScreen.cancel"), style: "cancel" },
                {
                  text: t("provider.calendarScreen.overlayMenu.delete"),
                  style: "destructive",
                  onPress: async () => {
                    const { error } = await deleteAvailabilityBlock(
                      `/api/provider/availability-blocks/${block.availability_block_id}`,
                    );
                    if (error) {
                      Alert.alert(t("provider.calendarScreen.overlayMenu.removeBlockErrorTitle"), error);
                      return;
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    refreshAvailabilityBlocks();
                  },
                },
              ]);
            },
          },
          { text: t("provider.calendarScreen.cancel"), style: "cancel" },
        ],
      );
      return;
    }
    if (block.calendar_overlay_kind === "time_block") {
      Alert.alert(t("provider.calendarScreen.overlayMenu.timeBlockTitle"), block.title, [
        {
          text: t("provider.calendarScreen.overlayMenu.manage"),
          onPress: () => {
            const params = new URLSearchParams();
            params.set("date", block.date);
            if (block.staff_id) params.set("staff_id", block.staff_id);
            router.push(`/(app)/(tabs)/more/time-blocks?${params.toString()}` as never);
          },
        },
        {
          text: t("provider.calendarScreen.overlayMenu.delete"),
          style: "destructive",
          onPress: () => {
            Alert.alert(t("provider.calendarScreen.overlayMenu.removeTimeBlockTitle"), "", [
              { text: t("provider.calendarScreen.cancel"), style: "cancel" },
              {
                text: t("provider.calendarScreen.overlayMenu.delete"),
                style: "destructive",
                onPress: async () => {
                  const recordId = resolveTimeBlockRecordId(block);
                  const { error } = await deleteCalendarTimeBlock(`/api/provider/time-blocks/${recordId}`);
                  if (error) {
                    Alert.alert(t("provider.calendarScreen.overlayMenu.removeTimeBlockErrorTitle"), error);
                    return;
                  }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  refreshTimeBlocks();
                },
              },
            ]);
          },
        },
        { text: t("provider.calendarScreen.cancel"), style: "cancel" },
      ]);
    }
  }

  async function handleSaveAvailabilityEdit() {
    if (!availabilityEdit) return;
    const timePattern = /^\d{2}:\d{2}$/;
    if (!timePattern.test(availabilityEdit.start_time) || !timePattern.test(availabilityEdit.end_time)) {
      Alert.alert(t("provider.calendarScreen.overlayMenu.invalidTimeTitle"), t("provider.calendarScreen.overlayMenu.invalidTimeMessage"));
      return;
    }
    const providerTimezone = provider?.timezone ?? null;
    const startIso = buildZonedIsoForWallClock(availabilityEdit.date, availabilityEdit.start_time, providerTimezone);
    const endIso = buildZonedIsoForWallClock(availabilityEdit.date, availabilityEdit.end_time, providerTimezone);
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      Alert.alert(t("provider.calendarScreen.overlayMenu.invalidTimeTitle"), t("provider.calendarScreen.overlayMenu.invalidTimeMessage"));
      return;
    }
    if (end.getTime() <= start.getTime()) {
      Alert.alert(t("provider.calendarScreen.overlayMenu.invalidRangeTitle"), t("provider.calendarScreen.overlayMenu.invalidRangeMessage"));
      return;
    }
    const { error } = await updateAvailabilityBlock(`/api/provider/availability-blocks/${availabilityEdit.id}`, {
      block_type: availabilityEdit.block_type,
      start_at: startIso,
      end_at: endIso,
      staff_id: availabilityEdit.staff_id,
    });
    if (error) {
      Alert.alert(t("provider.calendarScreen.overlayMenu.saveBlockErrorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAvailabilityEdit(null);
    refreshAvailabilityBlocks();
  }

  const waitingCount = waitingRoom?.count ?? 0;

  const { width: screenWidth } = useWindowDimensions();
  const TIME_COL_WIDTH = isTablet ? TIME_COL_WIDTH_TABLET : TIME_COL_WIDTH_PHONE;
  const MIN_STAFF_COL_WIDTH = isTablet ? MIN_STAFF_COL_WIDTH_TABLET : MIN_STAFF_COL_WIDTH_PHONE;
  const MIN_WEEK_COL_WIDTH = isTablet ? MIN_WEEK_COL_WIDTH_TABLET : MIN_WEEK_COL_WIDTH_PHONE;
  const horizontalPadding = isTablet ? screenPadding * 2 : 8;
  const contentWidth = isTablet ? screenWidth - horizontalPadding : screenWidth;
  const availableWidth = contentWidth - TIME_COL_WIDTH - (isTablet ? 24 : 16);

  const dayColumnWidth = useMemo(() => {
    if (viewMode === "week") return Math.max(MIN_WEEK_COL_WIDTH, availableWidth / 7);
    if (layoutMode === "single") return availableWidth;
    if (staffColumns && staffColumns.length > 1) {
      return MIN_STAFF_COL_WIDTH;
    }
    return availableWidth;
  }, [viewMode, staffColumns, availableWidth, layoutMode, MIN_STAFF_COL_WIDTH, MIN_WEEK_COL_WIDTH]);

  const staffScrollContentWidth = staffColumns && staffColumns.length > 1
    ? staffColumns.length * dayColumnWidth
    : undefined;

  const calendarBookingPreferences = useMemo(
    () => ({
      highContrast: preferences.highContrast,
      compactMode: preferences.compactMode,
      showAppointmentIcons: preferences.showAppointmentIcons,
      showPrices: preferences.showPrices,
      showClientPhone: preferences.showClientPhone,
    }),
    [
      preferences.highContrast,
      preferences.compactMode,
      preferences.showAppointmentIcons,
      preferences.showPrices,
      preferences.showClientPhone,
    ],
  );

  /* ═══════════════ Render a booking block (optional drag when dropContext provided) ═══════════════ */

  function renderBookingBlock(
    booking: CalendarBooking,
    colWidth: number,
    day: Date,
    dropContext?: CalendarBookingDropContext | null,
  ) {
    const walkInLabel = t("provider.calendarScreen.walkIn");
    const top = GRID_TOP_PADDING + getTopOffset(booking.scheduled_at, startHour, SLOT_HEIGHT, provider?.timezone ?? null);
    const height = getBlockHeight(booking, SLOT_HEIGHT, preferences.compactMode);
    const colors = getBlockColors(booking, preferences.colorBy, staffList);
    const paymentLabel = getCalendarPaymentLabel(booking, t);
    const paymentNeedsAction = paymentNeedsAttention(booking);
    const isNew = isNewBooking(booking);
    return (
      <CalendarBookingBlock
        key={booking.calendar_item_id}
        booking={booking}
        colWidth={colWidth}
        dropContext={dropContext}
        viewMode={viewMode}
        top={top}
        blockHeight={height}
        colors={colors}
        providerTimezone={provider?.timezone ?? null}
        walkInLabel={walkInLabel}
        pendingBookingActionIds={pendingBookingActionIds}
        pendingRescheduleBookingIds={pendingRescheduleBookingIds}
        draggingBooking={draggingBooking}
        preferences={calendarBookingPreferences}
        paymentLabel={paymentLabel}
        paymentNeedsAction={paymentNeedsAction}
        isNew={isNew}
        isHighlighted={
          highlightedBookingId === booking.id ||
          highlightedBookingId === booking.calendar_parent_booking_id ||
          highlightedBookingId === booking.group_booking_id
        }
        onTap={() => handleTapBooking(booking)}
        onLongPress={() => handleLongPressBooking(booking)}
        onDrop={(ax, ay) =>
          handleBookingDrop(
            booking,
            ax,
            ay,
            dropContext?.staffColumns ?? null,
            dropContext?.dayColumnWidth ?? colWidth,
            dropContext?.day ?? day,
          )
        }
        draggingRef={draggingRef}
        draggingBookingIdRef={draggingBookingIdRef}
        setDraggingBooking={setDraggingBooking}
        setDragPosition={setDragPosition}
        t={t}
        translateBookingStatusLabel={translateBookingStatusLabel}
      />
    );
  }

  /* ═══════════════ Operating hours shading (ranges → CalendarDayGridColumn) ═══════════════ */

  function getOpenRangesForCalendarShading(
    day: Date,
    blockContext?: { staffColumnId?: string | null } | null,
  ): MinuteRange[] | null {
    let schedule: WeeklyHours | null = null;
    const columnStaffId = blockContext?.staffColumnId;

    if (columnStaffId && columnStaffId !== "unassigned") {
      schedule = (effectiveStaffList.find((s) => s.id === columnStaffId)?.working_hours ?? null) as WeeklyHours | null;
    } else if (staffFilter !== "all") {
      schedule = (effectiveStaffList.find((s) => s.id === staffFilter)?.working_hours ?? null) as WeeklyHours | null;
    } else if (effectiveStaffList.some((s) => s.working_hours && Object.keys(s.working_hours).length > 0)) {
      schedule = mergeStaffWorkingHours(
        effectiveStaffList.map((s) => ({ working_hours: s.working_hours as WeeklyHours | null | undefined })),
      ) as WeeklyHours | null;
    }

    const staffRanges = schedule
      ? dayMinuteRanges(day, schedule, provider?.timezone ?? null)
      : null;
    if (staffRanges) return staffRanges;
    if (!operatingHours) return null;
    return dayMinuteRanges(
      day,
      operatingHours as WeeklyHours,
      provider?.timezone ?? null,
    );
  }

  /* ═══════════════ Render a day grid column ═══════════════ */

  function renderDayGrid(
    day: Date,
    bookingsForDay: CalendarBooking[],
    colWidth: number,
    showTimeIndicator = true,
    dropContext?: CalendarBookingDropContext | null,
    blockContext?: { staffColumnId?: string | null } | null,
  ) {
    const dayBlocks = getCalendarBlocksForDay(day, blockContext);
    const closedRanges = getOpenRangesForCalendarShading(day, blockContext);
    const closedHoursShadeBg = preferences.highContrast ? Colors.gray[700] : Colors.gray[200];
    return (
      <CalendarDayGridColumn
        day={day}
        colWidth={colWidth}
        totalGridHeight={totalGridHeight}
        gridTopPadding={GRID_TOP_PADDING}
        rowHeight={rowHeight}
        slotHeight={SLOT_HEIGHT}
        startHour={startHour}
        endHour={endHour}
        quarterHeight={QUARTER_HEIGHT}
        gridRows={gridRows}
        closedRanges={closedRanges}
        closedHoursShadeBg={closedHoursShadeBg}
        overlayBlocks={dayBlocks}
        bookingsForDay={bookingsForDay}
        renderBookingBlock={(b) => renderBookingBlock(b, colWidth, day, dropContext)}
        onSlotPress={(hour, minute) => handleTapSlot(hour, minute, day, blockContext?.staffColumnId ?? null)}
        onOverlayBlockPress={(block) => openOverlayBlockMenu(block as TimeBlock)}
        getOverlayAccessibilityLabel={(tb) =>
          t("provider.calendarScreen.overlayBlockA11y", {
            type: translateOverlayBlockType(t, tb.block_type),
            start: tb.start_time,
            end: tb.end_time,
          })
        }
        slotAccessibilityLabel={(row, d) =>
          t("provider.calendarScreen.grid.slotBookA11y", {
            time: row.label,
            day: format(d, "EEEE, MMMM d"),
          })
        }
        showEmptyDayHint={
          viewMode === "day" && bookingsForDay.length === 0 && dayBlocks.length === 0 && !loading
        }
        emptyDayHint={t("provider.calendarScreen.grid.emptyDayHint")}
        showTimeIndicator={showTimeIndicator}
        viewMode={viewMode}
        isTodayInBusinessZone={isProviderToday(day)}
        providerTimezone={provider?.timezone ?? null}
        currentTimeA11yPrefix={t("provider.calendarScreen.currentTimeA11yPrefix")}
      />
    );
  }

  /* ═══════════════ Single staff view for day mode ═══════════════ */
  const selectedStaff = staffList[selectedStaffIndex] ?? null;
  const singleStaffBookings = useMemo(() => {
    if (!selectedStaff) return filteredBookings;
    return bookingsByStaffId.byStaffId.get(selectedStaff.id) ?? [];
  }, [selectedStaff, filteredBookings, bookingsByStaffId]);

  /* ================================================================ */
  /*  JSX                                                             */
  /* ================================================================ */

  const tabletContentStyle = isTablet
    ? { width: "100%" as const, paddingHorizontal: screenPadding }
    : undefined;

  return (
    <ScreenContainer scrollable={false} noPadding>
      {/* ─── Dark Header (matches web portal) ─── */}
      <View style={{ backgroundColor: DARK_HEADER, paddingBottom: 8, paddingTop: 8 }}>
        <View style={tabletContentStyle}>
        {/* Date navigation row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}>
          <TouchableOpacity
            onPress={() => navigateDate(-1)}
            hitSlop={8}
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
            accessibilityLabel={viewMode === "week" ? t("provider.calendarScreen.dateNav.prevWeek") : t("provider.calendarScreen.dateNav.prevDay")}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setDatePickerVisible(true)}
            style={{ flexDirection: "row", alignItems: "center" }}
            accessibilityLabel={t("provider.calendarScreen.dateNav.jumpToDate")}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.white }}>
              {viewMode === "week"
                ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d")}`
                : viewMode === "3day"
                ? `${format(selectedDate, "MMM d")} – ${format(addDays(selectedDate, 2), "MMM d")}`
                : format(selectedDate, "EEE, MMM d")}
            </Text>
            {todayBookingCount > 0 && viewMode === "day" && (
              <View style={{ marginLeft: 8, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: TEAL_ACCENT }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: DARK_HEADER }}>
                  {todayBookingCount}
                </Text>
              </View>
            )}
            {pendingOnSelectedDay > 0 && viewMode === "day" && (
              <View style={{ marginLeft: 6, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#F59E0B" }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>
                  {t("provider.calendarScreen.pendingBadge", { count: pendingOnSelectedDay })}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={openCalendarActionsMenu}
              hitSlop={8}
              style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", marginRight: 4 }}
              accessibilityLabel={t("provider.calendarScreen.utilityMenu.title")}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPrefsVisible(true)}
              hitSlop={8}
              style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", marginRight: 8 }}
              accessibilityLabel={t("provider.calendarScreen.preferencesA11y")}
            >
              <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigateDate(1)}
              hitSlop={8}
              style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
              accessibilityLabel={viewMode === "week" ? t("provider.calendarScreen.dateNav.nextWeek") : t("provider.calendarScreen.dateNav.nextDay")}
            >
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* View toggle + Today */}
        <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", borderRadius: 8, padding: 2, backgroundColor: "rgba(255,255,255,0.1)" }}>
            {([
              { key: "day" as ViewMode, label: t("provider.calendarScreen.viewModes.day") },
              { key: "3day" as ViewMode, label: t("provider.calendarScreen.viewModes.threeDay") },
              { key: "week" as ViewMode, label: t("provider.calendarScreen.viewModes.week") },
            ]).map((v) => (
              <TouchableOpacity
                key={v.key}
                style={{ borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: viewMode === v.key ? Colors.white : "transparent" }}
                onPress={() => setViewMode(v.key)}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: viewMode === v.key ? Colors.gray[900] : "rgba(255,255,255,0.7)" }}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {waitingCount > 0 && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(239,68,68,0.2)", marginRight: 8 }}
                onPress={() => router.push("/(app)/(tabs)/more/waiting-room" as never)}
                accessibilityLabel={t("provider.calendarScreen.actionRail.waitingCountSub", { count: waitingCount })}
              >
                <Ionicons name="people" size={12} color="#fca5a5" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#fca5a5" }}>{waitingCount}</Text>
              </TouchableOpacity>
            )}
            {preferences.colorBy !== "status" && (
              <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(79,209,197,0.2)", marginRight: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "500", color: TEAL_ACCENT }}>
                  {preferences.colorBy === "service"
                    ? t("provider.calendarScreen.colorByChip.service")
                    : t("provider.calendarScreen.colorByChip.staff")}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setShowLegend(true)}
              style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.1)", marginRight: 8 }}
              accessibilityLabel={t("provider.calendarScreen.colorLegend.a11y")}
            >
              <Ionicons name="color-palette-outline" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: TEAL_ACCENT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
              onPress={() => {
                const tz = provider?.timezone ?? null;
                const todayKey = formatDateKeyInTimeZone(new Date(), tz);
                const next = parseCalendarDateParam(todayKey, tz) ?? new Date();
                setSelectedDate(next);
                hasScrolledToNow.current = false;
              }}
              accessibilityLabel={t("provider.calendarScreen.dateNav.today")}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: DARK_HEADER }}>{t("provider.calendarScreen.dateNav.today")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scrollable date strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, paddingHorizontal: 8 }} contentContainerStyle={{ flexDirection: "row" }}>
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isProviderToday(day);
            const count = bookingCountsByDate.get(calendarDateKey(day, provider?.timezone ?? null)) ?? 0;
            return (
              <TouchableOpacity
                key={day.toISOString()}
                // §UI-audit 2026-04: date chip is the primary navigation
                // on calendar — min tap target now 44×44, weekday label
                // text bumped to 11px, contrast raised from 0.6→0.82 for
                // WCAG AA against DARK_HEADER. "Today" gets a brighter
                // 0.6 ring so it's readable without being selected.
                style={[
                  { alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 6, minWidth: 52, minHeight: 56 },
                  isSelected
                    ? { backgroundColor: TEAL_ACCENT }
                    : isToday
                      ? { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)" }
                      : {},
                ]}
                onPress={() => { setSelectedDate(day); if (viewMode === "week") setViewMode("day"); hasScrolledToNow.current = false; }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: isSelected ? DARK_HEADER : "rgba(255,255,255,0.82)" }}>
                  {format(day, "EEE")}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "700", color: isSelected ? DARK_HEADER : Colors.white }}>
                  {format(day, "d")}
                </Text>
                {count > 0 && !isSelected && (
                  <View style={{ marginTop: 4, height: 6, width: 6, borderRadius: 3, backgroundColor: TEAL_ACCENT }} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        </View>
      </View>

      {(pendingAttentionCount > 0 || urgentPendingCount > 0) && (
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/waiting-room" as never)}
          activeOpacity={0.85}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: isTablet ? screenPadding : 12,
            marginTop: 8,
            marginBottom: 4,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            backgroundColor: urgentPendingCount > 0 ? "#FEF2F2" : "#FFFBEB",
            borderWidth: 1,
            borderColor: urgentPendingCount > 0 ? "#FECACA" : "#FDE68A",
          }}
          accessibilityRole="button"
          accessibilityLabel={t("provider.calendarScreen.pendingBanner.accessibility", {
            count: pendingAttentionCount,
          })}
        >
          <Ionicons name={urgentPendingCount > 0 ? "flash" : "alert-circle"} size={22} color={urgentPendingCount > 0 ? "#DC2626" : "#D97706"} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: urgentPendingCount > 0 ? "#991B1B" : "#78350F" }}>
              {urgentPendingCount > 0
                ? t("provider.calendarScreen.pendingBanner.urgentTitle", { count: urgentPendingCount })
                : pendingAttentionCount === 1
                  ? t("provider.calendarScreen.pendingBanner.pendingTitleSingular")
                  : t("provider.calendarScreen.pendingBanner.pendingTitlePlural", {
                      count: pendingAttentionCount,
                    })}
            </Text>
            <Text style={{ fontSize: 12, color: urgentPendingCount > 0 ? "#B91C1C" : "#92400E", marginTop: 2 }}>
              {t("provider.calendarScreen.pendingBanner.subtitle")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={urgentPendingCount > 0 ? "#DC2626" : "#D97706"} />
        </TouchableOpacity>
      )}

      <CalendarActionRail
        isTablet={isTablet}
        screenPadding={screenPadding}
        waitingCount={waitingCount}
        onNewAppointment={openNewBookingFromCalendar}
        onWalkIn={openWalkInBookingFromCalendar}
        onGroup={openGroupBookingFromCalendar}
        onSale={() => router.push("/(app)/(tabs)/more/walk-in-sale" as never)}
        onRecurring={() => router.push("/(app)/(tabs)/more/recurring-appointments" as never)}
        onBlock={openTimeBlockFormFromCalendar}
        onWaiting={() => router.push("/(app)/(tabs)/more/waiting-room" as never)}
        t={t}
      />

      {/* ─── Layout Toggle + Staff Filter (matches web "Staff View" bar) ─── */}
      {viewMode === "day" && staffList.length > 1 && staffFilter === "all" && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.gray[200], backgroundColor: Colors.white, paddingVertical: 8, ...(isTablet ? { paddingHorizontal: screenPadding } : { paddingHorizontal: 12 }) }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="people-outline" size={14} color="#6366f1" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: Colors.gray[900] }}>{t("provider.calendarScreen.staffViewStrip.title")}</Text>
            </View>
            <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[100], padding: 2 }}>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, marginRight: 4, backgroundColor: layoutMode === "columns" ? Colors.white : "transparent", elevation: layoutMode === "columns" ? 1 : 0, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
                onPress={() => setLayoutMode("columns")}
              >
                <Ionicons name="grid-outline" size={12} color={layoutMode === "columns" ? "#111" : "#9ca3af"} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: layoutMode === "columns" ? Colors.gray[900] : Colors.gray[500] }}>{t("provider.calendarScreen.staffViewStrip.all")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: layoutMode === "single" ? Colors.white : "transparent", elevation: layoutMode === "single" ? 1 : 0, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
                onPress={() => setLayoutMode("single")}
              >
                <Ionicons name="person-outline" size={12} color={layoutMode === "single" ? "#111" : "#9ca3af"} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: layoutMode === "single" ? Colors.gray[900] : Colors.gray[500] }}>{t("provider.calendarScreen.staffViewStrip.single")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Single mode: staff tabs */}
          {layoutMode === "single" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ flexDirection: "row" }}>
              {staffList.map((member, idx) => {
                const count = bookingsByStaffId.byStaffId.get(member.id)?.length ?? 0;
                const isActive = selectedStaffIndex === idx;
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[ { flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 }, isActive ? { backgroundColor: DARK_HEADER } : { backgroundColor: Colors.gray[100] } ]}
                    onPress={() => setSelectedStaffIndex(idx)}
                  >
                    <View style={{ marginRight: 8, transform: [{ scale: 0.75 }] }}>
                      <Avatar name={member.name} imageUrl={member.avatar_url ?? null} size="sm" />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: isActive ? Colors.white : Colors.gray[700], marginRight: count > 0 ? 8 : 0 }}>
                      {member.name.split(" ")[0]}
                    </Text>
                    {count > 0 && (
                      <View style={[ { borderRadius: 9999, paddingHorizontal: 6, paddingVertical: 2 }, isActive ? { backgroundColor: TEAL_ACCENT } : { backgroundColor: "#4f46e6" } ]}>
                        <Text style={[ { fontSize: 9, fontWeight: "700" }, isActive ? { color: DARK_HEADER } : { color: Colors.white } ]}>
                          {count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* ─── Staff/Location Filters (when not in multi-column mode or in week/3day view) ─── */}
      {(viewMode === "week" || viewMode === "3day" || staffList.length <= 1 || staffFilter !== "all") && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.gray[100], backgroundColor: Colors.white, paddingVertical: 8, paddingHorizontal: screenPadding }}>
          {staffOptions.length > 1 && (
            <FilterChipGroup options={staffOptions} selected={staffFilter} onSelect={setStaffFilter} />
          )}
          {locationOptions.length > 1 && (
            <View style={{ marginTop: 4 }}>
              <FilterChipGroup options={locationOptions} selected={locationFilter} onSelect={setLocationFilter} />
            </View>
          )}
        </View>
      )}

      {/* §Provider-launch (audit 2026-04-21): stale-data banner. When
           useApi preserves previously-successful bookings through a
           refresh failure (flaky network, backgrounded app), the user
           previously saw no indication their data was potentially
           stale. Banner stays lightweight, dismissible by tapping
           refresh, and doesn't replace the grid. */}
      {fetchError && bookings && !loading && (
        <TouchableOpacity
          onPress={handleRefresh}
          activeOpacity={0.85}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: isTablet ? screenPadding : 12,
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: "#FFF7ED",
            borderWidth: 1,
            borderColor: "#FED7AA",
          }}
          accessibilityRole="button"
          accessibilityLabel={t("provider.calendarScreen.staleDataBanner.a11y")}
        >
          <Ionicons name="cloud-offline-outline" size={18} color="#B45309" />
          <Text style={{ flex: 1, marginLeft: 10, fontSize: 12, fontWeight: "600", color: "#92400E" }} numberOfLines={2}>
            {t("provider.calendarScreen.staleDataBanner.body")}
          </Text>
          <Ionicons name="refresh" size={16} color="#B45309" />
        </TouchableOpacity>
      )}

      {(timeBlocksError || availabilityBlocksError || staffUnavailError || bookingHoldsError) && !loading && (
        <TouchableOpacity
          onPress={handleRefresh}
          activeOpacity={0.85}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: isTablet ? screenPadding : 12,
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: "#FFF7ED",
            borderWidth: 1,
            borderColor: "#FED7AA",
          }}
          accessibilityRole="button"
          accessibilityLabel={t("provider.calendarScreen.overlayPartialWarningA11y")}
        >
          <Ionicons name="warning-outline" size={18} color="#B45309" />
          <Text style={{ flex: 1, marginLeft: 10, fontSize: 12, fontWeight: "600", color: "#92400E" }} numberOfLines={2}>
            {t("provider.calendarScreen.overlayPartialWarning")}
          </Text>
          <Ionicons name="refresh" size={16} color="#B45309" />
        </TouchableOpacity>
      )}

      {/* ─── Calendar grid — ALWAYS shown, never blocked by empty state ─── */}
      {loading && !bookings ? (
        <CalendarSkeleton />
      ) : fetchError && !bookings ? (
        <ErrorState
          title={t("provider.calendarScreen.fetchError.title")}
          message={fetchError}
          onRetry={refresh}
          retryLabel={t("provider.calendarScreen.fetchError.retry")}
          icon="calendar-outline"
        />
      ) : (
        <GestureDetector gesture={swipeDayPanGesture}>
        <CalendarGridScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80, paddingTop: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
          onLayout={scrollToCurrentTime}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollOffsetRef.current.y = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={32}
        >
          <View style={isTablet ? { paddingHorizontal: screenPadding, width: "100%" } : {}}>
          <View ref={gridContainerRef} style={{ flexDirection: "row", paddingHorizontal: 8 }}>
            {/* Time column: fixed width, aligns with grid rows; border separates from staff columns */}
            <View
              style={{
                width: TIME_COL_WIDTH,
                height: totalGridHeight + GRID_TOP_PADDING,
                paddingTop: GRID_TOP_PADDING,
                borderRightWidth: 1,
                borderRightColor: "#e5e7eb",
                zIndex: 2,
              }}
            >
              {gridRows
                .filter((r) => r.minute === 0)
                .map((row) => (
                  <View
                    key={`t-${row.hour}`}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: GRID_TOP_PADDING + (row.hour - startHour) * SLOT_HEIGHT,
                      width: TIME_COL_WIDTH,
                      alignItems: "flex-end",
                      paddingRight: 8,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[600] }}>{row.label}</Text>
                  </View>
                ))}
            </View>

            {/* Day view */}
            {viewMode === "day" || viewMode === "3day" ? (
              viewMode === "3day" ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row" }}>
                      {threeDays.map((day) => {
                        const key = calendarDateKey(day, provider?.timezone ?? null);
                        const dayBookings = filteredBookingsByDate.get(key) ?? [];
                        const isToday = isProviderToday(day);
                        const threeDayColWidth = Math.max(MIN_STAFF_COL_WIDTH, availableWidth / 3);
                        return (
                          <View key={key}>
                            <TouchableOpacity
                              style={{ width: threeDayColWidth, alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingBottom: 4, paddingTop: 4, backgroundColor: isToday ? TEAL_ACCENT + "30" : "#f9fafb" }}
                              onPress={() => { setSelectedDate(day); setViewMode("day"); }}
                              onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0) setThreeDayColHeaderHeight(h); }}
                            >
                              <Text style={{ fontSize: 10, color: Colors.gray[400] }}>{format(day, "EEE")}</Text>
                              <Text style={{ fontSize: 14, fontWeight: "700", color: isToday ? "#4f46e6" : Colors.gray[700] }}>{format(day, "d MMM")}</Text>
                              <Text style={{ fontSize: 9, color: Colors.gray[400] }}>
                                {dayBookings.length === 1
                                  ? t("provider.calendarScreen.apptSingle")
                                  : t("provider.calendarScreen.apptPlural", { count: dayBookings.length })}
                              </Text>
                            </TouchableOpacity>
                            <View style={{ borderRightWidth: 1, borderRightColor: Colors.gray[50] }}>
                              {renderDayGrid(day, dayBookings, threeDayColWidth, false)}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  {/* Full-width current time line across all 3 days when today is in view */}
                  {viewMode === "3day" && threeDays.some((d) => isProviderToday(d)) && (
                    <View
                      style={{
                        position: "absolute",
                        left: TIME_COL_WIDTH,
                        top: threeDayColHeaderHeight,
                        width: 3 * Math.max(MIN_STAFF_COL_WIDTH, availableWidth / 3),
                        height: totalGridHeight + GRID_TOP_PADDING,
                        pointerEvents: "none",
                        zIndex: 100,
                      }}
                    >
                      <CurrentTimeIndicator
                        startHour={startHour}
                        slotHeight={SLOT_HEIGHT}
                        endHour={endHour}
                        totalGridHeight={totalGridHeight}
                        timeZone={provider?.timezone ?? null}
                        accessibilityLabelPrefix={t("provider.calendarScreen.currentTimeA11yPrefix")}
                      />
                    </View>
                  )}
                </>
              ) :
              layoutMode === "columns" && staffColumns && staffColumns.length > 1 ? (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={true}
                    style={{ flex: 1, minWidth: 0 }}
                    contentContainerStyle={staffScrollContentWidth != null ? { width: staffScrollContentWidth } : undefined}
                    onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                      scrollOffsetRef.current.x = e.nativeEvent.contentOffset.x;
                    }}
                    scrollEventThrottle={32}
                  >
                    <View style={{ flexDirection: "row" }}>
                      {staffColumns.map((col) => {
                        return (
                          <View key={col.staffId} style={{ width: dayColumnWidth, borderRightWidth: 1, borderRightColor: "#e5e7eb" }}>
                            <TouchableOpacity
                              style={{ width: dayColumnWidth, alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingHorizontal: 4, paddingBottom: 4, paddingTop: 4, backgroundColor: DARK_HEADER }}
                              onPress={() => handleStaffHeaderPress(col)}
                              activeOpacity={0.7}
                              onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0) setStaffColHeaderHeight(h); }}
                            >
                              <View style={{ marginBottom: 2 }}>
                                <Avatar name={col.staffName} imageUrl={col.staffAvatarUrl} size="sm" />
                              </View>
                              <Text style={{ fontSize: 10, fontWeight: "600", color: Colors.white }} numberOfLines={1}>{col.staffName.split(" ")[0]}</Text>
                              <Text style={{ fontSize: 9, color: TEAL_ACCENT }}>
                                {col.bookings.length === 1
                                  ? t("provider.calendarScreen.apptSingle")
                                  : t("provider.calendarScreen.apptPlural", { count: col.bookings.length })}
                              </Text>
                            </TouchableOpacity>
                            <View>
                              {renderDayGrid(selectedDate, col.bookings, dayColumnWidth, false, {
                                staffColumns,
                                dayColumnWidth,
                                day: selectedDate,
                              }, { staffColumnId: col.staffId })}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  {/* Full-width current time line across all staff columns */}
                  {viewMode === "day" && isProviderToday(selectedDate) && staffColumns && staffColumns.length > 1 && staffScrollContentWidth != null && (
                    <View
                      style={{
                        position: "absolute",
                        left: TIME_COL_WIDTH,
                        top: staffColHeaderHeight,
                        width: staffScrollContentWidth,
                        height: totalGridHeight + GRID_TOP_PADDING,
                        pointerEvents: "none",
                        zIndex: 100,
                      }}
                    >
                      <CurrentTimeIndicator
                        startHour={startHour}
                        slotHeight={SLOT_HEIGHT}
                        endHour={endHour}
                        totalGridHeight={totalGridHeight}
                        timeZone={provider?.timezone ?? null}
                        accessibilityLabelPrefix={t("provider.calendarScreen.currentTimeA11yPrefix")}
                      />
                    </View>
                  )}
                </>
              ) : layoutMode === "single" && staffList.length > 1 && staffFilter === "all" ? (
                renderDayGrid(selectedDate, singleStaffBookings, dayColumnWidth, true, {
                  staffColumns: [],
                  dayColumnWidth,
                  day: selectedDate,
                }, { staffColumnId: selectedStaff?.id })
              ) : (
                renderDayGrid(selectedDate, filteredBookings, dayColumnWidth, true, {
                  staffColumns: [],
                  dayColumnWidth,
                  day: selectedDate,
                })
              )
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row" }}>
                    {weekDays.map((day) => {
                      const key = calendarDateKey(day, provider?.timezone ?? null);
                      const dayBookings = filteredBookingsByDate.get(key) ?? [];
                      const isToday = isProviderToday(day);
                      return (
                        <View key={key}>
                          <View
                            style={{ width: dayColumnWidth, alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingBottom: 4, backgroundColor: isToday ? TEAL_ACCENT + "30" : "#f9fafb" }}
                            onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0) setWeekColHeaderHeight(h); }}
                          >
                            <Text style={{ fontSize: 10, color: Colors.gray[400] }}>{format(day, "EEE")}</Text>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: isToday ? "#4f46e6" : Colors.gray[700] }}>{format(day, "d")}</Text>
                          </View>
                          <View style={{ borderRightWidth: 1, borderRightColor: Colors.gray[50] }}>
                            {renderDayGrid(day, dayBookings, dayColumnWidth, false)}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
                {/* Full-width current time line across all 7 days when today is in view */}
                {viewMode === "week" && weekDays.some((d) => isProviderToday(d)) && (
                  <View
                    style={{
                      position: "absolute",
                      left: TIME_COL_WIDTH,
                      top: weekColHeaderHeight,
                      width: 7 * Math.max(MIN_WEEK_COL_WIDTH, availableWidth / 7),
                      height: totalGridHeight + GRID_TOP_PADDING,
                      pointerEvents: "none",
                      zIndex: 100,
                    }}
                  >
                    <CurrentTimeIndicator
                      startHour={startHour}
                      slotHeight={SLOT_HEIGHT}
                      endHour={endHour}
                      totalGridHeight={totalGridHeight}
                      timeZone={provider?.timezone ?? null}
                      accessibilityLabelPrefix={t("provider.calendarScreen.currentTimeA11yPrefix")}
                    />
                  </View>
                )}
              </>
            )}
          </View>
          </View>
        </CalendarGridScrollView>
        </GestureDetector>
      )}

      {/* Drag ghost: follows finger when dragging a booking */}
      {draggingBooking && dragPosition && (
        <CalendarDragGhost
          dragPosition={dragPosition}
          width={dayColumnWidth}
          draggingBooking={draggingBooking}
          walkInLabel={t("provider.calendarScreen.walkIn")}
          providerTimezone={provider?.timezone ?? null}
        />
      )}

      <DatePickerModal
        visible={datePickerVisible}
        currentDate={selectedDate}
        onSelect={setSelectedDate}
        onClose={() => setDatePickerVisible(false)}
      />

      {Platform.OS === "android" && (
        <BottomSheet
          visible={androidBookingMenu != null}
          onClose={() => setAndroidBookingMenu(null)}
          title={
            androidBookingMenu
              ? `${androidBookingMenu.customers?.full_name ?? t("provider.calendarScreen.bookingLabelFallback")} — ${translateBookingStatusLabel(t, androidBookingMenu.status)}`
              : undefined
          }
          subtitle={t("provider.calendarScreen.bookingActionsMessage")}
          snapHeight="half"
        >
          {androidBookingMenu ? (
            <View>
              <TouchableOpacity
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
                onPress={() => {
                  const b = androidBookingMenu;
                  setAndroidBookingMenu(null);
                  handleTapBooking(b);
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[900] }}>
                  {t("provider.calendarScreen.viewDetails")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}
                onPress={() => {
                  const b = androidBookingMenu;
                  setAndroidBookingMenu(null);
                  router.push(
                    `/(app)/(tabs)/more/bookings/${b.calendar_parent_booking_id?.trim() ? b.calendar_parent_booking_id : b.id}?focusPayment=1` as never,
                  );
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[900] }}>
                  {t("provider.calendarScreen.collectPayment")}
                </Text>
              </TouchableOpacity>
              {bookingActionTargets(androidBookingMenu).map((key, idx, arr) => (
                <TouchableOpacity
                  key={key}
                  style={{
                    paddingVertical: 14,
                    borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                    borderBottomColor: Colors.gray[100],
                  }}
                  onPress={() => {
                    const b = androidBookingMenu;
                    setAndroidBookingMenu(null);
                    void changeBookingStatus(b.id, key);
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "500",
                      color: key === "cancelled" ? "#dc2626" : Colors.gray[900],
                    }}
                  >
                    {getStatusActionLabel(t, dbTargetToPatchStatusField(key))}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </BottomSheet>
      )}

      <MonthOverviewModal
        visible={monthOverviewVisible}
        monthAnchor={selectedDate}
        locationParam={locationParam}
        timeZone={provider?.timezone ?? null}
        onClose={() => setMonthOverviewVisible(false)}
        onSelectDate={(d) => {
          setSelectedDate(d);
          hasScrolledToNow.current = false;
        }}
      />

      <CalendarPreferencesModal
        visible={prefsVisible}
        onClose={() => setPrefsVisible(false)}
        preferences={preferences}
        onUpdate={updatePreference}
        onReset={resetToDefaults}
      />

      {/* ─── Legend Modal ─── */}
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowLegend(false)}>
          <Pressable style={{ marginHorizontal: 24, width: 320, maxHeight: "82%", borderRadius: 16, backgroundColor: Colors.white, padding: 20 }} onPress={() => {}}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{t("provider.calendarScreen.colorLegend.title")}</Text>
              <TouchableOpacity
                onPress={() => setShowLegend(false)}
                accessibilityRole="button"
                accessibilityLabel={t("provider.calendarScreen.close")}
              >
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
            {preferences.colorBy === "status" && (
              <View>
                <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>
                  {t("provider.calendarScreen.colorLegend.statusColors")}
                </Text>
                {Object.entries(STATUS_COLORS).map(([key, colors]) => (
                  <View key={key} style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: colors.bg, borderLeftWidth: 3, borderLeftColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: colors.text }}>{translateBookingStatusLabel(t, key)}</Text>
                  </View>
                ))}
              </View>
            )}

            {preferences.colorBy === "service" && (
              <View>
                <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>
                  {t("provider.calendarScreen.colorLegend.serviceColors")}
                </Text>
                {SERVICE_COLOR_MAP.map(([keywords, colors], i) => (
                  <View key={i} style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: colors.bg, borderLeftWidth: 3, borderLeftColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", textTransform: "capitalize", color: colors.text }}>{(keywords as string[])[0]}</Text>
                  </View>
                ))}
              </View>
            )}

            {preferences.colorBy === "team_member" && (
              <View>
                <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>
                  {t("provider.calendarScreen.colorLegend.teamColors")}
                </Text>
                {staffList.slice(0, TEAM_COLORS.length).map((member, i) => {
                  const tc = TEAM_COLORS[i % TEAM_COLORS.length]!;
                  return (
                    <View key={member.id} style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: tc.bg, borderLeftWidth: 3, borderLeftColor: tc.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: "500", color: tc.text }}>{member.name}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={{ marginTop: 12 }}>
              <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>
                {t("provider.calendarScreen.colorLegend.closedTimeOff")}
              </Text>
              <Text style={{ marginBottom: 8, fontSize: 11, lineHeight: 15, color: Colors.gray[500] }}>
                {t("provider.calendarScreen.colorLegend.closedTimeOffDescription")}
              </Text>
              <View style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: STAFF_TIMEOFF_OVERLAY_COLORS.bg, borderLeftWidth: 3, borderLeftColor: STAFF_TIMEOFF_OVERLAY_COLORS.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Ionicons name="calendar-outline" size={12} color={STAFF_TIMEOFF_OVERLAY_COLORS.text} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 12, fontWeight: "500", color: STAFF_TIMEOFF_OVERLAY_COLORS.text }}>
                  {t("provider.calendarScreen.colorLegend.staffTimeOff")}
                </Text>
              </View>
              <View style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: BLOCK_TYPE_COLORS.unavailable.bg, borderLeftWidth: 3, borderLeftColor: BLOCK_TYPE_COLORS.unavailable.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Ionicons name="ban-outline" size={12} color={BLOCK_TYPE_COLORS.unavailable.text} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 12, fontWeight: "500", color: BLOCK_TYPE_COLORS.unavailable.text }}>
                  {t("provider.calendarScreen.colorLegend.unavailableClosed")}
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 4 }}>
              <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>
                {t("provider.calendarScreen.colorLegend.timeBlocks")}
              </Text>
              {Object.entries(BLOCK_TYPE_COLORS).map(([key, colors]) => (
                <View key={key} style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: colors.bg, borderLeftWidth: 3, borderLeftColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Ionicons name={colors.icon as keyof typeof Ionicons.glyphMap} size={12} color="#92400e" style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 12, fontWeight: "500", color: colors.text }}>
                    {key === "unavailable" || key === "maintenance"
                      ? translateAvailabilityBlockType(t, key)
                      : t(`provider.calendarScreen.timeBlockTypes.${key}`)}
                  </Text>
                </View>
              ))}
            </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Edit availability block (from grid) ─── */}
      <Modal
        visible={availabilityEdit != null}
        transparent
        animationType="fade"
        onRequestClose={() => setAvailabilityEdit(null)}
      >
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }} onPress={() => setAvailabilityEdit(null)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ borderRadius: 16, backgroundColor: Colors.white, padding: 20, maxHeight: "90%" }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>{t("provider.calendarScreen.availabilityEditModal.title")}</Text>
            {availabilityEdit ? (
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>{availabilityEdit.date}</Text>
            ) : null}
            {availabilityEdit ? (
              <>
                <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.availabilityEditModal.type")}</Text>
                <View style={{ marginBottom: 12, flexDirection: "row", flexWrap: "wrap" }}>
                  {AVAILABILITY_EDIT_TYPES.map((bt) => (
                    <TouchableOpacity
                      key={bt.value}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        marginRight: 8,
                        marginBottom: 8,
                        backgroundColor: availabilityEdit.block_type === bt.value ? "#4f46e6" : Colors.gray[100],
                      }}
                      onPress={() => setAvailabilityEdit((p) => (p ? { ...p, block_type: bt.value } : p))}
                    >
                      <Ionicons
                        name={bt.icon}
                        size={14}
                        color={availabilityEdit.block_type === bt.value ? "#fff" : "#6b7280"}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "500",
                          color: availabilityEdit.block_type === bt.value ? Colors.white : Colors.gray[700],
                        }}
                      >
                        {t(`provider.calendarScreen.availabilityEditTypes.${bt.value}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ marginBottom: 12, flexDirection: "row" }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.availabilityEditModal.start")}</Text>
                    <TextInput
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: Colors.gray[200],
                        backgroundColor: Colors.gray[50],
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        fontSize: 16,
                        color: Colors.gray[900],
                      }}
                      value={availabilityEdit.start_time}
                      onChangeText={(t) => setAvailabilityEdit((p) => (p ? { ...p, start_time: t } : p))}
                      placeholder="HH:MM"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.availabilityEditModal.end")}</Text>
                    <TextInput
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: Colors.gray[200],
                        backgroundColor: Colors.gray[50],
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        fontSize: 16,
                        color: Colors.gray[900],
                      }}
                      value={availabilityEdit.end_time}
                      onChangeText={(t) => setAvailabilityEdit((p) => (p ? { ...p, end_time: t } : p))}
                      placeholder="HH:MM"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>
                {staffList.length > 0 ? (
                  <>
                    <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.availabilityEditModal.staff")}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ flexDirection: "row" }}>
                      <TouchableOpacity
                        style={{
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          marginRight: 8,
                          backgroundColor: availabilityEdit.staff_id == null ? "#4f46e6" : Colors.gray[100],
                        }}
                        onPress={() => setAvailabilityEdit((p) => (p ? { ...p, staff_id: null } : p))}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "500",
                            color: availabilityEdit.staff_id == null ? Colors.white : Colors.gray[700],
                          }}
                        >
                          {t("provider.calendarScreen.availabilityEditModal.everyone")}
                        </Text>
                      </TouchableOpacity>
                      {staffList.map((member) => (
                        <TouchableOpacity
                          key={member.id}
                          style={{
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            marginRight: 8,
                            backgroundColor: availabilityEdit.staff_id === member.id ? "#4f46e6" : Colors.gray[100],
                          }}
                          onPress={() => setAvailabilityEdit((p) => (p ? { ...p, staff_id: member.id } : p))}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "500",
                              color: availabilityEdit.staff_id === member.id ? Colors.white : Colors.gray[700],
                            }}
                          >
                            {member.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                <View style={{ flexDirection: "row" }}>
                  <TouchableOpacity
                    style={{ flex: 1, marginRight: 10, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.gray[100], alignItems: "center" }}
                    onPress={() => setAvailabilityEdit(null)}
                  >
                    <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>{t("provider.calendarScreen.availabilityEditModal.cancel")}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <ActionButton label={t("provider.calendarScreen.availabilityEditModal.save")} onPress={handleSaveAvailabilityEdit} loading={savingAvailabilityEdit} fullWidth />
                  </View>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Time Block Creation Sheet ─── */}
      <BottomSheet
        visible={showTimeBlockForm}
        onClose={() => setShowTimeBlockForm(false)}
        title={t("provider.calendarScreen.timeBlockSheet.title")}
      >
        <View>
          <Text style={{ marginBottom: 8, fontSize: 14, color: Colors.gray[500] }}>
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </Text>

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.timeBlockSheet.blockType")}</Text>
          <View style={{ marginBottom: 12, flexDirection: "row", flexWrap: "wrap" }}>
            {BLOCK_TYPES.map((bt) => (
              <TouchableOpacity
                key={bt.value}
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8, backgroundColor: timeBlockForm.type === bt.value ? "#4f46e6" : Colors.gray[100] }}
                onPress={() => setTimeBlockForm((p) => ({ ...p, type: bt.value }))}
              >
                <Ionicons
                  name={bt.icon}
                  size={14}
                  color={timeBlockForm.type === bt.value ? "#fff" : "#6b7280"}
                  style={{ marginRight: 6 }}
                />
                <Text style={{ fontSize: 12, fontWeight: "500", color: timeBlockForm.type === bt.value ? Colors.white : Colors.gray[700] }}>
                  {t(`provider.calendarScreen.timeBlockTypes.${bt.value}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.timeBlockSheet.titleField")}</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={timeBlockForm.title}
            onChangeText={(t) => setTimeBlockForm((p) => ({ ...p, title: t }))}
            placeholder={capitalizeFirst(timeBlockForm.type)}
            placeholderTextColor="#9ca3af"
          />

          <View style={{ marginBottom: 12, flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.timeBlockSheet.startTime")}</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={timeBlockForm.startTime}
                onChangeText={(t) => setTimeBlockForm((p) => ({ ...p, startTime: t }))}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.timeBlockSheet.endTime")}</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={timeBlockForm.endTime}
                onChangeText={(t) => setTimeBlockForm((p) => ({ ...p, endTime: t }))}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          {staffList.length > 0 && (
            <>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{t("provider.calendarScreen.timeBlockSheet.staffOptional")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ flexDirection: "row" }}>
                <TouchableOpacity
                  style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, backgroundColor: !timeBlockForm.staffId ? "#4f46e6" : Colors.gray[100] }}
                  onPress={() => setTimeBlockForm((p) => ({ ...p, staffId: "" }))}
                >
                  <Text style={{ fontSize: 12, fontWeight: "500", color: !timeBlockForm.staffId ? Colors.white : Colors.gray[700] }}>
                    All Staff
                  </Text>
                </TouchableOpacity>
                {staffList.map((member) => (
                  <TouchableOpacity
                    key={member.id}
                    style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, backgroundColor: timeBlockForm.staffId === member.id ? "#4f46e6" : Colors.gray[100] }}
                    onPress={() => setTimeBlockForm((p) => ({ ...p, staffId: member.id }))}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "500", color: timeBlockForm.staffId === member.id ? Colors.white : Colors.gray[700] }}>
                      {member.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <ActionButton label={t("provider.calendarScreen.timeBlockSheet.submit")} onPress={handleCreateTimeBlock} loading={creatingBlock} fullWidth />
        </View>
      </BottomSheet>
      {cancelReasonBookingId && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setCancelReasonBookingId(null)}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" }} onPress={() => setCancelReasonBookingId(null)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, marginHorizontal: 24, width: 320 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>{t("provider.calendarScreen.cancelBookingModal.title")}</Text>
              <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 8 }}>Reason for cancellation (optional):</Text>
              <TextInput
                value={cancelReasonText}
                onChangeText={setCancelReasonText}
                placeholder="e.g. Client requested"
                multiline
                style={{ borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, padding: 12, fontSize: 14, minHeight: 72, textAlignVertical: "top", marginBottom: 16 }}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity onPress={() => setCancelReasonBookingId(null)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#D1D5DB", alignItems: "center" }}>
                  <Text style={{ fontWeight: "600", color: "#374151" }}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const bId = cancelReasonBookingId;
                    const reason = cancelReasonText.trim() || "No reason provided";
                    setCancelReasonBookingId(null);
                    applyBookingStatus(bId, "cancelled", reason);
                  }}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#DC2626", alignItems: "center" }}
                >
                  <Text style={{ fontWeight: "600", color: "#fff" }}>{t("provider.calendarScreen.cancelBookingModal.confirm")}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <CalendarBookingQuickSheet
        visible={quickSheetBooking != null}
        booking={quickSheetBooking}
        providerTimezone={providerTz}
        onClose={() => setQuickSheetBooking(null)}
        onViewFullDetails={(bookingId) => {
          router.push(`/(app)/(tabs)/more/bookings/${bookingId}` as never);
        }}
        translateBookingStatusLabel={translateBookingStatusLabel}
        t={t}
      />
    </ScreenContainer>
  );
}

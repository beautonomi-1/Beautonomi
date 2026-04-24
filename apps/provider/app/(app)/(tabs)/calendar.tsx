import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
  PanResponder,
  TextInput,
  useWindowDimensions,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  startOfDay,
  startOfMonth,
  endOfMonth,
  isSameDay,
  parseISO,
  getHours,
  getMinutes,
  differenceInHours,
  differenceInMinutes,
} from "date-fns";
import * as Clipboard from "expo-clipboard";
import { APP_URL } from "@/config/public-env";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useCalendarPreferences } from "@/hooks/useCalendarPreferences";
import { useProvider } from "@/providers/ProviderContext";
import type { ColorByMode } from "@/hooks/useCalendarPreferences";
import { CalendarPreferencesModal } from "@/components/calendar/CalendarPreferencesModal";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  formatTime,
  formatTimeInZone,
  formatCurrency,
  capitalizeFirst,
} from "@/lib/format";
import { buildZonedIsoForWallClock } from "@/lib/tz";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { trackCalendarView } from "@/lib/analytics";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { useTranslation, type TFunction } from "@beautonomi/i18n";
import {
  expandTimeBlocksForCalendarRange,
  resolveTimeBlockRecordId,
} from "@/lib/expand-time-blocks";
import { newBookingScreenHrefFromCalendarDay } from "@/lib/new-booking-nav-defaults";
import {
  DAY_NAMES as SHARED_DAY_NAMES,
  dayMinuteRanges,
  deriveGridHourWindow,
  formatDateKeyInTimeZone,
  getWeekdayInTimeZone,
  mergeOperatingHours,
  resolveDayHours as sharedResolveDayHours,
  timeStringToMinutes as sharedTimeStringToMinutes,
  type WeeklyHours,
} from "@beautonomi/utils";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface BookingService {
  name: string;
  offering_name?: string;
  /** Present when the calendar API returns offering ids (resource / check-availability parity). */
  offering_id?: string | null;
  duration_minutes: number;
  staff_name: string | null;
  staff_id: string | null;
  guest_name?: string | null;
}

interface Booking {
  id: string;
  booking_number: string;
  status: string;
  /** Raw DB status from API — pending vs confirmed for calendar colors when `status` is `booked`. */
  db_status?: string;
  scheduled_at: string;
  total_amount: number;
  currency: string;
  location_type: string;
  created_at?: string;
  notes?: string;
  services: BookingService[];
  customers: { full_name: string; phone: string } | null;
  locations: { id: string; name: string } | null;
  is_group_booking?: boolean;
  group_booking_ref?: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  working_hours?: Record<string, { open?: string; close?: string; open_time?: string; close_time?: string; closed?: boolean; is_open?: boolean }> | null;
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

function normalizeAvailabilityBlocksToSegments(raw: AvailabilityBlockApi[]): AvailabilitySegment[] {
  const result: AvailabilitySegment[] = [];
  for (const block of raw) {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const pad = (n: number) => n.toString().padStart(2, "0");
    let cursor = new Date(start);
    while (cursor < end) {
      const dateStr = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
      const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const segmentStart = cursor < dayStart ? dayStart : cursor;
      const segmentEnd = end < dayEnd ? end : dayEnd;
      const startTime = `${pad(segmentStart.getHours())}:${pad(segmentStart.getMinutes())}`;
      const endTime = `${pad(segmentEnd.getHours())}:${pad(segmentEnd.getMinutes())}`;
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
      cursor = dayEnd;
    }
  }
  return result;
}

function availabilitySegmentToTimeBlock(seg: AvailabilitySegment): TimeBlock {
  const isStaff = seg._source === "staff_unavailability";
  return {
    id: seg.id,
    staff_id: seg.team_member_id,
    block_type: seg.block_type,
    title: (seg.reason && seg.reason.trim()) || seg.block_type,
    start_time: seg.start_time,
    end_time: seg.end_time,
    date: seg.date,
    overlay_source: seg._source,
    availability_block_id: isStaff ? undefined : seg.parent_block_id,
    calendar_overlay_kind: isStaff ? "staff_off" : "availability",
  };
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

// §Calendar-hours: use the shared DAY_NAMES tuple so day-index lookups stay
// aligned with `resolveDayHours` / `deriveGridHourWindow` helpers.
const DAY_NAMES: readonly string[] = SHARED_DAY_NAMES;

type ColorTriple = { bg: string; border: string; text: string };

const STATUS_COLORS: Record<string, ColorTriple> = {
  confirmed: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  pending: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
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

const BLOCK_TYPE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  break: { bg: "#fefce8", border: "#facc15", text: "#854d0e", icon: "cafe-outline" },
  lunch: { bg: "#fefce8", border: "#facc15", text: "#854d0e", icon: "cafe-outline" },
  meeting: { bg: "#eff6ff", border: "#60a5fa", text: "#1e40af", icon: "people-outline" },
  maintenance: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", icon: "build-outline" },
  unavailable: { bg: Colors.gray[100], border: Colors.gray[500], text: Colors.gray[700], icon: "ban-outline" },
  other: { bg: Colors.gray[50], border: Colors.gray[400], text: Colors.gray[600], icon: "ban-outline" },
};

const STAFF_TIMEOFF_OVERLAY_COLORS = {
  bg: "#EDE9FE",
  border: "#8B5CF6",
  text: "#5B21B6",
  icon: "calendar-outline",
};

/**
 * §Provider-launch (audit 2026-04): ghost slot styling for in-checkout
 * booking holds. Mirrors the web calendar B8 behaviour so providers see a
 * faint dashed block where a customer is actively holding a slot and
 * finalising payment, preventing accidental double-booking.
 */
const BOOKING_HOLD_OVERLAY_COLORS = {
  bg: "#FFF7ED",
  border: "#FB923C",
  text: "#9A3412",
  icon: "hourglass-outline",
};

/** Keys for {@link changeBookingStatus}; labels from `provider.calendarScreen.statusActionLabels.*`. */
const STATUS_ACTION_KEYS = ["booked", "started", "completed", "no_show", "cancelled"] as const;

function translateBookingStatusLabel(t: TFunction, status: string): string {
  const key = `provider.calendarScreen.bookingStatusLabels.${status}`;
  const v = t(key);
  return v === key ? capitalizeFirst(status.replace(/_/g, " ")) : v;
}

function getStatusActionLabel(t: TFunction, actionKey: string): string {
  return t(`provider.calendarScreen.statusActionLabels.${actionKey}`);
}

type LayoutMode = "columns" | "single";
type ViewMode = "day" | "3day" | "week";

const BLOCK_TYPES = [
  { label: "Break", value: "break", icon: "cafe-outline" as const },
  { label: "Lunch", value: "lunch", icon: "restaurant-outline" as const },
  { label: "Meeting", value: "meeting", icon: "people-outline" as const },
  { label: "Personal", value: "personal", icon: "person-outline" as const },
  { label: "Other", value: "other", icon: "ban-outline" as const },
];

/** Editable `availability_blocks.block_type` values (API). */
const AVAILABILITY_EDIT_TYPES = [
  { label: "Unavailable", value: "unavailable" as const, icon: "ban-outline" as const },
  { label: "Break", value: "break" as const, icon: "cafe-outline" as const },
  { label: "Maintenance", value: "maintenance" as const, icon: "construct-outline" as const },
];

/* ================================================================== */
/*  Color resolvers                                                    */
/* ================================================================== */

function getStatusColors(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.booked;
}

/** Map DB + provider-facing status to calendar color keys (pending ≠ confirmed “booked”). */
function resolveCalendarColorKey(booking: Booking): string {
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

function getServiceColors(booking: Booking) {
  const serviceName = booking.services?.[0]?.name?.toLowerCase() ?? "";
  for (const [keywords, colors] of SERVICE_COLOR_MAP) {
    if (keywords.some((kw) => serviceName.includes(kw))) return colors;
  }
  return { bg: "#f8fafc", border: "#94a3b8", text: "#1e293b" };
}

function getTeamColors(booking: Booking, staffList: StaffMember[]) {
  const staffId = booking.services?.[0]?.staff_id;
  if (!staffId) return TEAM_COLORS[0]!;
  const idx = staffList.findIndex((s) => s.id === staffId);
  return TEAM_COLORS[idx >= 0 ? idx % TEAM_COLORS.length : 0]!;
}

function getBlockColors(
  booking: Booking,
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

function getTimeBlockColors(type: string) {
  const lower = type.toLowerCase();
  if (lower === "unavailable" || lower.includes("unavailable")) return BLOCK_TYPE_COLORS.unavailable;
  if (lower === "maintenance" || lower.includes("maintenance")) return BLOCK_TYPE_COLORS.maintenance;
  if (lower.includes("break") || lower.includes("lunch"))
    return BLOCK_TYPE_COLORS.break;
  if (lower.includes("meeting")) return BLOCK_TYPE_COLORS.meeting;
  return BLOCK_TYPE_COLORS.other;
}

function getCalendarOverlayColors(block: TimeBlock) {
  if (block.calendar_overlay_kind === "booking_hold") return BOOKING_HOLD_OVERLAY_COLORS;
  if (block.overlay_source === "staff_unavailability") return STAFF_TIMEOFF_OVERLAY_COLORS;
  return getTimeBlockColors(block.block_type);
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

function normalizeOperatingSchedule(
  schedule: unknown,
): { isOpen: boolean; openTime?: string; closeTime?: string } | null {
  const resolved = sharedResolveDayHours(schedule);
  if (!resolved) {
    // Keep historical behaviour: an explicit closed flag without a parseable
    // open/close still short-circuits downstream open-hour math.
    if (schedule && typeof schedule === "object" && !Array.isArray(schedule)) {
      const raw = schedule as Record<string, unknown>;
      if (raw.closed === true || raw.is_open === false) {
        return { isOpen: false };
      }
    }
    return null;
  }
  if (resolved.closed) return { isOpen: false };
  const pad = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return {
    isOpen: true,
    openTime: pad(resolved.openMin),
    closeTime: pad(resolved.closeMin),
  };
}

function parseApiDateTime(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = parseISO(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Wall-clock hour/minute for an instant in the business IANA zone (matches
 * {@link CurrentTimeIndicator}). Falls back to the device local clock when
 * no zone is set.
 */
function getHourMinuteForInstantInZone(
  instant: Date,
  timeZone: string | null | undefined,
): { h: number; m: number } {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(instant);
      return {
        h: Number(parts.find((p) => p.type === "hour")?.value ?? getHours(instant)),
        m: Number(parts.find((p) => p.type === "minute")?.value ?? getMinutes(instant)),
      };
    } catch {
      /* fall through */
    }
  }
  return { h: getHours(instant), m: getMinutes(instant) };
}

function getTopOffset(
  dateStr: string,
  startHour: number,
  slotHeight: number,
  timeZone?: string | null,
): number {
  const d = parseApiDateTime(dateStr);
  if (!d) return 0;
  const { h, m } = getHourMinuteForInstantInZone(d, timeZone);
  const slot = Number.isFinite(slotHeight) && slotHeight > 0 ? slotHeight : 60;
  const safeStart = Number.isFinite(startHour) ? startHour : 0;
  const hourN = Number.isFinite(h) ? h : 0;
  const minN = Number.isFinite(m) ? m : 0;
  const out = (hourN - safeStart) * slot + (minN / 60) * slot;
  return Math.max(0, Number.isFinite(out) ? out : 0);
}

function getBlockHeight(booking: Booking, slotHeight: number, compact: boolean): number {
  // §Provider-launch (audit 2026-04): defensive NaN guard. A service row
  // with a null/undefined `duration_minutes` (possible when the backend
  // shape drifts ahead of the client types) used to produce NaN here,
  // which Yoga rejects and iOS JSC reports as an intermittent layout
  // crash while the calendar scrolls. Coerce to finite numbers and fall
  // back to a sensible minimum.
  const rawTotal =
    booking.services?.reduce((s, svc) => {
      const n = Number(svc?.duration_minutes);
      return s + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0) ?? 0;
  const totalMin = rawTotal > 0 ? rawTotal : 30;
  const slot = Number.isFinite(slotHeight) && slotHeight > 0 ? slotHeight : 60;
  const raw = (totalMin / 60) * slot;
  const minH = compact ? slot / 6 : slot / 4;
  const out = Math.max(raw, minH);
  return Number.isFinite(out) ? out : minH;
}

function isNewBooking(booking: Booking): boolean {
  if (!booking.created_at) return false;
  if (booking.status === "completed" || booking.status === "cancelled") return false;
  const createdAt = parseApiDateTime(booking.created_at);
  if (!createdAt) return false;
  return differenceInHours(new Date(), createdAt) < 24;
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
    const dayBookings = sorted.filter((b) => {
      const d = parseApiDateTime(b.scheduled_at);
      return d != null && isSameDay(d, day);
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
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} accessibilityLabel="Loading calendar">
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
/*  Current time indicator                                             */
/* ================================================================== */

function CurrentTimeIndicator({
  startHour,
  slotHeight,
  endHour,
  totalGridHeight,
  timeZone,
}: {
  startHour: number;
  slotHeight: number;
  endHour: number;
  totalGridHeight: number;
  /**
   * IANA tz the grid is rendered in (provider business zone). When
   * set, the "now" line is positioned using the wall-clock H:M in that
   * zone instead of the device's local time, so providers working from
   * a different timezone see the correct line.
   */
  timeZone?: string | null;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // §UI-audit 2026-04: same wall-clock derivation as booking blocks
  // ({@link getHourMinuteForInstantInZone}) so the red line aligns with
  // appointment cards when the device timezone ≠ business timezone.
  const { h, m } = getHourMinuteForInstantInZone(now, timeZone);
  const rawTop = (h - startHour) * slotHeight + (m / 60) * slotHeight;
  // Always show the line when viewing today: clamp so it stays visible in the grid (offset by grid top padding)
  const GRID_TOP = 8;
  const top = GRID_TOP + Math.max(0, Math.min(rawTop, totalGridHeight - 4));

  // §Provider-audit 2026-04: a11y label must match the visual line position,
  // which uses business-TZ wall clock. Previously used device-local time and
  // could disagree with the on-screen line when the phone zone ≠ business.
  const a11yHour = String(h).padStart(2, "0");
  const a11yMinute = String(m).padStart(2, "0");

  return (
    <View
      style={{ position: "absolute", left: 0, right: 0, top, flexDirection: "row", alignItems: "center", zIndex: 100, pointerEvents: "none" }}
      accessibilityLabel={`Current time ${a11yHour}:${a11yMinute}`}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: "#dc2626",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 1,
          elevation: 2,
        }}
      />
      <View style={{ height: 3, flex: 1, backgroundColor: "#dc2626" }} />
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
  const [month, setMonth] = useState(currentDate);
  useEffect(() => { if (visible) setMonth(currentDate); }, [visible, currentDate]);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

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
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={20} color="#111" />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{format(month, "MMMM yyyy")}</Text>
            <TouchableOpacity
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={20} color="#111" />
            </TouchableOpacity>
          </View>

          <View style={{ marginBottom: 4, flexDirection: "row" }}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
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
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Today</Text>
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
  onClose,
  onSelectDate,
}: {
  visible: boolean;
  monthAnchor: Date;
  locationParam: string;
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
  const { data: mbBookings, loading } = useApi<Booking[]>(
    `/api/provider/bookings?start_date=${start}&end_date=${end}&limit=500${locationParam}`,
    { enabled: visible, staleTimeMs: 0 },
  );

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    if (!mbBookings?.length) return m;
    for (const b of mbBookings) {
      const d = parseApiDateTime(b.scheduled_at);
      if (!d) continue;
      const key = format(d, "yyyy-MM-dd");
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [mbBookings]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

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
          <View style={{ marginBottom: 4, flexDirection: "row" }}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <View key={d} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400] }}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`e-${i}`} style={{ width: "14.28%" }} />;
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const key = format(date, "yyyy-MM-dd");
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
  return (
    <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
      <View style={{ height: 72, width: 72, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: "#fef2f2", marginBottom: 16 }}>
        <Ionicons name="calendar-outline" size={30} color="#ef4444" />
      </View>
      <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.gray[900], textAlign: "center" }}>
        We hit a snag opening your calendar
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: Colors.gray[500], textAlign: "center" }}>
        Tap reload to try again — your appointments and bookings are safe.
      </Text>
      <TouchableOpacity
        onPress={onReset}
        style={{ marginTop: 20, borderRadius: 12, backgroundColor: DARK_HEADER, paddingHorizontal: 28, paddingVertical: 12, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        accessibilityRole="button"
        accessibilityLabel="Reload calendar"
      >
        <Text style={{ color: Colors.white, fontWeight: "600" }}>Reload calendar</Text>
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
  const insets = useSafeAreaInsets();
  // §Provider-launch (audit 2026-04): accept `?date=YYYY-MM-DD` +
  // `?booking_id=...` deep-link params so push notifications and email
  // reminders can land the provider on the exact day (and optionally open
  // the booking detail). Falls back to today + no booking highlight.
  const searchParams = useLocalSearchParams<{ date?: string; booking_id?: string }>();
  const deepLinkDate = useMemo(() => {
    if (typeof searchParams.date !== "string" || !searchParams.date) return null;
    const parsed = new Date(searchParams.date);
    return isNaN(parsed.getTime()) ? null : parsed;
  }, [searchParams.date]);
  const [isFocused, setIsFocused] = useState(true);
  const [secondaryEnabled, setSecondaryEnabled] = useState(false);
  useAuth();
  const { provider, selectedLocationId: globalLocationId } = useProvider();
  const { isTablet, screenPadding } = useResponsive();
  const { preferences, updatePreference, resetToDefaults } = useCalendarPreferences();

  const [selectedDate, setSelectedDate] = useState<Date>(() => deepLinkDate ?? new Date());
  useEffect(() => {
    if (deepLinkDate) {
      setSelectedDate((prev) => (isSameDay(prev, deepLinkDate) ? prev : deepLinkDate));
    }
  }, [deepLinkDate]);
  useEffect(() => {
    if (typeof searchParams.booking_id === "string" && searchParams.booking_id) {
      router.push(`/(app)/(tabs)/more/bookings/${searchParams.booking_id}` as never);
    }
  }, [searchParams.booking_id, router]);
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
  const [androidBookingMenu, setAndroidBookingMenu] = useState<Booking | null>(null);
  const [prefsVisible, setPrefsVisible] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
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
  const fabAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledToNow = useRef(false);
  const prevViewModeRef = useRef(viewMode);
  if (prevViewModeRef.current !== viewMode) {
    prevViewModeRef.current = viewMode;
    hasScrolledToNow.current = false;
  }
  const scrollOffsetRef = useRef({ x: 0, y: 0 });
  const gridContainerRef = useRef<View>(null);
  const draggingRef = useRef(false);
  const [draggingBooking, setDraggingBooking] = useState<Booking | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  const SLOT_HEIGHT = preferences.compactMode ? 40 : 60;
  const QUARTER_HEIGHT = SLOT_HEIGHT / 4;
  const GRID_TOP_PADDING = 8;

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = format(addDays(weekStart, 6), "yyyy-MM-dd");
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const threeDayEnd = format(addDays(selectedDate, 2), "yyyy-MM-dd");

  // Day view still shows one day in the grid, but we load the full ISO week so the date strip
  // booking dots, share/print, and month counts stay accurate without extra fetches.
  const startDate = viewMode === "week" ? weekStartStr : viewMode === "3day" ? dateStr : weekStartStr;
  const endDate = viewMode === "week" ? weekEnd : viewMode === "3day" ? threeDayEnd : weekEnd;
  const locationParam = locationFilter !== "all" ? `&location_id=${locationFilter}` : "";

  const {
    data: bookings,
    loading,
    error: fetchError,
    refresh,
    mutate: setBookings,
  } = useApi<Booking[]>(
    `/api/provider/bookings?start_date=${startDate}&end_date=${endDate}&limit=500${locationParam}`,
    /** Calendar loads a wide date range; allow slow networks / large datasets before surfacing timeout. */
    { enabled: isFocused, staleTimeMs: 0, timeoutMs: 60_000 },
  );

  const teamUrl = locationFilter !== "all" ? `/api/provider/team?location_id=${encodeURIComponent(locationFilter)}` : "/api/provider/team";
  const { data: staff } = useApi<StaffMember[]>(teamUrl, { enabled: isFocused, staleTimeMs: 30_000 });
  const timeBlocksLocationParam = locationFilter !== "all" ? `&location_id=${encodeURIComponent(locationFilter)}` : "";
  const { data: timeBlocks, refresh: refreshTimeBlocks } = useApi<TimeBlock[]>(
    `/api/provider/time-blocks?date_from=${startDate}&date_to=${endDate}${timeBlocksLocationParam}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  const { data: availabilityRaw, refresh: refreshAvailabilityBlocks } = useApi<AvailabilityBlockApi[]>(
    `/api/provider/availability-blocks?from=${encodeURIComponent(startDate)}&to=${encodeURIComponent(endDate)}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  const { data: staffUnavailSegments, refresh: refreshStaffUnavail } = useApi<AvailabilitySegment[]>(
    `/api/provider/calendar/staff-unavailability?date_from=${encodeURIComponent(startDate)}&date_to=${encodeURIComponent(endDate)}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  // §Provider-launch (audit 2026-04): surface active booking_holds as ghost
  // slots so providers don't accidentally double-book a slot a customer is
  // currently finalising payment for. Matches web calendar B8 behaviour.
  const { data: bookingHoldSegments, refresh: refreshBookingHolds } = useApi<
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
      const st = String(raw.start_time ?? "00:00").slice(0, 5);
      const et = String(raw.end_time ?? "00:00").slice(0, 5);
      return {
        id: raw.id,
        staff_id: raw.staff_id ?? raw.team_member_id ?? null,
        block_type: raw.block_type || raw.blocked_time_type_name || "blocked",
        title: raw.title || raw.name || "Time block",
        start_time: st,
        end_time: et,
        date: raw.date,
        calendar_overlay_kind: "time_block" as const,
        is_recurring: !!raw.is_recurring,
        is_active: raw.is_active !== false,
        recurrence_rule: raw.recurrence_rule ?? raw.recurring_pattern,
      };
    });
  }, [timeBlocks]);

  const expandedApiTimeBlocks = useMemo(
    () => expandTimeBlocksForCalendarRange(normalizedApiTimeBlocks, startDate, endDate),
    [normalizedApiTimeBlocks, startDate, endDate],
  );

  useEffect(() => {
    if (!isFocused || !provider?.id) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refresh();
      }, 400);
    };

    const channel = supabase
      .channel(`calendar-bookings:${provider.id}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "bookings", filter: `provider_id=eq.${provider.id}` },
        () => {
          scheduleRefresh();
        },
      )
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [isFocused, refresh, provider?.id]);

  /* ─── Swipe navigation via PanResponder ─── */
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.dy) < 30;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > 50) {
            navigateDate(-1);
          } else if (gestureState.dx < -50) {
            navigateDate(1);
          }
        },
      }),
    // navigateDate is stable by identity; including it would recreate the gesture every time
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDate, viewMode],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const tasks = [refresh()];
      if (secondaryEnabled) {
        tasks.push(
          refreshTimeBlocks(),
          refreshAvailabilityBlocks(),
          refreshStaffUnavail(),
          refreshBookingHolds(),
        );
      }
      await Promise.all(tasks);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshTimeBlocks, refreshAvailabilityBlocks, refreshStaffUnavail, refreshBookingHolds, secondaryEnabled]);

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

  // §Provider-audit 2026-04: staffList / staffNameToId used to live ~60 lines
  // below this block, AFTER getHoursForDay() was invoked via todayHours and
  // the startHour/endHour useMemo. In TDZ the const binding is uninitialised,
  // which iOS JSC reports as `TypeError: Cannot convert undefined value to
  // object` on the `for (const member of staffList)` line inside the hours
  // calculator. Declaring these derived lists BEFORE any consumer removes the
  // crash and keeps a single source of truth.
  const staffList = useMemo(() => staff ?? [], [staff]);
  const staffNameToId = useMemo(() => {
    const map = new Map<string, string>();
    staffList.forEach((s) => map.set(s.name, s.id));
    return map;
  }, [staffList]);
  const staffOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [{ label: "All", value: "all" }];
    staffList.forEach((s) => opts.push({ label: s.name, value: s.id }));
    return opts;
  }, [staffList]);

  /**
   * §Calendar-hours: delegate the per-day visible range to the shared
   * `deriveGridHourWindow` so overnight shifts, sub-hour opens, and
   * staff-only weekend windows are all handled in one place.
   */
  function getHoursForDay(day: Date): { startHour: number; endHour: number; isOpen: boolean } {
    const staffWorkingHours = (staffList ?? [])
      .map((m) => (m?.working_hours ?? null) as WeeklyHours | null);
    const { startHour, endHour, hasAnyOpenSlot } = deriveGridHourWindow({
      visibleDates: [day],
      locationOperatingHours: (operatingHours ?? null) as WeeklyHours | null,
      staffWorkingHours,
      defaultStartHour: Math.max(0, preferences.workdayStartHour - 1),
      defaultEndHour: Math.min(23, preferences.workdayEndHour + 1),
      paddingHours: 1,
      timeZone: provider?.timezone ?? null,
    });
    return { startHour, endHour, isOpen: hasAnyOpenSlot };
  }

  const todayHours = getHoursForDay(selectedDate);
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
    const staffWorkingHours = (staffList ?? [])
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
    staffList,
    preferences.workdayStartHour,
    preferences.workdayEndHour,
    provider?.timezone,
  ]);

  const scrollToCurrentTime = useCallback(() => {
    if (!preferences.scrollToNow || hasScrolledToNow.current) return;
    const now = new Date();
    const { h } = getHourMinuteForInstantInZone(now, provider?.timezone ?? null);
    const offset = Math.max(0, (h - startHour - 1) * SLOT_HEIGHT);
    scrollRef.current?.scrollTo({ y: offset, animated: false });
    hasScrolledToNow.current = true;
  }, [preferences.scrollToNow, startHour, SLOT_HEIGHT, provider?.timezone]);

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

  // staffList / staffOptions / staffNameToId moved above getHoursForDay to avoid TDZ.

  const locationOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [{ label: "All Locations", value: "all" }];
    locations?.forEach((l) => opts.push({ label: l.name, value: l.id }));
    return opts;
  }, [locations]);

  const filteredBookings = useMemo(() => {
    if (!bookings || !Array.isArray(bookings)) return [];
    let result = bookings;
    if (!preferences.showCanceled) {
      result = result.filter((b) => b.status !== "cancelled");
    }
    if (viewMode === "day") {
      result = result.filter((b) => {
        const bDate = parseApiDateTime(b.scheduled_at);
        return bDate ? isSameDay(bDate, selectedDate) : false;
      });
    } else if (viewMode === "3day") {
      result = result.filter((b) => {
        const bDate = parseApiDateTime(b.scheduled_at);
        if (!bDate) return false;
        return bDate >= selectedDate && bDate < addDays(selectedDate, 3);
      });
    }
    if (staffFilter !== "all") {
      result = result.filter((b) =>
        b.services?.some((s) => {
          if (s.staff_id === staffFilter) return true;
          if (!s.staff_name) return false;
          return staffNameToId.get(s.staff_name) === staffFilter;
        }),
      );
    }
    return result;
  }, [bookings, selectedDate, viewMode, staffFilter, staffNameToId, preferences.showCanceled]);

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
    const d = format(selectedDate, "yyyy-MM-dd");
    pushInAppBrowser(router, `${base}/provider/calendar?date=${encodeURIComponent(d)}`, "Calendar");
  }, [router, selectedDate, t]);

  const openCalendarActionsMenu = useCallback(() => {
    const runShare = () => {
      void handleShareSchedule();
    };
    const runCopy = () => {
      void handleCopySchedule();
    };
    const runMonth = () => setMonthOverviewVisible(true);
    const runWeb = () => handleOpenWebCalendar();
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t("provider.calendarScreen.cancel"),
            t("provider.calendarScreen.shareSchedule"),
            t("provider.calendarScreen.copySchedule"),
            t("provider.calendarScreen.monthOverview"),
            t("provider.calendarScreen.fullCalendarBrowser"),
          ],
          cancelButtonIndex: 0,
          title: t("provider.calendarScreen.calendarActions"),
        },
        (idx) => {
          if (idx === 1) runShare();
          else if (idx === 2) runCopy();
          else if (idx === 3) runMonth();
          else if (idx === 4) runWeb();
        },
      );
    } else {
      Alert.alert(t("provider.calendarScreen.calendarActions"), undefined, [
        { text: t("provider.calendarScreen.shareSchedule"), onPress: runShare },
        { text: t("provider.calendarScreen.copySchedule"), onPress: runCopy },
        { text: t("provider.calendarScreen.monthOverview"), onPress: runMonth },
        { text: t("provider.calendarScreen.fullCalendarBrowser"), onPress: runWeb },
        { text: t("provider.calendarScreen.close"), style: "cancel" },
      ]);
    }
  }, [handleCopySchedule, handleOpenWebCalendar, handleShareSchedule, t]);

  const availabilitySegments = useMemo(() => {
    if (!availabilityRaw?.length) return [];
    const normalized = normalizeAvailabilityBlocksToSegments(availabilityRaw);
    if (locationFilter !== "all") {
      return normalized.filter((s) => s.location_id == null || s.location_id === locationFilter);
    }
    return normalized;
  }, [availabilityRaw, locationFilter]);

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

    for (const seg of bookingHoldSegments ?? []) {
      if (seg.date !== dayStr) continue;
      if (!blockMatchesStaff(seg.team_member_id)) continue;
      if (!blockMatchesLocation(seg.location_id)) continue;
      out.push({
        id: seg.id,
        staff_id: seg.team_member_id,
        block_type: "booking_hold",
        title: seg.reason?.trim() || t("provider.calendarScreen.bookingHoldTitle"),
        start_time: seg.start_time,
        end_time: seg.end_time,
        date: seg.date,
        calendar_overlay_kind: "booking_hold",
        hold_id: seg.hold_id ?? seg.id,
        hold_expires_at: seg.hold_expires_at ?? null,
      });
    }

    if (preferences.showProcessingAndBuffer && expandedApiTimeBlocks.length > 0) {
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
    const map = new Map<string, Booking[]>();
    filteredBookings.forEach((b) => {
      const bDate = parseApiDateTime(b.scheduled_at);
      if (!bDate) return;
      const key = format(bDate, "yyyy-MM-dd");
      const existing = map.get(key);
      if (existing) {
        existing.push(b);
      } else {
        map.set(key, [b]);
      }
    });
    return map;
  }, [filteredBookings]);

  const bookingsByStaffId = useMemo(() => {
    const byStaffId = new Map<string, Booking[]>();
    staffList.forEach((s) => byStaffId.set(s.id, []));
    const unassigned: Booking[] = [];

    filteredBookings.forEach((b) => {
      const matchedIds = new Set<string>();
      b.services?.forEach((svc) => {
        if (svc.staff_id && byStaffId.has(svc.staff_id)) {
          matchedIds.add(svc.staff_id);
          return;
        }
        if (svc.staff_name) {
          const mappedStaffId = staffNameToId.get(svc.staff_name);
          if (mappedStaffId) matchedIds.add(mappedStaffId);
        }
      });

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
    bookings.forEach((b) => {
      const bDate = parseApiDateTime(b.scheduled_at);
      if (!bDate) return;
      const key = format(bDate, "yyyy-MM-dd");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [bookings]);

  const staffColumns = useMemo(() => {
    if (viewMode !== "day") return null;
    if (staffFilter !== "all") return null;
    if (staffList.length <= 1) return null;

    const cols: { staffId: string; staffName: string; bookings: Booking[] }[] = staffList.map((s) => ({
      staffId: s.id,
      staffName: s.name,
      bookings: bookingsByStaffId.byStaffId.get(s.id) ?? [],
    }));

    if (bookingsByStaffId.unassigned.length > 0) {
      cols.push({
        staffId: "unassigned",
        staffName: t("provider.calendarScreen.staffColumn.unassigned"),
        bookings: bookingsByStaffId.unassigned,
      });
    }

    return cols.filter((c) => c.bookings.length > 0 || cols.length <= 4);
  }, [viewMode, staffList, staffFilter, bookingsByStaffId, t]);

  const todayBookingCount = useMemo(
    () => bookingCountsByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? 0,
    [bookingCountsByDate, selectedDate],
  );

  const pendingOnSelectedDay = useMemo(
    () => filteredBookings.filter((b) => b.db_status === "pending").length,
    [filteredBookings],
  );

  /** Pending confirmations in the next week — surface on calendar so nothing slips. */
  const pendingAttentionCount = useMemo(() => {
    if (!bookings || !Array.isArray(bookings)) return 0;
    const start = startOfDay(new Date());
    const end = addDays(start, 8);
    return bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      if (b.db_status !== "pending") return false;
      const d = parseApiDateTime(b.scheduled_at);
      return d != null && d >= start && d < end;
    }).length;
  }, [bookings]);

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

  function navigateDate(direction: number) {
    const amount = viewMode === "week" ? 7 : viewMode === "3day" ? 3 : 1;
    hasScrolledToNow.current = false;
    setSelectedDate((prev) => (direction > 0 ? addDays(prev, amount) : subDays(prev, amount)));
  }

  function handleTapSlot(
    hour: number,
    minute: number,
    day?: Date,
    columnStaffId?: string | null,
  ) {
    const targetDay = day ?? selectedDate;
    const dateParam = format(targetDay, "yyyy-MM-dd");
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
    if (columnStaffId && columnStaffId !== "all") {
      params.set("staff_id", columnStaffId);
    } else if (staffFilter !== "all") {
      params.set("staff_id", staffFilter);
    }
    if (locationFilter !== "all") {
      params.set("location_id", locationFilter);
    }
    router.push(
      `/(app)/(tabs)/more/bookings/new?${params.toString()}` as never,
    );
  }

  function handleTapBooking(bookingId: string) {
    router.push(`/(app)/(tabs)/more/bookings/${bookingId}` as never);
  }

  function handleLongPressBooking(booking: Booking) {
    const availableActions = STATUS_ACTION_KEYS.filter((key) => key !== booking.status);
    const actionLabels = availableActions.map((key) => getStatusActionLabel(t, key));
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
            handleTapBooking(booking.id);
            return;
          }
          if (buttonIndex === 2) {
            router.push(`/(app)/(tabs)/more/bookings/${booking.id}?focusPayment=1` as never);
            return;
          }
          const actionKey = availableActions[buttonIndex - 3];
          if (actionKey) changeBookingStatus(booking.id, actionKey);
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

  async function changeBookingStatus(bookingId: string, newStatus: string) {
    if (newStatus === "cancelled") {
      setCancelReasonBookingId(bookingId);
      setCancelReasonText("");
      return;
    }
    await applyBookingStatus(bookingId, newStatus);
  }

  async function applyBookingStatus(bookingId: string, newStatus: string, reason?: string) {
    if (bookings) {
      setBookings(bookings.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b)));
    }
    if (newStatus === "completed") {
      const { error } = await postBookingAction(`/api/provider/bookings/${bookingId}/complete-service`, {});
      if (error) { Alert.alert("Couldn't complete service", error); refresh(); }
      return;
    }
    if (newStatus === "started") {
      const { error } = await postBookingAction(`/api/provider/bookings/${bookingId}/start-service`, {});
      if (error) { Alert.alert("Couldn't start service", error); refresh(); }
      return;
    }
    const body: Record<string, unknown> = { status: newStatus };
    if (newStatus === "cancelled" && reason) body.cancellation_reason = reason;
    const { error } = await patchBooking(`/api/provider/bookings/${bookingId}`, body);
    if (error) { Alert.alert("Couldn't update booking", error); refresh(); }
  }

  /** Drag-and-drop: compute new time and optionally staff from drop position, check availability, then PATCH */
  async function handleBookingDrop(
    booking: Booking,
    absoluteX: number,
    absoluteY: number,
    targetStaffColumns: { staffId: string; staffName: string; bookings: Booking[] }[] | null,
    targetDayColumnWidth: number,
    targetDay: Date,
  ) {
    gridContainerRef.current?.measureInWindow((gridX, gridY) => {
      const scrollY = scrollOffsetRef.current.y;
      const scrollX = scrollOffsetRef.current.x;
      const contentY = scrollY + (absoluteY - gridY);
      const contentX = scrollX + (absoluteX - gridX);

      const slotOffset = contentY - GRID_TOP_PADDING;
      const slotIndex = Math.max(0, slotOffset / SLOT_HEIGHT);
      const hour = startHour + Math.floor(slotIndex);
      const frac = slotIndex % 1;
      const inc = preferences.timeIncrementMinutes;
      const minute = Math.round((frac * 60) / inc) * inc;
      const clampedMinute = Math.min(59, Math.max(0, minute));
      const hourClamp = Math.min(23, Math.max(0, hour));
      // §Release-audit 2026-04: build a timezone-aware ISO using the
      // **provider's** IANA zone (e.g. Africa/Johannesburg), not the
      // device's. Previously we used `naive.getTimezoneOffset()` which
      // encoded the phone's zone into the ISO — providers on travel or
      // running a business in a different zone than their device would
      // have bookings persisted at the wrong UTC instant, manifesting as
      // "booking moved to 3am" after a drag. The helper falls back to the
      // device zone if the provider record has no timezone yet, preserving
      // the pre-fix behaviour for that legacy case.
      const naiveDateStr = format(targetDay, "yyyy-MM-dd");
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

      const durationMinutes = booking.services?.reduce((s, svc) => s + svc.duration_minutes, 0) ?? 60;
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
        const res = await api.get<{ available?: boolean; conflicts?: string[] }>(checkUrl);
        if (res.error) {
          Alert.alert("Couldn't move appointment", res.error.message ?? "We couldn't check availability for that slot. Please try again.");
          return;
        }
        const available = res.data?.available ?? false;
        if (!available) {
          Alert.alert(
            "Slot not available",
            res.data?.conflicts?.join("\n") ?? "Another booking or block overlaps this time.",
          );
          return;
        }
        const payload: { scheduled_at: string; staff_id?: string | null } = { scheduled_at: newScheduledAt };
        if (newStaffId !== undefined) payload.staff_id = newStaffId || null;
        const { error } = await patchBooking(`/api/provider/bookings/${booking.id}`, payload);
        if (error) {
          Alert.alert("Couldn't move appointment", error);
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refresh();
      })();
    });
  }

  /* ─── 3-day view days ─── */
  const threeDays = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => addDays(selectedDate, i));
  }, [selectedDate]);

  /* ─── FAB toggle ─── */
  function toggleFab() {
    const toValue = fabOpen ? 0 : 1;
    Animated.spring(fabAnim, { toValue, useNativeDriver: true, friction: 6 }).start();
    setFabOpen(!fabOpen);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  /* ─── Time block creation ─── */
  async function handleCreateTimeBlock() {
    if (!timeBlockForm.startTime || !timeBlockForm.endTime) {
      Alert.alert("Start and end time required", "Please set both a start and end time for this block.");
      return;
    }
    const { error } = await createTimeBlock("/api/provider/time-blocks", {
      name: timeBlockForm.title.trim() || capitalizeFirst(timeBlockForm.type),
      start_time: timeBlockForm.startTime,
      end_time: timeBlockForm.endTime,
      date: dateStr,
      staff_id: timeBlockForm.staffId ? timeBlockForm.staffId : null,
    });
    if (error) {
      Alert.alert("Couldn't save time block", error);
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
        ? ` Expires ${new Date(block.hold_expires_at).toLocaleTimeString()}.`
        : "";
      Alert.alert(
        "Booking hold",
        `A customer is currently finalising checkout for this slot.${expiresText} It will clear automatically if they don't complete payment.`,
      );
      return;
    }
    if (block.calendar_overlay_kind === "staff_off") {
      Alert.alert(
        "Team time off",
        "This comes from staff time off or day off. Update it in team scheduling, not from the calendar grid.",
      );
      return;
    }
    if (block.calendar_overlay_kind === "availability" && block.availability_block_id) {
      Alert.alert(
        `${capitalizeFirst(block.block_type)} · ${block.start_time}–${block.end_time}`,
        block.title,
        [
          {
            text: "Edit",
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
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Alert.alert("Remove this block?", "Clients may be able to book this time again.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    const { error } = await deleteAvailabilityBlock(
                      `/api/provider/availability-blocks/${block.availability_block_id}`,
                    );
                    if (error) {
                      Alert.alert("Couldn't remove block", error);
                      return;
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    refreshAvailabilityBlocks();
                  },
                },
              ]);
            },
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }
    if (block.calendar_overlay_kind === "time_block") {
      Alert.alert("Time block", block.title, [
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert("Remove time block?", "", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  const recordId = resolveTimeBlockRecordId(block);
                  const { error } = await deleteCalendarTimeBlock(`/api/provider/time-blocks/${recordId}`);
                  if (error) {
                    Alert.alert("Couldn't remove time block", error);
                    return;
                  }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  refreshTimeBlocks();
                },
              },
            ]);
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  async function handleSaveAvailabilityEdit() {
    if (!availabilityEdit) return;
    const start = new Date(`${availabilityEdit.date}T${availabilityEdit.start_time}:00`);
    const end = new Date(`${availabilityEdit.date}T${availabilityEdit.end_time}:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      Alert.alert("Invalid time", "Use HH:MM format for start and end.");
      return;
    }
    if (end.getTime() <= start.getTime()) {
      Alert.alert("Invalid range", "End time must be after start time.");
      return;
    }
    const { error } = await updateAvailabilityBlock(`/api/provider/availability-blocks/${availabilityEdit.id}`, {
      block_type: availabilityEdit.block_type,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      staff_id: availabilityEdit.staff_id,
    });
    if (error) {
      Alert.alert("Couldn't save block", error);
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

  /* ═══════════════ Render a booking block (optional drag when dropContext provided) ═══════════════ */

  function renderBookingBlock(
    booking: Booking,
    colWidth: number,
    day: Date,
    dropContext?: DropContext | null,
  ) {
    const walkInLabel = t("provider.calendarScreen.walkIn");
    const top = GRID_TOP_PADDING + getTopOffset(booking.scheduled_at, startHour, SLOT_HEIGHT, provider?.timezone ?? null);
    const height = getBlockHeight(booking, SLOT_HEIGHT, preferences.compactMode);
    const colors = getBlockColors(booking, preferences.colorBy, staffList);
    const isSmall = height < (preferences.compactMode ? 24 : 40);
    const isNew = isNewBooking(booking);
    const isCancelled = booking.status === "cancelled";
    const hasNotes = !!booking.notes;
    const blockBg = preferences.highContrast ? Colors.gray[800] : colors.bg;
    const blockTextColor = preferences.highContrast ? Colors.white : colors.text;
    const canDrag =
      dropContext &&
      booking.status !== "completed" &&
      booking.status !== "cancelled" &&
      viewMode === "day";

    const subTextColor = preferences.highContrast ? Colors.gray[400] : Colors.gray[500];
    // §Provider-launch (audit 2026-04): drag-to-reschedule claims the
    // long-press gesture on day view, which used to completely block the
    // status action menu (Confirm / Start / Complete / No-show / Cancel).
    // Add an explicit overflow ("⋯") affordance in the corner of the
    // booking card so the menu is still one tap away even when the card is
    // drag-enabled. Hidden for very small cards to avoid crowding.
    const overflowButton =
      !isSmall && height >= 30 ? (
        <TouchableOpacity
          onPress={(e) => {
            // Don't let the tap bubble into the parent card's onPress
            // (which would open booking detail) or trigger drag.
            e?.stopPropagation?.();
            handleLongPressBooking(booking);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            zIndex: 20,
            paddingHorizontal: 4,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: preferences.highContrast ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)",
          }}
          accessibilityRole="button"
          accessibilityLabel={t("provider.calendarScreen.bookingActionsMessage")}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={12}
            color={preferences.highContrast ? Colors.white : Colors.gray[700]}
          />
        </TouchableOpacity>
      ) : null;

    const blockContent = (
      <>
        {preferences.showAppointmentIcons && isNew && (
          <View style={{ position: "absolute", right: -2, top: -2, borderBottomLeftRadius: 6, backgroundColor: "#4f46e6", paddingHorizontal: 4, paddingVertical: 2 }}>
            <Text
              style={{ fontSize: 9, fontWeight: "700", color: Colors.white }}
              allowFontScaling={false}
            >
              NEW
            </Text>
          </View>
        )}
        {overflowButton}
        {/**
         * §UX-audit 2026-04: raised legibility floor on calendar chips.
         * Primary name was 10px (below mobile minimums and unusable for
         * Dynamic Type / high-contrast modes). Locked to 12px with
         * `allowFontScaling={false}` + a compact 11px for secondary rows
         * so chips still fit but don't require a magnifier.
         */}
        {isSmall ? (
          <Text
            style={{ fontSize: 12, fontWeight: "600", color: blockTextColor }}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {booking.customers?.full_name ?? walkInLabel}
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{ flex: 1, fontSize: 12, fontWeight: "700", color: blockTextColor }}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {booking.customers?.full_name ?? walkInLabel}
              </Text>
              {preferences.showAppointmentIcons && hasNotes && (
                <Ionicons name="document-text-outline" size={12} color={preferences.highContrast ? "#fff" : "#6b7280"} />
              )}
            </View>
            {booking.services?.length > 0 && (
              <Text
                style={{ fontSize: 11, color: preferences.highContrast ? Colors.gray[300] : Colors.gray[600] }}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {booking.services.map((s) => (s.guest_name ? `${s.name ?? s.offering_name ?? "Service"} (${s.guest_name})` : (s.name ?? s.offering_name ?? "Service"))).join(", ")}
              </Text>
            )}
            {booking.is_group_booking && booking.group_booking_ref && (
              <Text
                style={{ marginTop: 2, fontSize: 11, color: subTextColor }}
                numberOfLines={1}
                allowFontScaling={false}
              >
                Group: {booking.group_booking_ref}
              </Text>
            )}
            {booking.location_type === "at_home" && (
              <Text
                style={{ marginTop: 2, fontSize: 11, color: subTextColor }}
                numberOfLines={1}
                allowFontScaling={false}
              >
                At home
              </Text>
            )}
            {!preferences.compactMode && height >= 55 && (
              <Text
                style={{ marginTop: 2, fontSize: 11, color: subTextColor }}
                allowFontScaling={false}
              >
                {formatTimeInZone(booking.scheduled_at, provider?.timezone ?? null)}
                {preferences.showPrices && <> &middot; {formatCurrency(booking.total_amount, booking.currency)}</>}
              </Text>
            )}
            {preferences.showClientPhone && !preferences.compactMode && height >= 70 && booking.customers?.phone && (
              <Text style={{ fontSize: 8, color: subTextColor }} numberOfLines={1}>
                {booking.customers.phone}
              </Text>
            )}
          </>
        )}
      </>
    );

    const blockStyle = {
      position: "absolute" as const,
      left: 4,
      right: 4,
      top,
      height: Math.max(height, 20),
      zIndex: 10,
      opacity: draggingBooking?.id === booking.id ? 0.4 : isCancelled ? 0.5 : 1,
      overflow: "hidden" as const,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: colors.border,
      backgroundColor: blockBg,
      paddingHorizontal: 6,
      paddingVertical: 4,
    };

    if (canDrag) {
      const longPress = Gesture.LongPress()
        .minDuration(400)
        .onStart(() => {
          draggingRef.current = true;
          setDraggingBooking(booking);
          setDragPosition({ x: 0, y: 0 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        });

      const pan = Gesture.Pan()
        .onUpdate((e) => {
          if (draggingRef.current) {
            setDragPosition({ x: e.absoluteX - colWidth / 2, y: e.absoluteY - 24 });
          }
        })
        .onEnd((e) => {
          if (draggingRef.current && draggingBooking?.id === booking.id) {
            handleBookingDrop(
              booking,
              e.absoluteX,
              e.absoluteY,
              dropContext?.staffColumns ?? null,
              dropContext?.dayColumnWidth ?? colWidth,
              dropContext?.day ?? day,
            );
          }
          draggingRef.current = false;
          setDraggingBooking(null);
          setDragPosition(null);
        });

      const composed = Gesture.Simultaneous(longPress, pan);

      return (
        <GestureDetector key={booking.id} gesture={composed}>
          <TouchableOpacity
            style={blockStyle}
            activeOpacity={0.7}
            onPress={() => !draggingRef.current && handleTapBooking(booking.id)}
            onLongPress={() => {
              if (!draggingRef.current) handleLongPressBooking(booking);
            }}
            delayLongPress={500}
            accessibilityRole="button"
            accessibilityLabel={t("provider.calendarScreen.bookingA11yLongPress", {
              name: booking.customers?.full_name?.trim() || walkInLabel,
              time: formatTimeInZone(booking.scheduled_at, provider?.timezone ?? null),
            })}
          >
            {blockContent}
          </TouchableOpacity>
        </GestureDetector>
      );
    }

    return (
      <TouchableOpacity
        key={booking.id}
        style={blockStyle}
        activeOpacity={0.7}
        onPress={() => handleTapBooking(booking.id)}
        onLongPress={() => handleLongPressBooking(booking)}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={t("provider.calendarScreen.bookingA11yShort", {
          name: booking.customers?.full_name?.trim() || walkInLabel,
          time: formatTimeInZone(booking.scheduled_at, provider?.timezone ?? null),
          status: translateBookingStatusLabel(t, booking.status),
        })}
      >
        {blockContent}
      </TouchableOpacity>
    );
  }

  /* ═══════════════ Render a time block ═══════════════ */

  function renderTimeBlock(block: TimeBlock) {
    const bColors = getCalendarOverlayColors(block);
    const startMin = timeStringToMinutes(block.start_time);
    const endMin = timeStringToMinutes(block.end_time);
    const top = GRID_TOP_PADDING + Math.max(0, (startMin / 60 - startHour) * SLOT_HEIGHT);
    const height = Math.max(((endMin - startMin) / 60) * SLOT_HEIGHT, QUARTER_HEIGHT);
    const interactive = !!block.calendar_overlay_kind;
    // §Provider-launch (audit 2026-04): ghost booking_holds should read as
    // tentative slots, matching the web `TimeBlockElement` which uses a
    // dashed border. Regular time blocks / staff-off / availability still
    // get the solid accent stripe on the left.
    const isBookingHold = block.calendar_overlay_kind === "booking_hold";
    const boxStyle = isBookingHold
      ? {
          position: "absolute" as const,
          left: 4,
          right: 4,
          top,
          height,
          zIndex: 5,
          overflow: "hidden" as const,
          borderRadius: 6,
          borderWidth: 1,
          borderStyle: "dashed" as const,
          borderColor: bColors.border,
          backgroundColor: bColors.bg,
          paddingHorizontal: 6,
          paddingVertical: 2,
        }
      : {
          position: "absolute" as const,
          left: 4,
          right: 4,
          top,
          height,
          zIndex: 5,
          overflow: "hidden" as const,
          borderRadius: 6,
          borderLeftWidth: 3,
          borderLeftColor: bColors.border,
          backgroundColor: bColors.bg,
          paddingHorizontal: 6,
          paddingVertical: 2,
        };
    const label = (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name={bColors.icon as keyof typeof Ionicons.glyphMap} size={10} color={bColors.text} />
        <Text style={{ marginLeft: 4, fontSize: 9, fontWeight: "500", color: bColors.text }} numberOfLines={1}>
          {block.title || capitalizeFirst(block.block_type)}
        </Text>
      </View>
    );
    if (interactive) {
      return (
        <Pressable
          key={block.id}
          onPress={() => openOverlayBlockMenu(block)}
          style={({ pressed }) => [boxStyle, { opacity: pressed ? 0.88 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${block.block_type} ${block.start_time} to ${block.end_time}. Tap for edit or delete.`}
        >
          {label}
        </Pressable>
      );
    }
    return (
      <View key={block.id} style={[boxStyle, { pointerEvents: "none" }]}>
        {label}
      </View>
    );
  }

  /* ═══════════════ Operating hours shading ═══════════════ */

  function renderHoursShading(day: Date) {
    if (!operatingHours) return null;
    const shadeBg = preferences.highContrast ? Colors.gray[700] : Colors.gray[200];

    // §Calendar-hours: use the shared engine so overnight shifts (22:00-02:00)
    // render correctly on BOTH days — the grid gets an open range on the
    // opening day and another on the wrap-around day, with the non-open
    // portions shaded in between.
    const openRanges = dayMinuteRanges(
      day,
      operatingHours as WeeklyHours,
      provider?.timezone ?? null,
    );

    if (openRanges.length === 0) {
      const tz = provider?.timezone ?? null;
      const weekdayIndex = tz ? getWeekdayInTimeZone(day, tz) : day.getDay();
      const dayName2 = DAY_NAMES[weekdayIndex] ?? "monday";
      const anyStaffWorks = staffList.some((s) => {
        const wh = s.working_hours?.[dayName2];
        if (!wh) return false;
        const norm = normalizeOperatingSchedule(wh);
        return norm?.isOpen === true;
      });
      if (anyStaffWorks) return null;
      return (
        <View style={{ position: "absolute", left: 0, right: 0, top: GRID_TOP_PADDING, height: totalGridHeight, backgroundColor: shadeBg, opacity: 0.3, zIndex: 1, pointerEvents: "none" }} />
      );
    }

    const gridStartMin = startHour * 60;
    const gridEndMin = (endHour + 1) * 60;
    const minToTop = (min: number) =>
      GRID_TOP_PADDING + ((Math.max(gridStartMin, Math.min(gridEndMin, min)) - gridStartMin) / 60) * SLOT_HEIGHT;

    const elements: React.ReactNode[] = [];
    let cursor = gridStartMin;
    openRanges.forEach((range, idx) => {
      if (range.endMin <= gridStartMin || range.startMin >= gridEndMin) return;
      if (range.startMin > cursor) {
        const top = minToTop(cursor);
        const bottom = minToTop(range.startMin);
        const height = bottom - top;
        if (height > 0) {
          elements.push(
            <View
              key={`gap-${idx}-before`}
              style={{ position: "absolute", left: 0, right: 0, top, height, backgroundColor: shadeBg, opacity: 0.3, zIndex: 1, pointerEvents: "none" }}
            />,
          );
        }
      }
      cursor = Math.max(cursor, range.endMin);
    });
    if (cursor < gridEndMin) {
      const top = minToTop(cursor);
      const bottom = minToTop(gridEndMin);
      const height = bottom - top;
      if (height > 0) {
        elements.push(
          <View
            key="tail"
            style={{ position: "absolute", left: 0, right: 0, top, height, backgroundColor: shadeBg, opacity: 0.3, zIndex: 1, pointerEvents: "none" }}
          />,
        );
      }
    }
    return <>{elements}</>;
  }

  /* ═══════════════ Render a day grid column ═══════════════ */

  type DropContext = {
    staffColumns: { staffId: string; staffName: string; bookings: Booking[] }[];
    dayColumnWidth: number;
    day: Date;
  } | null;

  function renderDayGrid(
    day: Date,
    bookingsForDay: Booking[],
    colWidth: number,
    showTimeIndicator = true,
    dropContext?: DropContext | null,
    blockContext?: { staffColumnId?: string | null } | null,
  ) {
    const dayBlocks = getCalendarBlocksForDay(day, blockContext);
    return (
      <View style={{ width: colWidth, height: totalGridHeight + GRID_TOP_PADDING, paddingTop: GRID_TOP_PADDING, position: "relative" }}>
        {renderHoursShading(day)}

        {/* Grid rows + half-hour dashed lines */}
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 1 }}>
          {gridRows.map((row, idx) => (
            <TouchableOpacity
              key={`${row.hour}-${row.minute}`}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: idx * rowHeight + GRID_TOP_PADDING,
                height: rowHeight,
                borderTopWidth: 1,
                borderTopColor: row.minute === 0 ? Colors.gray[200] : Colors.gray[50],
              }}
              activeOpacity={0.6}
              onPress={() =>
                handleTapSlot(row.hour, row.minute, day, blockContext?.staffColumnId ?? null)
              }
              accessibilityRole="button"
              accessibilityLabel={`Book at ${row.label} on ${format(day, "EEEE, MMMM d")}`}
            />
          ))}
          {/* Half-hour dashed lines */}
          {Array.from({ length: endHour - startHour }, (_, i) => (
            <View
              key={`half-${i}`}
              style={{ position: "absolute", left: 0, right: 0, top: i * SLOT_HEIGHT + SLOT_HEIGHT / 2 + GRID_TOP_PADDING, height: 1, borderTopWidth: 1, borderStyle: "dashed", borderColor: "#e5e7eb", zIndex: 0, pointerEvents: "none" }}
            />
          ))}
        </View>

        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 5, pointerEvents: "box-none" }}>
          {dayBlocks.map((tb) => renderTimeBlock(tb))}
        </View>

        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 10, pointerEvents: "box-none" }}>
          {bookingsForDay.map((b) => renderBookingBlock(b, colWidth, day, dropContext))}
        </View>

        {/*
          §Provider-launch (audit 2026-04): explicit empty-day copy so the
          calendar doesn't read as "broken or still loading" when a staff
          member has a clean diary. Only shown in day view and only when
          nothing at all would render (no bookings, no blocks).
        */}
        {viewMode === "day" && bookingsForDay.length === 0 && dayBlocks.length === 0 && !loading && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: GRID_TOP_PADDING + 40,
              alignItems: "center",
              zIndex: 4,
            }}
          >
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.gray[50], borderWidth: 1, borderColor: Colors.gray[200] }}>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>
                No appointments — tap a slot to add one
              </Text>
            </View>
          </View>
        )}

        {showTimeIndicator && viewMode === "day" && isSameDay(day, new Date()) && (
          <CurrentTimeIndicator
            startHour={startHour}
            slotHeight={SLOT_HEIGHT}
            endHour={endHour}
            totalGridHeight={totalGridHeight}
            timeZone={provider?.timezone ?? null}
          />
        )}
      </View>
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
            accessibilityLabel={viewMode === "week" ? "Previous week" : "Previous day"}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setDatePickerVisible(true)}
            style={{ flexDirection: "row", alignItems: "center" }}
            accessibilityLabel="Jump to date"
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
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>{pendingOnSelectedDay} pending</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={openCalendarActionsMenu}
              hitSlop={8}
              style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", marginRight: 4 }}
              accessibilityLabel="Calendar actions: share, copy, month, open in browser"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPrefsVisible(true)}
              hitSlop={8}
              style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", marginRight: 8 }}
              accessibilityLabel="Calendar preferences"
            >
              <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigateDate(1)}
              hitSlop={8}
              style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
              accessibilityLabel={viewMode === "week" ? "Next week" : "Next day"}
            >
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* View toggle + Today */}
        <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", borderRadius: 8, padding: 2, backgroundColor: "rgba(255,255,255,0.1)" }}>
            {([
              { key: "day" as ViewMode, label: "DAY" },
              { key: "3day" as ViewMode, label: "3 DAY" },
              { key: "week" as ViewMode, label: "WEEK" },
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
                accessibilityLabel={`${waitingCount} waiting`}
              >
                <Ionicons name="people" size={12} color="#fca5a5" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#fca5a5" }}>{waitingCount}</Text>
              </TouchableOpacity>
            )}
            {preferences.colorBy !== "status" && (
              <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(79,209,197,0.2)", marginRight: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "500", color: TEAL_ACCENT }}>
                  {preferences.colorBy === "service" ? "By Service" : "By Staff"}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setShowLegend(true)}
              style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.1)", marginRight: 8 }}
              accessibilityLabel="Color legend"
            >
              <Ionicons name="color-palette-outline" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: TEAL_ACCENT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
              onPress={() => { setSelectedDate(new Date()); hasScrolledToNow.current = false; }}
              accessibilityLabel="Today"
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: DARK_HEADER }}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scrollable date strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, paddingHorizontal: 8 }} contentContainerStyle={{ flexDirection: "row" }}>
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const count = bookingCountsByDate.get(format(day, "yyyy-MM-dd")) ?? 0;
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
          accessibilityLabel={`Front desk: ${pendingAttentionCount} bookings need confirmation`}
        >
          <Ionicons name={urgentPendingCount > 0 ? "flash" : "alert-circle"} size={22} color={urgentPendingCount > 0 ? "#DC2626" : "#D97706"} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: urgentPendingCount > 0 ? "#991B1B" : "#78350F" }}>
              {urgentPendingCount > 0
                ? `${urgentPendingCount} pending within 2h — confirm or decline`
                : `${pendingAttentionCount} booking${pendingAttentionCount !== 1 ? "s" : ""} need confirmation`}
            </Text>
            <Text style={{ fontSize: 12, color: urgentPendingCount > 0 ? "#B91C1C" : "#92400E", marginTop: 2 }}>
              Front Desk shows today’s schedule and check-ins
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={urgentPendingCount > 0 ? "#DC2626" : "#D97706"} />
        </TouchableOpacity>
      )}

      {/* ─── Layout Toggle + Staff Filter (matches web "Staff View" bar) ─── */}
      {viewMode === "day" && staffList.length > 1 && staffFilter === "all" && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.gray[200], backgroundColor: Colors.white, paddingVertical: 8, ...(isTablet ? { paddingHorizontal: screenPadding } : { paddingHorizontal: 12 }) }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="people-outline" size={14} color="#6366f1" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, color: Colors.gray[900] }}>Staff View</Text>
            </View>
            <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[100], padding: 2 }}>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, marginRight: 4, backgroundColor: layoutMode === "columns" ? Colors.white : "transparent", elevation: layoutMode === "columns" ? 1 : 0, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
                onPress={() => setLayoutMode("columns")}
              >
                <Ionicons name="grid-outline" size={12} color={layoutMode === "columns" ? "#111" : "#9ca3af"} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: layoutMode === "columns" ? Colors.gray[900] : Colors.gray[500] }}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: layoutMode === "single" ? Colors.white : "transparent", elevation: layoutMode === "single" ? 1 : 0, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
                onPress={() => setLayoutMode("single")}
              >
                <Ionicons name="person-outline" size={12} color={layoutMode === "single" ? "#111" : "#9ca3af"} style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: layoutMode === "single" ? Colors.gray[900] : Colors.gray[500] }}>Single</Text>
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
                    <View
                      style={[ { height: 24, width: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, marginRight: 8 }, isActive ? { backgroundColor: TEAL_ACCENT } : { backgroundColor: Colors.gray[300] } ]}
                    >
                      <Text style={[ { fontSize: 9, fontWeight: "700" }, isActive ? { color: DARK_HEADER } : { color: Colors.gray[600] } ]}>
                        {member.name.charAt(0)}
                      </Text>
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
          accessibilityLabel="Calendar may be out of date. Tap to refresh."
        >
          <Ionicons name="cloud-offline-outline" size={18} color="#B45309" />
          <Text style={{ flex: 1, marginLeft: 10, fontSize: 12, fontWeight: "600", color: "#92400E" }} numberOfLines={2}>
            Showing last known schedule — tap to refresh
          </Text>
          <Ionicons name="refresh" size={16} color="#B45309" />
        </TouchableOpacity>
      )}

      {/* ─── Calendar grid — ALWAYS shown, never blocked by empty state ─── */}
      {loading && !bookings ? (
        <CalendarSkeleton />
      ) : fetchError && !bookings ? (
        <ErrorState
          title="Can't load your calendar"
          message={fetchError}
          onRetry={refresh}
          retryLabel="Reload"
          icon="calendar-outline"
        />
      ) : (
        <ScrollView
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
          {...panResponder.panHandlers}
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
                    style={{ position: "absolute", left: 0, right: 0, top: (row.hour - startHour) * SLOT_HEIGHT, width: TIME_COL_WIDTH, alignItems: "flex-end", paddingRight: 8 }}
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
                        const key = format(day, "yyyy-MM-dd");
                        const dayBookings = filteredBookingsByDate.get(key) ?? [];
                        const isToday = isSameDay(day, new Date());
                        const threeDayColWidth = Math.max(MIN_STAFF_COL_WIDTH, availableWidth / 3);
                        return (
                          <View key={key}>
                            <TouchableOpacity
                              style={{ width: threeDayColWidth, alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingBottom: 4, paddingTop: 4, backgroundColor: isToday ? TEAL_ACCENT + "30" : "#f9fafb" }}
                              onPress={() => { setSelectedDate(day); setViewMode("day"); }}
                            >
                              <Text style={{ fontSize: 10, color: Colors.gray[400] }}>{format(day, "EEE")}</Text>
                              <Text style={{ fontSize: 14, fontWeight: "700", color: isToday ? "#4f46e6" : Colors.gray[700] }}>{format(day, "d MMM")}</Text>
                              {(() => {
                                if (!operatingHours) return null;
                                const tz = provider?.timezone ?? null;
                                const weekdayIndex = tz ? getWeekdayInTimeZone(day, tz) : day.getDay();
                                const dn = DAY_NAMES[weekdayIndex] ?? "monday";
                                const sc = normalizeOperatingSchedule(operatingHours[dn]);
                                if (!sc?.isOpen) {
                                  const anyStaffWorks = staffList.some((m) => {
                                    const wh = m.working_hours?.[dn];
                                    if (!wh) return false;
                                    return wh.closed !== true && wh.is_open !== false;
                                  });
                                  if (!anyStaffWorks) return <Text style={{ fontSize: 8, color: "#ef4444", fontWeight: "700" }}>CLOSED</Text>;
                                }
                                return <Text style={{ fontSize: 9, color: Colors.gray[400] }}>{dayBookings.length} appt{dayBookings.length !== 1 ? "s" : ""}</Text>;
                              })()}
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
                  {viewMode === "3day" && threeDays.some((d) => isSameDay(d, new Date())) && (
                    <View
                      style={{
                        position: "absolute",
                        left: TIME_COL_WIDTH,
                        top: 0,
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
                        const initials = col.staffName.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                        return (
                          <View key={col.staffId} style={{ width: dayColumnWidth, borderRightWidth: 1, borderRightColor: "#e5e7eb" }}>
                            <TouchableOpacity
                              style={{ width: dayColumnWidth, alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingHorizontal: 4, paddingBottom: 4, paddingTop: 4, backgroundColor: DARK_HEADER }}
                              onPress={() => handleStaffHeaderPress(col)}
                              activeOpacity={0.7}
                            >
                              <View style={{ marginBottom: 2, height: 24, width: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: TEAL_ACCENT }}>
                                <Text style={{ fontSize: 9, fontWeight: "700", color: DARK_HEADER }}>{initials}</Text>
                              </View>
                              <Text style={{ fontSize: 10, fontWeight: "600", color: Colors.white }} numberOfLines={1}>{col.staffName.split(" ")[0]}</Text>
                              <Text style={{ fontSize: 9, color: TEAL_ACCENT }}>
                                {col.bookings.length} appt{col.bookings.length !== 1 ? "s" : ""}
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
                  {viewMode === "day" && isSameDay(selectedDate, new Date()) && staffColumns && staffColumns.length > 1 && staffScrollContentWidth != null && (
                    <View
                      style={{
                        position: "absolute",
                        left: TIME_COL_WIDTH,
                        top: 0,
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
                      const key = format(day, "yyyy-MM-dd");
                      const dayBookings = filteredBookingsByDate.get(key) ?? [];
                      const isToday = isSameDay(day, new Date());
                      return (
                        <View key={key}>
                          <View
                            style={{ width: dayColumnWidth, alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingBottom: 4, backgroundColor: isToday ? TEAL_ACCENT + "30" : "#f9fafb" }}
                          >
                            <Text style={{ fontSize: 10, color: Colors.gray[400] }}>{format(day, "EEE")}</Text>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: isToday ? "#4f46e6" : Colors.gray[700] }}>{format(day, "d")}</Text>
                            {(() => {
                              if (!operatingHours) return null;
                              const tz = provider?.timezone ?? null;
                              const weekdayIndex = tz ? getWeekdayInTimeZone(day, tz) : day.getDay();
                              const dn = DAY_NAMES[weekdayIndex] ?? "monday";
                              const sc = normalizeOperatingSchedule(operatingHours[dn]);
                              if (!sc?.isOpen) {
                                const anyStaffWorks = staffList.some((m) => {
                                  const wh = m.working_hours?.[dn];
                                  if (!wh) return false;
                                  return wh.closed !== true && wh.is_open !== false;
                                });
                                if (!anyStaffWorks) return <Text style={{ fontSize: 8, color: "#ef4444", fontWeight: "700", marginTop: 1 }}>CLOSED</Text>;
                              }
                              return null;
                            })()}
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
                {viewMode === "week" && weekDays.some((d) => isSameDay(d, new Date())) && (
                  <View
                    style={{
                      position: "absolute",
                      left: TIME_COL_WIDTH,
                      top: 0,
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
                    />
                  </View>
                )}
              </>
            )}
          </View>
          </View>
        </ScrollView>
      )}

      {/* Drag ghost: follows finger when dragging a booking */}
      {draggingBooking && dragPosition && (
        <Modal visible transparent animationType="none" statusBarTranslucent>
          <View style={{ flex: 1, pointerEvents: "none" }}>
            <View
              style={{
                position: "absolute",
                left: dragPosition.x,
                top: dragPosition.y,
                width: Math.min(dayColumnWidth - 8, 200),
                minHeight: 44,
                borderRadius: 8,
                paddingHorizontal: 6,
                paddingVertical: 4,
                borderLeftWidth: 3,
                backgroundColor: "#fff",
                borderLeftColor: "#6366f1",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "700", color: Colors.gray[900] }} numberOfLines={1}>
                {draggingBooking.customers?.full_name ?? t("provider.calendarScreen.walkIn")}
              </Text>
              {draggingBooking.services?.length > 0 && (
                <Text style={{ marginTop: 2, fontSize: 9, color: Colors.gray[600] }} numberOfLines={1}>
                  {draggingBooking.services.map((s) => s.name).join(", ")}
                </Text>
              )}
              <Text style={{ marginTop: 2, fontSize: 9, color: Colors.gray[500] }}>{formatTimeInZone(draggingBooking.scheduled_at, provider?.timezone ?? null)}</Text>
            </View>
          </View>
        </Modal>
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
                  handleTapBooking(b.id);
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
                  router.push(`/(app)/(tabs)/more/bookings/${b.id}?focusPayment=1` as never);
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[900] }}>
                  {t("provider.calendarScreen.collectPayment")}
                </Text>
              </TouchableOpacity>
              {STATUS_ACTION_KEYS.filter((key) => key !== androidBookingMenu.status).map((key, idx, arr) => (
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
                    {getStatusActionLabel(t, key)}
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

      {/* ─── Floating Action Button ─── */}
      {/* §UI-audit 2026-04: `bottom: 24` previously hid the FAB under
          the iPhone home-indicator area (and tab bar on small phones).
          Offset by `insets.bottom` + tab bar chrome so it never lands
          on the system gesture region. */}
      <View style={{ position: "absolute", bottom: 24 + insets.bottom + 56, right: 20, zIndex: 100 }}>
        {fabOpen && (
          <View style={{ marginBottom: 12 }}>
            {[
              {
                labelKey: "newBooking",
                label: t("provider.calendarScreen.fab.newBooking"),
                icon: "calendar-outline" as keyof typeof Ionicons.glyphMap,
                color: "#4f46e5",
                onPress: () => {
                  setFabOpen(false);
                  const href = newBookingScreenHrefFromCalendarDay(selectedDate, {
                    status: preferences.defaultNewAppointmentStatus,
                    ...(locationFilter !== "all" ? { locationId: locationFilter } : {}),
                  });
                  router.push(href as never);
                },
              },
              {
                labelKey: "walkIn",
                label: t("provider.calendarScreen.fab.walkIn"),
                icon: "walk-outline" as keyof typeof Ionicons.glyphMap,
                color: "#22c55e",
                onPress: () => {
                  setFabOpen(false);
                  router.push(
                    newBookingScreenHrefFromCalendarDay(selectedDate, {
                      walkIn: true,
                      ...(locationFilter !== "all" ? { locationId: locationFilter } : {}),
                    }) as never,
                  );
                },
              },
              {
                labelKey: "expressBook",
                label: t("provider.calendarScreen.fab.expressBook"),
                icon: "flash-outline" as keyof typeof Ionicons.glyphMap,
                color: "#f59e0b",
                onPress: () => {
                  setFabOpen(false);
                  router.push("/(app)/(tabs)/more/express-booking" as never);
                },
              },
              {
                labelKey: "timeBlock",
                label: t("provider.calendarScreen.fab.timeBlock"),
                icon: "ban-outline" as keyof typeof Ionicons.glyphMap,
                color: "#6366f1",
                onPress: () => {
                  setFabOpen(false);
                  setShowTimeBlockForm(true);
                },
              },
              {
                labelKey: "groupBooking",
                label: t("provider.calendarScreen.fab.groupBooking"),
                icon: "people-outline" as keyof typeof Ionicons.glyphMap,
                color: "#ec4899",
                onPress: () => {
                  setFabOpen(false);
                  router.push("/(app)/(tabs)/more/group-bookings" as never);
                },
              },
            ].map((action, index) => (
              <Animated.View
                key={action.labelKey}
                style={{
                  opacity: fabAnim,
                  transform: [
                    {
                      translateY: fabAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                  ],
                }}
              >
                <TouchableOpacity
                  style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", alignSelf: "flex-end" }}
                  onPress={action.onPress}
                  activeOpacity={0.7}
                >
                  <View style={{ marginRight: 8, borderRadius: 8, backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 6, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[800] }}>{action.label}</Text>
                  </View>
                  <View
                    style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: action.color, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}
                  >
                    <Ionicons name={action.icon} size={18} color="#fff" />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={{ height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: fabOpen ? "#ef4444" : DARK_HEADER, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 }}
          onPress={toggleFab}
          activeOpacity={0.8}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", "45deg"],
                  }),
                },
              ],
            }}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Dismiss FAB overlay */}
      {fabOpen && (
        <Pressable
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 99 }}
          onPress={() => { setFabOpen(false); Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true, friction: 6 }).start(); }}
        />
      )}

      {/* ─── Legend Modal ─── */}
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowLegend(false)}>
          <Pressable style={{ marginHorizontal: 24, width: 320, borderRadius: 16, backgroundColor: Colors.white, padding: 20 }} onPress={() => {}}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>Color Legend</Text>
              <TouchableOpacity onPress={() => setShowLegend(false)}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {preferences.colorBy === "status" && (
              <View>
                <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>Status Colors</Text>
                {Object.entries(STATUS_COLORS).map(([key, colors]) => (
                  <View key={key} style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: colors.bg, borderLeftWidth: 3, borderLeftColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", textTransform: "capitalize", color: colors.text }}>{key.replace(/_/g, " ")}</Text>
                  </View>
                ))}
              </View>
            )}

            {preferences.colorBy === "service" && (
              <View>
                <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>Service Colors</Text>
                {SERVICE_COLOR_MAP.map(([keywords, colors], i) => (
                  <View key={i} style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: colors.bg, borderLeftWidth: 3, borderLeftColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", textTransform: "capitalize", color: colors.text }}>{(keywords as string[])[0]}</Text>
                  </View>
                ))}
              </View>
            )}

            {preferences.colorBy === "team_member" && (
              <View>
                <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>Team Colors</Text>
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
                Closed &amp; time off
              </Text>
              <Text style={{ marginBottom: 8, fontSize: 11, lineHeight: 15, color: Colors.gray[500] }}>
                Staff time off and day off match what customers see when booking. Closed periods come from calendar settings. Tap an availability or time block on the grid to edit or remove it.
              </Text>
              <View style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: STAFF_TIMEOFF_OVERLAY_COLORS.bg, borderLeftWidth: 3, borderLeftColor: STAFF_TIMEOFF_OVERLAY_COLORS.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Ionicons name="calendar-outline" size={12} color={STAFF_TIMEOFF_OVERLAY_COLORS.text} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 12, fontWeight: "500", color: STAFF_TIMEOFF_OVERLAY_COLORS.text }}>Staff time off / day off</Text>
              </View>
              <View style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: BLOCK_TYPE_COLORS.unavailable.bg, borderLeftWidth: 3, borderLeftColor: BLOCK_TYPE_COLORS.unavailable.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Ionicons name="ban-outline" size={12} color={BLOCK_TYPE_COLORS.unavailable.text} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 12, fontWeight: "500", color: BLOCK_TYPE_COLORS.unavailable.text }}>Unavailable (closed period)</Text>
              </View>
            </View>

            <View style={{ marginTop: 4 }}>
              <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "600", textTransform: "uppercase", color: Colors.gray[400] }}>Time Blocks</Text>
              {Object.entries(BLOCK_TYPE_COLORS).map(([key, colors]) => (
                <View key={key} style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", borderRadius: 8, backgroundColor: colors.bg, borderLeftWidth: 3, borderLeftColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Ionicons name={colors.icon as keyof typeof Ionicons.glyphMap} size={12} color="#92400e" style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 12, fontWeight: "500", textTransform: "capitalize", color: colors.text }}>{key}</Text>
                </View>
              ))}
            </View>
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
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>Edit closed period</Text>
            {availabilityEdit ? (
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 12 }}>{availabilityEdit.date}</Text>
            ) : null}
            {availabilityEdit ? (
              <>
                <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Type</Text>
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
                        {bt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ marginBottom: 12, flexDirection: "row" }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Start</Text>
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
                    <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>End</Text>
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
                    <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Staff (optional)</Text>
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
                          Everyone
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
                    <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>Cancel</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <ActionButton label="Save" onPress={handleSaveAvailabilityEdit} loading={savingAvailabilityEdit} fullWidth />
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
        title="Add Time Block"
      >
        <View>
          <Text style={{ marginBottom: 8, fontSize: 14, color: Colors.gray[500] }}>
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </Text>

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Block Type</Text>
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
                  {bt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Title</Text>
          <TextInput
            style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            value={timeBlockForm.title}
            onChangeText={(t) => setTimeBlockForm((p) => ({ ...p, title: t }))}
            placeholder={capitalizeFirst(timeBlockForm.type)}
            placeholderTextColor="#9ca3af"
          />

          <View style={{ marginBottom: 12, flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Start Time</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={timeBlockForm.startTime}
                onChangeText={(t) => setTimeBlockForm((p) => ({ ...p, startTime: t }))}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>End Time</Text>
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
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Staff Member (optional)</Text>
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

          <ActionButton label="Add Time Block" onPress={handleCreateTimeBlock} loading={creatingBlock} fullWidth />
        </View>
      </BottomSheet>
      {cancelReasonBookingId && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setCancelReasonBookingId(null)}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" }} onPress={() => setCancelReasonBookingId(null)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, marginHorizontal: 24, width: 320 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Cancel booking</Text>
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
                  <Text style={{ fontWeight: "600", color: "#fff" }}>Cancel booking</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </ScreenContainer>
  );
}

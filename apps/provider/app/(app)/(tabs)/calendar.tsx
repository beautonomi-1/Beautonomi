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
  PanResponder,
  TextInput,
  useWindowDimensions,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  startOfDay,
  isSameDay,
  parseISO,
  getHours,
  getMinutes,
  differenceInHours,
  differenceInMinutes,
} from "date-fns";
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
  formatCurrency,
  capitalizeFirst,
} from "@/lib/format";
import { trackCalendarView } from "@/lib/analytics";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import {
  expandTimeBlocksForCalendarRange,
  resolveTimeBlockRecordId,
} from "@/lib/expand-time-blocks";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface BookingService {
  name: string;
  offering_name?: string;
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
  calendar_overlay_kind?: "availability" | "staff_off" | "time_block";
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

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type ColorTriple = { bg: string; border: string; text: string };

const STATUS_COLORS: Record<string, ColorTriple> = {
  confirmed: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  pending: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
  booked: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f" },
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

const STATUS_ACTIONS = [
  { key: "confirmed", label: "Confirm" },
  { key: "started", label: "Start Service" },
  { key: "completed", label: "Complete" },
  { key: "no_show", label: "No Show" },
  { key: "cancelled", label: "Cancel" },
];

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
  if (block.overlay_source === "staff_unavailability") return STAFF_TIMEOFF_OVERLAY_COLORS;
  return getTimeBlockColors(block.block_type);
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function timeStringToMinutes(t: string | undefined | null): number {
  if (t == null || typeof t !== "string") return 0;
  const [hRaw, mRaw] = t.split(":").map(Number);
  const h = Number.isFinite(hRaw) ? Math.max(0, Math.min(23, hRaw)) : 0;
  const m = Number.isFinite(mRaw) ? Math.max(0, Math.min(59, mRaw)) : 0;
  return h * 60 + m;
}

function normalizeOperatingSchedule(
  schedule: unknown,
): { isOpen: boolean; openTime?: string; closeTime?: string } | null {
  if (!schedule || typeof schedule !== "object") return null;
  const raw = schedule as Record<string, unknown>;
  const isOpen =
    raw.is_open === true || (raw.closed !== true && raw.is_open !== false);
  const openTime =
    typeof raw.open_time === "string"
      ? raw.open_time
      : typeof raw.open === "string"
        ? raw.open
        : undefined;
  const closeTime =
    typeof raw.close_time === "string"
      ? raw.close_time
      : typeof raw.close === "string"
        ? raw.close
        : undefined;
  return { isOpen, openTime, closeTime };
}

function parseApiDateTime(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = parseISO(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getTopOffset(dateStr: string, startHour: number, slotHeight: number): number {
  const d = parseApiDateTime(dateStr);
  if (!d) return 0;
  const h = getHours(d);
  const m = getMinutes(d);
  return Math.max(0, (h - startHour) * slotHeight + (m / 60) * slotHeight);
}

function getBlockHeight(booking: Booking, slotHeight: number, compact: boolean): number {
  const totalMin = booking.services?.reduce((s, svc) => s + svc.duration_minutes, 0) ?? 30;
  const raw = (totalMin / 60) * slotHeight;
  const minH = compact ? slotHeight / 6 : slotHeight / 4;
  return Math.max(raw, minH);
}

function isNewBooking(booking: Booking): boolean {
  if (!booking.created_at) return false;
  if (booking.status === "completed" || booking.status === "cancelled") return false;
  const createdAt = parseApiDateTime(booking.created_at);
  if (!createdAt) return false;
  return differenceInHours(new Date(), createdAt) < 24;
}

/* ================================================================== */
/*  Skeleton                                                           */
/* ================================================================== */

function CalendarSkeleton() {
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} accessibilityLabel="Loading calendar">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
          <View style={{ marginRight: 12, height: 16, width: 40, borderRadius: 4, backgroundColor: Colors.gray[200] }} />
          <View style={{ height: 56, flex: 1, borderRadius: 12, backgroundColor: Colors.gray[100] }} />
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
}: {
  startHour: number;
  slotHeight: number;
  endHour: number;
  totalGridHeight: number;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const h = getHours(now);
  const m = getMinutes(now);
  const rawTop = (h - startHour) * slotHeight + (m / 60) * slotHeight;
  // Always show the line when viewing today: clamp so it stays visible in the grid (offset by grid top padding)
  const GRID_TOP = 8;
  const top = GRID_TOP + Math.max(0, Math.min(rawTop, totalGridHeight - 4));

  return (
    <View
      style={{ position: "absolute", left: 0, right: 0, top, flexDirection: "row", alignItems: "center", zIndex: 100, pointerEvents: "none" }}
      accessibilityLabel={`Current time ${format(now, "HH:mm")}`}
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

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */

export default function CalendarScreen() {
  const router = useRouter();
  const [isFocused, setIsFocused] = useState(true);
  const [secondaryEnabled, setSecondaryEnabled] = useState(false);
  const { user } = useAuth();
  const { provider, selectedLocationId: globalLocationId } = useProvider();
  const { isTablet, screenPadding } = useResponsive();
  const { preferences, updatePreference, resetToDefaults } = useCalendarPreferences();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("columns");
  const [selectedStaffIndex, setSelectedStaffIndex] = useState(0);
  const [staffFilter, setStaffFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState(globalLocationId ?? "all");

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

  const startDate = viewMode === "week" ? weekStartStr : viewMode === "3day" ? dateStr : dateStr;
  const endDate = viewMode === "week" ? weekEnd : viewMode === "3day" ? threeDayEnd : dateStr;
  const locationParam = locationFilter !== "all" ? `&location_id=${locationFilter}` : "";

  const {
    data: bookings,
    loading,
    error: fetchError,
    refresh,
    mutate: setBookings,
  } = useApi<Booking[]>(
    `/api/provider/bookings?start_date=${startDate}&end_date=${endDate}&limit=500${locationParam}`,
    { enabled: isFocused, staleTimeMs: 10_000 },
  );

  const teamUrl = locationFilter !== "all" ? `/api/provider/team?location_id=${encodeURIComponent(locationFilter)}` : "/api/provider/team";
  const { data: staff } = useApi<StaffMember[]>(teamUrl, { enabled: isFocused, staleTimeMs: 30_000 });
  const timeBlocksLocationParam = locationFilter !== "all" ? `&location_id=${encodeURIComponent(locationFilter)}` : "";
  const { data: timeBlocks, refresh: refreshTimeBlocks } = useApi<TimeBlock[]>(
    `/api/provider/time-blocks?date_from=${startDate}&date_to=${endDate}${timeBlocksLocationParam}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  const availabilityFromIso = `${startDate}T00:00:00.000Z`;
  const availabilityToIso = `${endDate}T23:59:59.999Z`;
  const { data: availabilityRaw, refresh: refreshAvailabilityBlocks } = useApi<AvailabilityBlockApi[]>(
    `/api/provider/availability-blocks?from=${encodeURIComponent(availabilityFromIso)}&to=${encodeURIComponent(availabilityToIso)}`,
    { enabled: isFocused && secondaryEnabled, staleTimeMs: 10_000 },
  );
  const { data: staffUnavailSegments, refresh: refreshStaffUnavail } = useApi<AvailabilitySegment[]>(
    `/api/provider/calendar/staff-unavailability?date_from=${encodeURIComponent(startDate)}&date_to=${encodeURIComponent(endDate)}`,
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

  const scrollToCurrentTime = useCallback(() => {
    if (!preferences.scrollToNow || hasScrolledToNow.current) return;
    const now = new Date();
    const h = getHours(now);
    const effectiveStart = preferences.workdayStartHour;
    const offset = Math.max(0, (h - effectiveStart - 1) * SLOT_HEIGHT);
    scrollRef.current?.scrollTo({ y: offset, animated: false });
    hasScrolledToNow.current = true;
  }, [preferences.scrollToNow, preferences.workdayStartHour, SLOT_HEIGHT]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const tasks = [refresh()];
    if (secondaryEnabled) {
      tasks.push(refreshTimeBlocks(), refreshAvailabilityBlocks(), refreshStaffUnavail());
    }
    await Promise.all(tasks);
    setRefreshing(false);
  }, [refresh, refreshTimeBlocks, refreshAvailabilityBlocks, refreshStaffUnavail, secondaryEnabled]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const operatingHours = useMemo(() => {
    if (!locations || locations.length === 0) return null;
    const loc = locationFilter !== "all"
      ? locations.find((l) => l.id === locationFilter)
      : locations[0];
    return loc?.operating_hours ?? null;
  }, [locations, locationFilter]);

  function getHoursForDay(day: Date): { startHour: number; endHour: number; isOpen: boolean } {
    // Always show at least 1 hour before start and 1 hour after end (closed/blocked time visible)
    if (!operatingHours) {
      const start = Math.max(0, preferences.workdayStartHour - 1);
      const end = Math.min(23, preferences.workdayEndHour + 1);
      return { startHour: start, endHour: end, isOpen: true };
    }
    const dayName = DAY_NAMES[day.getDay()] ?? "monday";
    const schedule = normalizeOperatingSchedule(operatingHours[dayName]);
    if (!schedule || !schedule.isOpen || schedule.openTime == null || schedule.closeTime == null) {
      const start = Math.max(0, preferences.workdayStartHour - 1);
      const end = Math.min(23, preferences.workdayEndHour + 1);
      return { startHour: start, endHour: end, isOpen: !!schedule?.isOpen };
    }
    const openMin = timeStringToMinutes(schedule.openTime);
    const closeMin = timeStringToMinutes(schedule.closeTime);
    const sh = Math.max(0, Math.floor(openMin / 60) - 1);
    const eh = Math.min(23, Math.ceil(closeMin / 60) + 1);
    return { startHour: sh, endHour: eh, isOpen: true };
  }

  const todayHours = getHoursForDay(selectedDate);
  // Day view uses day-specific hours (with 1hr buffer); week/3day use workday ± 1hr so closed time is visible
  const startHour =
    viewMode === "day"
      ? todayHours.startHour
      : Math.max(0, preferences.workdayStartHour - 1);
  const endHour =
    viewMode === "day"
      ? todayHours.endHour
      : Math.min(23, preferences.workdayEndHour + 1);

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

  const staffList = useMemo(() => staff ?? [], [staff]);
  const staffOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [{ label: "All", value: "all" }];
    staffList.forEach((s) => opts.push({ label: s.name, value: s.id }));
    return opts;
  }, [staffList]);

  const staffNameToId = useMemo(() => {
    const map = new Map<string, string>();
    staffList.forEach((s) => map.set(s.name, s.id));
    return map;
  }, [staffList]);

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
    const dayStr = format(day, "yyyy-MM-dd");
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

    for (const seg of staffUnavailSegments ?? []) {
      if (seg.date !== dayStr) continue;
      if (!blockMatchesStaff(seg.team_member_id)) continue;
      out.push(availabilitySegmentToTimeBlock(seg));
    }

    for (const seg of availabilitySegments) {
      if (seg.date !== dayStr) continue;
      if (!blockMatchesStaff(seg.team_member_id)) continue;
      out.push(availabilitySegmentToTimeBlock(seg));
    }

    if (preferences.showProcessingAndBuffer && expandedApiTimeBlocks.length > 0) {
      for (const tb of expandedApiTimeBlocks) {
        if (tb.date !== dayStr) continue;
        if (!blockMatchesStaff(tb.staff_id)) continue;
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
      cols.push({ staffId: "unassigned", staffName: "Unassigned", bookings: bookingsByStaffId.unassigned });
    }

    return cols.filter((c) => c.bookings.length > 0 || cols.length <= 4);
  }, [viewMode, staffList, staffFilter, bookingsByStaffId]);

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

  function handleTapSlot(hour: number, minute: number, day?: Date) {
    const targetDay = day ?? selectedDate;
    const dateParam = format(targetDay, "yyyy-MM-dd");
    const timeParam = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    router.push(
      `/(app)/(tabs)/more/bookings/new?date=${dateParam}&time=${timeParam}&status=${preferences.defaultNewAppointmentStatus}` as never,
    );
  }

  function handleTapBooking(bookingId: string) {
    router.push(`/(app)/(tabs)/more/bookings/${bookingId}` as never);
  }

  function handleLongPressBooking(booking: Booking) {
    const availableActions = STATUS_ACTIONS.filter((a) => a.key !== booking.status);
    const actionLabels = availableActions.map((a) => a.label);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", ...actionLabels],
          cancelButtonIndex: 0,
          destructiveButtonIndex: actionLabels.indexOf("Cancel") + 1,
          title: `${booking.customers?.full_name ?? "Booking"} — ${capitalizeFirst(booking.status)}`,
          message: "Change booking status",
        },
        (buttonIndex) => {
          if (buttonIndex === 0) return;
          const action = availableActions[buttonIndex - 1];
          if (action) changeBookingStatus(booking.id, action.key);
        },
      );
    } else {
      Alert.alert(
        `${booking.customers?.full_name ?? "Booking"}`,
        `Current status: ${capitalizeFirst(booking.status)}\nChange to:`,
        [
          { text: "Cancel", style: "cancel" },
          ...availableActions.map((a) => ({
            text: a.label,
            style: (a.key === "cancelled" ? "destructive" : "default") as "destructive" | "default",
            onPress: () => changeBookingStatus(booking.id, a.key),
          })),
        ],
      );
    }
  }

  function handleStaffHeaderPress(staffMember: { staffId: string; staffName: string }) {
    if (staffMember.staffId === "unassigned") return;
    const actions = [
      { text: "View Week Schedule", onPress: () => { setStaffFilter(staffMember.staffId); setViewMode("week"); } },
      { text: "View Single", onPress: () => { const idx = staffList.findIndex((s) => s.id === staffMember.staffId); if (idx >= 0) { setSelectedStaffIndex(idx); setLayoutMode("single"); } } },
    ];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", ...actions.map((a) => a.text)], cancelButtonIndex: 0, title: staffMember.staffName },
        (idx) => { if (idx > 0) actions[idx - 1]?.onPress(); },
      );
    } else {
      Alert.alert(staffMember.staffName, undefined, [
        { text: "Cancel", style: "cancel" },
        ...actions.map((a) => ({ text: a.text, onPress: a.onPress })),
      ]);
    }
  }

  async function changeBookingStatus(bookingId: string, newStatus: string) {
    if (bookings) {
      setBookings(bookings.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b)));
    }
    const { error } = await patchBooking(`/api/provider/bookings/${bookingId}`, { status: newStatus });
    if (error) { Alert.alert("Error", error); refresh(); }
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
      const newScheduledAt =
        format(targetDay, "yyyy-MM-dd") +
        "T" +
        String(hourClamp).padStart(2, "0") +
        ":" +
        String(clampedMinute).padStart(2, "0") +
        ":00";

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
      const checkUrl =
        `/api/provider/bookings/check-availability?scheduled_at=${encodeURIComponent(newScheduledAt)}&duration_minutes=${durationMinutes}` +
        (staffIdsParam ? `&staff_ids=${encodeURIComponent(staffIdsParam)}` : "");

      (async () => {
        const res = await api.get<{ available?: boolean; conflicts?: string[] }>(checkUrl);
        if (res.error) {
          Alert.alert("Error", res.error.message ?? "Could not check availability");
          return;
        }
        const available = res.data?.available ?? false;
        if (!available) {
          Alert.alert(
            "Slot not available",
            (res.data as any)?.conflicts?.join("\n") ?? "Another booking or block overlaps this time.",
          );
          return;
        }
        const payload: { scheduled_at: string; staff_id?: string | null } = { scheduled_at: newScheduledAt };
        if (newStaffId !== undefined) payload.staff_id = newStaffId || null;
        const { error } = await patchBooking(`/api/provider/bookings/${booking.id}`, payload);
        if (error) {
          Alert.alert("Error", error);
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
      Alert.alert("Required", "Start and end time are required");
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
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowTimeBlockForm(false);
    setTimeBlockForm({ type: "break", title: "", startTime: "12:00", endTime: "13:00", staffId: "" });
    refreshTimeBlocks();
  }

  function openOverlayBlockMenu(block: TimeBlock) {
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
                      Alert.alert("Error", error);
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
                    Alert.alert("Error", error);
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
      Alert.alert("Error", error);
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
    const top = GRID_TOP_PADDING + getTopOffset(booking.scheduled_at, startHour, SLOT_HEIGHT);
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
    const blockContent = (
      <>
        {preferences.showAppointmentIcons && isNew && (
          <View style={{ position: "absolute", right: -2, top: -2, borderBottomLeftRadius: 6, backgroundColor: "#4f46e6", paddingHorizontal: 4, paddingVertical: 2 }}>
            <Text style={{ fontSize: 7, fontWeight: "700", color: Colors.white }}>NEW</Text>
          </View>
        )}
        {isSmall ? (
          <Text style={{ fontSize: 10, fontWeight: "600", color: blockTextColor }} numberOfLines={1}>
            {booking.customers?.full_name ?? "Walk-in"}
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: blockTextColor }} numberOfLines={1}>
                {booking.customers?.full_name ?? "Walk-in"}
              </Text>
              {preferences.showAppointmentIcons && hasNotes && (
                <Ionicons name="document-text-outline" size={10} color={preferences.highContrast ? "#fff" : "#6b7280"} />
              )}
            </View>
            {booking.services?.length > 0 && (
              <Text style={{ fontSize: 9, color: preferences.highContrast ? Colors.gray[300] : Colors.gray[600] }} numberOfLines={1}>
                {booking.services.map((s) => (s.guest_name ? `${s.name ?? s.offering_name ?? "Service"} (${s.guest_name})` : (s.name ?? s.offering_name ?? "Service"))).join(", ")}
              </Text>
            )}
            {booking.is_group_booking && booking.group_booking_ref && (
              <Text style={{ marginTop: 2, fontSize: 8, color: subTextColor }} numberOfLines={1}>
                Group: {booking.group_booking_ref}
              </Text>
            )}
            {booking.location_type === "at_home" && (
              <Text style={{ marginTop: 2, fontSize: 8, color: subTextColor }} numberOfLines={1}>
                At home
              </Text>
            )}
            {!preferences.compactMode && height >= 55 && (
              <Text style={{ marginTop: 2, fontSize: 9, color: subTextColor }}>
                {formatTime(booking.scheduled_at)}
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
            accessibilityLabel={`Booking with ${booking.customers?.full_name ?? "Walk-in"} at ${formatTime(booking.scheduled_at)}. Long press to drag.`}
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
        accessibilityLabel={`Booking with ${booking.customers?.full_name ?? "Walk-in"} at ${formatTime(booking.scheduled_at)}, status ${capitalizeFirst(booking.status)}`}
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
    const boxStyle = {
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
    const dayName = DAY_NAMES[day.getDay()] ?? "monday";
    const schedule = normalizeOperatingSchedule(operatingHours[dayName]);
    const shadeBg = preferences.highContrast ? Colors.gray[700] : Colors.gray[200];

    if (!schedule || !schedule.isOpen || schedule.openTime == null || schedule.closeTime == null) {
      return (
        <View style={{ position: "absolute", left: 0, right: 0, top: GRID_TOP_PADDING, height: totalGridHeight, backgroundColor: shadeBg, opacity: 0.3, zIndex: 1, pointerEvents: "none" }} />
      );
    }

    const openMin = timeStringToMinutes(schedule.openTime);
    const closeMin = timeStringToMinutes(schedule.closeTime);
    const elements: React.ReactNode[] = [];
    const beforeHeight = Math.max(0, (openMin / 60 - startHour) * SLOT_HEIGHT);
    if (beforeHeight > 0) {
      elements.push(<View key="before" style={{ position: "absolute", left: 0, right: 0, top: GRID_TOP_PADDING, height: beforeHeight, backgroundColor: shadeBg, opacity: 0.3, zIndex: 1, pointerEvents: "none" }} />);
    }
    const afterTop = GRID_TOP_PADDING + (closeMin / 60 - startHour) * SLOT_HEIGHT;
    const afterHeight = totalGridHeight + GRID_TOP_PADDING - afterTop;
    if (afterHeight > 0 && afterTop < totalGridHeight + GRID_TOP_PADDING) {
      elements.push(<View key="after" style={{ position: "absolute", left: 0, right: 0, top: afterTop, height: afterHeight, backgroundColor: shadeBg, opacity: 0.3, zIndex: 1, pointerEvents: "none" }} />);
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
              onPress={() => handleTapSlot(row.hour, row.minute, day)}
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

        {showTimeIndicator && viewMode === "day" && isSameDay(day, new Date()) && (
          <CurrentTimeIndicator
            startHour={startHour}
            slotHeight={SLOT_HEIGHT}
            endHour={endHour}
            totalGridHeight={totalGridHeight}
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
                style={[
                  { alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginRight: 4 },
                  isSelected ? { backgroundColor: TEAL_ACCENT } : isToday ? { borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" } : {},
                ]}
                onPress={() => { setSelectedDate(day); if (viewMode === "week") setViewMode("day"); hasScrolledToNow.current = false; }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={{ fontSize: 10, fontWeight: "500", color: isSelected ? DARK_HEADER : "rgba(255,255,255,0.6)" }}>
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

      {/* ─── Calendar grid — ALWAYS shown, never blocked by empty state ─── */}
      {loading && !bookings ? (
        <CalendarSkeleton />
      ) : fetchError && !bookings ? (
        <ErrorState message={fetchError} onRetry={refresh} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80, paddingTop: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#111" />}
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
                                const dn = DAY_NAMES[day.getDay()] ?? "monday";
                                const sc = normalizeOperatingSchedule(operatingHours[dn]);
                                if (!sc?.isOpen) return <Text style={{ fontSize: 8, color: "#ef4444", fontWeight: "700" }}>CLOSED</Text>;
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
                              const dn = DAY_NAMES[day.getDay()] ?? "monday";
                              const sc = normalizeOperatingSchedule(operatingHours[dn]);
                              if (!sc?.isOpen) return <Text style={{ fontSize: 8, color: "#ef4444", fontWeight: "700", marginTop: 1 }}>CLOSED</Text>;
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
                {draggingBooking.customers?.full_name ?? "Walk-in"}
              </Text>
              {draggingBooking.services?.length > 0 && (
                <Text style={{ marginTop: 2, fontSize: 9, color: Colors.gray[600] }} numberOfLines={1}>
                  {draggingBooking.services.map((s) => s.name).join(", ")}
                </Text>
              )}
              <Text style={{ marginTop: 2, fontSize: 9, color: Colors.gray[500] }}>{formatTime(draggingBooking.scheduled_at)}</Text>
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

      <CalendarPreferencesModal
        visible={prefsVisible}
        onClose={() => setPrefsVisible(false)}
        preferences={preferences}
        onUpdate={updatePreference}
        onReset={resetToDefaults}
      />

      {/* ─── Floating Action Button ─── */}
      <View style={{ position: "absolute", bottom: 24, right: 20, zIndex: 100 }}>
        {fabOpen && (
          <View style={{ marginBottom: 12 }}>
            {[
              {
                label: "New Booking",
                icon: "calendar-outline" as keyof typeof Ionicons.glyphMap,
                color: "#4f46e5",
                onPress: () => {
                  setFabOpen(false);
                  const now = new Date();
                  const roundedMin = Math.ceil(now.getMinutes() / 15) * 15 % 60;
                  const roundedHour = now.getHours() + (Math.ceil(now.getMinutes() / 15) >= 4 ? 1 : 0);
                  const timeParam = `${String(roundedHour).padStart(2, "0")}:${String(roundedMin).padStart(2, "0")}`;
                  router.push(`/(app)/(tabs)/more/bookings/new?date=${dateStr}&time=${timeParam}&status=${preferences.defaultNewAppointmentStatus}` as never);
                },
              },
              {
                label: "Walk-in",
                icon: "walk-outline" as keyof typeof Ionicons.glyphMap,
                color: "#22c55e",
                onPress: () => {
                  setFabOpen(false);
                  router.push(`/(app)/(tabs)/more/bookings/new?date=${dateStr}&walk_in=true` as never);
                },
              },
              {
                label: "Express Book",
                icon: "flash-outline" as keyof typeof Ionicons.glyphMap,
                color: "#f59e0b",
                onPress: () => {
                  setFabOpen(false);
                  router.push("/(app)/(tabs)/more/express-booking" as never);
                },
              },
              {
                label: "Time Block",
                icon: "ban-outline" as keyof typeof Ionicons.glyphMap,
                color: "#6366f1",
                onPress: () => {
                  setFabOpen(false);
                  setShowTimeBlockForm(true);
                },
              },
              {
                label: "Group Booking",
                icon: "people-outline" as keyof typeof Ionicons.glyphMap,
                color: "#ec4899",
                onPress: () => {
                  setFabOpen(false);
                  router.push("/(app)/(tabs)/more/group-bookings" as never);
                },
              },
            ].map((action, index) => (
              <Animated.View
                key={action.label}
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
    </ScreenContainer>
  );
}

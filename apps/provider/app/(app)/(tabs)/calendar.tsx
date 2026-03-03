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
import { api } from "@/lib/api-client";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  isSameDay,
  parseISO,
  getHours,
  getMinutes,
  differenceInHours,
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
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

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

const STATUS_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  confirmed: { bg: "bg-blue-100", border: "border-l-blue-500", text: "text-blue-900" },
  pending: { bg: "bg-amber-50", border: "border-l-amber-500", text: "text-amber-900" },
  booked: { bg: "bg-amber-50", border: "border-l-amber-500", text: "text-amber-900" },
  in_progress: { bg: "bg-pink-50", border: "border-l-pink-500", text: "text-pink-900" },
  started: { bg: "bg-pink-50", border: "border-l-pink-500", text: "text-pink-900" },
  completed: { bg: "bg-gray-100", border: "border-l-gray-400", text: "text-gray-600" },
  cancelled: { bg: "bg-gray-100", border: "border-l-gray-300", text: "text-gray-400" },
  no_show: { bg: "bg-red-50", border: "border-l-red-500", text: "text-red-800" },
};

const SERVICE_COLOR_MAP: [string[], { bg: string; border: string; text: string }][] = [
  [["haircut", "cut", "trim"], { bg: "bg-cyan-50", border: "border-l-cyan-500", text: "text-cyan-900" }],
  [["color", "colour", "dye"], { bg: "bg-amber-50", border: "border-l-amber-500", text: "text-amber-900" }],
  [["highlight", "foil"], { bg: "bg-yellow-50", border: "border-l-yellow-400", text: "text-yellow-800" }],
  [["balayage", "ombre"], { bg: "bg-pink-50", border: "border-l-pink-400", text: "text-pink-900" }],
  [["facial", "face"], { bg: "bg-gray-100", border: "border-l-gray-500", text: "text-gray-800" }],
  [["manicure", "pedicure", "nail"], { bg: "bg-blue-50", border: "border-l-blue-500", text: "text-blue-900" }],
  [["massage", "body"], { bg: "bg-green-50", border: "border-l-green-500", text: "text-green-900" }],
  [["wax"], { bg: "bg-orange-50", border: "border-l-orange-400", text: "text-orange-900" }],
  [["brow", "lash", "eye"], { bg: "bg-stone-100", border: "border-l-stone-500", text: "text-stone-800" }],
  [["treatment", "therapy"], { bg: "bg-purple-50", border: "border-l-purple-500", text: "text-purple-900" }],
];

const TEAM_COLORS = [
  { bg: "bg-indigo-50", border: "border-l-indigo-500", text: "text-indigo-900" },
  { bg: "bg-emerald-50", border: "border-l-emerald-500", text: "text-emerald-900" },
  { bg: "bg-rose-50", border: "border-l-rose-500", text: "text-rose-900" },
  { bg: "bg-sky-50", border: "border-l-sky-500", text: "text-sky-900" },
  { bg: "bg-amber-50", border: "border-l-amber-500", text: "text-amber-900" },
  { bg: "bg-violet-50", border: "border-l-violet-500", text: "text-violet-900" },
  { bg: "bg-teal-50", border: "border-l-teal-500", text: "text-teal-900" },
  { bg: "bg-fuchsia-50", border: "border-l-fuchsia-500", text: "text-fuchsia-900" },
];

const BLOCK_TYPE_COLORS: Record<
  string,
  { bg: string; border: string; text: string; icon: string }
> = {
  break: { bg: "bg-yellow-50", border: "border-l-yellow-400", text: "text-yellow-800", icon: "cafe-outline" },
  lunch: { bg: "bg-yellow-50", border: "border-l-yellow-400", text: "text-yellow-800", icon: "cafe-outline" },
  meeting: { bg: "bg-blue-50", border: "border-l-blue-400", text: "text-blue-800", icon: "people-outline" },
  other: { bg: "bg-gray-50", border: "border-l-gray-400", text: "text-gray-600", icon: "ban-outline" },
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

/* ================================================================== */
/*  Color resolvers                                                    */
/* ================================================================== */

function getStatusColors(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.completed;
}

function getServiceColors(booking: Booking) {
  const serviceName = booking.services?.[0]?.name?.toLowerCase() ?? "";
  for (const [keywords, colors] of SERVICE_COLOR_MAP) {
    if (keywords.some((kw) => serviceName.includes(kw))) return colors;
  }
  return { bg: "bg-slate-50", border: "border-l-slate-400", text: "text-slate-800" };
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
      return getStatusColors(booking.status);
  }
}

function getTimeBlockColors(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes("break") || lower.includes("lunch"))
    return BLOCK_TYPE_COLORS.break;
  if (lower.includes("meeting")) return BLOCK_TYPE_COLORS.meeting;
  return BLOCK_TYPE_COLORS.other;
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function timeStringToMinutes(t: string | undefined | null): number {
  if (t == null || typeof t !== "string") return 0;
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function getTopOffset(dateStr: string, startHour: number, slotHeight: number): number {
  const d = parseISO(dateStr);
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
  return differenceInHours(new Date(), parseISO(booking.created_at)) < 24;
}

/* ================================================================== */
/*  Skeleton                                                           */
/* ================================================================== */

function CalendarSkeleton() {
  return (
    <View className="flex-1 px-4 pt-4" accessibilityLabel="Loading calendar">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} className="mb-3 flex-row items-center">
          <View className="mr-3 h-4 w-10 rounded bg-gray-200" />
          <View className="h-14 flex-1 rounded-xl bg-gray-100" />
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
      className="absolute left-0 right-0 flex-row items-center"
      style={{ top, zIndex: 100, pointerEvents: "none" }}
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
      <Pressable className="flex-1 items-center justify-center bg-black/40" onPress={onClose}>
        <Pressable className="mx-6 w-80 rounded-2xl bg-white p-5" onPress={() => {}}>
          <View className="mb-3 flex-row items-center justify-between">
            <TouchableOpacity
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={20} color="#111" />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900">{format(month, "MMMM yyyy")}</Text>
            <TouchableOpacity
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={20} color="#111" />
            </TouchableOpacity>
          </View>

          <View className="mb-1 flex-row">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <View key={d} className="flex-1 items-center">
                <Text className="text-xs font-medium text-gray-400">{d}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((day, i) => {
              if (day === null) return <View key={`e-${i}`} style={{ width: "14.28%" }} />;
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const isSelected = isSameDay(date, currentDate);
              const isToday = isSameDay(date, new Date());
              return (
                <TouchableOpacity
                  key={day}
                  style={{ width: "14.28%" }}
                  className={`items-center rounded-full py-2 ${isSelected ? "bg-gray-900" : isToday ? "bg-gray-100" : ""}`}
                  onPress={() => { onSelect(date); onClose(); }}
                  accessibilityLabel={format(date, "MMMM d, yyyy")}
                >
                  <Text className={`text-sm ${isSelected ? "font-bold text-white" : isToday ? "font-bold text-gray-900" : "text-gray-700"}`}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            className="mt-3 items-center rounded-lg bg-gray-100 py-2"
            onPress={() => { onSelect(new Date()); onClose(); }}
          >
            <Text className="text-sm font-semibold text-gray-900">Today</Text>
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
  const { user } = useAuth();
  const { selectedLocationId: globalLocationId } = useProvider();
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
  }, [globalLocationId]);
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
  );

  const { data: staff } = useApi<StaffMember[]>("/api/provider/team");
  const { data: timeBlocks, refresh: refreshTimeBlocks } = useApi<TimeBlock[]>(
    `/api/provider/time-blocks?date_from=${startDate}&date_to=${endDate}`,
  );
  const { data: locations } = useApi<ProviderLocation[]>("/api/provider/locations");
  const { data: waitingRoom } = useApi<{ count: number }>("/api/provider/waiting-room/count");
  const { execute: patchBooking } = useApiMutation("patch");
  const { execute: createTimeBlock, loading: creatingBlock } = useApiMutation("post");

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("calendar-bookings")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "bookings", filter: `provider_id=eq.${user.id}` },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh, user?.id]);

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
    await Promise.all([refresh(), refreshTimeBlocks()]);
    setRefreshing(false);
  }, [refresh, refreshTimeBlocks]);

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
    const schedule = operatingHours[dayName];
    if (!schedule || !schedule.is_open || schedule.open_time == null || schedule.close_time == null) {
      const start = Math.max(0, preferences.workdayStartHour - 1);
      const end = Math.min(23, preferences.workdayEndHour + 1);
      return { startHour: start, endHour: end, isOpen: !!schedule?.is_open };
    }
    const openMin = timeStringToMinutes(schedule.open_time);
    const closeMin = timeStringToMinutes(schedule.close_time);
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

  const staffIdToName = useMemo(() => {
    const map = new Map<string, string>();
    staffList.forEach((s) => map.set(s.id, s.name));
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
      result = result.filter((b) => isSameDay(parseISO(b.scheduled_at), selectedDate));
    } else if (viewMode === "3day") {
      result = result.filter((b) => {
        const bDate = parseISO(b.scheduled_at);
        return bDate >= selectedDate && bDate < addDays(selectedDate, 3);
      });
    }
    if (staffFilter !== "all") {
      const staffName = staffIdToName.get(staffFilter);
      result = result.filter((b) =>
        b.services?.some((s) => s.staff_id === staffFilter || s.staff_name === staffName),
      );
    }
    return result;
  }, [bookings, selectedDate, viewMode, staffFilter, staffIdToName, preferences.showCanceled]);

  function getTimeBlocksForDay(day: Date): TimeBlock[] {
    if (!timeBlocks) return [];
    if (!preferences.showProcessingAndBuffer) return [];
    const dayStr = format(day, "yyyy-MM-dd");
    return timeBlocks.filter((tb) => tb.date === dayStr);
  }

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    weekDays.forEach((d) => map.set(format(d, "yyyy-MM-dd"), []));
    filteredBookings.forEach((b) => {
      const key = format(parseISO(b.scheduled_at), "yyyy-MM-dd");
      map.get(key)?.push(b);
    });
    return map;
  }, [filteredBookings, weekDays]);

  const staffColumns = useMemo(() => {
    if (viewMode !== "day") return null;
    if (staffFilter !== "all") return null;
    if (staffList.length <= 1) return null;

    const cols: { staffId: string; staffName: string; bookings: Booking[] }[] = [];
    const unassigned: Booking[] = [];

    staffList.forEach((s) => {
      const staffBookings = filteredBookings.filter((b) =>
        b.services?.some((svc) => svc.staff_id === s.id || svc.staff_name === s.name),
      );
      cols.push({ staffId: s.id, staffName: s.name, bookings: staffBookings });
    });

    filteredBookings.forEach((b) => {
      const hasStaff = b.services?.some((s) => s.staff_id || s.staff_name);
      if (!hasStaff) unassigned.push(b);
    });

    if (unassigned.length > 0) {
      cols.push({ staffId: "unassigned", staffName: "Unassigned", bookings: unassigned });
    }

    return cols.filter((c) => c.bookings.length > 0 || cols.length <= 4);
  }, [viewMode, staffList, staffFilter, filteredBookings]);

  const todayBookingCount = useMemo(() => {
    if (!bookings) return 0;
    return bookings.filter((b) => isSameDay(parseISO(b.scheduled_at), selectedDate)).length;
  }, [bookings, selectedDate]);

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
      block_type: timeBlockForm.type,
      title: timeBlockForm.title.trim() || capitalizeFirst(timeBlockForm.type),
      start_time: timeBlockForm.startTime,
      end_time: timeBlockForm.endTime,
      date: dateStr,
      staff_id: timeBlockForm.staffId || undefined,
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
    const highContrastBg = preferences.highContrast ? "bg-gray-800" : "";
    const highContrastText = preferences.highContrast ? "text-white" : colors.text;
    const canDrag =
      dropContext &&
      booking.status !== "completed" &&
      booking.status !== "cancelled" &&
      viewMode === "day";

    const blockContent = (
      <>
        {preferences.showAppointmentIcons && isNew && (
          <View className="absolute -right-0.5 -top-0.5 rounded-bl-md bg-indigo-600 px-1 py-0.5">
            <Text className="text-[7px] font-bold text-white">NEW</Text>
          </View>
        )}
        {isSmall ? (
          <Text className={`text-[10px] font-semibold ${highContrastText}`} numberOfLines={1}>
            {booking.customers?.full_name ?? "Walk-in"}
          </Text>
        ) : (
          <>
            <View className="flex-row items-center">
              <Text className={`flex-1 text-[10px] font-bold ${highContrastText}`} numberOfLines={1}>
                {booking.customers?.full_name ?? "Walk-in"}
              </Text>
              {preferences.showAppointmentIcons && hasNotes && (
                <Ionicons name="document-text-outline" size={10} color={preferences.highContrast ? "#fff" : "#6b7280"} />
              )}
            </View>
            {booking.services?.length > 0 && (
              <Text className={`text-[9px] ${preferences.highContrast ? "text-gray-300" : "text-gray-600"}`} numberOfLines={1}>
                {booking.services.map((s) => (s.guest_name ? `${s.name ?? s.offering_name ?? "Service"} (${s.guest_name})` : (s.name ?? s.offering_name ?? "Service"))).join(", ")}
              </Text>
            )}
            {booking.is_group_booking && booking.group_booking_ref && (
              <Text className={`mt-0.5 text-[8px] ${preferences.highContrast ? "text-gray-400" : "text-gray-500"}`} numberOfLines={1}>
                Group: {booking.group_booking_ref}
              </Text>
            )}
            {!preferences.compactMode && height >= 55 && (
              <Text className={`mt-0.5 text-[9px] ${preferences.highContrast ? "text-gray-400" : "text-gray-500"}`}>
                {formatTime(booking.scheduled_at)}
                {preferences.showPrices && <> &middot; {formatCurrency(booking.total_amount, booking.currency)}</>}
              </Text>
            )}
            {preferences.showClientPhone && !preferences.compactMode && height >= 70 && booking.customers?.phone && (
              <Text className={`text-[8px] ${preferences.highContrast ? "text-gray-400" : "text-gray-400"}`} numberOfLines={1}>
                {booking.customers.phone}
              </Text>
            )}
          </>
        )}
      </>
    );

    const blockStyle = {
      top,
      height: Math.max(height, 20),
      zIndex: 10,
      opacity: draggingBooking?.id === booking.id ? 0.4 : 1,
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
            className={`absolute left-1 right-1 overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 ${preferences.highContrast ? highContrastBg : colors.bg} ${colors.border} ${isCancelled ? "opacity-50" : ""}`}
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
        className={`absolute left-1 right-1 overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 ${preferences.highContrast ? highContrastBg : colors.bg} ${colors.border} ${isCancelled ? "opacity-50" : ""}`}
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
    const bColors = getTimeBlockColors(block.block_type);
    const startMin = timeStringToMinutes(block.start_time);
    const endMin = timeStringToMinutes(block.end_time);
    const top = GRID_TOP_PADDING + Math.max(0, (startMin / 60 - startHour) * SLOT_HEIGHT);
    const height = Math.max(((endMin - startMin) / 60) * SLOT_HEIGHT, QUARTER_HEIGHT);
    return (
      <View
        key={block.id}
        className={`absolute left-1 right-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 ${bColors.bg} ${bColors.border}`}
        style={{ top, height, zIndex: 5, pointerEvents: "none" }}
      >
        <View className="flex-row items-center">
          <Ionicons name={bColors.icon as keyof typeof Ionicons.glyphMap} size={10} color="#92400e" />
          <Text className={`ml-1 text-[9px] font-medium ${bColors.text}`} numberOfLines={1}>
            {block.title || capitalizeFirst(block.block_type)}
          </Text>
        </View>
      </View>
    );
  }

  /* ═══════════════ Operating hours shading ═══════════════ */

  function renderHoursShading(day: Date) {
    if (!operatingHours) return null;
    const dayName = DAY_NAMES[day.getDay()] ?? "monday";
    const schedule = operatingHours[dayName];
    const shadeBg = preferences.highContrast ? "bg-gray-700" : "bg-gray-200";

    if (!schedule || !schedule.is_open || schedule.open_time == null || schedule.close_time == null) {
      return (
        <View className={`absolute left-0 right-0 ${shadeBg}`} style={{ top: GRID_TOP_PADDING, height: totalGridHeight, opacity: 0.3, zIndex: 1, pointerEvents: "none" }} />
      );
    }

    const openMin = timeStringToMinutes(schedule.open_time);
    const closeMin = timeStringToMinutes(schedule.close_time);
    const elements: React.ReactNode[] = [];
    const beforeHeight = Math.max(0, (openMin / 60 - startHour) * SLOT_HEIGHT);
    if (beforeHeight > 0) {
      elements.push(<View key="before" className={`absolute left-0 right-0 ${shadeBg}`} style={{ top: GRID_TOP_PADDING, height: beforeHeight, opacity: 0.3, zIndex: 1, pointerEvents: "none" }} />);
    }
    const afterTop = GRID_TOP_PADDING + (closeMin / 60 - startHour) * SLOT_HEIGHT;
    const afterHeight = totalGridHeight + GRID_TOP_PADDING - afterTop;
    if (afterHeight > 0 && afterTop < totalGridHeight + GRID_TOP_PADDING) {
      elements.push(<View key="after" className={`absolute left-0 right-0 ${shadeBg}`} style={{ top: afterTop, height: afterHeight, opacity: 0.3, zIndex: 1, pointerEvents: "none" }} />);
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
  ) {
    const dayBlocks = getTimeBlocksForDay(day);
    return (
      <View style={{ width: colWidth, height: totalGridHeight + GRID_TOP_PADDING, paddingTop: GRID_TOP_PADDING }} className="relative">
        {renderHoursShading(day)}

        {/* Grid rows + half-hour dashed lines */}
        <View className="absolute inset-0" style={{ zIndex: 1 }}>
          {gridRows.map((row, idx) => (
            <TouchableOpacity
              key={`${row.hour}-${row.minute}`}
              className={`absolute left-0 right-0 ${row.minute === 0 ? "border-t border-gray-200" : "border-t border-gray-50"}`}
              style={{ top: idx * rowHeight + GRID_TOP_PADDING, height: rowHeight }}
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
              className="absolute left-0 right-0"
              style={{ top: i * SLOT_HEIGHT + SLOT_HEIGHT / 2 + GRID_TOP_PADDING, height: 1, borderTopWidth: 1, borderStyle: "dashed", borderColor: "#e5e7eb", zIndex: 0, pointerEvents: "none" }}
            />
          ))}
        </View>

        <View className="absolute inset-0" style={{ zIndex: 5, pointerEvents: "box-none" }}>
          {dayBlocks.map((tb) => renderTimeBlock(tb))}
        </View>

        <View className="absolute inset-0" style={{ zIndex: 10, pointerEvents: "box-none" }}>
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
    return filteredBookings.filter((b) =>
      b.services?.some((svc) => svc.staff_id === selectedStaff.id || svc.staff_name === selectedStaff.name),
    );
  }, [selectedStaff, filteredBookings]);

  /* ================================================================ */
  /*  JSX                                                             */
  /* ================================================================ */

  const tabletContentStyle = isTablet
    ? { width: "100%" as const, paddingHorizontal: screenPadding }
    : undefined;

  return (
    <ScreenContainer scrollable={false} noPadding>
      {/* ─── Dark Header (matches web portal) ─── */}
      <View style={{ backgroundColor: DARK_HEADER }} className="pb-2 pt-2">
        <View style={tabletContentStyle}>
        {/* Date navigation row */}
        <View className="flex-row items-center justify-between px-4">
          <TouchableOpacity
            onPress={() => navigateDate(-1)}
            hitSlop={8}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            accessibilityLabel={viewMode === "week" ? "Previous week" : "Previous day"}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setDatePickerVisible(true)}
            className="flex-row items-center"
            accessibilityLabel="Jump to date"
          >
            <Text className="text-lg font-bold text-white">
              {viewMode === "week"
                ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d")}`
                : viewMode === "3day"
                ? `${format(selectedDate, "MMM d")} – ${format(addDays(selectedDate, 2), "MMM d")}`
                : format(selectedDate, "EEE, MMM d")}
            </Text>
            {todayBookingCount > 0 && viewMode === "day" && (
              <View style={{ backgroundColor: TEAL_ACCENT }} className="ml-2 rounded-full px-2 py-0.5">
                <Text className="text-xs font-bold" style={{ color: DARK_HEADER }}>
                  {todayBookingCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={() => setPrefsVisible(true)}
              hitSlop={8}
              className="min-h-[44px] min-w-[44px] items-center justify-center"
              accessibilityLabel="Calendar preferences"
            >
              <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigateDate(1)}
              hitSlop={8}
              className="min-h-[44px] min-w-[44px] items-center justify-center"
              accessibilityLabel={viewMode === "week" ? "Next week" : "Next day"}
            >
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* View toggle + Today */}
        <View className="mt-1 flex-row items-center justify-between px-4">
          <View className="flex-row rounded-lg p-0.5" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            {([
              { key: "day" as ViewMode, label: "DAY" },
              { key: "3day" as ViewMode, label: "3 DAY" },
              { key: "week" as ViewMode, label: "WEEK" },
            ]).map((v) => (
              <TouchableOpacity
                key={v.key}
                className={`rounded-md px-3 py-1.5 ${viewMode === v.key ? "bg-white" : ""}`}
                onPress={() => setViewMode(v.key)}
              >
                <Text className={`text-xs font-semibold ${viewMode === v.key ? "text-gray-900" : "text-white/70"}`}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row items-center gap-2">
            {waitingCount > 0 && (
              <TouchableOpacity
                className="flex-row items-center gap-1 rounded-md px-2 py-1"
                style={{ backgroundColor: "rgba(239,68,68,0.2)" }}
                onPress={() => router.push("/(app)/(tabs)/more/waiting-room" as never)}
                accessibilityLabel={`${waitingCount} waiting`}
              >
                <Ionicons name="people" size={12} color="#fca5a5" />
                <Text className="text-[10px] font-bold text-red-300">{waitingCount}</Text>
              </TouchableOpacity>
            )}
            {preferences.colorBy !== "status" && (
              <View className="rounded-md px-2 py-1" style={{ backgroundColor: "rgba(79,209,197,0.2)" }}>
                <Text className="text-[10px] font-medium" style={{ color: TEAL_ACCENT }}>
                  {preferences.colorBy === "service" ? "By Service" : "By Staff"}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setShowLegend(true)}
              className="rounded-md px-2 py-1"
              style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              accessibilityLabel="Color legend"
            >
              <Ionicons name="color-palette-outline" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: TEAL_ACCENT }}
              className="rounded-lg px-3 py-1.5"
              onPress={() => { setSelectedDate(new Date()); hasScrolledToNow.current = false; }}
              accessibilityLabel="Today"
            >
              <Text className="text-xs font-semibold" style={{ color: DARK_HEADER }}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scrollable date strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 px-2" contentContainerStyle={{ gap: 4 }}>
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const count = bookings?.filter((b) => isSameDay(parseISO(b.scheduled_at), day)).length ?? 0;
            return (
              <TouchableOpacity
                key={day.toISOString()}
                className={`items-center rounded-xl px-3.5 py-2 ${isSelected ? "" : isToday ? "border border-white/30" : ""}`}
                style={isSelected ? { backgroundColor: TEAL_ACCENT } : undefined}
                onPress={() => { setSelectedDate(day); if (viewMode === "week") setViewMode("day"); hasScrolledToNow.current = false; }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
              >
                <Text className={`text-[10px] font-medium ${isSelected ? "" : "text-white/60"}`} style={isSelected ? { color: DARK_HEADER } : undefined}>
                  {format(day, "EEE")}
                </Text>
                <Text className={`mt-0.5 text-base font-bold ${isSelected ? "" : "text-white"}`} style={isSelected ? { color: DARK_HEADER } : undefined}>
                  {format(day, "d")}
                </Text>
                {count > 0 && !isSelected && (
                  <View className="mt-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TEAL_ACCENT }} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        </View>
      </View>

      {/* ─── Layout Toggle + Staff Filter (matches web "Staff View" bar) ─── */}
      {viewMode === "day" && staffList.length > 1 && staffFilter === "all" && (
        <View className="border-b border-gray-200 bg-white py-2" style={isTablet ? { paddingHorizontal: screenPadding } : { paddingHorizontal: 12 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="people-outline" size={14} color="#6366f1" />
              <Text className="text-xs font-bold uppercase tracking-wider text-gray-900">Staff View</Text>
            </View>
            <View className="flex-row rounded-lg border border-gray-200 bg-gray-100 p-0.5">
              <TouchableOpacity
                className={`flex-row items-center gap-1 rounded-md px-3 py-1.5 ${layoutMode === "columns" ? "bg-white shadow-sm" : ""}`}
                onPress={() => setLayoutMode("columns")}
              >
                <Ionicons name="grid-outline" size={12} color={layoutMode === "columns" ? "#111" : "#9ca3af"} />
                <Text className={`text-xs font-semibold ${layoutMode === "columns" ? "text-gray-900" : "text-gray-500"}`}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-row items-center gap-1 rounded-md px-3 py-1.5 ${layoutMode === "single" ? "bg-white shadow-sm" : ""}`}
                onPress={() => setLayoutMode("single")}
              >
                <Ionicons name="person-outline" size={12} color={layoutMode === "single" ? "#111" : "#9ca3af"} />
                <Text className={`text-xs font-semibold ${layoutMode === "single" ? "text-gray-900" : "text-gray-500"}`}>Single</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Single mode: staff tabs */}
          {layoutMode === "single" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2" contentContainerStyle={{ gap: 8 }}>
              {staffList.map((member, idx) => {
                const count = filteredBookings.filter((b) =>
                  b.services?.some((svc) => svc.staff_id === member.id || svc.staff_name === member.name),
                ).length;
                const isActive = selectedStaffIndex === idx;
                return (
                  <TouchableOpacity
                    key={member.id}
                    className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${isActive ? "" : "bg-gray-100"}`}
                    style={isActive ? { backgroundColor: DARK_HEADER } : undefined}
                    onPress={() => setSelectedStaffIndex(idx)}
                  >
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-full ${isActive ? "" : "bg-gray-300"}`}
                      style={isActive ? { backgroundColor: TEAL_ACCENT } : undefined}
                    >
                      <Text className={`text-[9px] font-bold ${isActive ? "" : "text-gray-600"}`} style={isActive ? { color: DARK_HEADER } : undefined}>
                        {member.name.charAt(0)}
                      </Text>
                    </View>
                    <Text className={`text-sm font-medium ${isActive ? "text-white" : "text-gray-700"}`}>
                      {member.name.split(" ")[0]}
                    </Text>
                    {count > 0 && (
                      <View className={`rounded-full px-1.5 py-0.5 ${isActive ? "" : "bg-indigo-600"}`} style={isActive ? { backgroundColor: TEAL_ACCENT } : undefined}>
                        <Text className={`text-[9px] font-bold ${isActive ? "" : "text-white"}`} style={isActive ? { color: DARK_HEADER } : undefined}>
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
        <View className="border-b border-gray-100 bg-white py-2" style={isTablet ? { paddingHorizontal: screenPadding } : { paddingHorizontal: 16 }}>
          {staffOptions.length > 1 && (
            <FilterChipGroup options={staffOptions} selected={staffFilter} onSelect={setStaffFilter} />
          )}
          {locationOptions.length > 1 && (
            <View className="mt-1">
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
          className="flex-1"
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
          <View ref={gridContainerRef} className="flex-row px-2">
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
                    className="absolute left-0 right-0 items-end pr-2"
                    style={{ top: (row.hour - startHour) * SLOT_HEIGHT, width: TIME_COL_WIDTH }}
                  >
                    <Text className="text-xs font-semibold text-gray-600">{row.label}</Text>
                  </View>
                ))}
            </View>

            {/* Day view */}
            {viewMode === "day" || viewMode === "3day" ? (
              viewMode === "3day" ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row">
                      {threeDays.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const dayBookings = (bookingsByDay.get(key) ?? []).length > 0
                          ? bookingsByDay.get(key)!
                          : filteredBookings.filter((b) => isSameDay(parseISO(b.scheduled_at), day));
                        const isToday = isSameDay(day, new Date());
                        const threeDayColWidth = Math.max(MIN_STAFF_COL_WIDTH, availableWidth / 3);
                        return (
                          <View key={key}>
                            <TouchableOpacity
                              className="items-center border-b border-gray-200 pb-1 pt-1"
                              style={{ width: threeDayColWidth, backgroundColor: isToday ? TEAL_ACCENT + "30" : "#f9fafb" }}
                              onPress={() => { setSelectedDate(day); setViewMode("day"); }}
                            >
                              <Text className="text-[10px] text-gray-400">{format(day, "EEE")}</Text>
                              <Text className={`text-sm font-bold ${isToday ? "text-indigo-600" : "text-gray-700"}`}>{format(day, "d MMM")}</Text>
                              <Text className="text-[9px] text-gray-400">{dayBookings.length} appt{dayBookings.length !== 1 ? "s" : ""}</Text>
                            </TouchableOpacity>
                            <View className="border-r border-gray-50">
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
                    <View className="flex-row">
                      {staffColumns.map((col) => {
                        const initials = col.staffName.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                        return (
                          <View key={col.staffId} style={{ width: dayColumnWidth, borderRightWidth: 1, borderRightColor: "#e5e7eb" }}>
                            <TouchableOpacity
                              className="items-center border-b border-gray-200 px-1 pb-1 pt-1"
                              style={{ width: dayColumnWidth, backgroundColor: DARK_HEADER }}
                              onPress={() => handleStaffHeaderPress(col)}
                              activeOpacity={0.7}
                            >
                              <View className="mb-0.5 h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: TEAL_ACCENT }}>
                                <Text className="text-[9px] font-bold" style={{ color: DARK_HEADER }}>{initials}</Text>
                              </View>
                              <Text className="text-[10px] font-semibold text-white" numberOfLines={1}>{col.staffName.split(" ")[0]}</Text>
                              <Text className="text-[9px]" style={{ color: TEAL_ACCENT }}>
                                {col.bookings.length} appt{col.bookings.length !== 1 ? "s" : ""}
                              </Text>
                            </TouchableOpacity>
                            <View>
                              {renderDayGrid(selectedDate, col.bookings, dayColumnWidth, false, {
                                staffColumns,
                                dayColumnWidth,
                                day: selectedDate,
                              })}
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
                })
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
                  <View className="flex-row">
                    {weekDays.map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const dayBookings = bookingsByDay.get(key) ?? [];
                      const isToday = isSameDay(day, new Date());
                      return (
                        <View key={key}>
                          <View
                            className={`items-center border-b border-gray-200 pb-1 ${isToday ? "" : ""}`}
                            style={{ width: dayColumnWidth, backgroundColor: isToday ? TEAL_ACCENT + "30" : "#f9fafb" }}
                          >
                            <Text className="text-[10px] text-gray-400">{format(day, "EEE")}</Text>
                            <Text className={`text-xs font-bold ${isToday ? "text-indigo-600" : "text-gray-700"}`}>{format(day, "d")}</Text>
                          </View>
                          <View className="border-r border-gray-50">
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
              <Text className="text-[10px] font-bold text-gray-900" numberOfLines={1}>
                {draggingBooking.customers?.full_name ?? "Walk-in"}
              </Text>
              {draggingBooking.services?.length > 0 && (
                <Text className="mt-0.5 text-[9px] text-gray-600" numberOfLines={1}>
                  {draggingBooking.services.map((s) => s.name).join(", ")}
                </Text>
              )}
              <Text className="mt-0.5 text-[9px] text-gray-500">{formatTime(draggingBooking.scheduled_at)}</Text>
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
      <View className="absolute bottom-6 right-5" style={{ zIndex: 100 }}>
        {fabOpen && (
          <View className="mb-3">
            {[
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
                  className="mb-2 flex-row items-center self-end"
                  onPress={action.onPress}
                  activeOpacity={0.7}
                >
                  <View className="mr-2 rounded-lg bg-white px-3 py-1.5 shadow-sm">
                    <Text className="text-xs font-medium text-gray-800">{action.label}</Text>
                  </View>
                  <View
                    className="h-10 w-10 items-center justify-center rounded-full shadow-md"
                    style={{ backgroundColor: action.color }}
                  >
                    <Ionicons name={action.icon} size={18} color="#fff" />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        )}
        <TouchableOpacity
          className="h-14 w-14 items-center justify-center rounded-full shadow-lg"
          style={{ backgroundColor: fabOpen ? "#ef4444" : DARK_HEADER }}
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
          className="absolute inset-0"
          style={{ zIndex: 99 }}
          onPress={() => { setFabOpen(false); Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true, friction: 6 }).start(); }}
        />
      )}

      {/* ─── Legend Modal ─── */}
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/40" onPress={() => setShowLegend(false)}>
          <Pressable className="mx-6 w-80 rounded-2xl bg-white p-5" onPress={() => {}}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-gray-900">Color Legend</Text>
              <TouchableOpacity onPress={() => setShowLegend(false)}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {preferences.colorBy === "status" && (
              <View>
                <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">Status Colors</Text>
                {Object.entries(STATUS_COLORS).map(([key, colors]) => (
                  <View key={key} className={`mb-1.5 flex-row items-center gap-2 rounded-lg ${colors.bg} border-l-[3px] ${colors.border} px-3 py-2`}>
                    <Text className={`text-xs font-medium capitalize ${colors.text}`}>{key.replace(/_/g, " ")}</Text>
                  </View>
                ))}
              </View>
            )}

            {preferences.colorBy === "service" && (
              <View>
                <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">Service Colors</Text>
                {SERVICE_COLOR_MAP.map(([keywords, colors], i) => (
                  <View key={i} className={`mb-1.5 flex-row items-center gap-2 rounded-lg ${colors.bg} border-l-[3px] ${colors.border} px-3 py-2`}>
                    <Text className={`text-xs font-medium capitalize ${colors.text}`}>{(keywords as string[])[0]}</Text>
                  </View>
                ))}
              </View>
            )}

            {preferences.colorBy === "team_member" && (
              <View>
                <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">Team Colors</Text>
                {staffList.slice(0, TEAM_COLORS.length).map((member, i) => {
                  const tc = TEAM_COLORS[i % TEAM_COLORS.length]!;
                  return (
                    <View key={member.id} className={`mb-1.5 flex-row items-center gap-2 rounded-lg ${tc.bg} border-l-[3px] ${tc.border} px-3 py-2`}>
                      <Text className={`text-xs font-medium ${tc.text}`}>{member.name}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View className="mt-3">
              <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">Time Blocks</Text>
              {Object.entries(BLOCK_TYPE_COLORS).map(([key, colors]) => (
                <View key={key} className={`mb-1.5 flex-row items-center gap-2 rounded-lg ${colors.bg} border-l-[3px] ${colors.border} px-3 py-2`}>
                  <Ionicons name={colors.icon as keyof typeof Ionicons.glyphMap} size={12} color="#92400e" />
                  <Text className={`text-xs font-medium capitalize ${colors.text}`}>{key}</Text>
                </View>
              ))}
            </View>
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
          <Text className="mb-2 text-sm text-gray-500">
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </Text>

          <Text className="mb-1 text-sm font-medium text-gray-700">Block Type</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {BLOCK_TYPES.map((bt) => (
              <TouchableOpacity
                key={bt.value}
                className={`flex-row items-center gap-1.5 rounded-lg px-3 py-2 ${
                  timeBlockForm.type === bt.value ? "bg-indigo-600" : "bg-gray-100"
                }`}
                onPress={() => setTimeBlockForm((p) => ({ ...p, type: bt.value }))}
              >
                <Ionicons
                  name={bt.icon}
                  size={14}
                  color={timeBlockForm.type === bt.value ? "#fff" : "#6b7280"}
                />
                <Text
                  className={`text-xs font-medium ${
                    timeBlockForm.type === bt.value ? "text-white" : "text-gray-700"
                  }`}
                >
                  {bt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="mb-1 text-sm font-medium text-gray-700">Title</Text>
          <TextInput
            className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
            value={timeBlockForm.title}
            onChangeText={(t) => setTimeBlockForm((p) => ({ ...p, title: t }))}
            placeholder={capitalizeFirst(timeBlockForm.type)}
            placeholderTextColor="#9ca3af"
          />

          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">Start Time</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={timeBlockForm.startTime}
                onChangeText={(t) => setTimeBlockForm((p) => ({ ...p, startTime: t }))}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-sm font-medium text-gray-700">End Time</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={timeBlockForm.endTime}
                onChangeText={(t) => setTimeBlockForm((p) => ({ ...p, endTime: t }))}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          {staffList.length > 0 && (
            <>
              <Text className="mb-1 text-sm font-medium text-gray-700">Staff Member (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity
                  className={`rounded-lg px-3 py-2 ${!timeBlockForm.staffId ? "bg-indigo-600" : "bg-gray-100"}`}
                  onPress={() => setTimeBlockForm((p) => ({ ...p, staffId: "" }))}
                >
                  <Text className={`text-xs font-medium ${!timeBlockForm.staffId ? "text-white" : "text-gray-700"}`}>
                    All Staff
                  </Text>
                </TouchableOpacity>
                {staffList.map((member) => (
                  <TouchableOpacity
                    key={member.id}
                    className={`rounded-lg px-3 py-2 ${timeBlockForm.staffId === member.id ? "bg-indigo-600" : "bg-gray-100"}`}
                    onPress={() => setTimeBlockForm((p) => ({ ...p, staffId: member.id }))}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        timeBlockForm.staffId === member.id ? "text-white" : "text-gray-700"
                      }`}
                    >
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

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  SectionList,
  RefreshControl,
  AppState,
  Animated,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  format,
  addDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isToday,
  isTomorrow,
} from "date-fns";
import { usePagedProviderBookings } from "@/hooks/usePagedProviderBookings";
import { useProvider } from "@/providers/ProviderContext";
import { useApi } from "@/hooks/useApi";
import { useBookingsRealtime } from "@/hooks/useBookingsRealtime";
import { useBookingStatusActions } from "@/hooks/useBookingStatusActions";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";
import { horizontalFlatListPerf } from "@/lib/flatListPerformance";
import { Colors } from "@/constants/colors";
import { tabScreenScrollBottomPadding } from "@/constants/layout";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ActionButton } from "@/components/ui/ActionButton";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BookingScheduleCard } from "@/components/bookings/BookingScheduleCard";
import { mapProviderBookingActionError } from "@/lib/provider-booking-action-policy";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BookingCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface BookingService {
  id: string;
  name?: string;
  offering_name?: string;
  duration_minutes?: number;
  price?: number;
  staff_name?: string | null;
}

interface Booking {
  id: string;
  booking_number: string | null;
  status: string;
  db_status?: string | null;
  scheduled_at: string | null;
  created_at?: string | null;
  total_amount: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  payment_status?: string | null;
  location_type?: "at_salon" | "at_home" | null;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  is_recurring?: boolean;
  recurring_series_id?: string | null;
  booking_source?: string | null;
  custom_offer?: any;
  customers?: BookingCustomer | null;
  services?: BookingService[];
}

interface TimeBlockRow {
  id: string;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  team_member_name: string | null;
  blocked_time_type_name: string | null;
  blocked_time_type_color: string | null;
  is_recurring: boolean;
  is_active: boolean;
}

interface AvailabilityBlockRow {
  id: string;
  start_at: string;
  end_at: string;
  block_type: string;
}

type ScheduleItem =
  | { kind: "booking"; booking: Booking }
  | { kind: "block"; block: TimeBlockRow };

type ViewMode = "day" | "overview";

type BookingsListSection = { title: string; data: ScheduleItem[] };

type QuickActionTile = {
  label: string;
  sub: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  route: string;
  accent?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type DateRange = "today" | "week" | "month" | "upcoming" | "all";

/** List ordering: by appointment time (chronological) or by when the booking was created. */
type BookingsListSort = "appointment" | "booked_at";

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
  { label: "Upcoming", value: "upcoming" },
  { label: "All", value: "all" },
];

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Awaiting payment", value: "pending_payment" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Waiting", value: "waiting" },
  { label: "Checked in", value: "checked_in" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "No show", value: "no_show" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildDateParams(range: DateRange): { start_date?: string; end_date?: string } {
  const now = new Date();
  switch (range) {
    case "today":
      return {
        start_date: format(startOfDay(now), "yyyy-MM-dd"),
        end_date: format(endOfDay(now), "yyyy-MM-dd"),
      };
    case "week":
      return {
        start_date: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end_date: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    case "month":
      return {
        start_date: format(startOfMonth(now), "yyyy-MM-dd"),
        end_date: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    case "upcoming":
      return { start_date: format(now, "yyyy-MM-dd") };
    case "all":
    default:
      return {};
  }
}

function formatBookingTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatHHMM(time: string): string {
  const [h = "0", m = "0"] = time.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

function normalizeBookingStatus(s: string): string {
  const x = (s || "").trim().toLowerCase();
  if (x === "booked") return "confirmed";
  if (x === "started") return "in_progress";
  return x;
}

/** Prefer `db_status` when the list API denormalises a display `status` (parity with schedule cards). */
function bookingLifecycleStatus(b: Pick<Booking, "status" | "db_status">): string {
  return normalizeBookingStatus((b.db_status?.trim() || b.status || "").trim());
}

const TERMINAL_SCHEDULE_STATUSES = new Set(["cancelled", "canceled", "completed", "no_show"]);

function isNonTerminalScheduleBooking(b: Pick<Booking, "status" | "db_status">): boolean {
  return !TERMINAL_SCHEDULE_STATUSES.has(bookingLifecycleStatus(b));
}

const BLOCK_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  break: "cafe-outline",
  lunch: "restaurant-outline",
  meeting: "people-outline",
  personal: "person-outline",
  unavailable: "ban-outline",
  maintenance: "construct-outline",
};

function ScheduleBlockRow({ block, onPress }: { block: TimeBlockRow; onPress: () => void }) {
  const accent = block.blocked_time_type_color ?? "#d1d5db";
  const typeKey = (block.blocked_time_type_name ?? "").toLowerCase();
  const iconName = BLOCK_ICONS[typeKey] ?? "ban-outline";
  const label = block.name || block.blocked_time_type_name || "Blocked";
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        twStyle("mb-2 flex-row items-center overflow-hidden rounded-xl bg-gray-50"),
        { borderLeftWidth: 4, borderLeftColor: accent, minHeight: 52 },
      ]}
    >
      <View style={twStyle("flex-1 flex-row items-center px-3 py-2.5")}>
        <Ionicons name={iconName} size={16} color={accent} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={twStyle("text-sm font-semibold text-gray-700")} numberOfLines={1}>
            {label}
          </Text>
          <View style={twStyle("mt-0.5 flex-row flex-wrap items-center gap-2")}>
            <Text style={twStyle("text-xs text-gray-400")}>
              {formatHHMM(block.start_time)} – {formatHHMM(block.end_time)}
            </Text>
            {block.team_member_name ? (
              <Text style={twStyle("text-xs text-gray-400")}>· {block.team_member_name}</Text>
            ) : null}
          </View>
        </View>
        {block.is_recurring ? (
          <View style={twStyle("ml-2 rounded-full bg-gray-200 px-1.5 py-0.5")}>
            <Ionicons name="repeat-outline" size={10} color="#6b7280" />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function BookingsListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listBottomPadding = tabScreenScrollBottomPadding(insets.bottom, 16);
  const { screenPadding } = useResponsive();
  const { provider, selectedLocationId } = useProvider();
  const currency = getTenantDefaultCurrency();

  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [listSort, setListSort] = useState<BookingsListSort>("appointment");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [newBookingFlash, setNewBookingFlash] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const flashY = useSharedValue(-64);
  const toastY = useSharedValue(100);
  const flashAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: flashY.value }],
    opacity: flashY.value < -50 ? 0 : 1,
  }));
  const toastAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: toastY.value }],
  }));

  useEffect(() => {
    if (listSort === "booked_at") setViewMode("overview");
  }, [listSort]);

  // §Mobile-parity 2026-04: snapshot metrics strip at the top of the
  // bookings tab, filterable by time period independent of the list's
  // `dateRange` so providers can pivot without disturbing their current
  // list view. Mirrors the web /provider/bookings snapshot.
  type StatsRange = "today" | "week" | "month" | "all";
  const [statsRange, setStatsRange] = useState<StatsRange>("today");
  // §Provider-realtime 2026-04: "live" indicator goes on for ~1s after
  // every successful refresh so the provider has visible feedback that
  // the list auto-updated (websocket or polling). Purely cosmetic.
  const [isLive, setIsLive] = useState(false);
  /** Only true while this tab/screen is focused — realtime unsubscribes when pushing booking detail (calendar parity). */
  const [bookingsListFocused, setBookingsListFocused] = useState(true);

  // §Provider-audit 2026-04 (round 6): debounce search input so every
  // keystroke doesn't refetch. Matches the clients screen pattern.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length === 0) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const effectiveDateRange: DateRange = viewMode === "day" ? "month" : dateRange;
  const dateParams = useMemo(() => buildDateParams(effectiveDateRange), [effectiveDateRange]);

  const bookingsListQueryParts = useMemo(() => {
    const parts: string[] = [];
    if (dateParams.start_date) parts.push(`start_date=${dateParams.start_date}`);
    if (dateParams.end_date) parts.push(`end_date=${dateParams.end_date}`);
    if (statusFilter) parts.push(`status=${encodeURIComponent(statusFilter)}`);
    if (debouncedSearch.length > 0) parts.push(`search=${encodeURIComponent(debouncedSearch)}`);
    // §Launch-audit 2026-04: default remains appointment order (soonest
    // first). Optional "Booked" switches to `created_at` desc so recent
    // intake appears on top — matches GET /api/me/bookings sort_by.
    if (listSort === "booked_at") {
      parts.push("sort=created_at");
      parts.push("order=desc");
    } else {
      parts.push("sort=scheduled_at");
      parts.push("order=asc");
    }
    return parts;
  }, [dateParams.start_date, dateParams.end_date, statusFilter, debouncedSearch, listSort]);

  const url = useMemo(() => {
    const parts = [...bookingsListQueryParts];
    if (selectedLocationId) parts.push(`location_id=${encodeURIComponent(selectedLocationId)}`);
    return `/api/provider/bookings?${parts.join("&")}`;
  }, [bookingsListQueryParts, selectedLocationId]);

  const atHomeListUrl = useMemo(() => {
    if (!selectedLocationId) return "";
    const parts = [...bookingsListQueryParts, "location_type=at_home"];
    return `/api/provider/bookings?${parts.join("&")}`;
  }, [bookingsListQueryParts, selectedLocationId]);

  const { data, loading, error, refresh, mutate: mutateMain } = usePagedProviderBookings<Booking>(url, {
    timeoutMs: 60_000,
  });
  const {
    data: atHomeData,
    loading: atHomeLoading,
    error: atHomeError,
    refresh: refreshAtHome,
    mutate: mutateAtHome,
  } = usePagedProviderBookings<Booking>(atHomeListUrl, {
    enabled: Boolean(selectedLocationId && atHomeListUrl),
    timeoutMs: 60_000,
  });

  const timeBlocksUrl = useMemo(() => {
    const from = format(startOfMonth(selectedDate), "yyyy-MM-dd");
    const to = format(endOfMonth(selectedDate), "yyyy-MM-dd");
    const loc = selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : "";
    return `/api/provider/time-blocks?date_from=${from}&date_to=${to}${loc}`;
  }, [selectedDate, selectedLocationId]);

  const { data: timeBlocksRaw, refresh: refreshTimeBlocks } = useApi<TimeBlockRow[]>(timeBlocksUrl, {
    staleTimeMs: 300_000,
  });
  const { data: availabilityBlocksRaw, refresh: refreshAvailability } = useApi<AvailabilityBlockRow[]>(
    "/api/provider/availability-blocks",
    { staleTimeMs: 600_000 },
  );
  const { data: navCounts } = useApi<{ waiting_room: number }>("/api/provider/nav-counts", { staleTimeMs: 15_000 });

  const timeBlocks = useMemo(() => (Array.isArray(timeBlocksRaw) ? timeBlocksRaw : []), [timeBlocksRaw]);

  const mergedBookingsData = useMemo(() => {
    const main = Array.isArray(data) ? data : [];
    if (!selectedLocationId) return main;
    const extra = Array.isArray(atHomeData) ? atHomeData : [];
    const seen = new Set(main.map((b) => b.id));
    return [...main, ...extra.filter((b) => !seen.has(b.id))];
  }, [data, atHomeData, selectedLocationId]);

  const listLoading = loading || (Boolean(selectedLocationId) && atHomeLoading);
  const listError = error ?? (selectedLocationId ? atHomeError : null);

  const refreshAllBookings = useCallback(async () => {
    await refresh();
    if (selectedLocationId) await refreshAtHome();
  }, [refresh, refreshAtHome, selectedLocationId]);

  const refreshOverlays = useCallback(async () => {
    await refreshTimeBlocks();
    await refreshAvailability();
  }, [refreshTimeBlocks, refreshAvailability]);

  const mutateMerged = useCallback(
    (next: Booking[] | null) => {
      if (next === null) return;
      const byId = new Map(next.map((b) => [b.id, b]));
      if (data) mutateMain(data.map((b) => byId.get(b.id) ?? b));
      if (atHomeData) mutateAtHome(atHomeData.map((b) => byId.get(b.id) ?? b));
    },
    [data, atHomeData, mutateMain, mutateAtHome],
  );

  const { applyStatus, pendingIds } = useBookingStatusActions({
    bookings: mergedBookingsData,
    mutate: mutateMerged,
    refresh: refreshAllBookings,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAllBookings();
      await refreshOverlays();
    } finally {
      setRefreshing(false);
    }
  }, [refreshAllBookings, refreshOverlays]);

  const pumpLive = useCallback(() => {
    setIsLive(true);
    setTimeout(() => setIsLive(false), 1200);
  }, []);

  useBookingsRealtime(
    provider?.id,
    bookingsListFocused,
    async () => {
      await refreshAllBookings();
      pumpLive();
    },
    refreshOverlays,
    () => setNewBookingFlash(true),
  );

  useEffect(() => {
    if (newBookingFlash) {
      flashY.value = withSpring(0, { damping: 16 });
      const t = setTimeout(() => {
        flashY.value = withTiming(-64, { duration: 280 });
        setTimeout(() => setNewBookingFlash(false), 300);
      }, 3500);
      return () => clearTimeout(t);
    } else {
      flashY.value = -64;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newBookingFlash]);

  useEffect(() => {
    if (toast) {
      toastY.value = withSpring(0, { damping: 18 });
      const t = setTimeout(() => {
        toastY.value = withTiming(100, { duration: 280 });
        setTimeout(() => setToast(null), 300);
      }, 2500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const skeletonOpacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonOpacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(skeletonOpacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [skeletonOpacity]);

  // §Cross-app audit 2026-04 (bookings list freshness): previously the
  // calendar screen subscribed to `postgres_changes` on `bookings`, so a
  // new online booking appeared automatically there — but this list only
  // refreshed on mount / pull-to-refresh, meaning a provider staring at
  // the tab wouldn't see a just-booked appointment until they swiped
  // down. Mirror the calendar pattern with two small additions:
  //
  //  1. `useFocusEffect` — refresh when the list regains focus (e.g. the
  //     provider returns from tapping a booking detail). Cheap, covers
  //     most real-world staleness.
  //  2. Supabase realtime channel on `bookings` filtered by provider_id
  //     — debounced 400ms refresh when any booking row changes, matching
  //     calendar.tsx behaviour so both surfaces converge.
  useFocusEffect(
    useCallback(() => {
      setBookingsListFocused(true);
      void refreshAllBookings();
      return () => setBookingsListFocused(false);
    }, [refreshAllBookings]),
  );

  // Keep a stable ref to the latest refresh so the realtime effect doesn't
  // need to re-subscribe every time refresh changes identity (which happens
  // on every data fetch, causing "cannot add postgres_changes after subscribe").
  const refreshRef = useRef(refreshAllBookings);
  useEffect(() => { refreshRef.current = refreshAllBookings; }, [refreshAllBookings]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && bookingsListFocused) {
        refreshRef.current();
      }
    });
    return () => sub.remove();
  }, [bookingsListFocused]);

  const closedDateKeys = useMemo(() => {
    const keys = new Set<string>();
    const raw = Array.isArray(availabilityBlocksRaw) ? availabilityBlocksRaw : [];
    for (const ab of raw) {
      let cursor = startOfDay(new Date(ab.start_at));
      const endD = startOfDay(new Date(ab.end_at));
      if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(endD.getTime())) continue;
      while (cursor <= endD) {
        keys.add(format(cursor, "yyyy-MM-dd"));
        cursor = addDays(cursor, 1);
      }
    }
    return keys;
  }, [availabilityBlocksRaw]);

  const stripDays = useMemo(
    () => Array.from({ length: 60 }, (_, i) => addDays(startOfDay(new Date()), i - 30)),
    [],
  );

  const dateStripInfo = useMemo(() => {
    const map = new Map<string, { bookings: number; hasPending: boolean; blocks: number; isClosed: boolean }>();
    for (const b of mergedBookingsData) {
      if (!b.scheduled_at) continue;
      const key = format(new Date(b.scheduled_at), "yyyy-MM-dd");
      const prev = map.get(key) ?? { bookings: 0, hasPending: false, blocks: 0, isClosed: false };
      map.set(key, {
        bookings: prev.bookings + 1,
        hasPending: prev.hasPending || ["pending", "pending_payment", "waiting"].includes(bookingLifecycleStatus(b)),
        blocks: prev.blocks,
        isClosed: prev.isClosed,
      });
    }
    for (const tb of timeBlocks) {
      if (!tb.is_active) continue;
      const prev = map.get(tb.date) ?? { bookings: 0, hasPending: false, blocks: 0, isClosed: false };
      map.set(tb.date, { ...prev, blocks: prev.blocks + 1 });
    }
    for (const key of closedDateKeys) {
      const prev = map.get(key) ?? { bookings: 0, hasPending: false, blocks: 0, isClosed: false };
      map.set(key, { ...prev, isClosed: true });
    }
    return map;
  }, [mergedBookingsData, timeBlocks, closedDateKeys]);

  const filtered = useMemo(() => {
    const allBookings: Booking[] = mergedBookingsData;
    const q = search.trim().toLowerCase();
    if (!q) return allBookings;
    return allBookings.filter((b) => {
      const name = (b.customers?.full_name ?? "").toLowerCase();
      const num = (b.booking_number ?? "").toLowerCase();
      const service = (b.services?.[0]?.name ?? b.services?.[0]?.offering_name ?? "").toLowerCase();
      return name.includes(q) || num.includes(q) || service.includes(q);
    });
  }, [mergedBookingsData, search]);

  const nextUpcomingId = useMemo(() => {
    const now = Date.now();
    const sorted = [...mergedBookingsData]
      .filter((b) => b.scheduled_at && isNonTerminalScheduleBooking(b))
      .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
    return sorted.find((b) => new Date(b.scheduled_at!).getTime() > now)?.id ?? null;
  }, [mergedBookingsData]);

  const dayBookings = useMemo(() => {
    if (viewMode !== "day") return filtered;
    return filtered.filter((b) => b.scheduled_at && isSameDay(new Date(b.scheduled_at), selectedDate));
  }, [filtered, viewMode, selectedDate]);

  const dayBlocksForSelected = useMemo(() => {
    const key = format(selectedDate, "yyyy-MM-dd");
    return timeBlocks.filter((t) => t.date === key && t.is_active);
  }, [timeBlocks, selectedDate]);

  const daySchedule = useMemo(() => {
    const items: ScheduleItem[] = [...dayBookings.map((b) => ({ kind: "booking" as const, booking: b }))];
    for (const block of dayBlocksForSelected) {
      items.push({ kind: "block", block });
    }
    const sortKey = (it: ScheduleItem) => {
      if (it.kind === "booking") {
        if (!it.booking.scheduled_at) return Number.POSITIVE_INFINITY;
        return new Date(it.booking.scheduled_at).getTime();
      }
      const [h = 0, m = 0] = it.block.start_time.split(":").map(Number);
      const d = new Date(selectedDate);
      d.setHours(h, m, 0, 0);
      return d.getTime();
    };
    return items.sort((a, b) => sortKey(a) - sortKey(b));
  }, [dayBookings, dayBlocksForSelected, selectedDate]);

  const listSections: BookingsListSection[] = useMemo(() => {
    const toBookingItems = (rows: Booking[]): ScheduleItem[] =>
      rows.map((b) => ({ kind: "booking" as const, booking: b }));

    if (viewMode === "overview" || listSort === "booked_at") {
      return [{ title: "", data: toBookingItems(filtered) }];
    }
    const hourOf = (it: ScheduleItem) => {
      if (it.kind === "booking") {
        if (!it.booking.scheduled_at) return 0;
        return new Date(it.booking.scheduled_at).getHours();
      }
      const [h = 0] = it.block.start_time.split(":").map(Number);
      return h;
    };
    const buckets = [
      { title: "Morning", from: 0, to: 12 },
      { title: "Afternoon", from: 12, to: 17 },
      { title: "Evening", from: 17, to: 24 },
    ];
    const sections = buckets
      .map(({ title, from, to }) => ({
        title,
        data: daySchedule.filter((it) => {
          const h = hourOf(it);
          return h >= from && h < to;
        }),
      }))
      .filter((s) => s.data.length > 0);
    return sections.length ? sections : [{ title: "", data: [] as ScheduleItem[] }];
  }, [viewMode, listSort, filtered, daySchedule]);

  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");

  const daySummary = useMemo(() => {
    const dayB = mergedBookingsData.filter(
      (b) => b.scheduled_at && format(new Date(b.scheduled_at), "yyyy-MM-dd") === selectedDateKey,
    );
    const active = dayB.filter((b) => !["cancelled", "canceled", "no_show"].includes(bookingLifecycleStatus(b)));
    const blockCount = timeBlocks.filter((t) => t.date === selectedDateKey && t.is_active).length;
    const pending = dayB.filter((b) => ["pending", "pending_payment"].includes(bookingLifecycleStatus(b))).length;
    const closed = closedDateKeys.has(selectedDateKey);
    const nextUp = dayB
      .filter(
        (b) =>
          b.scheduled_at &&
          new Date(b.scheduled_at).getTime() > Date.now() &&
          isNonTerminalScheduleBooking(b),
      )
      .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())[0];
    return {
      label: isToday(selectedDate) ? "Today" : isTomorrow(selectedDate) ? "Tomorrow" : format(selectedDate, "EEE, MMM d"),
      count: active.length,
      revenue: active.reduce((n, b) => n + Number(b.total_amount || 0), 0),
      pending,
      blockCount,
      isClosed: closed,
      hasBookingsOnClosed: closed && dayB.length > 0,
      nextUp,
    };
  }, [mergedBookingsData, selectedDateKey, timeBlocks, closedDateKeys, selectedDate]);

  const handleApplyStatus = useCallback(
    async (bookingId: string, action: import("@/lib/provider-booking-action-policy").ProviderBookingAction, successMessage: string) => {
      const r = await applyStatus(bookingId, action);
      if (r.error) {
        setToast({ message: mapProviderBookingActionError(r.error, r.errorCode), type: "error" });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setToast({ message: successMessage, type: "success" });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    [applyStatus],
  );

  // §Mobile-parity 2026-04: stats snapshot computed across the full
  // returned result set. Independent of the list's date range so the
  // numbers still make sense when the list is filtered.
  const statsSnapshot = useMemo(() => {
    const allBookings: Booking[] = mergedBookingsData;
    const now = new Date();
    let start = 0;
    let end = Number.POSITIVE_INFINITY;
    if (statsRange !== "all") {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (statsRange === "today") {
        start = d.getTime();
        end = start + 24 * 60 * 60 * 1000;
      } else if (statsRange === "week") {
        start = startOfWeek(d, { weekStartsOn: 1 }).getTime();
        end = endOfWeek(d, { weekStartsOn: 1 }).getTime() + 1;
      } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      }
    }
    let count = 0;
    let revenue = 0;
    let pendingCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    for (const b of allBookings) {
      const s = bookingLifecycleStatus(b);
      if (s === "pending" || s === "pending_payment") pendingCount += 1;
      if (s === "in_progress" || s === "started" || s === "waiting" || s === "checked_in") inProgressCount += 1;
      if (s === "completed") completedCount += 1;
      const ts = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      if (ts >= start && ts < end) {
        count += 1;
        if (s !== "cancelled" && s !== "canceled" && s !== "no_show") {
          revenue += Number(b.total_amount || 0);
        }
      }
    }
    return { count, revenue, pendingCount, inProgressCount, completedCount };
  }, [mergedBookingsData, statsRange]);

  const statsRangeLabel = useMemo(() => {
    if (statsRange === "today") return "Today";
    if (statsRange === "week") return "Week";
    if (statsRange === "month") return "Month";
    return "All";
  }, [statsRange]);

  const dateRangeLabel = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "today":     return format(now, "EEE, MMM d");
      case "week":      return `Week of ${format(startOfWeek(now, { weekStartsOn: 1 }), "MMM d")}`;
      case "month":     return format(now, "MMMM yyyy");
      case "upcoming":  return "Upcoming";
      case "all":       return "All time";
    }
  }, [dateRange]);

  const openBooking = useCallback(
    (b: Booking) => {
      if (b.is_group_booking && b.group_booking_id) {
        router.push({
          pathname: "/(app)/(tabs)/more/group-bookings",
          params: { open_group_id: b.group_booking_id },
        } as never);
        return;
      }
      router.push(`/(app)/(tabs)/bookings/${b.id}` as never);
    },
    [router],
  );

  const sectionKeyExtractor = useCallback((item: ScheduleItem, index: number) => {
    if (item.kind === "booking") return item.booking.id;
    return `block-${item.block.id}-${index}`;
  }, []);

  const renderScheduleItem = useCallback(
    ({ item }: { item: ScheduleItem }) => {
      if (item.kind === "block") {
        return (
          <ScheduleBlockRow
            block={item.block}
            onPress={() => {
              void Haptics.selectionAsync();
              router.push("/(app)/(tabs)/more/time-blocks" as never);
            }}
          />
        );
      }
      return (
        <BookingScheduleCard
          booking={item.booking}
          currency={currency}
          pendingIds={pendingIds}
          isNextUpcoming={item.booking.id === nextUpcomingId}
          onOpen={(booking) => openBooking(booking as Booking)}
          onApplyStatus={handleApplyStatus}
        />
      );
    },
    [currency, pendingIds, nextUpcomingId, openBooking, handleApplyStatus, router],
  );

  /**
   * Single scroll surface: filters + day strip live in SectionList header so the
   * appointment list is not squeezed under fixed chrome on small iPhones.
   */
  const bookingsListHeader = useMemo(
    () => (
      <>
        <AnnouncementBanner />

        <AnimatedRe.View
          style={[
            twStyle("mx-4 mt-2 flex-row items-center rounded-2xl border px-3 py-2.5"),
            { backgroundColor: Colors.primarySoft, borderColor: Colors.primaryRing },
            flashAnimStyle,
          ]}
          pointerEvents={newBookingFlash ? "auto" : "none"}
        >
          <Ionicons name="calendar-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
          <Text style={[twStyle("flex-1 text-sm font-semibold"), { color: Colors.primary }]}>New booking received</Text>
          <TouchableOpacity
            onPress={() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setNewBookingFlash(false);
            }}
            accessibilityLabel="Dismiss"
          >
            <Ionicons name="close" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </AnimatedRe.View>

        <View style={{ marginTop: 8, marginBottom: 6 }}>
          <FlatList<QuickActionTile>
            {...horizontalFlatListPerf}
            horizontal
            data={[
              { label: "New", sub: "Booking", icon: "calendar-outline", route: "/(app)/(tabs)/bookings/new", accent: true },
              { label: "Walk-in", sub: "Queue", icon: "walk-outline", route: "/(app)/(tabs)/more/waiting-room" },
              { label: "Group", sub: "Booking", icon: "people-outline", route: "/(app)/(tabs)/more/group-bookings" },
              ...(provider?.offers_mobile_services
                ? [
                    {
                      label: "House Call",
                      sub: "Mobile",
                      icon: "car-outline",
                      route: "/(app)/(tabs)/bookings/new?location_type=at_home",
                    } satisfies QuickActionTile,
                  ]
                : []),
              { label: "Sale", sub: "Walk-in", icon: "bag-handle-outline", route: "/(app)/(tabs)/more/walk-in-sale" },
              { label: "Block", sub: "Time", icon: "ban-outline", route: "/(app)/(tabs)/more/time-blocks" },
            ]}
            keyExtractor={(it: QuickActionTile) => it.label}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 0, gap: 8 }}
            renderItem={({ item }: { item: QuickActionTile }) => (
              <TouchableOpacity
                onPress={() => {
                  void Haptics.selectionAsync();
                  router.push(item.route as never);
                }}
                style={[
                  twStyle("min-h-[46px] min-w-[98px] flex-row items-center rounded-2xl border px-3 py-2"),
                  item.accent
                    ? { backgroundColor: Colors.primarySoft, borderColor: Colors.primaryRing }
                    : { backgroundColor: "#fff", borderColor: "#f1f5f9" },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} ${item.sub}`}
              >
                <Ionicons name={item.icon} size={16} color={item.accent ? Colors.primary : "#374151"} style={{ marginRight: 8 }} />
                <View>
                  <Text style={twStyle("text-xs font-extrabold text-gray-900")}>{item.label}</Text>
                  <Text style={twStyle("text-[10px] text-gray-500")}>{item.sub}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>

        <SegmentTabs
          tabs={[
            { key: "day", label: "Day" },
            { key: "overview", label: "Overview" },
          ]}
          activeKey={viewMode}
          onSelect={(key) => setViewMode(key as ViewMode)}
          style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: 16, backgroundColor: Colors.primaryLight }}
        />

        {viewMode === "day" ? (
          <>
            <FlatList<Date>
              horizontal
              data={stripDays}
              keyExtractor={(d: Date) => d.toISOString()}
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={30}
              initialNumToRender={40}
              getItemLayout={(_item: Date | ArrayLike<Date> | null | undefined, index: number) => ({
                length: 62,
                offset: 62 * index,
                index,
              })}
              contentContainerStyle={{ paddingHorizontal: 0, paddingBottom: 8 }}
              renderItem={({ item: day }: { item: Date }) => {
                const key = format(day, "yyyy-MM-dd");
                const info = dateStripInfo.get(key);
                const selected = isSameDay(day, selectedDate);
                const todayCell = isToday(day);
                const dotColor = info?.hasPending ? "#f59e0b" : Colors.primary;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectedDate(startOfDay(day));
                    }}
                    style={[
                      { width: 56, alignItems: "center", borderRadius: 14, paddingVertical: 10, marginRight: 6 },
                      selected ? { backgroundColor: Colors.primary } : {},
                      !selected && todayCell ? { borderWidth: 1.5, borderColor: Colors.primary } : {},
                      info?.isClosed && !selected ? { backgroundColor: "#f3f4f6" } : {},
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={twStyle(`text-[11px] font-semibold ${selected ? "text-white" : "text-gray-500"}`)}
                    >
                      {format(day, "EEE")}
                    </Text>
                    <Text
                      style={twStyle(`mt-0.5 text-[17px] font-bold ${selected ? "text-white" : info?.isClosed ? "text-gray-400" : "text-gray-900"}`)}
                    >
                      {format(day, "d")}
                    </Text>
                    {info?.isClosed && !selected ? (
                      <Text style={twStyle("mt-0.5 text-[10px] text-gray-400")}>×</Text>
                    ) : null}
                    {info && info.bookings + info.blocks > 0 && !selected ? (
                      <View style={twStyle("mt-1 flex-row items-center gap-0.5")}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
                        {info.bookings + info.blocks > 1 ? (
                          <Text style={[twStyle("text-[8px] font-bold"), { color: dotColor }]}>
                            {info.bookings + info.blocks > 9 ? "9+" : info.bookings + info.blocks}
                          </Text>
                        ) : null}
                      </View>
                    ) : info && info.blocks > 0 && info.bookings === 0 && !selected ? (
                      <View style={twStyle("mt-1 h-1.5 w-1.5 rounded-full bg-gray-400")} />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
            <View style={twStyle("mx-4 mb-2 rounded-3xl border border-gray-100 bg-white p-3")}>
              <View style={twStyle("flex-row items-start justify-between")}>
                <View>
                  <Text style={twStyle("text-lg font-bold text-gray-900")}>{daySummary.label}</Text>
                  <Text style={twStyle("text-sm text-gray-500")}>
                    {daySummary.count} appointment{daySummary.count === 1 ? "" : "s"}
                    {daySummary.blockCount > 0 ? ` · ${daySummary.blockCount} blocked` : ""}
                  </Text>
                </View>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {formatCurrency(daySummary.revenue, currency)}
                </Text>
              </View>
              {daySummary.pending > 0 ? (
                <View style={twStyle("mt-2 self-start rounded-full bg-amber-50 px-2 py-1")}>
                  <Text style={twStyle("text-xs font-semibold text-amber-800")}>{daySummary.pending} pending</Text>
                </View>
              ) : null}
              {(navCounts?.waiting_room ?? 0) > 0 ? (
                <TouchableOpacity
                  onPress={() => router.push("/(app)/(tabs)/more/waiting-room" as never)}
                  style={twStyle("mt-2 flex-row items-center gap-1 self-start rounded-full border border-amber-200 bg-amber-50 px-2 py-1")}
                >
                  <Ionicons name="hourglass-outline" size={12} color="#b45309" />
                  <Text style={twStyle("text-xs font-semibold text-amber-700")}>
                    {navCounts?.waiting_room} in queue
                  </Text>
                </TouchableOpacity>
              ) : null}
              {daySummary.nextUp && isToday(selectedDate) && daySummary.nextUp.scheduled_at ? (
                <Text style={[twStyle("mt-2 text-xs font-semibold"), { color: Colors.primary }]}>
                  Next: {formatBookingTime(daySummary.nextUp.scheduled_at)} ·{" "}
                  {daySummary.nextUp.customers?.full_name ?? "Customer"}
                </Text>
              ) : null}
            </View>
            {daySummary.isClosed ? (
              <View
                style={[
                  twStyle("mx-4 mb-2 flex-row items-center rounded-xl border border-gray-200 px-3 py-3"),
                  { backgroundColor: daySummary.hasBookingsOnClosed ? "#fffbeb" : "#f3f4f6", borderLeftWidth: 4, borderLeftColor: "#d1d5db" },
                ]}
              >
                <Ionicons name="ban-outline" size={18} color="#9ca3af" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={twStyle("text-sm font-semibold text-gray-700")}>
                    {daySummary.hasBookingsOnClosed ? "Closed day — bookings still scheduled" : "Closed"}
                  </Text>
                  <TouchableOpacity onPress={() => router.push("/(app)/(tabs)/more/settings/closed-periods" as never)}>
                    <Text style={[twStyle("mt-0.5 text-xs font-semibold"), { color: Colors.primary }]}>View closed periods</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {viewMode === "overview" ? (
          <View style={twStyle("mx-4 mt-1 mb-2")}>
            <View style={twStyle("flex-row items-center justify-between mb-2")}>
              <View style={twStyle("flex-row items-center rounded-xl border border-gray-200 bg-white p-1")}>
                {(["today", "week", "month", "all"] as StatsRange[]).map((value) => {
                  const active = statsRange === value;
                  const label = value === "today" ? "Today" : value === "week" ? "Week" : value === "month" ? "Month" : "All";
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setStatsRange(value)}
                      style={twStyle(`rounded-lg px-2.5 py-1 ${active ? "bg-gray-900" : ""}`)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={twStyle(`text-[11px] font-semibold ${active ? "text-white" : "text-gray-600"}`)}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {isLive && (
                <View style={twStyle("flex-row items-center gap-1.5")}>
                  <View style={[twStyle("rounded-full"), { height: 6, width: 6, backgroundColor: "#10b981" }]} />
                  <Text style={twStyle("text-[10px] font-semibold text-emerald-600")}>LIVE</Text>
                </View>
              )}
            </View>
            <View style={twStyle("flex-row gap-2")}>
              <View style={twStyle("flex-1 rounded-xl border border-gray-200 bg-white p-2.5")}>
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="calendar-outline" size={12} color="#6b7280" />
                  <Text style={twStyle("text-[10px] font-semibold uppercase tracking-wide text-gray-500")}>{statsRangeLabel}</Text>
                </View>
                <Text style={twStyle("mt-0.5 text-lg font-bold text-gray-900")}>{statsSnapshot.count}</Text>
              </View>
              <View
                style={[
                  twStyle("flex-1 rounded-xl p-2.5 border"),
                  statsSnapshot.pendingCount > 0
                    ? { backgroundColor: "#fffbeb", borderColor: "#fde68a" }
                    : { backgroundColor: "#fff", borderColor: "#e5e7eb" },
                ]}
              >
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="time-outline" size={12} color={statsSnapshot.pendingCount > 0 ? "#b45309" : "#6b7280"} />
                  <Text
                    style={[
                      twStyle("text-[10px] font-semibold uppercase tracking-wide"),
                      { color: statsSnapshot.pendingCount > 0 ? "#b45309" : "#6b7280" },
                    ]}
                  >
                    Pending
                  </Text>
                </View>
                <Text style={twStyle("mt-0.5 text-lg font-bold text-gray-900")}>{statsSnapshot.pendingCount}</Text>
              </View>
              <View
                style={[
                  twStyle("flex-1 rounded-xl p-2.5 border"),
                  statsSnapshot.inProgressCount > 0
                    ? { backgroundColor: Colors.primarySoft, borderColor: Colors.primaryRing }
                    : { backgroundColor: "#fff", borderColor: "#e5e7eb" },
                ]}
              >
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="flash-outline" size={12} color={statsSnapshot.inProgressCount > 0 ? Colors.primary : "#6b7280"} />
                  <Text
                    style={[
                      twStyle("text-[10px] font-semibold uppercase tracking-wide"),
                      { color: statsSnapshot.inProgressCount > 0 ? Colors.primary : "#6b7280" },
                    ]}
                  >
                    Active
                  </Text>
                </View>
                <Text style={twStyle("mt-0.5 text-lg font-bold text-gray-900")}>{statsSnapshot.inProgressCount}</Text>
              </View>
            </View>
            <View style={twStyle("mt-2 flex-row gap-2")}>
              <View style={twStyle("flex-1 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5")}>
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="checkmark-circle-outline" size={12} color="#059669" />
                  <Text style={twStyle("text-[10px] font-semibold uppercase tracking-wide text-emerald-800")}>Completed</Text>
                </View>
                <Text style={twStyle("mt-0.5 text-lg font-bold text-gray-900")}>{statsSnapshot.completedCount}</Text>
              </View>
              <View style={[twStyle("flex-1 rounded-xl p-2.5 border"), { backgroundColor: "#fff0f7", borderColor: "#fbcfe8" }]}>
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="cash-outline" size={12} color="#be185d" />
                  <Text style={[twStyle("text-[10px] font-semibold uppercase tracking-wide"), { color: "#be185d" }]}>Revenue</Text>
                </View>
                <Text style={twStyle("mt-0.5 text-[15px] font-bold text-gray-900")} numberOfLines={1}>
                  {formatCurrency(statsSnapshot.revenue, currency)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={[twStyle("mx-4 mb-2"), { paddingHorizontal: 0 }]}>
          <View style={twStyle("flex-row items-center rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5")}>
            <Ionicons name="search-outline" size={16} color="#9ca3af" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search customer, service, #number…"
              placeholderTextColor="#9ca3af"
              style={twStyle("ml-2 flex-1 text-sm text-gray-900")}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search bookings"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {viewMode === "overview" ? (
          <View style={{ marginBottom: 6 }}>
            <FilterChipGroup
              options={DATE_RANGE_OPTIONS}
              selected={dateRange}
              onSelect={(value) => setDateRange(value as DateRange)}
            />
          </View>
        ) : null}

        <View style={{ marginBottom: 6 }}>
          <FilterChipGroup
            options={[
              { value: "appointment", label: "By appointment" },
              { value: "booked_at", label: "By date booked" },
            ]}
            selected={listSort}
            onSelect={(value) => setListSort(value as BookingsListSort)}
          />
        </View>

        <View style={{ marginBottom: 10 }}>
          <FilterChipGroup options={STATUS_OPTIONS} selected={statusFilter} onSelect={setStatusFilter} />
        </View>
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- header mirrors full bookings UI state
    [
      newBookingFlash,
      flashAnimStyle,
      provider?.offers_mobile_services,
      router,
      viewMode,
      stripDays,
      dateStripInfo,
      selectedDate,
      daySummary,
      currency,
      navCounts?.waiting_room,
      daySummary.isClosed,
      daySummary.hasBookingsOnClosed,
      statsRange,
      isLive,
      statsRangeLabel,
      statsSnapshot,
      search,
      dateRange,
      listSort,
      statusFilter,
    ],
  );

  if (listLoading && mergedBookingsData.length === 0) {
    return (
      <ScreenContainer scrollable={false} noPadding>
        <View style={{ paddingHorizontal: screenPadding }}>
          <ScreenHeader title="Bookings" showBack />
        </View>
        <View style={{ paddingHorizontal: screenPadding, paddingTop: 16, gap: 12 }}>
          {[0, 1, 2, 3].map((k) => (
            <Animated.View
              key={k}
              style={[
                twStyle("rounded-2xl bg-gray-100 p-4"),
                { opacity: skeletonOpacity, height: 96 },
              ]}
            >
              <View style={twStyle("flex-row items-center gap-3")}>
                <View style={twStyle("h-10 w-10 rounded-full bg-gray-200")} />
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={twStyle("h-3.5 rounded-full bg-gray-200")} />
                  <View style={[twStyle("h-3 rounded-full bg-gray-200"), { width: "55%" }]} />
                  <View style={[twStyle("h-3 rounded-full bg-gray-200"), { width: "70%" }]} />
                </View>
              </View>
            </Animated.View>
          ))}
        </View>
      </ScreenContainer>
    );
  }

  if (listError && mergedBookingsData.length === 0) {
    return (
      <ScreenContainer scrollable={false} noPadding>
        <View style={{ paddingHorizontal: screenPadding }}>
          <ScreenHeader title="Bookings" showBack />
        </View>
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: screenPadding }}>
          <ErrorState message={listError} onRetry={() => void refreshAllBookings()} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false} noPadding style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: screenPadding }}>
        <ScreenHeader
          title="Bookings"
          showBack
          subtitle={`${viewMode === "day" ? daySummary.label : dateRangeLabel} · ${filtered.length}`}
          rightAction={
            <ActionButton
              label="New"
              icon="add"
              size="sm"
              variant="brand"
              onPress={() => router.push("/(app)/(tabs)/bookings/new" as never)}
            />
          }
        />
      </View>

      <View style={{ flex: 1, minHeight: 0 }}>
        <SectionList<ScheduleItem>
          sections={listSections}
          keyExtractor={sectionKeyExtractor}
          renderItem={renderScheduleItem}
          ListHeaderComponent={bookingsListHeader}
          renderSectionHeader={({ section }: { section: BookingsListSection }) =>
            section.title ? (
              <View style={twStyle("pt-2 pb-1")}>
                <Text style={twStyle("text-[11px] font-extrabold uppercase tracking-wide text-gray-400")}>
                  {section.title}
                </Text>
              </View>
            ) : null
          }
          stickySectionHeadersEnabled={false}
          extraData={`${filtered.length}:${refreshing}:${viewMode}:${listSort}`}
          removeClippedSubviews={false}
          initialNumToRender={12}
          windowSize={7}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: screenPadding,
            paddingBottom: listBottomPadding,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title={search || statusFilter ? "No bookings match" : "Nothing scheduled"}
              description={
                search || statusFilter
                  ? "Try adjusting your search or filters."
                  : viewMode === "day"
                    ? "No appointments or blocks for this day."
                    : "Create a new booking to get started."
              }
              actionLabel={!search && !statusFilter && viewMode === "overview" ? "New booking" : undefined}
              onAction={
                !search && !statusFilter && viewMode === "overview"
                  ? () => router.push("/(app)/(tabs)/bookings/new" as never)
                  : undefined
              }
            />
          }
        />
      </View>

      <AnimatedRe.View
        style={[
          twStyle("absolute left-0 right-0 z-50 mx-4 flex-row items-center rounded-xl px-4 py-3"),
          {
            bottom: listBottomPadding + 4,
            backgroundColor: toast?.type === "error" ? "#dc2626" : "#059669",
          },
          toastAnimStyle,
        ]}
        pointerEvents={toast ? "auto" : "none"}
        accessibilityLiveRegion="polite"
      >
        <Ionicons
          name={toast?.type === "error" ? "alert-circle-outline" : "checkmark-circle-outline"}
          size={18}
          color="#fff"
          style={{ marginRight: 8 }}
        />
        <Text style={twStyle("flex-1 text-sm font-semibold text-white")}>
          {toast?.message ?? ""}
        </Text>
      </AnimatedRe.View>
    </ScreenContainer>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  SectionList,
  RefreshControl,
  Animated,
  Platform,
} from "react-native";
import {
  bookingLifecycleStatus,
  bookingScheduleYmd,
  effectiveScheduleAt,
  formatBusinessDayYYYYMMDD,
  isPendingOrQueueBooking,
  isTerminalScheduleBooking,
  PROVIDER_BOOKINGS_STRIP_HALF_DAYS,
  startOfBusinessDayLocalDate,
} from "@beautonomi/utils";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { addDays, endOfMonth, format, isSameDay, isTomorrow, startOfDay, startOfMonth } from "date-fns";
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
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ActionButton } from "@/components/ui/ActionButton";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BookingScheduleCard } from "@/components/bookings/BookingScheduleCard";
import { mapProviderBookingActionError } from "@/lib/provider-booking-action-policy";
import { useBusinessToday } from "@/hooks/useBusinessToday";
import {
  appendBookingsQueryParts,
  BOOKINGS_TO_REVIEW_STATUS,
  buildDateStripInfo,
  buildOverviewDateParams,
  buildOverviewDateRangeLabel,
  buildStatsReconciliationLine,
  buildStripDateParams,
  buildStripDays,
  filterBookingsForDayKey,
  isDateWithinStripWindow,
  mergeAtHomeBookings,
  statsRangeToDateRange,
  statusFilterForStatsTile,
  type BookingsStatsTileKey,
} from "@/lib/bookings-list-query";

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
  scheduled_start_at?: string | null;
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
  group_booking_ref?: string | null;
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
  { label: "To review", value: BOOKINGS_TO_REVIEW_STATUS },
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

function bookingMatchesStatusFilter(
  b: Pick<Booking, "status" | "db_status">,
  statusFilter: string,
): boolean {
  if (!statusFilter) return true;
  if (statusFilter === BOOKINGS_TO_REVIEW_STATUS) {
    const status = bookingLifecycleStatus(b);
    return status === "pending" || status === "pending_payment";
  }
  return bookingLifecycleStatus(b) === statusFilter;
}

function isPendingStatusDeepLink(rawStatus: string): boolean {
  return (
    rawStatus === "pending" ||
    rawStatus === "pending_payment" ||
    rawStatus === BOOKINGS_TO_REVIEW_STATUS
  );
}

function isNonTerminalScheduleBooking(b: Pick<Booking, "status" | "db_status">): boolean {
  if (isTerminalScheduleBooking(b)) return false;
  return bookingLifecycleStatus(b) !== "completed";
}

function bookingListCanReschedule(
  b: Pick<Booking, "status" | "db_status" | "scheduled_at" | "is_group_booking" | "group_booking_id">,
  canEdit: boolean,
): boolean {
  if (!canEdit || !b.scheduled_at) return false;
  if (b.is_group_booking && b.group_booking_id) return true;
  if (b.is_group_booking) return false;
  const status = bookingLifecycleStatus(b);
  return ["pending", "pending_payment", "confirmed", "waiting", "checked_in", "booked"].includes(
    status,
  );
}

function bookingListCanCancel(
  b: Pick<Booking, "status" | "db_status" | "is_group_booking" | "group_booking_id">,
  canCancel: boolean,
): boolean {
  if (!canCancel) return false;
  if (b.is_group_booking && b.group_booking_id) return true;
  if (b.is_group_booking) return false;
  const status = bookingLifecycleStatus(b);
  return !["cancelled", "canceled", "no_show", "completed"].includes(status);
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
  const routeParams = useLocalSearchParams<{ date?: string; booking_id?: string; status?: string }>();
  const insets = useSafeAreaInsets();
  const listBottomPadding = tabScreenScrollBottomPadding(insets.bottom, 16);
  const { screenPadding } = useResponsive();
  const { provider, selectedLocationId } = useProvider();
  const currency = getTenantDefaultCurrency();
  const unifiedPosEnabled = useFeatureFlag("provider.unified_pos_checkout");

  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [listSort, setListSort] = useState<BookingsListSort>("appointment");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const providerTimezone = provider?.timezone?.trim() || null;
  const { businessToday, businessTodayKey } = useBusinessToday(providerTimezone);
  const [selectedDate, setSelectedDate] = useState(() => startOfBusinessDayLocalDate(providerTimezone));
  const [stripAnchorDate, setStripAnchorDate] = useState(() => startOfBusinessDayLocalDate(providerTimezone));
  const [showJumpDatePicker, setShowJumpDatePicker] = useState(false);
  const prevBusinessTodayKeyRef = useRef(businessTodayKey);
  const userPickedDateRef = useRef(false);

  useEffect(() => {
    const rawDate = typeof routeParams.date === "string" ? routeParams.date.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      const [y, m, d] = rawDate.split("-").map(Number);
      const parsed = new Date(y, (m || 1) - 1, d || 1);
      if (Number.isFinite(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0);
        userPickedDateRef.current = !isSameDay(parsed, businessToday);
        setSelectedDate(parsed);
        setStripAnchorDate((prev) =>
          isDateWithinStripWindow(parsed, prev) ? prev : parsed,
        );
        setViewMode("day");
      }
    }
  }, [routeParams.date, businessToday]);

  const selectedDateKey = useMemo(() => {
    return formatBusinessDayYYYYMMDD(selectedDate, providerTimezone);
  }, [selectedDate, providerTimezone]);

  const DATE_STRIP_ITEM_WIDTH = 62;
  const DATE_STRIP_TODAY_INDEX = PROVIDER_BOOKINGS_STRIP_HALF_DAYS;
  const dateStripRef = useRef<FlatList<Date>>(null);
  const scheduleDateStripScrollRef = useRef<() => void>(() => {});

  useEffect(() => {
    const prevKey = prevBusinessTodayKeyRef.current;
    if (prevKey === businessTodayKey) return;

    if (!userPickedDateRef.current || selectedDateKey === prevKey) {
      setSelectedDate(businessToday);
      setStripAnchorDate(businessToday);
      userPickedDateRef.current = false;
    }
    prevBusinessTodayKeyRef.current = businessTodayKey;
  }, [businessToday, businessTodayKey, selectedDateKey]);

  const scrollDateStripToIndex = useCallback((index: number, animated = false) => {
    if (index < 0) return;
    dateStripRef.current?.scrollToIndex({ index, animated, viewPosition: 0.5 });
  }, []);

  const onDateStripScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      dateStripRef.current?.scrollToOffset({
        offset: Math.max(0, info.averageItemLength * info.index),
        animated: false,
      });
      setTimeout(() => {
        scrollDateStripToIndex(info.index, false);
      }, 100);
    },
    [scrollDateStripToIndex],
  );

  useEffect(() => {
    const bookingId =
      typeof routeParams.booking_id === "string" ? routeParams.booking_id.trim() : "";
    if (bookingId && /^[0-9a-f-]{36}$/i.test(bookingId)) {
      router.push(`/(app)/(tabs)/bookings/${bookingId}` as never);
    }
  }, [routeParams.booking_id, router]);

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

  useEffect(() => {
    const rawStatus = typeof routeParams.status === "string" ? routeParams.status.trim() : "";
    if (!rawStatus) return;
    const isKnownStatus =
      STATUS_OPTIONS.some((o) => o.value === rawStatus) || rawStatus === BOOKINGS_TO_REVIEW_STATUS;
    if (!isKnownStatus) return;
    setStatusFilter(rawStatus === "pending" ? BOOKINGS_TO_REVIEW_STATUS : rawStatus);
    if (isPendingStatusDeepLink(rawStatus)) {
      setDateRange("all");
      setStatsRange("all");
      setListSort("appointment");
      setSearch("");
      setDebouncedSearch("");
    }
    setViewMode("overview");
  }, [routeParams.status]);

  interface BookingsStatsPayload {
    booked_gmv: number;
    recognized_revenue: number;
    appointment_count: number;
    pending_count: number;
    confirmed_count: number;
    in_progress_count: number;
    completed_count: number;
    cancelled_count: number;
    no_show_count: number;
  }

  const statsLocationQ = selectedLocationId
    ? `&location_id=${encodeURIComponent(selectedLocationId)}`
    : "";
  const { data: bookingsStatsApi } = useApi<BookingsStatsPayload>(
    `/api/provider/bookings/stats?range=${statsRange}${statsLocationQ}`,
    { staleTimeMs: 30_000, enabled: viewMode === "overview" },
  );
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

  const stripDateParams = useMemo(
    () => buildStripDateParams(providerTimezone, stripAnchorDate),
    [providerTimezone, stripAnchorDate],
  );

  const stripUrl = useMemo(
    () =>
      appendBookingsQueryParts(new URLSearchParams(), {
        ...stripDateParams,
        sort: "scheduled_at",
        order: "asc",
        location_id: selectedLocationId,
      }),
    [stripDateParams, selectedLocationId],
  );

  const stripAtHomeUrl = useMemo(() => {
    if (!selectedLocationId) return "";
    return appendBookingsQueryParts(new URLSearchParams(), {
      ...stripDateParams,
      sort: "scheduled_at",
      order: "asc",
      location_type: "at_home",
    });
  }, [stripDateParams, selectedLocationId]);

  const overviewDateParams = useMemo(
    () => buildOverviewDateParams(dateRange, providerTimezone),
    [dateRange, providerTimezone],
  );

  const overviewUrl = useMemo(() => {
    if (viewMode !== "overview") return "";
    return appendBookingsQueryParts(new URLSearchParams(), {
      ...overviewDateParams,
      status: statusFilter || undefined,
      search: debouncedSearch || undefined,
      sort: listSort === "booked_at" ? "created_at" : "scheduled_at",
      order: listSort === "booked_at" ? "desc" : "asc",
      location_id: selectedLocationId,
    });
  }, [
    viewMode,
    overviewDateParams,
    statusFilter,
    debouncedSearch,
    listSort,
    selectedLocationId,
  ]);

  const overviewAtHomeUrl = useMemo(() => {
    if (viewMode !== "overview" || !selectedLocationId) return "";
    return appendBookingsQueryParts(new URLSearchParams(), {
      ...overviewDateParams,
      status: statusFilter || undefined,
      search: debouncedSearch || undefined,
      sort: listSort === "booked_at" ? "created_at" : "scheduled_at",
      order: listSort === "booked_at" ? "desc" : "asc",
      location_type: "at_home",
    });
  }, [
    viewMode,
    overviewDateParams,
    statusFilter,
    debouncedSearch,
    listSort,
    selectedLocationId,
  ]);

  const {
    data: stripData,
    loading: stripLoading,
    error: stripMainError,
    refresh: refreshStrip,
    mutate: mutateStrip,
  } = usePagedProviderBookings<Booking>(stripUrl, { timeoutMs: 60_000 });

  const {
    data: stripAtHomeData,
    loading: stripAtHomeLoading,
    error: stripAtHomeError,
    refresh: refreshStripAtHome,
    mutate: mutateStripAtHome,
  } = usePagedProviderBookings<Booking>(stripAtHomeUrl, {
    enabled: Boolean(selectedLocationId && stripAtHomeUrl),
    timeoutMs: 60_000,
  });

  const {
    data: overviewData,
    loading: overviewLoading,
    error: overviewError,
    refresh: refreshOverview,
    mutate: mutateOverview,
  } = usePagedProviderBookings<Booking>(overviewUrl, {
    enabled: viewMode === "overview" && Boolean(overviewUrl),
    timeoutMs: 60_000,
  });

  const {
    data: overviewAtHomeData,
    loading: overviewAtHomeLoading,
    error: overviewAtHomeError,
    refresh: refreshOverviewAtHome,
    mutate: mutateOverviewAtHome,
  } = usePagedProviderBookings<Booking>(overviewAtHomeUrl, {
    enabled: viewMode === "overview" && Boolean(selectedLocationId && overviewAtHomeUrl),
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
  const navCountsUrl = useMemo(
    () =>
      selectedLocationId
        ? `/api/provider/nav-counts?location_id=${encodeURIComponent(selectedLocationId)}`
        : "/api/provider/nav-counts",
    [selectedLocationId],
  );
  const { data: navCounts } = useApi<{ waiting_room: number; stale_pending_bookings: number }>(
    navCountsUrl,
    { staleTimeMs: 15_000 },
  );
  const { data: permissionData } = useApi<{
    isOwner?: boolean;
    permissions?: { edit_appointments?: boolean; cancel_appointments?: boolean };
  }>("/api/provider/permissions");
  const isOwner = permissionData?.isOwner === true;
  const canEditAppointments =
    isOwner || permissionData?.permissions?.edit_appointments === true;
  const canCancelAppointments =
    isOwner ||
    permissionData?.permissions?.cancel_appointments === true ||
    canEditAppointments;

  const timeBlocks = useMemo(() => (Array.isArray(timeBlocksRaw) ? timeBlocksRaw : []), [timeBlocksRaw]);

  const stripBookingsMerged = useMemo(() => {
    const main = Array.isArray(stripData) ? stripData : [];
    const extra = Array.isArray(stripAtHomeData) ? stripAtHomeData : [];
    return mergeAtHomeBookings(main, extra);
  }, [stripData, stripAtHomeData]);

  const overviewBookingsMerged = useMemo(() => {
    const main = Array.isArray(overviewData) ? overviewData : [];
    const extra = Array.isArray(overviewAtHomeData) ? overviewAtHomeData : [];
    return mergeAtHomeBookings(main, extra);
  }, [overviewData, overviewAtHomeData]);

  const stripLoadingAny = stripLoading || (Boolean(selectedLocationId) && stripAtHomeLoading);
  const overviewLoadingAny =
    viewMode === "overview" &&
    (overviewLoading || (Boolean(selectedLocationId) && overviewAtHomeLoading));
  const stripError = stripMainError ?? (selectedLocationId ? stripAtHomeError : null);
  const overviewListError = overviewError ?? (selectedLocationId ? overviewAtHomeError : null);

  const refreshAllBookings = useCallback(async () => {
    await refreshStrip();
    if (selectedLocationId) await refreshStripAtHome();
    if (viewMode === "overview") {
      await refreshOverview();
      if (selectedLocationId) await refreshOverviewAtHome();
    }
  }, [
    refreshStrip,
    refreshStripAtHome,
    refreshOverview,
    refreshOverviewAtHome,
    selectedLocationId,
    viewMode,
  ]);

  const refreshOverlays = useCallback(async () => {
    await refreshTimeBlocks();
    await refreshAvailability();
  }, [refreshTimeBlocks, refreshAvailability]);

  const mutateMerged = useCallback(
    (next: Booking[] | null) => {
      if (next === null) return;
      const byId = new Map(next.map((b) => [b.id, b]));
      if (stripData) mutateStrip(stripData.map((b) => byId.get(b.id) ?? b));
      if (stripAtHomeData) mutateStripAtHome(stripAtHomeData.map((b) => byId.get(b.id) ?? b));
      if (overviewData) mutateOverview(overviewData.map((b) => byId.get(b.id) ?? b));
      if (overviewAtHomeData) mutateOverviewAtHome(overviewAtHomeData.map((b) => byId.get(b.id) ?? b));
    },
    [
      stripData,
      stripAtHomeData,
      overviewData,
      overviewAtHomeData,
      mutateStrip,
      mutateStripAtHome,
      mutateOverview,
      mutateOverviewAtHome,
    ],
  );

  const { applyStatus, pendingIds } = useBookingStatusActions({
    bookings: stripBookingsMerged,
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
  // Keep a stable ref to the latest refresh so the focus / realtime / AppState
  // effects can call it without re-subscribing or re-firing every time refresh
  // changes identity (which happens whenever filters or fetched data change,
  // and also caused "cannot add postgres_changes after subscribe").
  const refreshRef = useRef(refreshAllBookings);
  useEffect(() => { refreshRef.current = refreshAllBookings; }, [refreshAllBookings]);

  // The paged bookings hooks already fetch on mount and refetch when their
  // filters (date range / location / view mode) change. The focus refresh only
  // needs to cover *returning* to the list (e.g. back from a booking detail),
  // so skip the very first focus — otherwise every bookings query fires twice
  // on screen entry. An empty dep list (via refreshRef) also stops this from
  // re-running on filter churn the underlying hooks already handle.
  const hasFocusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setBookingsListFocused(true);
      scheduleDateStripScrollRef.current();
      if (hasFocusedOnceRef.current) {
        void refreshRef.current();
      } else {
        hasFocusedOnceRef.current = true;
      }
      return () => setBookingsListFocused(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Note: app-foreground refresh is handled centrally — AuthProvider emits
  // `beautonomi:app:focus` on AppState "active", and each paged bookings hook
  // silently refetches on that event. A screen-level AppState listener here
  // would just fire every bookings query a second time on resume.

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

  const stripDays = useMemo(() => buildStripDays(stripAnchorDate), [stripAnchorDate]);

  const selectedDateStripIndex = useMemo(() => {
    const index = stripDays.findIndex((d) => isSameDay(d, selectedDate));
    return index >= 0 ? index : DATE_STRIP_TODAY_INDEX;
  }, [stripDays, selectedDate, DATE_STRIP_TODAY_INDEX]);

  const scrollDateStripToSelected = useCallback(
    (animated = false) => {
      if (viewMode !== "day") return;
      scrollDateStripToIndex(selectedDateStripIndex, animated);
    },
    [viewMode, selectedDateStripIndex, scrollDateStripToIndex],
  );

  scheduleDateStripScrollRef.current = () => {
    requestAnimationFrame(() => {
      scrollDateStripToSelected(false);
      // SectionList header mounts the strip lazily — retry once after layout.
      setTimeout(() => scrollDateStripToSelected(false), 120);
    });
  };

  useEffect(() => {
    if (viewMode !== "day") return;
    scheduleDateStripScrollRef.current();
  }, [viewMode, selectedDateStripIndex, businessTodayKey, stripAnchorDate]);


  const dateStripInfo = useMemo(
    () => buildDateStripInfo(stripBookingsMerged, timeBlocks, closedDateKeys, providerTimezone),
    [stripBookingsMerged, timeBlocks, closedDateKeys, providerTimezone],
  );

  const overviewFiltered = useMemo(() => {
    const allBookings: Booking[] = overviewBookingsMerged;
    const q = search.trim().toLowerCase();
    if (!q) return allBookings;
    return allBookings.filter((b) => {
      const name = (b.customers?.full_name ?? "").toLowerCase();
      const num = (b.booking_number ?? "").toLowerCase();
      const service = (b.services?.[0]?.name ?? b.services?.[0]?.offering_name ?? "").toLowerCase();
      return name.includes(q) || num.includes(q) || service.includes(q);
    });
  }, [overviewBookingsMerged, search]);

  const daySearchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stripBookingsMerged;
    return stripBookingsMerged.filter((b) => {
      const name = (b.customers?.full_name ?? "").toLowerCase();
      const num = (b.booking_number ?? "").toLowerCase();
      const service = (b.services?.[0]?.name ?? b.services?.[0]?.offering_name ?? "").toLowerCase();
      return name.includes(q) || num.includes(q) || service.includes(q);
    });
  }, [stripBookingsMerged, search]);

  const filtered = viewMode === "overview" ? overviewFiltered : daySearchFiltered;

  const isToReviewOverviewEmpty = useMemo(
    () =>
      viewMode === "overview" &&
      dateRange === "all" &&
      statusFilter === BOOKINGS_TO_REVIEW_STATUS &&
      !search.trim() &&
      filtered.length === 0 &&
      !overviewLoadingAny,
    [viewMode, dateRange, statusFilter, search, filtered.length, overviewLoadingAny],
  );

  const nextUpcomingId = useMemo(() => {
    const now = Date.now();
    const sorted = [...stripBookingsMerged]
      .filter((b) => effectiveScheduleAt(b) && isNonTerminalScheduleBooking(b))
      .sort(
        (a, b) =>
          (effectiveScheduleAt(a)?.getTime() ?? 0) - (effectiveScheduleAt(b)?.getTime() ?? 0),
      );
    return (
      sorted.find((b) => (effectiveScheduleAt(b)?.getTime() ?? 0) > now)?.id ?? null
    );
  }, [stripBookingsMerged]);

  const dayBookings = useMemo(() => {
    if (viewMode !== "day") return [];
    const dayRows = filterBookingsForDayKey(daySearchFiltered, selectedDateKey, providerTimezone);
    // Status chip narrows the day list client-side (the strip stays full —
    // dateStripInfo is derived from the unfiltered strip dataset).
    if (!statusFilter) return dayRows;
    return dayRows.filter((b) => bookingMatchesStatusFilter(b, statusFilter));
  }, [viewMode, daySearchFiltered, selectedDateKey, providerTimezone, statusFilter]);

  const dayBlocksForSelected = useMemo(() => {
    return timeBlocks.filter((t) => t.date === selectedDateKey && t.is_active);
  }, [timeBlocks, selectedDateKey]);

  const daySchedule = useMemo(() => {
    const items: ScheduleItem[] = [...dayBookings.map((b) => ({ kind: "booking" as const, booking: b }))];
    for (const block of dayBlocksForSelected) {
      items.push({ kind: "block", block });
    }
    const sortKey = (it: ScheduleItem) => {
      if (it.kind === "booking") {
        const at = effectiveScheduleAt(it.booking);
        if (!at) return Number.POSITIVE_INFINITY;
        return at.getTime();
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
        const at = effectiveScheduleAt(it.booking);
        return at ? at.getHours() : 0;
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

  const daySummary = useMemo(() => {
    const dayB = stripBookingsMerged.filter(
      (b) => bookingScheduleYmd(b, providerTimezone) === selectedDateKey,
    );
    const active = dayB.filter((b) => !isTerminalScheduleBooking(b));
    const blockCount = timeBlocks.filter((t) => t.date === selectedDateKey && t.is_active).length;
    const pending = dayB.filter((b) => isPendingOrQueueBooking(b)).length;
    const closed = closedDateKeys.has(selectedDateKey);
    const nextUp = dayB
      .filter(
        (b) =>
          effectiveScheduleAt(b) &&
          (effectiveScheduleAt(b)?.getTime() ?? 0) > Date.now() &&
          isNonTerminalScheduleBooking(b),
      )
      .sort(
        (a, b) =>
          (effectiveScheduleAt(a)?.getTime() ?? 0) - (effectiveScheduleAt(b)?.getTime() ?? 0),
      )[0];
    return {
      label:
        selectedDateKey === businessTodayKey
          ? "Today"
          : isTomorrow(selectedDate)
            ? "Tomorrow"
            : format(selectedDate, "EEE, MMM d"),
      count: active.length,
      revenue: active.reduce((n, b) => n + Number(b.total_amount || 0), 0),
      pending,
      blockCount,
      isClosed: closed,
      hasBookingsOnClosed: closed && dayB.length > 0,
      nextUp,
    };
  }, [stripBookingsMerged, selectedDateKey, timeBlocks, closedDateKeys, selectedDate, providerTimezone, businessTodayKey]);

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

  /** Server-backed stats (provider TZ + ledger); independent of paginated list window. */
  const statsSnapshot = useMemo(() => {
    if (bookingsStatsApi) {
      return {
        count: bookingsStatsApi.appointment_count,
        bookedGmv: bookingsStatsApi.booked_gmv,
        recognizedRevenue: bookingsStatsApi.recognized_revenue,
        pendingCount: bookingsStatsApi.pending_count,
        confirmedCount: bookingsStatsApi.confirmed_count,
        inProgressCount: bookingsStatsApi.in_progress_count,
        completedCount: bookingsStatsApi.completed_count,
        cancelledCount: bookingsStatsApi.cancelled_count,
        noShowCount: bookingsStatsApi.no_show_count,
      };
    }
    return {
      count: 0,
      bookedGmv: 0,
      recognizedRevenue: 0,
      pendingCount: 0,
      confirmedCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      noShowCount: 0,
    };
  }, [bookingsStatsApi]);

  const toReviewEmptyWithPendingMetric = useMemo(
    () =>
      viewMode === "overview" &&
      statusFilter === BOOKINGS_TO_REVIEW_STATUS &&
      !overviewLoadingAny &&
      filtered.length === 0 &&
      statsSnapshot.pendingCount > 0,
    [viewMode, statusFilter, overviewLoadingAny, filtered.length, statsSnapshot.pendingCount],
  );

  const statsReconciliationLine = useMemo(
    () =>
      buildStatsReconciliationLine({
        pending_count: statsSnapshot.pendingCount,
        confirmed_count: statsSnapshot.confirmedCount,
        in_progress_count: statsSnapshot.inProgressCount,
        completed_count: statsSnapshot.completedCount,
        cancelled_count: statsSnapshot.cancelledCount,
        no_show_count: statsSnapshot.noShowCount,
      }),
    [statsSnapshot],
  );

  const statsListRangeMismatch =
    viewMode === "overview" && statsRangeToDateRange(statsRange) !== dateRange;

  const statsRangeLabel = useMemo(() => {
    if (statsRange === "today") return "Today";
    if (statsRange === "week") return "Week";
    if (statsRange === "month") return "Month";
    return "All";
  }, [statsRange]);

  const dateRangeLabel = useMemo(
    () => buildOverviewDateRangeLabel(dateRange, providerTimezone),
    [dateRange, providerTimezone],
  );

  const applyJumpToDate = useCallback(
    (picked: Date) => {
      const normalized = new Date(picked);
      normalized.setHours(0, 0, 0, 0);
      userPickedDateRef.current = !isSameDay(normalized, businessToday);
      setSelectedDate(normalized);
      setStripAnchorDate((prev) =>
        isDateWithinStripWindow(normalized, prev) ? prev : normalized,
      );
      setViewMode("day");
    },
    [businessToday],
  );

  /**
   * Jump to the Overview list, filtered to pending bookings across all dates
   * (oldest-first via the default "By appointment" sort). Used by the
   * needs-attention banner and the tappable Overview Pending stat card so a
   * provider can always reach — and action — pending requests that have
   * fallen outside the ±30-day Day-view date strip.
   */
  const showAllPendingBookings = useCallback(() => {
    void Haptics.selectionAsync();
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter(BOOKINGS_TO_REVIEW_STATUS);
    setDateRange("all");
    setStatsRange("all");
    setListSort("appointment");
    setViewMode("overview");
  }, []);

  const applyStatsTileFilter = useCallback(
    (tile: BookingsStatsTileKey) => {
      void Haptics.selectionAsync();
      if (tile === "earned") {
        router.push("/(app)/(tabs)/more/reports" as never);
        return;
      }
      setSearch("");
      setDebouncedSearch("");
      setStatusFilter(statusFilterForStatsTile(tile));
      setDateRange(statsRangeToDateRange(statsRange));
      setListSort("appointment");
      setViewMode("overview");
    },
    [router, statsRange],
  );

  const syncListRangeToStats = useCallback(() => {
    void Haptics.selectionAsync();
    setDateRange(statsRangeToDateRange(statsRange));
  }, [statsRange]);

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

  const openBookingReschedule = useCallback(
    (b: Booking) => {
      if (b.is_group_booking && b.group_booking_id) {
        router.push({
          pathname: "/(app)/(tabs)/more/group-bookings",
          params: { open_group_id: b.group_booking_id, open_edit: "1" },
        } as never);
        return;
      }
      router.push({
        pathname: `/(app)/(tabs)/bookings/${b.id}`,
        params: { openReschedule: "1" },
      } as never);
    },
    [router],
  );

  const openBookingCancel = useCallback(
    (b: Booking) => {
      if (b.is_group_booking && b.group_booking_id) {
        router.push({
          pathname: "/(app)/(tabs)/more/group-bookings",
          params: { open_group_id: b.group_booking_id, open_cancel: "1" },
        } as never);
        return;
      }
      router.push({
        pathname: `/(app)/(tabs)/bookings/${b.id}`,
        params: { openCancel: "1" },
      } as never);
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
          canReschedule={bookingListCanReschedule(item.booking, canEditAppointments)}
          canCancel={bookingListCanCancel(item.booking, canCancelAppointments)}
          onReschedule={(booking) => openBookingReschedule(booking as Booking)}
          onCancel={(booking) => openBookingCancel(booking as Booking)}
        />
      );
    },
    [
      currency,
      pendingIds,
      nextUpcomingId,
      openBooking,
      handleApplyStatus,
      router,
      canEditAppointments,
      canCancelAppointments,
      openBookingReschedule,
      openBookingCancel,
    ],
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
              ...(unifiedPosEnabled
                ? [{ label: "Sell", sub: "POS", icon: "card-outline", route: "/(app)/(tabs)/sales" } satisfies QuickActionTile]
                : []),
              { label: "Front", sub: "Desk queue", icon: "people-circle-outline", route: "/(app)/(tabs)/more/waiting-room" },
              { label: "Walk-in", sub: "Appointment", icon: "walk-outline", route: "/(app)/(tabs)/bookings/new?walk_in=true" },
              { label: "Retail", sub: "Product sale", icon: "bag-handle-outline", route: "/(app)/(tabs)/more/walk-in-sale" },
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
            <View style={twStyle("mx-4 mb-2 flex-row items-center justify-end")}>
              <TouchableOpacity
                onPress={() => setShowJumpDatePicker(true)}
                style={twStyle(
                  "flex-row items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2",
                )}
                accessibilityRole="button"
                accessibilityLabel={`Jump to date, currently ${format(selectedDate, "MMMM d, yyyy")}`}
              >
                <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                <Text style={twStyle("text-xs font-semibold text-gray-700")}>
                  {format(selectedDate, "MMM d, yyyy")}
                </Text>
              </TouchableOpacity>
            </View>
            {showJumpDatePicker ? (
              <View style={twStyle("mx-4 mb-2")}>
                {Platform.OS === "ios" ? (
                  <View style={twStyle("mb-1 flex-row items-center justify-end")}>
                    <TouchableOpacity
                      onPress={() => setShowJumpDatePicker(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Done choosing date"
                    >
                      <Text style={[twStyle("text-sm font-bold"), { color: Colors.primary }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, picked) => {
                    if (Platform.OS === "android") setShowJumpDatePicker(false);
                    if (event.type === "dismissed") return;
                    if (picked) applyJumpToDate(picked);
                  }}
                />
              </View>
            ) : null}
            <FlatList<Date>
              ref={dateStripRef}
              horizontal
              data={stripDays}
              keyExtractor={(d: Date) => d.toISOString()}
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={selectedDateStripIndex}
              initialNumToRender={40}
              removeClippedSubviews={false}
              getItemLayout={(_item: Date | ArrayLike<Date> | null | undefined, index: number) => ({
                length: DATE_STRIP_ITEM_WIDTH,
                offset: DATE_STRIP_ITEM_WIDTH * index,
                index,
              })}
              onScrollToIndexFailed={onDateStripScrollToIndexFailed}
              contentContainerStyle={{ paddingHorizontal: 0, paddingBottom: 8 }}
              renderItem={({ item: day }: { item: Date }) => {
                const key = formatBusinessDayYYYYMMDD(day, providerTimezone);
                const info = dateStripInfo.get(key);
                const selected = isSameDay(day, selectedDate);
                const todayCell = isSameDay(day, businessToday);
                const dotColor = info?.hasPending ? "#f59e0b" : Colors.primary;
                const totalCount = (info?.bookings ?? 0) + (info?.blocks ?? 0);
                const indicatorColor = selected ? "#ffffff" : dotColor;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      void Haptics.selectionAsync();
                      userPickedDateRef.current = !isSameDay(day, businessToday);
                      setSelectedDate(day);
                    }}
                    style={[
                      { width: 56, alignItems: "center", borderRadius: 14, paddingVertical: 10, marginRight: 6 },
                      selected ? { backgroundColor: Colors.primary } : {},
                      !selected && todayCell ? { borderWidth: 1.5, borderColor: Colors.primary } : {},
                      info?.isClosed && !selected ? { backgroundColor: "#f3f4f6" } : {},
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={
                      totalCount > 0
                        ? `${format(day, "EEEE MMMM d")}, ${totalCount} scheduled`
                        : format(day, "EEEE MMMM d")
                    }
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
                    {totalCount > 0 ? (
                      <View style={twStyle("mt-1 flex-row items-center gap-0.5")}>
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: indicatorColor,
                          }}
                        />
                        <Text style={[twStyle("text-[8px] font-bold"), { color: indicatorColor }]}>
                          {totalCount > 9 ? "9+" : totalCount}
                        </Text>
                      </View>
                    ) : info && info.blocks > 0 && info.bookings === 0 ? (
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
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-[10px] font-semibold uppercase tracking-wide text-gray-500")}>
                    Booked value
                  </Text>
                  <Text style={twStyle("text-base font-bold text-gray-900")}>
                    {formatCurrency(daySummary.revenue, currency)}
                  </Text>
                </View>
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
              {daySummary.nextUp && selectedDateKey === businessTodayKey && daySummary.nextUp.scheduled_at ? (
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
            {(navCounts?.stale_pending_bookings ?? 0) > 0 ? (
              <TouchableOpacity
                onPress={showAllPendingBookings}
                activeOpacity={0.85}
                style={[
                  twStyle("mx-4 mb-2 flex-row items-center rounded-xl border px-3 py-3"),
                  { backgroundColor: "#fffbeb", borderColor: "#fde68a", borderLeftWidth: 4, borderLeftColor: "#f59e0b" },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${navCounts?.stale_pending_bookings} booking requests from past dates need your attention. Review.`}
              >
                <Ionicons name="alert-circle-outline" size={18} color="#b45309" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={twStyle("text-sm font-semibold text-amber-900")}>
                    {navCounts?.stale_pending_bookings} booking request
                    {navCounts?.stale_pending_bookings === 1 ? "" : "s"} from past dates need your attention
                  </Text>
                  <Text style={twStyle("mt-0.5 text-xs text-amber-700")}>
                    They&apos;ve fallen outside your date strip — review and confirm or decline them.
                  </Text>
                </View>
                <Text style={twStyle("ml-2 text-xs font-bold text-amber-800")}>Review</Text>
              </TouchableOpacity>
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
              <TouchableOpacity
                onPress={() => applyStatsTileFilter("appointments")}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${statsSnapshot.count} appointments — view all`}
                style={twStyle("flex-1 rounded-xl border border-gray-200 bg-white p-2.5")}
              >
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="calendar-outline" size={12} color="#6b7280" />
                  <Text style={twStyle("text-[10px] font-semibold uppercase tracking-wide text-gray-500")}>
                    Appointments
                  </Text>
                </View>
                <Text style={twStyle("mt-0.5 text-lg font-bold text-gray-900")}>{statsSnapshot.count}</Text>
                <Text style={twStyle("text-[10px] text-gray-500")}>{statsRangeLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyStatsTileFilter("pending")}
                activeOpacity={0.85}
                disabled={statsSnapshot.pendingCount === 0}
                accessibilityRole="button"
                accessibilityLabel={`${statsSnapshot.pendingCount} pending bookings — filter list`}
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
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyStatsTileFilter("confirmed")}
                activeOpacity={0.85}
                disabled={statsSnapshot.confirmedCount === 0}
                accessibilityRole="button"
                accessibilityLabel={`${statsSnapshot.confirmedCount} confirmed bookings — filter list`}
                style={[
                  twStyle("flex-1 rounded-xl p-2.5 border"),
                  statsSnapshot.confirmedCount > 0
                    ? { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }
                    : { backgroundColor: "#fff", borderColor: "#e5e7eb" },
                ]}
              >
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="checkmark-outline" size={12} color={statsSnapshot.confirmedCount > 0 ? "#059669" : "#6b7280"} />
                  <Text
                    style={[
                      twStyle("text-[10px] font-semibold uppercase tracking-wide"),
                      { color: statsSnapshot.confirmedCount > 0 ? "#059669" : "#6b7280" },
                    ]}
                  >
                    Confirmed
                  </Text>
                </View>
                <Text style={twStyle("mt-0.5 text-lg font-bold text-gray-900")}>{statsSnapshot.confirmedCount}</Text>
              </TouchableOpacity>
            </View>
            <View style={twStyle("mt-2 flex-row gap-2")}>
              <TouchableOpacity
                onPress={() => applyStatsTileFilter("active")}
                activeOpacity={0.85}
                disabled={statsSnapshot.inProgressCount === 0}
                accessibilityRole="button"
                accessibilityLabel={`${statsSnapshot.inProgressCount} active bookings — filter list`}
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
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyStatsTileFilter("completed")}
                activeOpacity={0.85}
                disabled={statsSnapshot.completedCount === 0}
                accessibilityRole="button"
                accessibilityLabel={`${statsSnapshot.completedCount} completed bookings — filter list`}
                style={twStyle("flex-1 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5")}
              >
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="checkmark-circle-outline" size={12} color="#059669" />
                  <Text style={twStyle("text-[10px] font-semibold uppercase tracking-wide text-emerald-800")}>Completed</Text>
                </View>
                <Text style={twStyle("mt-0.5 text-lg font-bold text-gray-900")}>{statsSnapshot.completedCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyStatsTileFilter("earned")}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Earned ${formatCurrency(statsSnapshot.recognizedRevenue, currency)} — open reports`}
                style={[twStyle("flex-1 rounded-xl p-2.5 border"), { backgroundColor: "#fff0f7", borderColor: "#fbcfe8" }]}
              >
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="cash-outline" size={12} color="#be185d" />
                  <Text style={[twStyle("text-[10px] font-semibold uppercase tracking-wide"), { color: "#be185d" }]}>
                    Earned
                  </Text>
                </View>
                <Text style={twStyle("mt-0.5 text-[15px] font-bold text-gray-900")} numberOfLines={1}>
                  {formatCurrency(statsSnapshot.recognizedRevenue, currency)}
                </Text>
                <Text style={twStyle("text-[10px] text-gray-500")} numberOfLines={1}>
                  Booked {formatCurrency(statsSnapshot.bookedGmv, currency)}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={twStyle("mt-2 text-[11px] leading-4 text-gray-500")}>{statsReconciliationLine}</Text>
            {statsListRangeMismatch ? (
              <TouchableOpacity
                onPress={syncListRangeToStats}
                activeOpacity={0.85}
                style={twStyle("mt-2 flex-row items-center gap-1 self-start rounded-full bg-gray-100 px-2.5 py-1")}
                accessibilityRole="button"
                accessibilityLabel="Match list date range to metrics"
              >
                <Ionicons name="sync-outline" size={12} color="#4b5563" />
                <Text style={twStyle("text-[11px] font-semibold text-gray-600")}>
                  List shows {dateRangeLabel} — tap to match metrics ({statsRangeLabel})
                </Text>
              </TouchableOpacity>
            ) : null}
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
      unifiedPosEnabled,
      viewMode,
      stripDays,
      dateStripInfo,
      selectedDate,
      daySummary,
      currency,
      navCounts?.waiting_room,
      navCounts?.stale_pending_bookings,
      showAllPendingBookings,
      daySummary.isClosed,
      daySummary.hasBookingsOnClosed,
      statsRange,
      isLive,
      statsRangeLabel,
      statsSnapshot,
      statsReconciliationLine,
      statsListRangeMismatch,
      dateRangeLabel,
      applyStatsTileFilter,
      syncListRangeToStats,
      search,
      dateRange,
      listSort,
      statusFilter,
      applyJumpToDate,
      showJumpDatePicker,
    ],
  );

  if (stripLoadingAny && stripBookingsMerged.length === 0) {
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

  if (stripError && stripBookingsMerged.length === 0) {
    return (
      <ScreenContainer scrollable={false} noPadding>
        <View style={{ paddingHorizontal: screenPadding }}>
          <ScreenHeader title="Bookings" showBack />
        </View>
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: screenPadding }}>
          <ErrorState message={stripError} onRetry={() => void refreshAllBookings()} />
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
          subtitle={`${viewMode === "day" ? daySummary.label : dateRangeLabel} · ${viewMode === "day" ? dayBookings.length : filtered.length}`}
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
          extraData={`${filtered.length}:${stripBookingsMerged.length}:${selectedDateKey}:${refreshing}:${viewMode}:${listSort}`}
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
            viewMode === "overview" && overviewListError ? (
              <ErrorState message={overviewListError} onRetry={() => void refreshAllBookings()} />
            ) : viewMode === "overview" && overviewLoadingAny ? (
              <View style={{ paddingHorizontal: 4, paddingTop: 16, gap: 12 }}>
                {[0, 1, 2].map((k) => (
                  <Animated.View
                    key={k}
                    style={[
                      twStyle("rounded-2xl bg-gray-100"),
                      { opacity: skeletonOpacity, height: 96 },
                    ]}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="calendar-outline"
                title={
                  toReviewEmptyWithPendingMetric
                    ? "Pending count doesn't match this list yet"
                    : isToReviewOverviewEmpty
                      ? "No pending requests"
                      : search || statusFilter
                        ? "No bookings match"
                        : "Nothing scheduled"
                }
                description={
                  toReviewEmptyWithPendingMetric
                    ? "Metrics show pending bookings that may include group requests or another date range. Pull to refresh, or open Group bookings to review party requests."
                    : isToReviewOverviewEmpty
                      ? "There are no pending or awaiting-payment bookings for this location."
                      : search || statusFilter
                        ? "Try adjusting your search or filters."
                        : viewMode === "day"
                          ? "No appointments or blocks for this day."
                          : "Create a new booking to get started."
                }
                actionLabel={
                  toReviewEmptyWithPendingMetric
                    ? "Group bookings"
                    : !search && !statusFilter && viewMode === "overview"
                      ? "New booking"
                      : undefined
                }
                onAction={
                  toReviewEmptyWithPendingMetric
                    ? () => router.push("/(app)/(tabs)/more/group-bookings" as never)
                    : !search && !statusFilter && viewMode === "overview"
                      ? () => router.push("/(app)/(tabs)/bookings/new" as never)
                      : undefined
                }
              />
            )
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

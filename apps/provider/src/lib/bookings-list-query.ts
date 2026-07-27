import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import {
  bookingScheduleYmd,
  formatBusinessDayYYYYMMDD,
  isPendingOrQueueBooking,
  isTerminalScheduleBooking,
  PROVIDER_BOOKINGS_STRIP_HALF_DAYS,
  resolveBookingDisplayTimezone,
  startOfBusinessDayLocalDate,
} from "@beautonomi/utils";

export type BookingsDateRange = "today" | "week" | "month" | "upcoming" | "all";

export type BookingsStatsRange = "today" | "week" | "month" | "all";

export type BookingsStatsTileKey =
  | "appointments"
  | "pending"
  | "confirmed"
  | "active"
  | "completed"
  | "earned";

/** Keep Overview list date chips aligned with the metrics strip range. */
export function statsRangeToDateRange(range: BookingsStatsRange): BookingsDateRange {
  if (range === "today") return "today";
  if (range === "week") return "week";
  if (range === "month") return "month";
  return "all";
}

/** Map a tapped Overview metric tile to the status chip value. */
export function statusFilterForStatsTile(tile: BookingsStatsTileKey): string {
  switch (tile) {
    case "pending":
      return BOOKINGS_TO_REVIEW_STATUS;
    case "confirmed":
      return "confirmed";
    case "active":
      return "in_progress";
    case "completed":
      return "completed";
    case "appointments":
    case "earned":
    default:
      return "";
  }
}

export function buildStatsReconciliationLine(stats: {
  pending_count: number;
  confirmed_count: number;
  in_progress_count: number;
  completed_count: number;
  cancelled_count: number;
  no_show_count: number;
}): string {
  const parts = [
    `${stats.pending_count} pending`,
    `${stats.confirmed_count} confirmed`,
    `${stats.in_progress_count} active`,
    `${stats.completed_count} completed`,
  ];
  const excluded = stats.cancelled_count + stats.no_show_count;
  if (excluded > 0) {
    parts.push(`excludes ${excluded} cancelled/no-show`);
  }
  return parts.join(" · ");
}

/** Matches nav-counts stale/pending and the Overview "To review" deep link. */
export const BOOKINGS_TO_REVIEW_STATUS = "pending,pending_payment";

export type DateStripDayInfo = {
  bookings: number;
  hasPending: boolean;
  blocks: number;
  isClosed: boolean;
};

export type DateStripBookingRow = {
  id?: string;
  scheduled_at?: string | null;
  services?: { scheduled_start_at?: string | null }[] | null;
  status?: string | null;
  db_status?: string | null;
};

export type DateStripTimeBlock = {
  date: string;
  is_active?: boolean;
};

/** Build strip counter map from bookings, time blocks, and closed days. */
export function buildDateStripInfo(
  bookings: DateStripBookingRow[],
  timeBlocks: DateStripTimeBlock[],
  closedDateKeys: Iterable<string>,
  providerTimezone?: string | null,
): Map<string, DateStripDayInfo> {
  const map = new Map<string, DateStripDayInfo>();
  for (const b of bookings) {
    if (isTerminalScheduleBooking(b)) continue;
    const key = bookingScheduleYmd(b, providerTimezone);
    if (!key) continue;
    const prev = map.get(key) ?? { bookings: 0, hasPending: false, blocks: 0, isClosed: false };
    map.set(key, {
      bookings: prev.bookings + 1,
      hasPending: prev.hasPending || isPendingOrQueueBooking(b),
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
}

/** Day list rows for a selected calendar day (provider TZ). */
export function filterBookingsForDayKey<T extends DateStripBookingRow>(
  bookings: T[],
  selectedDateKey: string,
  providerTimezone?: string | null,
): T[] {
  return bookings.filter((b) => bookingScheduleYmd(b, providerTimezone) === selectedDateKey);
}

export function normalizeStripAnchorDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** ±30-day horizontal strip centered on `stripAnchorDate` (defaults to business today). */
export function buildStripDays(stripAnchorDate: Date): Date[] {
  const anchor = normalizeStripAnchorDate(stripAnchorDate);
  return Array.from({ length: PROVIDER_BOOKINGS_STRIP_HALF_DAYS * 2 + 1 }, (_, i) =>
    addDays(anchor, i - PROVIDER_BOOKINGS_STRIP_HALF_DAYS),
  );
}

export function isDateWithinStripWindow(date: Date, stripAnchorDate: Date): boolean {
  const anchor = normalizeStripAnchorDate(stripAnchorDate);
  const target = normalizeStripAnchorDate(date);
  const start = addDays(anchor, -PROVIDER_BOOKINGS_STRIP_HALF_DAYS);
  const end = addDays(anchor, PROVIDER_BOOKINGS_STRIP_HALF_DAYS);
  return target >= start && target <= end;
}

export function buildStripDateParams(
  providerTimezone?: string | null,
  stripAnchorDate?: Date | null,
): {
  start_date: string;
  end_date: string;
} {
  const tz = resolveBookingDisplayTimezone(providerTimezone);
  const anchor = stripAnchorDate
    ? normalizeStripAnchorDate(stripAnchorDate)
    : startOfBusinessDayLocalDate(providerTimezone);
  return {
    start_date: formatBusinessDayYYYYMMDD(addDays(anchor, -PROVIDER_BOOKINGS_STRIP_HALF_DAYS), tz),
    end_date: formatBusinessDayYYYYMMDD(addDays(anchor, PROVIDER_BOOKINGS_STRIP_HALF_DAYS), tz),
  };
}

export function buildOverviewDateParams(
  range: BookingsDateRange,
  providerTimezone?: string | null,
): { start_date?: string; end_date?: string } {
  const tz = resolveBookingDisplayTimezone(providerTimezone);
  const businessToday = startOfBusinessDayLocalDate(providerTimezone);
  if (range === "all") return {};
  if (range === "today") {
    const ymd = formatBusinessDayYYYYMMDD(businessToday, tz);
    return { start_date: ymd, end_date: ymd };
  }
  if (range === "week") {
    return {
      start_date: format(startOfWeek(businessToday, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      end_date: format(endOfWeek(businessToday, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }
  if (range === "upcoming") {
    return { start_date: formatBusinessDayYYYYMMDD(businessToday, tz) };
  }
  return {
    start_date: format(startOfMonth(businessToday), "yyyy-MM-dd"),
    end_date: format(endOfMonth(businessToday), "yyyy-MM-dd"),
  };
}

/** Human-readable caption for overview date-range chips (provider business day). */
export function buildOverviewDateRangeLabel(
  range: BookingsDateRange,
  providerTimezone?: string | null,
): string {
  const businessToday = startOfBusinessDayLocalDate(providerTimezone);
  switch (range) {
    case "today":
      return format(businessToday, "EEE, MMM d");
    case "week":
      return `Week of ${format(startOfWeek(businessToday, { weekStartsOn: 1 }), "MMM d")}`;
    case "month":
      return format(businessToday, "MMMM yyyy");
    case "upcoming":
      return "Upcoming";
    case "all":
      return "All time";
  }
}

export function mergeAtHomeBookings<T extends { id?: string }>(main: T[], atHome: T[]): T[] {
  if (atHome.length === 0) return main;
  const seen = new Set(main.map((b) => b.id));
  return [...main, ...atHome.filter((b) => b.id && !seen.has(b.id))];
}

export function appendBookingsQueryParts(
  base: URLSearchParams,
  options: {
    start_date?: string;
    end_date?: string;
    status?: string;
    search?: string;
    sort?: "scheduled_at" | "created_at";
    order?: "asc" | "desc";
    location_id?: string | null;
    location_type?: "at_home";
  },
): string {
  const params = new URLSearchParams(base);
  if (options.start_date) params.set("start_date", options.start_date);
  if (options.end_date) params.set("end_date", options.end_date);
  if (options.status) params.set("status", options.status);
  if (options.search) params.set("search", options.search);
  if (options.sort) params.set("sort", options.sort);
  if (options.order) params.set("order", options.order);
  if (options.location_type === "at_home") {
    params.set("location_type", "at_home");
  } else if (options.location_id) {
    params.set("location_id", options.location_id);
  }
  return `/api/provider/bookings?${params.toString()}`;
}

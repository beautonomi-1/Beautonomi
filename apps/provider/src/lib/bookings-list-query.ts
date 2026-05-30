import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import {
  bookingScheduleYmd,
  formatBusinessDayYYYYMMDD,
  isPendingOrQueueBooking,
  isTerminalScheduleBooking,
  PROVIDER_BOOKINGS_STRIP_HALF_DAYS,
  resolveBookingDisplayTimezone,
} from "@beautonomi/utils";

export type BookingsDateRange = "today" | "week" | "month" | "upcoming" | "all";

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

export function buildStripDateParams(providerTimezone?: string | null): {
  start_date: string;
  end_date: string;
} {
  const tz = resolveBookingDisplayTimezone(providerTimezone);
  const anchor = new Date();
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
  const now = new Date();
  if (range === "all") return {};
  if (range === "today") {
    const ymd = formatBusinessDayYYYYMMDD(now, tz);
    return { start_date: ymd, end_date: ymd };
  }
  if (range === "week") {
    return {
      start_date: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      end_date: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }
  if (range === "upcoming") {
    return { start_date: formatBusinessDayYYYYMMDD(now, tz) };
  }
  return {
    start_date: format(startOfMonth(now), "yyyy-MM-dd"),
    end_date: format(endOfMonth(now), "yyyy-MM-dd"),
  };
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

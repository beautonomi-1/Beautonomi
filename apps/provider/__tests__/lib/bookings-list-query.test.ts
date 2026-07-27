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
} from "@/lib/bookings-list-query";
import { formatBusinessDayYYYYMMDD, startOfBusinessDayLocalDate } from "@beautonomi/utils";

describe("buildStripDateParams", () => {
  it("returns a 61-day window centered on today in provider timezone", () => {
    const { start_date, end_date } = buildStripDateParams("Africa/Johannesburg");
    expect(start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(start_date <= end_date).toBe(true);
  });

  it("centers the strip window on a custom anchor date", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));
    const anchor = new Date(2026, 0, 15);
    const { start_date, end_date } = buildStripDateParams("Africa/Johannesburg", anchor);
    expect(start_date).toBe("2025-12-16");
    expect(end_date).toBe("2026-02-14");
    jest.useRealTimers();
  });
});

describe("buildStripDays", () => {
  it("returns 61 days centered on the anchor", () => {
    const anchor = new Date(2026, 5, 15);
    const days = buildStripDays(anchor);
    expect(days).toHaveLength(61);
    expect(days[30].getDate()).toBe(15);
  });
});

describe("isDateWithinStripWindow", () => {
  it("returns true for dates inside ±30 days of anchor", () => {
    const anchor = new Date(2026, 5, 15);
    expect(isDateWithinStripWindow(new Date(2026, 5, 1), anchor)).toBe(true);
    expect(isDateWithinStripWindow(new Date(2026, 4, 16), anchor)).toBe(true);
    expect(isDateWithinStripWindow(new Date(2026, 6, 15), anchor)).toBe(true);
  });

  it("returns false for dates outside ±30 days of anchor", () => {
    const anchor = new Date(2026, 5, 15);
    expect(isDateWithinStripWindow(new Date(2026, 3, 1), anchor)).toBe(false);
    expect(isDateWithinStripWindow(new Date(2026, 8, 1), anchor)).toBe(false);
  });
});

describe("mergeAtHomeBookings", () => {
  it("dedupes by id", () => {
    const merged = mergeAtHomeBookings(
      [{ id: "a" }, { id: "b" }],
      [{ id: "b" }, { id: "c" }],
    );
    expect(merged.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
});

describe("buildOverviewDateParams", () => {
  const tz = "Africa/Johannesburg";

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-10T23:30:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns today bounds for today range in provider timezone", () => {
    const params = buildOverviewDateParams("today", tz);
    expect(params.start_date).toBe("2026-06-11");
    expect(params.start_date).toBe(params.end_date);
  });

  it("anchors week and month ranges to the provider business day", () => {
    const week = buildOverviewDateParams("week", tz);
    expect(week.start_date).toBe("2026-06-08");
    expect(week.end_date).toBe("2026-06-14");

    const month = buildOverviewDateParams("month", tz);
    expect(month.start_date).toBe("2026-06-01");
    expect(month.end_date).toBe("2026-06-30");
  });

  it("§stale-pending: 'all' range has no date bounds so stale pending requests stay reachable", () => {
    // The needs-attention banner and the tappable Overview Pending card both
    // deep-link to dateRange="all" — this is what guarantees a booking
    // request from any date in the past (however old) still shows up in the
    // Overview list, unlike the ±30-day Day-view date strip.
    const params = buildOverviewDateParams("all", tz);
    expect(params).toEqual({});
    expect(params.start_date).toBeUndefined();
    expect(params.end_date).toBeUndefined();
  });
});

describe("buildOverviewDateRangeLabel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-10T23:30:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("labels month using the provider business day", () => {
    expect(buildOverviewDateRangeLabel("month", "Africa/Johannesburg")).toBe("June 2026");
  });
});

describe("appendBookingsQueryParts", () => {
  it("strip URL excludes status and search filters", () => {
    const strip = buildStripDateParams("Africa/Johannesburg");
    const url = appendBookingsQueryParts(new URLSearchParams(), {
      ...strip,
      sort: "scheduled_at",
      order: "asc",
      location_id: "loc-1",
    });
    expect(url).toContain("start_date=");
    expect(url).toContain("end_date=");
    expect(url).not.toContain("status=");
    expect(url).not.toContain("search=");
  });

  it("overview URL includes status and search when provided", () => {
    const overview = buildOverviewDateParams("today", "Africa/Johannesburg");
    const url = appendBookingsQueryParts(new URLSearchParams(), {
      ...overview,
      status: "pending",
      search: "jane",
      sort: "scheduled_at",
      order: "asc",
    });
    expect(url).toContain("status=pending");
    expect(url).toContain("search=jane");
  });

  it("§stale-pending: the pending/all-dates deep-link URL filters by status without date bounds, sorted oldest-first", () => {
    const overview = buildOverviewDateParams("all", "Africa/Johannesburg");
    const url = appendBookingsQueryParts(new URLSearchParams(), {
      ...overview,
      status: BOOKINGS_TO_REVIEW_STATUS,
      sort: "scheduled_at",
      order: "asc",
    });
    expect(url).toContain(`status=${encodeURIComponent(BOOKINGS_TO_REVIEW_STATUS)}`);
    expect(url).toContain("order=asc");
    expect(url).not.toContain("start_date=");
    expect(url).not.toContain("end_date=");
  });
});

describe("buildDateStripInfo — regression matrix", () => {
  const tz = "Africa/Johannesburg";

  it("R1/R9: counts every day including single booking and selected-day visibility", () => {
    const bookings = [
      { id: "1", scheduled_at: "2026-06-01T10:00:00.000Z", status: "confirmed" },
      { id: "2", scheduled_at: "2026-06-02T09:00:00.000Z", status: "confirmed" },
      { id: "3", scheduled_at: "2026-06-03T08:00:00.000Z", status: "confirmed" },
    ];
    const map = buildDateStripInfo(bookings, [], [], tz);
    expect(map.get("2026-06-01")?.bookings).toBe(1);
    expect(map.get("2026-06-02")?.bookings).toBe(1);
    expect(map.get("2026-06-03")?.bookings).toBe(1);
  });

  it("R2: pending customer booking sets hasPending amber flag", () => {
    const map = buildDateStripInfo(
      [{ id: "p", scheduled_at: "2026-06-10T10:00:00.000Z", status: "pending" }],
      [],
      [],
      tz,
    );
    expect(map.get("2026-06-10")).toEqual({
      bookings: 1,
      hasPending: true,
      blocks: 0,
      isClosed: false,
    });
  });

  it("R3: waiting and checked_in queue statuses count and flag pending", () => {
    const map = buildDateStripInfo(
      [
        { id: "w", scheduled_at: "2026-06-11T10:00:00.000Z", db_status: "waiting" },
        { id: "c", scheduled_at: "2026-06-11T11:00:00.000Z", db_status: "checked_in" },
      ],
      [],
      [],
      tz,
    );
    expect(map.get("2026-06-11")).toEqual({
      bookings: 2,
      hasPending: true,
      blocks: 0,
      isClosed: false,
    });
  });

  it("R4/R5: strip map is independent of overview-style subset (full dataset passed in)", () => {
    const fullStripBookings = [
      { id: "a", scheduled_at: "2026-06-01T10:00:00.000Z", status: "confirmed" },
      { id: "b", scheduled_at: "2026-06-15T10:00:00.000Z", status: "pending" },
      { id: "c", scheduled_at: "2026-06-20T10:00:00.000Z", status: "confirmed" },
    ];
    const overviewTodayOnly = fullStripBookings.filter((b) => b.id === "a");
    const stripMap = buildDateStripInfo(fullStripBookings, [], [], tz);
    const overviewMap = buildDateStripInfo(overviewTodayOnly, [], [], tz);
    expect(stripMap.get("2026-06-15")?.bookings).toBe(1);
    expect(overviewMap.get("2026-06-15")).toBeUndefined();
  });

  it("R7: variant tier uses earliest booking_services.scheduled_start_at for day key", () => {
    const bookings = [
      {
        id: "v",
        scheduled_at: "2026-06-01T10:00:00.000Z",
        services: [{ scheduled_start_at: "2026-06-25T09:00:00.000Z" }],
        status: "confirmed",
      },
    ];
    const map = buildDateStripInfo(bookings, [], [], tz);
    expect(map.get("2026-06-25")?.bookings).toBe(1);
    expect(map.get("2026-06-01")).toBeUndefined();
  });

  it("R10: provider walk-in and customer online share strip behaviour", () => {
    const bookings = [
      { id: "walk", scheduled_at: "2026-06-05T10:00:00.000Z", status: "confirmed", booking_source: "walk_in" },
      { id: "online", scheduled_at: "2026-06-05T14:00:00.000Z", status: "confirmed", booking_source: "online" },
    ];
    const map = buildDateStripInfo(bookings, [], [], tz);
    expect(map.get("2026-06-05")?.bookings).toBe(2);
  });

  it("excludes cancelled and no_show from strip counts", () => {
    const map = buildDateStripInfo(
      [
        { id: "x", scheduled_at: "2026-06-08T10:00:00.000Z", status: "cancelled" },
        { id: "y", scheduled_at: "2026-06-08T11:00:00.000Z", status: "no_show" },
        { id: "z", scheduled_at: "2026-06-08T12:00:00.000Z", status: "confirmed" },
      ],
      [],
      [],
      tz,
    );
    expect(map.get("2026-06-08")?.bookings).toBe(1);
  });
});

describe("filterBookingsForDayKey", () => {
  const tz = "Africa/Johannesburg";

  it("R6: returns all bookings on tapped date", () => {
    const rows = [
      { id: "1", scheduled_at: "2026-06-05T08:00:00.000Z", status: "confirmed" },
      { id: "2", scheduled_at: "2026-06-05T12:00:00.000Z", status: "pending" },
      { id: "3", scheduled_at: "2026-06-06T08:00:00.000Z", status: "confirmed" },
    ];
    const day = filterBookingsForDayKey(rows, "2026-06-05", tz);
    expect(day.map((b) => b.id)).toEqual(["1", "2"]);
  });

  it("uses the same day key for bookings and time blocks on the selected business day", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-11T08:00:00.000Z"));
    const selectedDate = startOfBusinessDayLocalDate(tz);
    const selectedDateKey = formatBusinessDayYYYYMMDD(selectedDate, tz);
    const bookings = filterBookingsForDayKey(
      [{ id: "b1", scheduled_at: "2026-06-11T08:00:00.000Z", status: "confirmed" }],
      selectedDateKey,
      tz,
    );
    const blocks = [{ date: selectedDateKey, is_active: true }];
    expect(bookings).toHaveLength(1);
    expect(blocks.every((b) => b.date === selectedDateKey)).toBe(true);
    jest.useRealTimers();
  });
});

describe("Overview metrics tile mappings", () => {
  it("maps stats range to list date range", () => {
    expect(statsRangeToDateRange("today")).toBe("today");
    expect(statsRangeToDateRange("week")).toBe("week");
    expect(statsRangeToDateRange("month")).toBe("month");
    expect(statsRangeToDateRange("all")).toBe("all");
  });

  it("maps metric tiles to status filters", () => {
    expect(statusFilterForStatsTile("pending")).toBe(BOOKINGS_TO_REVIEW_STATUS);
    expect(statusFilterForStatsTile("confirmed")).toBe("confirmed");
    expect(statusFilterForStatsTile("active")).toBe("in_progress");
    expect(statusFilterForStatsTile("completed")).toBe("completed");
    expect(statusFilterForStatsTile("appointments")).toBe("");
  });

  it("builds a reconciliation line that explains excluded cancelled/no-show rows", () => {
    expect(
      buildStatsReconciliationLine({
        pending_count: 2,
        confirmed_count: 1,
        in_progress_count: 0,
        completed_count: 8,
        cancelled_count: 1,
        no_show_count: 0,
      }),
    ).toBe("2 pending · 1 confirmed · 0 active · 8 completed · excludes 1 cancelled/no-show");
  });
});

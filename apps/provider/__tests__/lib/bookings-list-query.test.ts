import {
  appendBookingsQueryParts,
  buildDateStripInfo,
  buildOverviewDateParams,
  buildStripDateParams,
  filterBookingsForDayKey,
  mergeAtHomeBookings,
} from "@/lib/bookings-list-query";

describe("buildStripDateParams", () => {
  it("returns a 61-day window centered on today in provider timezone", () => {
    const { start_date, end_date } = buildStripDateParams("Africa/Johannesburg");
    expect(start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(start_date <= end_date).toBe(true);
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
  it("returns today bounds for today range", () => {
    const params = buildOverviewDateParams("today", "Africa/Johannesburg");
    expect(params.start_date).toBeDefined();
    expect(params.start_date).toBe(params.end_date);
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
});

import {
  newBookingScreenHrefFromCalendarDay,
  nextQuarterHourFrom,
} from "@/lib/new-booking-nav-defaults";

function queryFromHref(href: string): URLSearchParams {
  const [, query = ""] = href.split("?");
  return new URLSearchParams(query);
}

describe("new booking navigation defaults", () => {
  it("preserves staff and location context from the calendar", () => {
    const href = newBookingScreenHrefFromCalendarDay(
      new Date("2026-04-30T10:00:00.000Z"),
      {
        staffId: "staff-123",
        locationId: "loc-456",
        status: "confirmed",
        timeZone: "UTC",
      },
      new Date("2026-04-30T09:02:00.000Z"),
    );

    const params = queryFromHref(href);
    expect(params.get("staff_id")).toBe("staff-123");
    expect(params.get("location_id")).toBe("loc-456");
    expect(params.get("status")).toBe("confirmed");
    expect(params.get("date")).toBe("2026-04-30");
    expect(params.get("time")).toBe("09:15");
  });

  it("rounds near midnight without producing an invalid 24:00 time", () => {
    expect(nextQuarterHourFrom(new Date("2026-04-30T23:59:00.000Z"), "UTC")).toEqual({
      dateYmd: "2026-05-01",
      timeHm: "00:00",
    });
  });

  it("uses provider timezone when deciding whether the calendar day is today", () => {
    const href = newBookingScreenHrefFromCalendarDay(
      new Date("2026-04-30T00:30:00.000Z"),
      { timeZone: "Africa/Johannesburg" },
      new Date("2026-04-29T22:10:00.000Z"),
    );

    const params = queryFromHref(href);
    expect(params.get("date")).toBe("2026-04-30");
    expect(params.get("time")).toBe("00:15");
  });
});

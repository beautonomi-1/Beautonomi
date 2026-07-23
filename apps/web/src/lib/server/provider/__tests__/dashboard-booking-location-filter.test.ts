import { describe, expect, it } from "vitest";
import {
  bookingMatchesDashboardLocation,
  dashboardBookingLocationOrFilter,
  dashboardGroupBookingLocationOrFilter,
} from "../dashboard-booking-location-filter";

describe("bookingMatchesDashboardLocation", () => {
  const branch = "loc-1";

  it("includes bookings at the selected branch", () => {
    expect(bookingMatchesDashboardLocation(branch, { location_id: branch })).toBe(true);
  });

  it("includes at-home bookings without a branch", () => {
    expect(
      bookingMatchesDashboardLocation(branch, {
        location_id: null,
        location_type: "at_home",
      }),
    ).toBe(true);
  });

  it("includes walk-in bookings without a branch", () => {
    expect(
      bookingMatchesDashboardLocation(branch, {
        location_id: null,
        booking_source: "walk_in",
      }),
    ).toBe(true);
  });

  it("excludes other-branch salon bookings", () => {
    expect(bookingMatchesDashboardLocation(branch, { location_id: "loc-2" })).toBe(false);
  });

  it("passes through when no branch filter is active", () => {
    expect(bookingMatchesDashboardLocation(null, { location_id: "loc-2" })).toBe(true);
  });
});

describe("dashboard location OR filters", () => {
  it("bookings filter includes walk_in branch (booking_source)", () => {
    const filter = dashboardBookingLocationOrFilter("loc-1");
    expect(filter).toContain("location_id.eq.loc-1");
    expect(filter).toContain("booking_source.eq.walk_in");
  });

  it("group_bookings filter omits booking_source (column does not exist)", () => {
    const filter = dashboardGroupBookingLocationOrFilter("loc-1");
    expect(filter).toContain("location_id.eq.loc-1");
    expect(filter).toContain("location_type.eq.at_home");
    expect(filter).not.toContain("booking_source");
  });
});

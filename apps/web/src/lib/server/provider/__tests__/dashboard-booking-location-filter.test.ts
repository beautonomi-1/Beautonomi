import { describe, expect, it } from "vitest";
import { bookingMatchesDashboardLocation } from "../dashboard-booking-location-filter";

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

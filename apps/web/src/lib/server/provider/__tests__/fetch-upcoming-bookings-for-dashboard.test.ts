import { describe, expect, it } from "vitest";
import { mapStatusToProvider } from "@/lib/utils/booking-status";
import { dashboardBookingLocationOrFilter } from "../dashboard-booking-location-filter";
import { UPCOMING_BOOKING_DB_STATUSES } from "../fetch-upcoming-bookings-for-dashboard";

describe("fetch-upcoming-bookings-for-dashboard", () => {
  it("maps confirmed DB status to booked without excluding from provider display filter", () => {
    expect(mapStatusToProvider("confirmed")).toBe("booked");
    expect(UPCOMING_BOOKING_DB_STATUSES).toContain("confirmed");
    expect(UPCOMING_BOOKING_DB_STATUSES).toContain("in_progress");
    expect(UPCOMING_BOOKING_DB_STATUSES).toContain("pending_payment");
  });

  it("includes in_progress so started appointments are not dropped at SQL layer", () => {
    expect(UPCOMING_BOOKING_DB_STATUSES).toContain("in_progress");
    expect(mapStatusToProvider("in_progress")).toBe("started");
  });

  it("location filter keeps at-home and walk-in without branch", () => {
    const clause = dashboardBookingLocationOrFilter("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(clause).toContain("location_type.eq.at_home");
    expect(clause).toContain("booking_source.eq.walk_in");
  });
});

import { describe, expect, it } from "vitest";
import { dashboardBookingLocationOrFilter } from "../dashboard-booking-location-filter";

describe("dashboardBookingLocationOrFilter", () => {
  it("includes branch, at-home without branch, and walk-in without branch", () => {
    const loc = "11111111-1111-4111-8111-111111111111";
    const clause = dashboardBookingLocationOrFilter(loc);
    expect(clause).toContain(`location_id.eq.${loc}`);
    expect(clause).toContain("location_type.eq.at_home");
    expect(clause).toContain("booking_source.eq.walk_in");
  });
});

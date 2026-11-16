import { describe, expect, it } from "vitest";
import { missingBookingStatusTimestamp } from "@/lib/bookings/booking-status-timestamps";

describe("missingBookingStatusTimestamp", () => {
  it("stamps completed_at for any location type, including null and mobile", () => {
    expect(missingBookingStatusTimestamp("completed", {}, "2026-11-16T08:26:12.000Z")).toEqual({
      completed_at: "2026-11-16T08:26:12.000Z",
    });
  });

  it("does not overwrite an existing completed_at", () => {
    expect(
      missingBookingStatusTimestamp("completed", { completed_at: "2026-01-01T00:00:00.000Z" }, "now"),
    ).toEqual({});
  });

  it("stamps cancelled_at for cancelled and no_show", () => {
    expect(missingBookingStatusTimestamp("cancelled", {}, "now")).toEqual({ cancelled_at: "now" });
    expect(missingBookingStatusTimestamp("no_show", {}, "now")).toEqual({ cancelled_at: "now" });
  });
});

import { describe, expect, it } from "vitest";
import { buildBookingStatusBreakdown } from "../analytics-booking-status-breakdown";
import { ALL_BOOKING_STATUS_VALUES } from "@/lib/utils/booking-status";

describe("buildBookingStatusBreakdown", () => {
  it("counts every enum status and other", () => {
    const rows = [
      { status: "completed" },
      { status: "completed" },
      { status: "pending_payment" },
      { status: "legacy_unknown" },
      { status: null },
    ];
    const b = buildBookingStatusBreakdown(rows);
    expect(b.completed).toBe(2);
    expect(b.pending_payment).toBe(1);
    expect(b.other).toBe(2);
    expect(b.scheduled_total).toBe(5);
    for (const s of ALL_BOOKING_STATUS_VALUES) {
      if (s !== "completed" && s !== "pending_payment") {
        expect(b[s]).toBe(0);
      }
    }
  });

  it("scheduled_total equals sum of buckets", () => {
    const rows = ALL_BOOKING_STATUS_VALUES.map((status) => ({ status }));
    const b = buildBookingStatusBreakdown(rows);
    expect(b.scheduled_total).toBe(ALL_BOOKING_STATUS_VALUES.length);
    expect(b.other).toBe(0);
  });
});

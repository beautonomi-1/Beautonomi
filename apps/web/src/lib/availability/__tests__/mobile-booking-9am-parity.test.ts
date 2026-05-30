import { describe, expect, it } from "vitest";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { segmentFitsAnyShift } from "@/lib/availability/shift-fit";
import type { AvailabilityConstraints, StaffShift } from "@/lib/availability/types";

const DATE = "2026-06-15";
const SHIFT: StaffShift = {
  id: "shift-1",
  staff_id: "staff-1",
  date: DATE,
  start_time: "09:00:00",
  end_time: "17:00:00",
  is_recurring: false,
};

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

describe("mobile parity: 09:00 availability -> hold -> payment guard", () => {
  it("PASS: 09:00 slot remains valid through hold/payment guard", () => {
    const constraints: AvailabilityConstraints & { workHoursEnabled?: boolean } = {
      staffShifts: [SHIFT],
      timeBlocks: [],
      existingBookings: [],
      workHoursEnabled: true,
    };

    const slots = calculateAvailableSlots(constraints, 60, DATE, { slotInterval: 15 });
    const has0900 = slots.some((s) => s.available && s.time === "09:00");
    expect(has0900).toBe(true);

    // Hold + payment validation uses effective segment end (duration + buffer + travel tail).
    // For this parity test, buffer defaults to 0 when unset and travel tail is 0 at salon.
    const segStartMin = minutes("09:00");
    const segEndMin = minutes("10:00");
    expect(segmentFitsAnyShift(segStartMin, segEndMin, [SHIFT])).toBe(true);
  });

  it("FAIL: slot before opening (08:45) is rejected", () => {
    const segStartMin = minutes("08:45");
    const segEndMin = minutes("09:45");
    expect(segmentFitsAnyShift(segStartMin, segEndMin, [SHIFT])).toBe(false);
  });

  it("FAIL: slot starting at close (17:00) is rejected", () => {
    const segStartMin = minutes("17:00");
    const segEndMin = minutes("18:00");
    expect(segmentFitsAnyShift(segStartMin, segEndMin, [SHIFT])).toBe(false);
  });

  it("FAIL: overrun past close is rejected", () => {
    const segStartMin = minutes("16:30");
    const segEndMin = minutes("17:30");
    expect(segmentFitsAnyShift(segStartMin, segEndMin, [SHIFT])).toBe(false);
  });

  it("PASS: multi-service/addon style 120-minute span from 09:00 fits", () => {
    // Models checkout-style chained span (services + addons rolled into total blocked window).
    const segStartMin = minutes("09:00");
    const segEndMin = minutes("11:00");
    expect(segmentFitsAnyShift(segStartMin, segEndMin, [SHIFT])).toBe(true);
  });

  it("FAIL: multi-service/addon style span that overruns close is rejected", () => {
    // Example: selected start is valid by wall clock, but total chain duration pushes past close.
    const segStartMin = minutes("15:30");
    const segEndMin = minutes("17:30");
    expect(segmentFitsAnyShift(segStartMin, segEndMin, [SHIFT])).toBe(false);
  });

  it("holdGridDurationMinutesFromSnapshot matches listing blocked span (no travel)", async () => {
    const { holdGridDurationMinutesFromSnapshot } = await import(
      "@/lib/booking-slot-math/blocked-window-minutes"
    );
    const startAt = new Date(`${DATE}T07:00:00.000Z`);
    const gridDur = holdGridDurationMinutesFromSnapshot({
      startAt,
      snapshotLines: [
        {
          offering_id: "o1",
          scheduled_end_at: new Date(startAt.getTime() + 60 * 60000).toISOString(),
        },
      ],
      bufferMinutesByOfferingId: new Map([["o1", 0]]),
    });
    expect(gridDur).toBe(60);
    const segStartMin = minutes("09:00");
    const segEndMin = segStartMin + gridDur;
    expect(segmentFitsAnyShift(segStartMin, segEndMin, [SHIFT])).toBe(true);
  });
});

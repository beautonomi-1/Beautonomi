import { describe, expect, it } from "vitest";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { holdGridDurationMinutesFromSnapshot } from "@/lib/booking-slot-math/blocked-window-minutes";
import type { AvailabilityConstraints, StaffShift } from "@/lib/availability/types";

const DATE = "2026-06-15";
const SAST = "Africa/Johannesburg";

function tightAtHomeShift(): StaffShift {
  return {
    id: "shift-tight",
    staff_id: "staff-1",
    date: DATE,
    start_time: "09:00:00",
    end_time: "10:30:00",
    is_recurring: false,
  };
}

describe("hold grid parity — no double travel buffer", () => {
  it("listing and hold grid both accept first slot when shift fits service + travel exactly", () => {
    const constraints: AvailabilityConstraints & { workHoursEnabled?: boolean } = {
      staffShifts: [tightAtHomeShift()],
      timeBlocks: [],
      existingBookings: [],
      workHoursEnabled: true,
    };

    const serviceMinutes = 60;
    const travelMinutes = 30;
    const totalBlocked = serviceMinutes; // buffer 0
    const slots = calculateAvailableSlots(constraints, totalBlocked, DATE, {
      slotInterval: 15,
      travelBuffer: travelMinutes,
      timezone: SAST,
    });

    const first = slots.find((s) => s.time === "09:00");
    expect(first?.available).toBe(true);

    const startAt = new Date("2026-06-15T07:00:00.000Z"); // 09:00 SAST
    const endAt = new Date(startAt.getTime() + serviceMinutes * 60000);
    const gridDur = holdGridDurationMinutesFromSnapshot({
      startAt,
      snapshotLines: [
        {
          offering_id: "off-1",
          scheduled_end_at: endAt.toISOString(),
        },
      ],
      bufferMinutesByOfferingId: new Map([["off-1", 0]]),
    });

    expect(gridDur).toBe(serviceMinutes);

    const holdFitEnd = 9 * 60 + gridDur + travelMinutes;
    const shiftEnd = 10 * 60 + 30;
    expect(holdFitEnd).toBeLessThanOrEqual(shiftEnd);
  });

  it("holdGridDurationMinutesFromSnapshot excludes travel (would fail if travel were included)", () => {
    const startAt = new Date("2026-06-15T07:00:00.000Z");
    const endAt = new Date(startAt.getTime() + 60 * 60000);
    const withTravelInSpan = holdGridDurationMinutesFromSnapshot({
      startAt,
      snapshotLines: [{ offering_id: "o1", scheduled_end_at: endAt.toISOString() }],
      bufferMinutesByOfferingId: new Map([["o1", 0]]),
    });
    expect(withTravelInSpan).toBe(60);
    expect(withTravelInSpan).not.toBe(90);
  });
});

describe("hold grid parity — salon first slot", () => {
  it("09:00 first slot with 60 min service and 0 buffer", () => {
    const shift: StaffShift = {
      id: "shift-1",
      staff_id: "staff-1",
      date: DATE,
      start_time: "09:00:00",
      end_time: "17:00:00",
      is_recurring: false,
    };
    const constraints: AvailabilityConstraints & { workHoursEnabled?: boolean } = {
      staffShifts: [shift],
      timeBlocks: [],
      existingBookings: [],
      workHoursEnabled: true,
    };

    const slots = calculateAvailableSlots(constraints, 60, DATE, {
      slotInterval: 15,
      travelBuffer: 0,
      timezone: SAST,
    });
    expect(slots.some((s) => s.available && s.time === "09:00")).toBe(true);

    const startAt = new Date("2026-06-15T07:00:00.000Z");
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
  });
});

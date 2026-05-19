/**
 * §Booking-slot-audit 2026-05: regression tests for early-morning availability
 * (03:00 / 04:00 / 05:00) in the provider's wall-clock timezone.
 *
 * Customers seeing slots like "3am, 4am, 5am" should be able to pick them and
 * have them survive cleanly through hold creation and payment. These tests
 * lock down:
 *
 *  - A salon opening at 05:00 SAST does NOT show 03:00 or 04:00.
 *  - An overnight shift that legitimately spans 03:00-04:00 DOES show those
 *    early slots, with correct UTC instants.
 *  - The recovered HH:MM labels exactly round-trip through
 *    `availabilitySlotsAsTimeSlots` in the same provider TZ — preventing the
 *    "UTC ISO substring" matching bug that previously dropped 03:00/04:00
 *    public slots on legacy `/booking` web.
 */
import { describe, it, expect } from "vitest";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { availabilitySlotsAsTimeSlots } from "@/lib/availability/public-slug-availability-engine";
import type { AvailabilityConstraints } from "@/lib/availability/types";

const SAST = "Africa/Johannesburg"; // UTC+2, no DST.
const DATE = "2026-06-10";

function morningOpenAt5Constraints(): AvailabilityConstraints & { workHoursEnabled?: boolean } {
  return {
    staffShifts: [
      {
        id: "shift-morning",
        staff_id: "staff-a",
        date: DATE,
        start_time: "05:00:00",
        end_time: "12:00:00",
        is_recurring: false,
      },
    ],
    timeBlocks: [],
    existingBookings: [],
    workHoursEnabled: true,
  };
}

function overnightShiftConstraints(): AvailabilityConstraints & { workHoursEnabled?: boolean } {
  return {
    staffShifts: [
      {
        id: "shift-overnight",
        staff_id: "staff-a",
        date: DATE,
        // 18:00 → 06:00 next day. Includes 03:00 / 04:00 / 05:00 wall-clock.
        start_time: "18:00:00",
        end_time: "06:00:00",
        is_recurring: false,
      },
    ],
    timeBlocks: [],
    existingBookings: [],
    workHoursEnabled: true,
  };
}

describe("availability engine — early morning slots (Africa/Johannesburg, UTC+2)", () => {
  describe("salon opens at 05:00 morning shift", () => {
    it("shows 05:00 as available (matches the requested early morning shift)", () => {
      const result = calculateAvailableSlots(
        morningOpenAt5Constraints(),
        60,
        DATE,
        { slotInterval: 60, timezone: SAST }
      );
      const available = result.filter((s) => s.available).map((s) => s.time);
      expect(available).toContain("05:00");
      expect(available).toContain("06:00");
    });

    it("does NOT show 03:00 or 04:00 when the salon opens at 05:00", () => {
      const result = calculateAvailableSlots(
        morningOpenAt5Constraints(),
        60,
        DATE,
        { slotInterval: 60, timezone: SAST }
      );
      const available = result.filter((s) => s.available).map((s) => s.time);
      expect(available).not.toContain("03:00");
      expect(available).not.toContain("04:00");
    });
  });

  describe("overnight shift 18:00 → 06:00 includes early-morning slots", () => {
    it("allows 03:00, 04:00, and 05:00 wall-clock slots", () => {
      const result = calculateAvailableSlots(
        overnightShiftConstraints(),
        60,
        DATE,
        { slotInterval: 60, timezone: SAST }
      );
      const available = result.filter((s) => s.available).map((s) => s.time);
      expect(available).toEqual(expect.arrayContaining(["03:00", "04:00", "05:00"]));
    });
  });
});

describe("availabilitySlotsAsTimeSlots — early morning round-trip parity", () => {
  it("recovers 03:00 SAST label from the 01:00Z ISO instant", () => {
    const slots = [
      // 03:00 SAST == 01:00Z, 04:00 SAST == 02:00Z, 05:00 SAST == 03:00Z.
      { start: "2026-06-11T01:00:00.000Z", end: "2026-06-11T02:00:00.000Z", is_available: true },
      { start: "2026-06-11T02:00:00.000Z", end: "2026-06-11T03:00:00.000Z", is_available: true },
      { start: "2026-06-11T03:00:00.000Z", end: "2026-06-11T04:00:00.000Z", is_available: true },
    ];
    const result = availabilitySlotsAsTimeSlots(slots, SAST);
    expect(result.map((s) => s.time)).toEqual(["03:00", "04:00", "05:00"]);
    expect(result.every((s) => s.available)).toBe(true);
  });

  it("legacy (no TZ) substring path returns the WRONG label for non-UTC zones — documenting the bug", () => {
    // This documents why public_slots matching must NOT use the raw UTC
    // substring: the legacy fallback gives "01:00" instead of provider-local
    // "03:00" for SAST early-morning slots.
    const slots = [
      { start: "2026-06-11T01:00:00.000Z", end: "2026-06-11T02:00:00.000Z", is_available: true },
    ];
    const noTzResult = availabilitySlotsAsTimeSlots(slots);
    expect(noTzResult[0].time).toBe("01:00"); // BUG: not the provider wall clock.

    const tzResult = availabilitySlotsAsTimeSlots(slots, SAST);
    expect(tzResult[0].time).toBe("03:00"); // FIX: correct provider wall clock.
  });
});

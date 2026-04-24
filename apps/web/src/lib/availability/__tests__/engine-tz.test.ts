/**
 * §Release-audit 2026-04: engine TZ round-trip tests.
 *
 * These cover the two functions that caused the "invalid time / slot taken"
 * regression when the web server ran in a non-UTC zone:
 *   - `calculateAvailableSlots` with `timezone` option produces correct UTC
 *     instants for the provider's wall clock.
 *   - `availabilitySlotsAsTimeSlots` with the same zone recovers the
 *     provider-wall-clock `HH:MM` label from the UTC start instant.
 *
 * The default-zone legacy behaviour is also asserted so pre-release drafts
 * (no providerTimeZone) keep the same output they had before.
 */
import { describe, it, expect } from "vitest";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { availabilitySlotsAsTimeSlots } from "@/lib/availability/public-slug-availability-engine";
import type { AvailabilityConstraints } from "@/lib/availability/types";

const TEST_DATE = "2026-06-10"; // SAST is UTC+2 on this date (no DST).
const DURATION = 60;

function makeConstraints(): AvailabilityConstraints & { workHoursEnabled?: boolean } {
  return {
    staffShifts: [
      {
        id: "shift-a",
        staff_id: "staff-a",
        date: TEST_DATE,
        start_time: "09:00:00",
        end_time: "11:00:00",
        is_recurring: false,
      },
    ],
    timeBlocks: [],
    existingBookings: [],
    workHoursEnabled: true,
  };
}

describe("calculateAvailableSlots — timezone option (Africa/Johannesburg, UTC+2)", () => {
  it("emits HH:MM labels in the provider's wall clock (unchanged under TZ)", () => {
    const result = calculateAvailableSlots(
      makeConstraints(),
      DURATION,
      TEST_DATE,
      { slotInterval: 60, timezone: "Africa/Johannesburg" }
    );
    const labels = result.map((s) => s.time);
    expect(labels).toContain("09:00");
    expect(labels).toContain("10:00");
    // The engine only emits slots that still fit the shift, so 11:00 would not
    // fit a 60min duration ending at 11:00 — just 09:00 and 10:00.
    expect(labels).not.toContain("11:00");
  });

  it("legacy (no timezone) still emits HH:MM labels identically", () => {
    const result = calculateAvailableSlots(
      makeConstraints(),
      DURATION,
      TEST_DATE,
      { slotInterval: 60 }
    );
    const labels = result.map((s) => s.time);
    expect(labels).toContain("09:00");
    expect(labels).toContain("10:00");
  });

  it("uses provider-local booking times for gap avoidance adjacency", () => {
    const constraints = makeConstraints();
    constraints.staffShifts[0].end_time = "12:00:00";
    constraints.existingBookings = [
      {
        id: "booking-service-a",
        booking_id: "booking-a",
        offering_id: "offering-a",
        staff_id: "staff-a",
        // 09:00-10:00 in Africa/Johannesburg.
        scheduled_start_at: "2026-06-10T07:00:00.000Z",
        scheduled_end_at: "2026-06-10T08:00:00.000Z",
        duration_minutes: 60,
        buffer_minutes: 0,
        processing_minutes: 0,
        finishing_minutes: 0,
      },
    ];

    const result = calculateAvailableSlots(constraints, DURATION, TEST_DATE, {
      slotInterval: 15,
      avoidGaps: true,
      timezone: "Africa/Johannesburg",
    });

    expect(result.map((s) => s.time)).toContain("10:00");
  });
});

describe("availabilitySlotsAsTimeSlots — TZ-aware label extraction", () => {
  const SAST = "Africa/Johannesburg"; // UTC+2 on this date.

  it("recovers the provider-wall-clock HH:MM label from a UTC start instant", () => {
    const slots = [
      // 15:00 wall-clock in SAST == 13:00Z.
      { start: "2026-06-10T13:00:00.000Z", end: "2026-06-10T14:00:00.000Z", is_available: true },
      // 09:00 wall-clock in SAST == 07:00Z.
      { start: "2026-06-10T07:00:00.000Z", end: "2026-06-10T08:00:00.000Z", is_available: false },
    ];
    const result = availabilitySlotsAsTimeSlots(slots, SAST);
    expect(result[0].time).toBe("15:00");
    expect(result[0].available).toBe(true);
    expect(result[1].time).toBe("09:00");
    expect(result[1].available).toBe(false);
  });

  it("legacy (no zone) returns the raw UTC HH:MM via substring", () => {
    const slots = [
      { start: "2026-06-10T13:00:00.000Z", end: "2026-06-10T14:00:00.000Z", is_available: true },
    ];
    const result = availabilitySlotsAsTimeSlots(slots);
    expect(result[0].time).toBe("13:00");
  });

  it("invalid zone falls back to substring method (no throw)", () => {
    const slots = [
      { start: "2026-06-10T13:00:00.000Z", end: "2026-06-10T14:00:00.000Z", is_available: true },
    ];
    const result = availabilitySlotsAsTimeSlots(slots, "Mars/Olympus_Mons");
    expect(result[0].time).toBe("13:00");
  });
});

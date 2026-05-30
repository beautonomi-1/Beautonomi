import { describe, it, expect } from "vitest";
import {
  bookingScheduleYmd,
  effectiveScheduleAt,
  isPendingOrQueueBooking,
  isTerminalScheduleBooking,
} from "./scheduleDisplay";

describe("effectiveScheduleAt", () => {
  it("uses earliest booking_services.scheduled_start_at", () => {
    const at = effectiveScheduleAt({
      scheduled_at: "2026-06-01T10:00:00.000Z",
      services: [
        { scheduled_start_at: "2026-06-02T09:00:00.000Z" },
        { scheduled_start_at: "2026-06-01T14:00:00.000Z" },
      ],
    });
    expect(at?.toISOString()).toBe("2026-06-01T14:00:00.000Z");
  });

  it("falls back to bookings.scheduled_at", () => {
    const at = effectiveScheduleAt({ scheduled_at: "2026-06-05T08:00:00.000Z", services: [] });
    expect(at?.toISOString()).toBe("2026-06-05T08:00:00.000Z");
  });
});

describe("bookingScheduleYmd", () => {
  it("formats in provider timezone", () => {
    const ymd = bookingScheduleYmd(
      { scheduled_at: "2026-05-30T22:30:00.000Z" },
      "Africa/Johannesburg",
    );
    expect(ymd).toBe("2026-05-31");
  });
});

describe("status helpers", () => {
  it("detects pending queue statuses", () => {
    expect(isPendingOrQueueBooking({ status: "pending" })).toBe(true);
    expect(isPendingOrQueueBooking({ db_status: "waiting" })).toBe(true);
    expect(isPendingOrQueueBooking({ status: "confirmed" })).toBe(false);
  });

  it("detects terminal schedule statuses", () => {
    expect(isTerminalScheduleBooking({ status: "cancelled" })).toBe(true);
    expect(isTerminalScheduleBooking({ status: "confirmed" })).toBe(false);
  });
});

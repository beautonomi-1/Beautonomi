import { describe, expect, it } from "vitest";
import {
  formatBookingDate,
  formatBookingTime,
  formatBookingDateTime,
} from "@/lib/notifications/notification-service";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";

/**
 * §Timezone-parity regression: a 05:00 Africa/Johannesburg (UTC+2) booking is
 * stored as 03:00 UTC. The receipt/invoice render it in the provider/business
 * timezone (falling back to DEFAULT_BOOKING_DISPLAY_TIMEZONE when the provider
 * row has no timezone). Notifications must render the SAME local wall clock —
 * not the raw UTC instant — so the customer sees 05:00, not 03:00.
 */
describe("notification booking-time timezone parity", () => {
  // 05:00 in Africa/Johannesburg (UTC+2) == 03:00 UTC.
  const scheduledAtUtc = "2026-06-05T03:00:00.000Z";

  it("renders the provider-local time when an explicit non-UTC zone is given", () => {
    expect(formatBookingTime(scheduledAtUtc, "Africa/Johannesburg")).toBe("05:00");
    expect(formatBookingDate(scheduledAtUtc, "Africa/Johannesburg")).toBe("2026-06-05");
    expect(formatBookingDateTime(scheduledAtUtc, "Africa/Johannesburg")).toBe(
      "2026-06-05 05:00",
    );
  });

  it("falls back to the platform default zone (not UTC) when timezone is missing", () => {
    // This is the reported bug: a NULL/blank provider timezone must NOT render
    // the raw UTC time (03:00) — it must match the receipt fallback (05:00).
    expect(DEFAULT_BOOKING_DISPLAY_TIMEZONE).toBe("Africa/Johannesburg");
    expect(formatBookingTime(scheduledAtUtc, null)).toBe("05:00");
    expect(formatBookingTime(scheduledAtUtc, undefined)).toBe("05:00");
    expect(formatBookingTime(scheduledAtUtc, "")).toBe("05:00");
    expect(formatBookingDate(scheduledAtUtc, null)).toBe("2026-06-05");
  });

  it("respects other IANA zones for non-SA providers", () => {
    // New York is UTC-4 in June (DST) → 03:00 UTC == 23:00 previous day.
    expect(formatBookingTime(scheduledAtUtc, "America/New_York")).toBe("23:00");
    expect(formatBookingDate(scheduledAtUtc, "America/New_York")).toBe("2026-06-04");
  });

  it("normalizes legacy offset-style timezones instead of falling back to UTC", () => {
    // Legacy rows can carry "GMT+2"; it must still resolve to the +2 wall clock.
    expect(formatBookingTime(scheduledAtUtc, "GMT+2")).toBe("05:00");
  });
});

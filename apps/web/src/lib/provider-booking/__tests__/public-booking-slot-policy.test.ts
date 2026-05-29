/**
 * Public booking slot policy constants — provider-portal parity for customers.
 */
import { describe, it, expect } from "vitest";
import {
  PUBLIC_BOOKING_MAX_ADVANCE_DAYS,
  PUBLIC_BOOKING_MIN_NOTICE_MINUTES,
} from "@/lib/provider-booking/public-booking-slot-policy";

describe("public-booking-slot-policy", () => {
  it("uses min-notice=0 (same as provider portal commit)", () => {
    expect(PUBLIC_BOOKING_MIN_NOTICE_MINUTES).toBe(0);
  });

  it("uses max-advance=365 (same as provider available-slots default)", () => {
    expect(PUBLIC_BOOKING_MAX_ADVANCE_DAYS).toBe(365);
  });
});

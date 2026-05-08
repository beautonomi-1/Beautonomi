import { contextualActionsFromBooking, bookingActionTargets } from "@/features/calendar/policies/actionAvailability.policy";
import type { Booking } from "@/components/calendar/calendar-booking-types";

const baseBooking = {
  id: "bk1",
  status: "booked",
  db_status: "confirmed",
  location_type: "salon",
  location_id: "loc1",
  arrival_otp_verified: false,
  qr_code_verified: false,
  arrival_otp_pending: false,
  qr_arrival_pending: false,
  current_stage: null,
} as unknown as Booking;

describe("contextualActionsFromBooking", () => {
  it("returns actions for a confirmed booking", () => {
    const actions = contextualActionsFromBooking(baseBooking);
    expect(actions.length).toBeGreaterThan(0);
  });

  it("marks cancel action as destructive", () => {
    const actions = contextualActionsFromBooking(baseBooking);
    const cancel = actions.find((a) => a.dbTarget === "cancelled");
    if (cancel) {
      expect(cancel.destructive).toBe(true);
    }
  });

  it("blocks in_progress when at_home OTP pending", () => {
    const booking = {
      ...baseBooking,
      db_status: "confirmed",
      location_type: "at_home",
      arrival_otp_pending: true,
    } as unknown as Booking;
    const targets = bookingActionTargets(booking);
    expect(targets).not.toContain("in_progress");
  });

  it("returns no actions for cancelled booking", () => {
    const booking = { ...baseBooking, db_status: "cancelled", status: "cancelled" } as unknown as Booking;
    const actions = contextualActionsFromBooking(booking);
    expect(actions).toHaveLength(0);
  });
});

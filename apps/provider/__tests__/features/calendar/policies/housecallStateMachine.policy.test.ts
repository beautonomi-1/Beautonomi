import { getHousecallNextAction, getHousecallStage } from "@/features/calendar/policies/housecallStateMachine.policy";
import type { Booking } from "@/components/calendar/calendar-booking-types";

const baseBooking = {
  id: "bk1",
  status: "booked",
  db_status: "confirmed",
  location_type: "at_home",
  arrival_otp_verified: false,
  qr_code_verified: false,
  arrival_otp_pending: false,
  qr_arrival_pending: false,
  current_stage: null,
} as unknown as Booking;

describe("getHousecallStage", () => {
  it("returns needs_verification when arrival OTP pending", () => {
    const b = { ...baseBooking, arrival_otp_pending: true } as unknown as Booking;
    expect(getHousecallStage(b)).toBe("needs_verification");
  });

  it("returns ready_for_service when verified", () => {
    const b = {
      ...baseBooking,
      arrival_otp_verified: true,
      current_stage: "provider_arrived",
    } as unknown as Booking;
    expect(getHousecallStage(b)).toBe("ready_for_service");
  });

  it("returns not_mobile for salon bookings", () => {
    const b = { ...baseBooking, location_type: "salon", location_id: "loc1" } as unknown as Booking;
    expect(getHousecallStage(b)).toBe("not_mobile");
  });
});

describe("getHousecallNextAction", () => {
  it("returns verify label when verification required", () => {
    const b = { ...baseBooking, arrival_otp_pending: true } as unknown as Booking;
    expect(getHousecallNextAction(b).labelKey).toBe("verify");
    expect(getHousecallNextAction(b).blockedReason).toBeTruthy();
  });

  it("returns none for non-mobile bookings", () => {
    const b = { ...baseBooking, location_type: "salon", location_id: "loc1" } as unknown as Booking;
    expect(getHousecallNextAction(b).labelKey).toBe("none");
  });
});

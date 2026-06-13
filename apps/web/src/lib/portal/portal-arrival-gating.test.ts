import { describe, expect, it } from "vitest";

/** Mirrors GET /api/portal/booking and /api/me/bookings arrival field gates. */
function shouldExposeArrivalOtp(booking: {
  location_type?: string;
  current_stage?: string | null;
  arrival_otp_verified?: boolean;
  arrival_otp?: string | null;
}): boolean {
  return (
    booking.location_type === "at_home" &&
    booking.current_stage === "provider_arrived" &&
    !booking.arrival_otp_verified &&
    booking.arrival_otp != null
  );
}

describe("portal arrival OTP gating", () => {
  it("exposes OTP only when provider arrived and not verified", () => {
    expect(
      shouldExposeArrivalOtp({
        location_type: "at_home",
        current_stage: "provider_arrived",
        arrival_otp_verified: false,
        arrival_otp: "1234",
      }),
    ).toBe(true);

    expect(
      shouldExposeArrivalOtp({
        location_type: "at_home",
        current_stage: "provider_on_way",
        arrival_otp_verified: false,
        arrival_otp: "1234",
      }),
    ).toBe(false);

    expect(
      shouldExposeArrivalOtp({
        location_type: "at_salon",
        current_stage: "provider_arrived",
        arrival_otp_verified: false,
        arrival_otp: "1234",
      }),
    ).toBe(false);

    expect(
      shouldExposeArrivalOtp({
        location_type: "at_home",
        current_stage: "provider_arrived",
        arrival_otp_verified: true,
        arrival_otp: "1234",
      }),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isValidProviderBookingStatusTransition, PROVIDER_BOOKING_STATUS_TRANSITIONS } from "../booking-status-transitions";

describe("PROVIDER_BOOKING_STATUS_TRANSITIONS", () => {
  it("allows confirmed -> checked_in and pending -> checked_in for salon check-in", () => {
    expect(isValidProviderBookingStatusTransition("confirmed", "checked_in")).toBe(true);
    expect(isValidProviderBookingStatusTransition("pending", "checked_in")).toBe(true);
    expect(isValidProviderBookingStatusTransition("checked_in", "in_progress")).toBe(true);
  });

  it("snapshot: confirmed still allows in_progress and no_show", () => {
    expect(PROVIDER_BOOKING_STATUS_TRANSITIONS.confirmed).toEqual(
      expect.arrayContaining(["checked_in", "in_progress", "cancelled", "no_show"]),
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  getProviderBookingStatusTransitionBlockReason,
  isSalonOnlyBookingStatus,
  isValidProviderBookingStatusTransition,
  isValidProviderBookingStatusTransitionWithContext,
  PROVIDER_BOOKING_STATUS_TRANSITIONS,
} from "../booking-status-transitions";

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

  it("explains paid-but-pending-payment blocks without treating payment as lifecycle confirmation", () => {
    expect(isValidProviderBookingStatusTransition("pending_payment", "confirmed")).toBe(false);
    expect(
      getProviderBookingStatusTransitionBlockReason("pending_payment", "confirmed", {
        payment_status: "paid",
      }),
    ).toContain("still recorded as pending payment");
  });
});

describe("isSalonOnlyBookingStatus", () => {
  it("returns true only for salon-physical states", () => {
    expect(isSalonOnlyBookingStatus("checked_in")).toBe(true);
    expect(isSalonOnlyBookingStatus("waiting")).toBe(true);
    expect(isSalonOnlyBookingStatus("confirmed")).toBe(false);
    expect(isSalonOnlyBookingStatus("in_progress")).toBe(false);
    expect(isSalonOnlyBookingStatus("pending")).toBe(false);
    expect(isSalonOnlyBookingStatus(null)).toBe(false);
    expect(isSalonOnlyBookingStatus(undefined)).toBe(false);
  });
});

describe("isValidProviderBookingStatusTransitionWithContext", () => {
  it("blocks at-home bookings from being moved to salon-only checked_in", () => {
    expect(
      isValidProviderBookingStatusTransitionWithContext("confirmed", "checked_in", {
        locationType: "at_home",
      }),
    ).toBe(false);
    expect(
      isValidProviderBookingStatusTransitionWithContext("pending", "checked_in", {
        locationType: "at_home",
      }),
    ).toBe(false);
    expect(
      isValidProviderBookingStatusTransitionWithContext("waiting", "checked_in", {
        locationType: "at_home",
      }),
    ).toBe(false);
  });

  it("blocks at-home bookings from being moved into the waiting queue", () => {
    expect(
      isValidProviderBookingStatusTransitionWithContext("confirmed", "waiting", {
        locationType: "at_home",
      }),
    ).toBe(false);
  });

  it("permits at-salon bookings to use the full salon flow (regression guard)", () => {
    expect(
      isValidProviderBookingStatusTransitionWithContext("confirmed", "checked_in", {
        locationType: "at_salon",
      }),
    ).toBe(true);
    expect(
      isValidProviderBookingStatusTransitionWithContext("checked_in", "in_progress", {
        locationType: "at_salon",
      }),
    ).toBe(true);
  });

  it("permits at-home bookings to skip from confirmed to in_progress (start service)", () => {
    expect(
      isValidProviderBookingStatusTransitionWithContext("confirmed", "in_progress", {
        locationType: "at_home",
      }),
    ).toBe(true);
  });

  it("permits at-home bookings to be cancelled or marked no_show (existing graph)", () => {
    expect(
      isValidProviderBookingStatusTransitionWithContext("confirmed", "cancelled", {
        locationType: "at_home",
      }),
    ).toBe(true);
    expect(
      isValidProviderBookingStatusTransitionWithContext("confirmed", "no_show", {
        locationType: "at_home",
      }),
    ).toBe(true);
  });

  it("opens a recovery edge for legacy at-home bookings stuck in checked_in / waiting", () => {
    expect(
      isValidProviderBookingStatusTransitionWithContext("checked_in", "confirmed", {
        locationType: "at_home",
      }),
    ).toBe(true);
    expect(
      isValidProviderBookingStatusTransitionWithContext("waiting", "confirmed", {
        locationType: "at_home",
      }),
    ).toBe(true);
  });

  it("does NOT open the recovery edge for at-salon bookings (recovery is at-home-specific)", () => {
    expect(
      isValidProviderBookingStatusTransitionWithContext("checked_in", "confirmed", {
        locationType: "at_salon",
      }),
    ).toBe(false);
  });

  it("uses a clear, helpful error message when blocking salon-only target on at-home", () => {
    const reason = getProviderBookingStatusTransitionBlockReason("confirmed", "checked_in", {
      locationType: "at_home",
    });
    expect(reason).toMatch(/salon-only/);
    expect(reason).toMatch(/Start journey/);
    expect(reason).toMatch(/Mark arrived/);
  });

  it("falls back to the same legality as the base check when location is unknown", () => {
    expect(isValidProviderBookingStatusTransitionWithContext("confirmed", "checked_in", {})).toBe(true);
    expect(isValidProviderBookingStatusTransitionWithContext("checked_in", "confirmed", {})).toBe(false);
  });
});

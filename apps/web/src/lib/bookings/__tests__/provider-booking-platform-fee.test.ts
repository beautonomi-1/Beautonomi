import { describe, expect, it } from "vitest";
import {
  bookingTotalAfterRemovingPlatformFee,
  canClearUncollectedPlatformFee,
  isProviderPortalBookingSource,
  storedPlatformFeeAmount,
} from "../provider-booking-platform-fee";

describe("provider-booking-platform-fee", () => {
  it("treats provider and walk_in as portal sources", () => {
    expect(isProviderPortalBookingSource("provider")).toBe(true);
    expect(isProviderPortalBookingSource("walk_in")).toBe(true);
    expect(isProviderPortalBookingSource("online")).toBe(false);
  });

  it("reads stored fee from either column", () => {
    expect(storedPlatformFeeAmount({ platform_fee_amount: 5, service_fee_amount: 10 })).toBe(5);
    expect(storedPlatformFeeAmount({ platform_fee_amount: 0, service_fee_amount: 10 })).toBe(10);
  });

  it("subtracts fee from total when clearing", () => {
    expect(bookingTotalAfterRemovingPlatformFee(120, 10)).toBe(110);
  });

  it("allows clear only for unpaid provider bookings with no pending gateway", () => {
    const booking = {
      id: "b1",
      booking_source: "provider",
      total_amount: 110,
      total_paid: 0,
      payment_status: "pending",
      platform_fee_amount: 10,
      service_fee_amount: 10,
    };
    expect(
      canClearUncollectedPlatformFee(booking, {
        hasCompletedPayment: false,
        hasPendingPaystackReference: false,
      }),
    ).toBe(true);
    expect(
      canClearUncollectedPlatformFee(booking, {
        hasCompletedPayment: true,
        hasPendingPaystackReference: false,
      }),
    ).toBe(false);
    expect(
      canClearUncollectedPlatformFee(
        { ...booking, booking_source: "online" },
        { hasCompletedPayment: false, hasPendingPaystackReference: false },
      ),
    ).toBe(false);
  });

  it("allows clear when status is partially_paid but nothing collected yet", () => {
    expect(
      canClearUncollectedPlatformFee(
        {
          id: "b1",
          booking_source: "provider",
          total_amount: 110,
          total_paid: 0,
          payment_status: "partially_paid",
          platform_fee_amount: 10,
          service_fee_amount: 10,
        },
        { hasCompletedPayment: false, hasPendingPaystackReference: false },
      ),
    ).toBe(true);
  });
});

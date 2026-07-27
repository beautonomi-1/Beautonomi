import { describe, expect, it } from "vitest";
import {
  bookingLevelItemsAlreadyPosted,
  resolveCommissionBaseForBookingPayment,
  sumPendingBookingLevelCatchUpNet,
  sumPostedPositiveLegs,
} from "../resolve-commission-base-for-booking-payment";

describe("resolveCommissionBaseForBookingPayment", () => {
  const booking = {
    bookingTotal: 277,
    platformFee: 18,
    tip: 10,
    tax: 0,
    travel: 120,
  };

  it("uses proportional math on first payment when no booking-level legs exist", () => {
    const base = resolveCommissionBaseForBookingPayment({
      paymentAmount: 208,
      bookingTotal: 208,
      platformFee: 18,
      tip: 10,
      tax: 0,
      travel: 120,
      bookingLevelItemsAlreadyPosted: false,
    });
    expect(base).toBe(60);
  });

  it("uses full top-up amount after edit when booking-level legs already posted", () => {
    const base = resolveCommissionBaseForBookingPayment({
      paymentAmount: 69,
      ...booking,
      cumulativePaid: 277,
      postedLegsSum: 208,
      bookingLevelItemsAlreadyPosted: true,
    });
    expect(base).toBe(69);
  });

  it("matches deposit+balance proportional share when legs exist from first payment", () => {
    const depositBase = resolveCommissionBaseForBookingPayment({
      paymentAmount: 138.5,
      ...booking,
      bookingLevelItemsAlreadyPosted: false,
    });
    expect(depositBase).toBeCloseTo(64.5, 2);

    const postedAfterDeposit =
      depositBase + booking.platformFee + booking.tip + booking.travel;
    const balanceBase = resolveCommissionBaseForBookingPayment({
      paymentAmount: 138.5,
      ...booking,
      cumulativePaid: 277,
      postedLegsSum: postedAfterDeposit,
      bookingLevelItemsAlreadyPosted: true,
    });
    expect(balanceBase).toBeCloseTo(64.5, 2);
  });

  it("clamps residual at zero when booking edited downward before top-up", () => {
    const base = resolveCommissionBaseForBookingPayment({
      paymentAmount: 50,
      bookingTotal: 200,
      platformFee: 18,
      tip: 10,
      tax: 0,
      travel: 120,
      cumulativePaid: 200,
      postedLegsSum: 220,
      bookingLevelItemsAlreadyPosted: true,
    });
    expect(base).toBe(0);
  });
});

describe("sumPostedPositiveLegs", () => {
  it("sums only allowed positive leg types", () => {
    expect(
      sumPostedPositiveLegs([
        { transaction_type: "provider_earnings", net: 60 },
        { transaction_type: "tip", net: 10 },
        { transaction_type: "travel_fee", net: 120 },
        { transaction_type: "refund", net: -5 },
      ]),
    ).toBe(190);
  });
});

describe("bookingLevelItemsAlreadyPosted", () => {
  it("detects existing booking-level rows", () => {
    expect(
      bookingLevelItemsAlreadyPosted([{ transaction_type: "provider_earnings" }]),
    ).toBe(false);
    expect(
      bookingLevelItemsAlreadyPosted([{ transaction_type: "travel_fee" }]),
    ).toBe(true);
  });
});

describe("sumPendingBookingLevelCatchUpNet", () => {
  it("sums only missing positive booking-level legs (tax net is 0)", () => {
    expect(
      sumPendingBookingLevelCatchUpNet({
        tipAmount: 10,
        travelFee: 120,
        platformFee: 18,
        existingTypes: new Set(["platform_fee"]),
      }),
    ).toBe(130);
  });

  it("prevents residual double-count when catch-up is included in postedLegsSum", () => {
    const catchUp = sumPendingBookingLevelCatchUpNet({
      tipAmount: 10,
      travelFee: 120,
      platformFee: 18,
      existingTypes: new Set(["platform_fee"]),
    });
    const base = resolveCommissionBaseForBookingPayment({
      paymentAmount: 208,
      bookingTotal: 277,
      platformFee: 18,
      tip: 10,
      tax: 0,
      travel: 120,
      cumulativePaid: 277,
      postedLegsSum: 78 + catchUp, // prior PE + fee, plus same-run tip/travel catch-up
      bookingLevelItemsAlreadyPosted: true,
    });
    expect(base).toBe(69);
  });
});

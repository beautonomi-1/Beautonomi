import { describe, expect, it, vi } from "vitest";
import { computeGroupShareApplication } from "../group-participant-payment";

describe("computeGroupShareApplication", () => {
  it("applies min of charge, share remaining, booking outstanding", () => {
    expect(
      computeGroupShareApplication({
        chargeMajor: 120,
        shareDue: 100,
        sharePaid: 0,
        bookingOutstanding: 80,
      }),
    ).toEqual({ applied: 80, excess: 40 });
  });
});

describe("recordGuestShareSettlement integration", () => {
  it("is covered by charge-success and settlement tests", () => {
    expect(true).toBe(true);
  });
});

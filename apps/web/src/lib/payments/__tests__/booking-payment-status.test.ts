import { describe, expect, it } from "vitest";
import { isPaidBookingPaymentStatus } from "../booking-payment-status";

describe("isPaidBookingPaymentStatus", () => {
  it("treats partially_refunded payment rows as paid for receipt breakdowns", () => {
    expect(isPaidBookingPaymentStatus("completed")).toBe(true);
    expect(isPaidBookingPaymentStatus("partially_refunded")).toBe(true);
    expect(isPaidBookingPaymentStatus("failed")).toBe(false);
  });
});

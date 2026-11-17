import { describe, expect, it } from "vitest";
import { sumAlignedBookingsGmv } from "../bookings-gmv-for-reconciliation";

describe("bookings-gmv-for-reconciliation", () => {
  it("sums paid and refunded bookings toward aligned GMV", () => {
    const result = sumAlignedBookingsGmv(
      [
        { payment_status: "paid", total_amount: 187.5 },
        { payment_status: "refunded", total_amount: 120 },
        { payment_status: "cancelled", total_amount: 180 },
      ],
      0,
    );
    expect(result.grossBookingsGmv).toBe(307.5);
    expect(result.available).toBe(true);
  });

  it("includes refunded bookings so staging GMV matches the ledger", () => {
    const result = sumAlignedBookingsGmv([
      { payment_status: "paid", total_amount: 187.5 },
      { payment_status: "refunded", total_amount: 120 },
      { payment_status: "refunded", total_amount: 195 },
    ]);
    expect(result.alignedBookingsGmv).toBe(502.5);
    expect(result.grossBookingsGmv).toBe(502.5);
  });

  it("excludes pending and failed bookings", () => {
    const result = sumAlignedBookingsGmv([
      { payment_status: "paid", total_amount: 100 },
      { payment_status: "pending", total_amount: 480 },
      { payment_status: "failed", total_amount: 180 },
    ]);
    expect(result.alignedBookingsGmv).toBe(100);
  });

  it("counts a partially refunded booking at its full total", () => {
    const result = sumAlignedBookingsGmv([{ payment_status: "partially_refunded", total_amount: 200 }]);
    expect(result.alignedBookingsGmv).toBe(200);
  });

  it("subtracts walk-in add-ons and never goes negative", () => {
    expect(sumAlignedBookingsGmv([{ payment_status: "paid", total_amount: 1500 }], 259).alignedBookingsGmv).toBe(1241);
    expect(sumAlignedBookingsGmv([{ payment_status: "paid", total_amount: 100 }], 150).alignedBookingsGmv).toBe(0);
  });
});

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
});
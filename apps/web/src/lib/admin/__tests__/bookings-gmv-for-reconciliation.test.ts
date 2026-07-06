import { describe, it, expect } from "vitest";

describe("aligned bookings GMV math", () => {
  it("subtracts walk-in add-ons from gross paid bookings GMV", () => {
    const grossBookingsGmv = 1500;
    const walkInAddOnDeduction = 259;
    const alignedBookingsGmv = Math.max(0, grossBookingsGmv - walkInAddOnDeduction);
    expect(alignedBookingsGmv).toBe(1241);
  });

  it("never returns negative aligned GMV", () => {
    const aligned = Math.max(0, 100 - 150);
    expect(aligned).toBe(0);
  });
});

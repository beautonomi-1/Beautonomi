import { describe, it, expect } from "vitest";
import {
  availabilityRouteDurationMinutes,
  publicSlugSpanParamsFromSlices,
  slicesFromBookingCart,
  slicesFromBookingServiceRows,
  sumChainedBlockedMinutes,
} from "../blocked-window-minutes";

describe("sumChainedBlockedMinutes", () => {
  it("matches sequential cursor: duration + buffer after each segment", () => {
    expect(
      sumChainedBlockedMinutes([
        { durationMinutes: 60, bufferAfterMinutes: 15 },
        { durationMinutes: 30, bufferAfterMinutes: 10 },
      ])
    ).toBe(60 + 15 + 30 + 10);
  });

  it("returns 0 for empty", () => {
    expect(sumChainedBlockedMinutes([])).toBe(0);
  });
});

describe("slicesFromBookingServiceRows", () => {
  it("maps booking_services join rows", () => {
    const slices = slicesFromBookingServiceRows([
      { duration_minutes: 45, offerings: { duration_minutes: 45, buffer_minutes: 12 } },
      { offerings: { duration_minutes: 30, buffer_minutes: 5 } },
    ]);
    expect(sumChainedBlockedMinutes(slices)).toBe(45 + 12 + 30 + 5);
  });
});

describe("parity: cart / public slug / api route duration", () => {
  it("publicSlugSpanParamsFromSlices sums match sumChainedBlockedMinutes (slug route uses duration+buffer)", () => {
    const slices = slicesFromBookingCart(
      [
        { duration: 60, bufferMinutes: 15 },
        { duration: 30, bufferMinutes: 10 },
      ],
      [{ duration: 20 }]
    );
    const chained = sumChainedBlockedMinutes(slices);
    const { durationMinutes, bufferMinutes } = publicSlugSpanParamsFromSlices(slices);
    expect(durationMinutes + bufferMinutes).toBe(chained);
    expect(availabilityRouteDurationMinutes(slices)).toBe(chained);
    expect(durationMinutes).toBe(60 + 30 + 20);
    expect(bufferMinutes).toBe(15 + 10 + 0);
  });
});

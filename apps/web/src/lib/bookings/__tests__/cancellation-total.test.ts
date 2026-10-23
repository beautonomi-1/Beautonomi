import { describe, expect, it } from "vitest";
import { totalAmountAfterCancellationFeeChange } from "../cancellation-total";

describe("totalAmountAfterCancellationFeeChange", () => {
  it("returns undefined when the fee is unchanged", () => {
    expect(totalAmountAfterCancellationFeeChange(150.5, 0, 0)).toBeUndefined();
    expect(totalAmountAfterCancellationFeeChange(99.99, 25, 25)).toBeUndefined();
  });

  it("subtracts only the fee delta when the fee increases", () => {
    expect(totalAmountAfterCancellationFeeChange(200, 0, 50)).toBe(150);
    expect(totalAmountAfterCancellationFeeChange(100, 10, 40)).toBe(70);
  });

  it("rounds to cents", () => {
    expect(totalAmountAfterCancellationFeeChange(10.006, 0, 0.001)).toBe(10.01);
  });
});

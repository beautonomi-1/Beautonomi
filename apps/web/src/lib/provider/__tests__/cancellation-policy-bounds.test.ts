import { describe, expect, it } from "vitest";
import { cancellationFeeAmountError } from "../cancellation-policy-bounds";

describe("cancellationFeeAmountError (F3-22)", () => {
  it("allows omitting fee_amount", () => {
    expect(cancellationFeeAmountError("percentage", undefined)).toBeNull();
    expect(cancellationFeeAmountError("fixed", null)).toBeNull();
  });

  it("caps percentage fees at 100", () => {
    expect(cancellationFeeAmountError("percentage", 101)).toMatch(/Percentage/);
    expect(cancellationFeeAmountError("percentage", 100)).toBeNull();
  });

  it("caps fixed fees at the client money maximum", () => {
    expect(cancellationFeeAmountError("fixed", 100_001)).toMatch(/Fixed/);
    expect(cancellationFeeAmountError("fixed", 50)).toBeNull();
  });
});

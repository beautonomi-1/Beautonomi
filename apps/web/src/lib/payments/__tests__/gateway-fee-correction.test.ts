import { describe, expect, it } from "vitest";
import { shouldPatchGatewayFee } from "../gateway-fee-correction";

describe("shouldPatchGatewayFee", () => {
  it("allows patch for estimated and stripe_fee_missing", () => {
    expect(shouldPatchGatewayFee("estimated")).toBe(true);
    expect(shouldPatchGatewayFee("stripe_fee_missing")).toBe(true);
    expect(shouldPatchGatewayFee(null)).toBe(true);
  });

  it("blocks patch for PSP-reported sources", () => {
    expect(shouldPatchGatewayFee("paystack")).toBe(false);
    expect(shouldPatchGatewayFee("stripe")).toBe(false);
  });
});

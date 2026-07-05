import { describe, it, expect } from "vitest";
import {
  financeNetAfterFeeAdjustment,
  paymentNetAfterFeeAdjustment,
} from "../fee-adjustment-net";

describe("fee adjustment net calculations", () => {
  it("computes payment_transactions net from amount minus adjusted fee", () => {
    expect(paymentNetAfterFeeAdjustment(100, 3.5)).toBe(96.5);
  });

  it("computes finance_transactions net from amount minus fee minus commission", () => {
    expect(financeNetAfterFeeAdjustment(500, 14.5, 75)).toBe(410.5);
  });

  it("treats null commission as zero", () => {
    expect(financeNetAfterFeeAdjustment(200, 5, 0)).toBe(195);
  });
});

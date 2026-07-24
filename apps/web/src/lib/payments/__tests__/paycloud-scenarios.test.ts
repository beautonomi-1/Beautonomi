import { describe, expect, it } from "vitest";
import {
  PAYCLOUD_DEFAULT_QR_PAY_METHOD_ID,
  resolvePayScenario,
} from "../paycloud-scenarios";

describe("resolvePayScenario", () => {
  it("uses SWIPE_CARD for card without pay_method_id", () => {
    expect(resolvePayScenario("card")).toEqual({ pay_scenario: "SWIPE_CARD" });
  });

  it("uses BSCANQR_PAY with SA ScanToPay for QR", () => {
    expect(resolvePayScenario("qr")).toEqual({
      pay_scenario: "BSCANQR_PAY",
      pay_method_id: "ScanToPay",
    });
    expect(PAYCLOUD_DEFAULT_QR_PAY_METHOD_ID).toBe("ScanToPay");
  });
});

import { describe, expect, it } from "vitest";
import { getSelfCancelEligibility } from "../route";

describe("getSelfCancelEligibility", () => {
  it("blocks partially_refunded orders", () => {
    const result = getSelfCancelEligibility({
      status: "confirmed",
      payment_status: "partially_refunded",
    });
    expect(result).toEqual({
      ok: false,
      code: "PARTIALLY_REFUNDED",
      message: expect.stringContaining("partially refunded"),
    });
  });

  it("allows pending confirmed when not shipped", () => {
    expect(getSelfCancelEligibility({ status: "confirmed", payment_status: "paid" })).toEqual({
      ok: true,
    });
  });
});

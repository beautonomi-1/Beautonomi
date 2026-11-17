import { describe, expect, it } from "vitest";
import { publicApiErrorMessage } from "../../../../../../packages/api/src/client";

describe("publicApiErrorMessage", () => {
  it("keeps a safe API sentence", () => {
    expect(
      publicApiErrorMessage(
        "INSUFFICIENT_BALANCE",
        "Insufficient payout balance for this request.",
      ),
    ).toBe("Insufficient payout balance for this request.");
  });

  it("replaces a raw refund SQL body when the code is OVER_REFUND", () => {
    expect(
      publicApiErrorMessage(
        "OVER_REFUND",
        "Refund amount validation failed. Total refunded for booking (400.00) exceeds total paid (333.33)",
      ),
    ).toBe("Refund exceeds the amount collected.");
  });

  it("hides raw SQL when the code is unknown", () => {
    expect(publicApiErrorMessage(undefined, "SQLSTATE 23514")).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

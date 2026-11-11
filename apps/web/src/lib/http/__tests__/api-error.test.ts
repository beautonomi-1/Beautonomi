import { describe, expect, it } from "vitest";
import { formatApiErrorMessage } from "../api-error";
import { FetchError } from "../fetcher";

describe("formatApiErrorMessage", () => {
  it("keeps a safe insufficient-balance sentence from the API", () => {
    const error = new FetchError(
      "Insufficient payout balance for this request.",
      400,
      "INSUFFICIENT_BALANCE",
    );
    expect(formatApiErrorMessage(error, "Could not request payout")).toBe(
      "Insufficient payout balance for this request.",
    );
  });

  it("replaces a raw refund SQL body with the OVER_REFUND sentence", () => {
    const error = new FetchError(
      "Refund amount validation failed. Total refunded for booking (400.00) exceeds total paid (333.33)",
      400,
      "OVER_REFUND",
    );
    expect(formatApiErrorMessage(error, "Refund failed")).toBe(
      "Refund exceeds the amount collected.",
    );
  });

  it("keeps a specific permission sentence", () => {
    const error = new FetchError("Staff cannot issue refunds.", 403, "FORBIDDEN");
    expect(formatApiErrorMessage(error, "Refund failed")).toBe("Staff cannot issue refunds.");
  });

  it("uses the caller fallback when the body is raw SQL and the code is unknown", () => {
    const error = new FetchError("SQLSTATE 23514", 500, "UNKNOWN");
    expect(formatApiErrorMessage(error, "Refund failed")).toBe("Refund failed");
  });
});

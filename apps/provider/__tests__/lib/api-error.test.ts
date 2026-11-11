import { getApiErrorMessage, getHttpErrorStatus } from "@/lib/api-error";

describe("getApiErrorMessage", () => {
  it("returns fallback for nullish", () => {
    expect(getApiErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });

  it("returns trimmed string", () => {
    expect(getApiErrorMessage("  x  ")).toBe("x");
  });

  it("hides a raw SQL string when no code is attached", () => {
    expect(
      getApiErrorMessage(
        "Refund amount validation failed. Total refunded for booking (400.00) exceeds total paid (333.33)",
      ),
    ).toBe("Something went wrong. Please try again.");
  });

  it("hides raw SQL on an object that has no code", () => {
    expect(
      getApiErrorMessage({
        message: "SQLSTATE 23514",
      }),
    ).toBe("Something went wrong. Please try again.");
  });

  it("uses Error message", () => {
    expect(getApiErrorMessage(new Error("bad"))).toBe("bad");
  });

  it("replaces a raw refund SQL error with the OVER_REFUND sentence", () => {
    expect(
      getApiErrorMessage({
        code: "OVER_REFUND",
        message: "Refund amount validation failed. Total refunded for booking (400.00) exceeds total paid (333.33)",
      }),
    ).toBe("Refund exceeds the amount collected.");
  });

  it("replaces raw SQL ledger failures with a friendly LEDGER_POSTING_FAILED message", () => {
    expect(
      getApiErrorMessage({
        code: "LEDGER_POSTING_FAILED",
        message: "finance ledger posting failed for booking abc payment def: boom",
      }),
    ).toMatch(/could not be recorded/i);
  });

  it("maps PAYOUT_HELD when the API omits a message", () => {
    expect(getApiErrorMessage({ code: "PAYOUT_HELD" })).toMatch(/on hold/i);
  });

  it("maps FORBIDDEN to a permission sentence", () => {
    expect(getApiErrorMessage({ code: "FORBIDDEN", message: "" })).toMatch(/permission/i);
  });

  it("maps IDEMPOTENCY_KEY_CONFLICT", () => {
    expect(getApiErrorMessage({ code: "IDEMPOTENCY_KEY_CONFLICT", message: "" })).toMatch(
      /already processed/i,
    );
  });
});

describe("getHttpErrorStatus", () => {
  it("returns undefined for non-objects", () => {
    expect(getHttpErrorStatus(undefined)).toBeUndefined();
  });

  it("reads status", () => {
    expect(getHttpErrorStatus({ status: 401 })).toBe(401);
  });

  it("reads statusCode when status missing", () => {
    expect(getHttpErrorStatus({ statusCode: 403 })).toBe(403);
  });

  it("prefers status when both set", () => {
    expect(getHttpErrorStatus({ status: 401, statusCode: 500 })).toBe(401);
  });
});

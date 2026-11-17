import {
  getApiErrorMessage,
  getBookingHoldSlotUnavailableMessage,
  getHttpErrorStatus,
} from "@/lib/api-error";

describe("getApiErrorMessage", () => {
  it("returns fallback for nullish", () => {
    expect(getApiErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(getApiErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("returns trimmed string", () => {
    expect(getApiErrorMessage("  Network error  ")).toBe("Network error");
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
        message: "finance ledger posting failed for booking abc payment def: boom",
      }),
    ).toBe("Something went wrong. Please try again.");
  });

  it("uses Error message", () => {
    expect(getApiErrorMessage(new Error("Bad request"))).toBe("Bad request");
  });

  it("uses custom fallback", () => {
    expect(getApiErrorMessage(null, "Try again")).toBe("Try again");
  });

  it("reads message from plain object", () => {
    expect(getApiErrorMessage({ message: "  x  " })).toBe("x");
  });

  it("maps IDEMPOTENCY_KEY_CONFLICT when the API omits a message", () => {
    expect(getApiErrorMessage({ code: "IDEMPOTENCY_KEY_CONFLICT" })).toMatch(
      /already processed/i,
    );
  });

  it("replaces a raw refund SQL error with the OVER_REFUND sentence", () => {
    expect(
      getApiErrorMessage({
        code: "OVER_REFUND",
        message: "Refund amount validation failed. Total refunded for booking (400.00) exceeds total paid (333.33)",
      }),
    ).toBe("Refund exceeds the amount collected.");
  });

  it("maps INSUFFICIENT_BALANCE when the API omits a message", () => {
    expect(getApiErrorMessage({ code: "INSUFFICIENT_BALANCE" })).toMatch(/not enough balance/i);
  });
});

describe("getBookingHoldSlotUnavailableMessage", () => {
  it("maps slot_error_code to friendly copy", () => {
    expect(
      getBookingHoldSlotUnavailableMessage(
        { message: "generic", details: { slot_error_code: "NO_STAFF_AVAILABLE" } },
        "fallback",
      ),
    ).toContain("No staff member");
    expect(
      getBookingHoldSlotUnavailableMessage(
        { message: "generic", details: { slot_error_code: "CALENDAR_BLOCKED" } },
        "fallback",
      ),
    ).toContain("blocked");
    expect(
      getBookingHoldSlotUnavailableMessage(
        { message: "generic", details: { slot_error_code: "SLOT_TAKEN_BY_HOLD" } },
        "fallback",
      ),
    ).toContain("Someone else");
  });

  it("falls back when no slot code", () => {
    expect(getBookingHoldSlotUnavailableMessage({ message: "x" }, "fb")).toBe("x");
  });

  it("shows wait minutes for RATE_LIMIT_EXCEEDED", () => {
    const msg = getBookingHoldSlotUnavailableMessage(
      {
        code: "RATE_LIMIT_EXCEEDED",
        details: { retry_after_seconds: 120 },
      },
      "fb",
      (key, opts) => `${key}:${(opts as { minutes?: number })?.minutes}`,
    );
    expect(msg).toBe("checkout.holdRateLimitWait:2");
  });
});

describe("getHttpErrorStatus", () => {
  it("returns undefined for non-objects", () => {
    expect(getHttpErrorStatus(null)).toBeUndefined();
    expect(getHttpErrorStatus("401")).toBeUndefined();
  });

  it("prefers status over statusCode when both present", () => {
    expect(getHttpErrorStatus({ status: 401, statusCode: 500 })).toBe(401);
  });

  it("reads statusCode when status missing", () => {
    expect(getHttpErrorStatus({ statusCode: 403 })).toBe(403);
  });

  it("ignores non-finite numbers", () => {
    expect(getHttpErrorStatus({ status: NaN })).toBeUndefined();
  });
});

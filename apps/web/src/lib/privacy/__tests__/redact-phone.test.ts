import { describe, expect, it } from "vitest";
import { redactPhoneForLog } from "../redact-phone";

describe("redactPhoneForLog (F2-69)", () => {
  it("keeps only the last 4 digits of a valid number", () => {
    expect(redactPhoneForLog("+27821234567")).toBe("***4567");
    expect(redactPhoneForLog("082 123 4567")).toBe("***4567");
  });

  it("does not echo the raw input when the value is too short or empty", () => {
    expect(redactPhoneForLog("")).toBe("[redacted]");
    expect(redactPhoneForLog("12")).toBe("[redacted]");
    expect(redactPhoneForLog(null)).toBe("[redacted]");
  });
});

import { describe, expect, it } from "vitest";
import { getUserFacingMessage } from "../user-messages";

describe("getUserFacingMessage", () => {
  it("surfaces API fallback for VALIDATION_ERROR when user-safe", () => {
    expect(
      getUserFacingMessage("VALIDATION_ERROR", "Address is outside the service area."),
    ).toBe("Address is outside the service area.");
  });

  it("masks VALIDATION_ERROR when fallback looks technical", () => {
    expect(
      getUserFacingMessage(
        "VALIDATION_ERROR",
        "duplicate key value violates unique constraint",
      ),
    ).toMatch(/invalid/i);
  });
});

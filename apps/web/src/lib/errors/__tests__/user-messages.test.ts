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

  it("keeps a safe OVER_REFUND sentence from the API", () => {
    expect(
      getUserFacingMessage(
        "OVER_REFUND",
        "Refund exceeds the amount collected on this booking.",
      ),
    ).toBe("Refund exceeds the amount collected on this booking.");
  });

  it("replaces a raw refund SQL body with the OVER_REFUND sentence", () => {
    expect(
      getUserFacingMessage(
        "OVER_REFUND",
        "Refund amount validation failed. Total refunded for booking (400.00) exceeds total paid (333.33)",
      ),
    ).toBe("Refund exceeds the amount collected.");
  });

  it("hides raw SQL when there is no known code", () => {
    expect(
      getUserFacingMessage(null, "finance ledger posting failed for booking abc"),
    ).toBe("Something went wrong. Please try again.");
  });
});

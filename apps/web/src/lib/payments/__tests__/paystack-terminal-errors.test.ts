import { describe, expect, it } from "vitest";
import { paystackTerminalErrorMessage } from "../paystack-terminal-errors";

describe("paystackTerminalErrorMessage", () => {
  it("maps SUBSCRIPTION_REQUIRED to upgrade guidance", () => {
    expect(paystackTerminalErrorMessage("raw", "SUBSCRIPTION_REQUIRED")).toContain("plan");
  });

  it("maps platform disabled code", () => {
    expect(paystackTerminalErrorMessage("raw", "PAYSTACK_VIRTUAL_TERMINAL_DISABLED_BY_PLATFORM")).toContain(
      "market",
    );
  });

  it("falls back to server message", () => {
    expect(paystackTerminalErrorMessage("Custom failure", "UNKNOWN")).toBe("Custom failure");
  });
});

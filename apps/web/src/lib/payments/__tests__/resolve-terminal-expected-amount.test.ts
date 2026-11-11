import { describe, expect, it } from "vitest";
import { terminalExpectedAmountForDisplay } from "../resolve-terminal-expected-amount";

describe("terminalExpectedAmountForDisplay (F3-17)", () => {
  it("uses the server remaining balance when an entity is named", () => {
    expect(
      terminalExpectedAmountForDisplay({ derived: 80, hasEntity: true, clientHint: 999 }),
    ).toBe(80);
  });

  it("keeps a zero remaining balance instead of the client hint", () => {
    expect(
      terminalExpectedAmountForDisplay({ derived: 0, hasEntity: true, clientHint: 50 }),
    ).toBe(0);
  });

  it("does not echo the client amount when the entity cannot be resolved", () => {
    expect(
      terminalExpectedAmountForDisplay({ derived: null, hasEntity: true, clientHint: 50 }),
    ).toBeNull();
  });

  it("uses the client hint only for ad-hoc collections", () => {
    expect(
      terminalExpectedAmountForDisplay({ derived: null, hasEntity: false, clientHint: 25.5 }),
    ).toBe(25.5);
  });
});

import { describe, expect, it } from "vitest";
import { mergeBrowseDisplayCurrencyCodes } from "../browse-display-currencies";

describe("mergeBrowseDisplayCurrencyCodes", () => {
  it("puts the tenant default first and includes browse currencies", () => {
    const codes = mergeBrowseDisplayCurrencyCodes(["ZAR"], "ZAR");
    expect(codes[0]).toBe("ZAR");
    expect(codes).toContain("USD");
    expect(codes).toContain("EUR");
    expect(new Set(codes).size).toBe(codes.length);
  });
});

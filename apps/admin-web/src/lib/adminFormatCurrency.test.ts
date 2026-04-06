import { describe, expect, it } from "vitest";
import { formatAdminCurrency, formatAdminNumber } from "./adminFormatCurrency";

describe("adminFormatCurrency", () => {
  it("formats finite amounts", () => {
    const s = formatAdminCurrency(1234.5);
    expect(s).not.toBe("—");
    expect(s).toContain("234");
    expect(s).toMatch(/1/);
  });

  it("returns em dash for non-finite", () => {
    expect(formatAdminCurrency(Number.NaN)).toBe("—");
  });
});

describe("formatAdminNumber", () => {
  it("groups large integers", () => {
    const s = formatAdminNumber(1000);
    expect(s).toContain("000");
    expect(s).toMatch(/1/);
  });
});

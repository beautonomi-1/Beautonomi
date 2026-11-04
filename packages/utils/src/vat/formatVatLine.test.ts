import { describe, expect, it } from "vitest";
import { formatVatLine } from "./formatVatLine";

describe("formatVatLine", () => {
  it("hides line when not registered", () => {
    expect(formatVatLine({ amount: 15, ratePercent: 15, inclusive: true, registered: false }).show).toBe(
      false,
    );
  });

  it("uses inclusive label when registered with inclusive pricing", () => {
    const line = formatVatLine({ amount: 15, ratePercent: 15, inclusive: true, registered: true });
    expect(line.show).toBe(true);
    expect(line.labelKey).toBe("vat.inclusive");
  });

  it("uses plain label when inclusive unknown", () => {
    const line = formatVatLine({
      amount: 10,
      ratePercent: 15,
      inclusive: true,
      registered: true,
      inclusiveUnknown: true,
    });
    expect(line.labelKey).toBe("vat.plain");
  });
});

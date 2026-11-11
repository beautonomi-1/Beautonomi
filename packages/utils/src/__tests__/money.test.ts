import { describe, it, expect } from "vitest";
import {
  toMinorUnits,
  fromMinorUnits,
  percentOf,
  normalizeTipPercentPresets,
  validateTipPercentPresetsForSave,
  sumMoney,
  splitMoneyProportionally,
  roundCurrency,
  formatMoney,
  formatMoneyCompact,
} from "../money";

describe("currency-aware money", () => {
  it("ZAR uses 2 decimal minor units", () => {
    expect(toMinorUnits(10.005, "ZAR")).toBe(1001);
    expect(fromMinorUnits(1001, "ZAR")).toBe(10.01);
  });

  it("JPY uses zero decimal minor units", () => {
    expect(toMinorUnits(100.7, "JPY")).toBe(101);
    expect(fromMinorUnits(101, "JPY")).toBe(101);
  });

  it("KWD uses 3 decimal minor units", () => {
    expect(toMinorUnits(1.2345, "KWD")).toBe(1235);
    expect(fromMinorUnits(1235, "KWD")).toBe(1.235);
  });

  it("percentOf avoids float drift for ZAR", () => {
    expect(percentOf(200, 15, "ZAR")).toBe(30);
    expect(percentOf(600, 15, "ZAR")).toBe(90);
    expect(percentOf(149.99, 10, "ZAR")).toBe(15);
  });

  it("normalizeTipPercentPresets returns defaults for invalid input", () => {
    expect(normalizeTipPercentPresets(null)).toEqual([10, 15, 20, 25]);
    expect(normalizeTipPercentPresets([])).toEqual([10, 15, 20, 25]);
    expect(normalizeTipPercentPresets(["10", "x"])).toEqual([10]);
    expect(normalizeTipPercentPresets([0, 150])).toEqual([10, 15, 20, 25]);
  });

  it("normalizeTipPercentPresets dedupes, sorts, and caps at 5", () => {
    expect(normalizeTipPercentPresets([25, 10, 15, 10, 20])).toEqual([10, 15, 20, 25]);
    expect(normalizeTipPercentPresets([5, 10, 15, 20, 25, 30])).toEqual([5, 10, 15, 20, 25]);
  });

  it("validateTipPercentPresetsForSave rejects invalid PATCH payloads", () => {
    expect(validateTipPercentPresetsForSave([])).toBeNull();
    expect(validateTipPercentPresetsForSave([0])).toBeNull();
    expect(validateTipPercentPresetsForSave([150])).toBeNull();
    expect(validateTipPercentPresetsForSave([10, 15, 20, 25, 30, 5])).toBeNull();
    expect(validateTipPercentPresetsForSave([10, 15, 20])).toEqual([10, 15, 20]);
  });

  it("sumMoney defaults to ZAR when currency omitted", () => {
    expect(sumMoney(1.1, 2.2)).toBe(3.3);
  });

  it("splitMoneyProportionally allocates remainder", () => {
    const { parts, residual } = splitMoneyProportionally(10, [1, 1, 1], "ZAR");
    expect(parts.reduce((a, b) => a + b, 0) + residual).toBeCloseTo(10, 2);
    expect(parts.every((p) => p === 3.33 || p === 3.34)).toBe(true);
  });

  it("roundCurrency respects currency minor units", () => {
    expect(roundCurrency(1.234, "KWD")).toBe(1.234);
    expect(roundCurrency(1.234, "ZAR")).toBe(1.23);
  });

  it("formatMoney matches a fresh Intl.NumberFormat and is stable across calls", () => {
    const expected = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
      1234.5,
    );
    expect(formatMoney(1234.5, "ZAR", "en-ZA")).toBe(expected);
    expect(formatMoney(1234.5, "ZAR", "en-ZA")).toBe(expected);
  });

  it("formatMoney caches per locale and currency", () => {
    expect(formatMoney(10, "USD", "en-US")).toBe(
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(10),
    );
    expect(formatMoney(10, "ZAR", "en-US")).not.toBe(formatMoney(10, "USD", "en-US"));
  });

  it("formatMoneyCompact does not share a formatter with formatMoney", () => {
    expect(formatMoneyCompact(1_250_000, "ZAR", "en-ZA")).toBe(
      new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(1_250_000),
    );
    expect(formatMoneyCompact(1_250_000, "ZAR", "en-ZA")).not.toBe(
      formatMoney(1_250_000, "ZAR", "en-ZA"),
    );
  });

  it("percentOf is idempotent under roundCurrency over random samples (F-09)", () => {
    let seed = 123456789;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 200; i++) {
      const amount = Math.round(rand() * 100_000) / 100;
      const pct = Math.round(rand() * 2_500) / 100;
      const got = percentOf(amount, pct, "ZAR");
      expect(got).toBe(roundCurrency(got, "ZAR"));
      expect(percentOf(amount, 0, "ZAR")).toBe(0);
    }
    expect(percentOf(100, 15, "ZAR")).toBe(15);
    expect(percentOf(99.99, 100, "ZAR")).toBe(99.99);
  });
});

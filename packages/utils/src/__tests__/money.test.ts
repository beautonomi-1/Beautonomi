import { describe, it, expect } from "vitest";
import {
  toMinorUnits,
  fromMinorUnits,
  percentOf,
  sumMoney,
  splitMoneyProportionally,
  roundCurrency,
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
});

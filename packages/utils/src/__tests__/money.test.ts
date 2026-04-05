import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  addMoney,
  subtractMoney,
  multiplyMoney,
  roundCurrency,
  percentOf,
  sumMoney,
  formatMoney,
} from "../money";

describe("toCents", () => {
  it("converts whole amounts", () => {
    expect(toCents(10)).toBe(1000);
  });
  it("converts decimal amounts correctly", () => {
    expect(toCents(19.99)).toBe(1999);
  });
  it("handles the classic 0.1 + 0.2 scenario", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe("fromCents", () => {
  it("converts back to decimal", () => {
    expect(fromCents(1999)).toBe(19.99);
  });
});

describe("addMoney", () => {
  it("adds without floating-point error", () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
  });
  it("adds larger values", () => {
    expect(addMoney(99.99, 0.01)).toBe(100);
  });
});

describe("subtractMoney", () => {
  it("subtracts without floating-point error", () => {
    expect(subtractMoney(100, 0.01)).toBe(99.99);
  });
});

describe("multiplyMoney", () => {
  it("multiplies amount by factor", () => {
    expect(multiplyMoney(33.33, 3)).toBe(99.99);
  });
  it("handles percentage discount", () => {
    expect(multiplyMoney(100, 0.15)).toBe(15);
  });
});

describe("roundCurrency", () => {
  it("rounds to two decimal places", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(1.004)).toBe(1);
  });
});

describe("percentOf", () => {
  it("computes 15% of 200", () => {
    expect(percentOf(200, 15)).toBe(30);
  });
  it("computes 7.5% of 100 without float drift", () => {
    expect(percentOf(100, 7.5)).toBe(7.5);
  });
  it("computes 33.33% of 100", () => {
    expect(percentOf(100, 33.33)).toBe(33.33);
  });
  it("handles zero percentage", () => {
    expect(percentOf(500, 0)).toBe(0);
  });
  it("handles 100%", () => {
    expect(percentOf(123.45, 100)).toBe(123.45);
  });
});

describe("sumMoney", () => {
  it("sums multiple values without float error", () => {
    expect(sumMoney(0.1, 0.2, 0.3)).toBe(0.6);
  });
  it("sums typical booking components", () => {
    expect(sumMoney(199.99, 15.0, 28.5, 10.0)).toBe(253.49);
  });
  it("handles single value", () => {
    expect(sumMoney(42.42)).toBe(42.42);
  });
});

describe("formatMoney", () => {
  it("formats ZAR by default", () => {
    const result = formatMoney(100);
    expect(result).toContain("100");
  });
});
